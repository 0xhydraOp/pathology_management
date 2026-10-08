import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, verify } from "node:crypto";
import { startSyntheticWorker } from "./fixture.mjs";
const device = (n) => String(n).padStart(64, "0");
const request = (f, n, requestId = randomUUID()) => ({
  key: f.key,
  deviceId: device(n),
  requestId,
  appVersion: "synthetic-1",
});
test(
  "exact metadata contract rejects patient data and client actor fields",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      for (const path of ["/v1/activate", "/v1/refresh"]) {
        for (const extra of [
          { patient: { name: "Synthetic rejected patient" } },
          { results: [1] },
          { actor: "spoofed" },
          { role: "admin" },
        ]) {
          assert.equal(
            (await f.post(path, { ...request(f, 1), ...extra })).status,
            403,
          );
        }
      }
      const validPolicy = {
        expiresAt: Math.floor(Date.now() / 1000) + 1000,
        seats: 1,
        offlineSeconds: 15,
      };
      const adminCases = {
        create: validPolicy,
        renew: { ...validPolicy, licenseId: f.licenseId },
        revoke: { licenseId: f.licenseId },
        transfer: {
          licenseId: f.licenseId,
          activationId: randomUUID(),
          deviceId: "1".repeat(64),
        },
      };
      for (const [action, b] of Object.entries(adminCases)) {
        assert.equal(
          (
            await f.post(
              `/v1/admin/${action}`,
              { ...b, actor: "spoofed" },
              f.adminHeaders,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await f.post(
              `/v1/admin/${action}`,
              { ...b, patient: "Synthetic rejected patient" },
              f.adminHeaders,
            )
          ).status,
          403,
        );
      }
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM activations").first()).n,
        0,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM admin_audit").first()).n,
        1,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM licenses").first()).n,
        1,
      );
      assert.equal((await f.post("/v1/activate", request(f, 1))).status, 200);
    } finally {
      await f.close();
    }
  },
);
test(
  "unexpected D1 failures return 503 and roll allocation/admin updates back",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      await f.db.exec(
        "CREATE TRIGGER synthetic_request_failure BEFORE INSERT ON requests BEGIN SELECT RAISE(ABORT,'synthetic persistence failure'); END;",
      );
      const failed = await f.post("/v1/activate", request(f, 1));
      assert.equal(failed.status, 503);
      assert.deepEqual(await failed.json(), {
        error: "Licensing service unavailable.",
      });
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM activations").first()).n,
        0,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM requests").first()).n,
        0,
      );
      await f.db.exec("DROP TRIGGER synthetic_request_failure;");
      assert.equal((await f.post("/v1/activate", request(f, 1))).status, 200);
      const original = await f.db.prepare("SELECT * FROM licenses").first();
      await f.db.exec(
        "CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON admin_audit BEGIN SELECT RAISE(ABORT,'synthetic persistence failure'); END;",
      );
      assert.equal(
        (
          await f.post(
            "/v1/admin/renew",
            {
              licenseId: f.licenseId,
              seats: 2,
              offlineSeconds: 15,
              expiresAt: Math.floor(Date.now() / 1000) + 10000,
            },
            f.adminHeaders,
          )
        ).status,
        503,
      );
      assert.deepEqual(
        await f.db.prepare("SELECT * FROM licenses").first(),
        original,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM admin_audit").first()).n,
        1,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "explicit policy and expired grants preserve activation history",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker({ offlineSeconds: 15 });
    try {
      const b = request(f, 1);
      const first = await f.post("/v1/activate", b);
      const payload = JSON.parse(
        Buffer.from((await first.json()).grant.payload, "base64url"),
      );
      assert.equal(
        payload.offlineUntil,
        Math.min(payload.expiresAt, payload.issuedAt + 15),
      );
      await f.db
        .prepare("UPDATE licenses SET expires_at=? WHERE id=?")
        .bind(Math.floor(Date.now() / 1000) - 1, f.licenseId)
        .run();
      const refresh = await f.post("/v1/refresh", {
        ...b,
        requestId: randomUUID(),
      });
      assert.equal(
        JSON.parse(
          Buffer.from((await refresh.json()).grant.payload, "base64url"),
        ).status,
        "expired",
      );
      assert.equal((await f.post("/v1/activate", request(f, 2))).status, 403);
      assert.equal(
        (
          await f.post(
            "/v1/admin/renew",
            {
              licenseId: f.licenseId,
              seats: 1,
              offlineSeconds: 0,
              expiresAt: Math.floor(Date.now() / 1000) + 1000,
            },
            f.adminHeaders,
          )
        ).status,
        403,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM activations").first()).n,
        1,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "idempotency-key collision rolls allocation back",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker({ seats: 3 });
    try {
      const id = randomUUID();
      const responses = await Promise.all(
        [1, 2].map((n) => f.post("/v1/activate", request(f, n, id))),
      );
      assert.equal(responses.filter((r) => r.status === 200).length, 1);
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM activations").first()).n,
        1,
      );
      const a = await f.db.prepare("SELECT * FROM activations").first();
      const other = a.device_id === device(1) ? 2 : 1;
      assert.equal(
        (await f.post("/v1/activate", request(f, other, id))).status,
        403,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM activations").first()).n,
        1,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "same-device concurrent retries and transfer compare-and-swap",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker({ seats: 3 });
    try {
      const b = request(f, 1);
      const responses = await Promise.all(
        Array.from({ length: 12 }, () => f.post("/v1/activate", b)),
      );
      assert(responses.every((r) => r.status === 200));
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM activations").first()).n,
        1,
      );
      const a = await f.db.prepare("SELECT * FROM activations").first();
      const transfers = await Promise.all(
        [2, 3].map((n) =>
          f.post(
            "/v1/admin/transfer",
            { licenseId: f.licenseId, activationId: a.id, deviceId: device(n) },
            f.adminHeaders,
          ),
        ),
      );
      assert.equal(transfers.filter((r) => r.status === 200).length, 1);
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM admin_audit").first()).n,
        2,
      );
      assert.equal(
        (
          await f.db
            .prepare("SELECT count(*) n FROM activations WHERE status='active'")
            .first()
        ).n,
        1,
      );
      assert.equal((await f.post("/v1/activate", request(f, 4))).status, 200);
      await assert.rejects(
        f.db
          .prepare("UPDATE licenses SET seats=1 WHERE id=?")
          .bind(f.licenseId)
          .run(),
      );
      assert.equal(
        (await f.db.prepare("SELECT seats FROM licenses").first()).seats,
        3,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "concurrent D1 seat claims, retries, renewal, transfer and revocation",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, n) =>
          f.post("/v1/activate", request(f, n + 1)),
        ),
      );
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      const a = await f.db
        .prepare("SELECT * FROM activations WHERE status='active'")
        .first();
      const retry = {
        key: f.key,
        deviceId: a.device_id,
        requestId: randomUUID(),
        appVersion: "1",
      };
      for (let i = 0; i < 3; i++)
        assert.equal((await f.post("/v1/activate", retry)).status, 200);
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM activations").first()).n,
        1,
      );
      let r = await f.post("/v1/refresh", retry);
      const { grant } = await r.json();
      assert(
        verify(
          null,
          Buffer.from(`patholy-grant-v1\n${grant.kid}.${grant.payload}`),
          f.publicKey,
          Buffer.from(grant.signature, "base64url"),
        ),
      );
      assert.equal(
        JSON.parse(Buffer.from(grant.payload, "base64url")).status,
        "active",
      );
      assert.equal(
        (
          await f.post(
            "/v1/admin/renew",
            {
              licenseId: f.licenseId,
              seats: 2,
              offlineSeconds: 7200,
              expiresAt: Math.floor(Date.now() / 1000) + 10000,
            },
            f.adminHeaders,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await f.post(
            "/v1/admin/transfer",
            {
              licenseId: f.licenseId,
              activationId: a.id,
              deviceId: device(999),
            },
            f.adminHeaders,
          )
        ).status,
        200,
      );
      r = await f.post("/v1/activate", retry);
      assert.equal(
        JSON.parse(Buffer.from((await r.json()).grant.payload, "base64url"))
          .status,
        "revoked",
      );
      assert.equal(
        (
          await f.post(
            "/v1/admin/revoke",
            { licenseId: f.licenseId },
            f.adminHeaders,
          )
        ).status,
        200,
      );
      const active = await f.db
        .prepare("SELECT * FROM activations WHERE status='active'")
        .first();
      r = await f.post("/v1/refresh", {
        ...retry,
        deviceId: active.device_id,
        requestId: randomUUID(),
      });
      assert.equal(
        JSON.parse(Buffer.from((await r.json()).grant.payload, "base64url"))
          .status,
        "revoked",
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM admin_audit").first()).n,
        4,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "admin JWT identity, secret, policy, unknown key and missing activation reject",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      for (const headers of [
        { "content-type": "application/json" },
        {
          ...f.adminHeaders,
          "cf-access-jwt-assertion": f.jwt({ sub: "spoofed" }),
        },
        { ...f.adminHeaders, "cf-access-jwt-assertion": f.jwt({ exp: 1 }) },
        {
          ...f.adminHeaders,
          "cf-access-jwt-assertion": f.jwt({ aud: ["wrong"] }),
        },
        { ...f.adminHeaders, authorization: "Bearer fake" },
      ])
        assert.equal(
          (
            await f.post(
              "/v1/admin/create",
              {
                seats: 1,
                offlineSeconds: 1,
                expiresAt: Math.floor(Date.now() / 1000) + 999,
              },
              headers,
            )
          ).status,
          403,
        );
      assert.equal(
        (await f.post("/v1/admin/create", {}, f.adminHeaders)).status,
        403,
      );
      assert.equal((await f.post("/v1/refresh", request(f, 1))).status, 403);
      assert.equal(
        (
          await f.post("/v1/activate", {
            ...request(f, 1),
            key: `PTH-${"x".repeat(43)}`,
          })
        ).status,
        403,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM licenses").first()).n,
        1,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "rate limit and transaction rollback preserve seats/audit",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker({ rateLimit: 2 });
    try {
      const b = request(f, 1);
      assert.equal((await f.post("/v1/activate", b)).status, 200);
      assert.equal((await f.post("/v1/activate", b)).status, 200);
      assert.equal((await f.post("/v1/activate", b)).status, 429);
      const a = await f.db.prepare("SELECT * FROM activations").first();
      await assert.rejects(
        f.db.batch([
          f.db
            .prepare("UPDATE activations SET status='revoked' WHERE id=?")
            .bind(a.id),
          f.db
            .prepare("INSERT INTO activations VALUES(?,?,?,'active',?)")
            .bind(a.id, f.licenseId, device(3), 1),
        ]),
      );
      assert.equal(
        (
          await f.db
            .prepare("SELECT status FROM activations WHERE id=?")
            .bind(a.id)
            .first()
        ).status,
        "active",
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM admin_audit").first()).n,
        1,
      );
    } finally {
      await f.close();
    }
  },
);
