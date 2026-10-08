import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startSyntheticWorker } from "./fixture.mjs";
import { readFile } from "node:fs/promises";
test(
  "customer invitation rejects expired, unverified, wrong-audience and rebound identities",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      const c = await customer(f),
        h = ownerHeaders(f);
      const make = async () =>
        (
          await (
            await f.post(
              "/v1/owner/customers/invite",
              { customerId: c, expiresAt: Math.floor(Date.now() / 1000) + 300 },
              h,
            )
          ).json()
        ).inviteToken;
      const token = await make();
      const claims = {
        sub: "customer-one",
        aud: ["synthetic-customer-audience"],
        email: "synthetic@example.test",
      };
      for (const override of [
        { email_verified: false },
        { aud: ["wrong-audience"] },
      ])
        assert.equal(
          (
            await f.post(
              "/v1/customer/accept-invite",
              { token },
              {
                ...h,
                "cf-access-jwt-assertion": f.jwt({ ...claims, ...override }),
              },
            )
          ).status,
          403,
        );
      await f.db
        .prepare(
          "UPDATE invitations SET expires_at=? WHERE consumed_at IS NULL",
        )
        .bind(Math.floor(Date.now() / 1000) - 1)
        .run();
      assert.equal(
        (
          await f.post(
            "/v1/customer/accept-invite",
            { token },
            { ...h, "cf-access-jwt-assertion": f.jwt(claims) },
          )
        ).status,
        403,
      );
      assert.equal(
        (await f.db.prepare("SELECT consumed_at FROM invitations").first())
          .consumed_at,
        null,
      );
      const newToken = await make();
      assert.equal(
        (
          await f.post(
            "/v1/customer/accept-invite",
            { token: newToken },
            { ...h, "cf-access-jwt-assertion": f.jwt(claims) },
          )
        ).status,
        200,
      );
      const replacement = await make();
      assert.equal(
        (
          await f.post(
            "/v1/customer/accept-invite",
            { token: replacement },
            {
              ...h,
              "cf-access-jwt-assertion": f.jwt({
                ...claims,
                sub: "customer-two",
              }),
            },
          )
        ).status,
        403,
      );
      assert.equal(
        (await f.db.prepare("SELECT identity_subject FROM customers").first())
          .identity_subject,
        "customer-one",
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "migration preserves existing licence IDs, keys, policy and audit; sole-owner config rejects ambiguity",
  { timeout: 60000 },
  async () => {
    for (const ownerSubjects of [[], ["synthetic-admin", "another-owner"]])
      await assert.rejects(
        startSyntheticWorker({ ownerSubjects }),
        /creation rejected 403/,
      );
    const f = await startSyntheticWorker({ customerMigration: false });
    try {
      const before = await f.db.prepare("SELECT * FROM licenses").first();
      const audits = (await f.db.prepare("SELECT * FROM admin_audit").all())
        .results;
      await f.db.exec(
        (
          await readFile(
            new URL("../migrations/0002_customers_owner.sql", import.meta.url),
            "utf8",
          )
        ).replaceAll("\n", " "),
      );
      const after = await f.db.prepare("SELECT * FROM licenses").first();
      for (const [key, value] of Object.entries(before))
        assert.equal(after[key], value);
      assert.equal(after.customer_id, null);
      assert.equal(after.kind, "licence");
      assert.equal(after.suspended, 0);
      assert.deepEqual(
        (await f.db.prepare("SELECT * FROM admin_audit").all()).results,
        audits,
      );
      assert.equal(
        (await f.post("/v1/activate", activation(f.key))).status,
        200,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "audit cursor retrieves all same-timestamp events without duplicates",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      const c = await customer(f),
        time = Math.floor(Date.now() / 1000);
      for (let offset = 0; offset < 1005; offset += 40)
        await f.db.batch(
          Array.from({ length: Math.min(40, 1005 - offset) }, (_, i) =>
            f.db
              .prepare("INSERT INTO owner_audit VALUES(?,?,?,?,?,?,?)")
              .bind(
                randomUUID(),
                "synthetic-admin",
                "synthetic.event",
                c,
                null,
                time,
                JSON.stringify({ n: offset + i }),
              ),
          ),
        );
      const first = await (
        await f.post("/v1/owner/audit/list", {}, ownerHeaders(f))
      ).json();
      assert.equal(first.events.length, 1000);
      assert(first.nextCursor);
      const second = await (
        await f.post(
          "/v1/owner/audit/list",
          { cursor: first.nextCursor },
          ownerHeaders(f),
        )
      ).json();
      assert.equal(second.nextCursor, null);
      assert.equal(second.events.length, 7);
      assert.equal(
        new Set([...first.events, ...second.events].map((e) => e.id)).size,
        1007,
      );
    } finally {
      await f.close();
    }
  },
);
function ownerHeaders(f) {
  const h = {
    ...f.adminHeaders,
    origin: new URL(f.url).origin,
    "x-patholy-owner-action": "1",
  };
  delete h.authorization;
  return h;
}
async function customer(f) {
  const r = await f.post(
    "/v1/owner/customers/create",
    { displayName: "Synthetic customer", email: "synthetic@example.test" },
    ownerHeaders(f),
  );
  assert.equal(r.status, 200);
  return (await r.json()).customerId;
}
async function trial(f, customerId) {
  const r = await f.post(
    "/v1/owner/licenses/create",
    {
      customerId,
      kind: "trial",
      seats: 2,
      offlineSeconds: 60,
    },
    ownerHeaders(f),
  );
  assert.equal(r.status, 200);
  return r.json();
}
const activation = (key) => ({
  key,
  deviceId: "a".repeat(64),
  requestId: randomUUID(),
  appVersion: "synthetic",
});
const status = async (r) =>
  JSON.parse(Buffer.from((await r.json()).grant.payload, "base64url")).status;
test(
  "sole owner MFA and same-origin CSRF enforced independently of lab roles",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      for (const h of [
        { ...ownerHeaders(f), origin: "https://attacker.test" },
        { ...ownerHeaders(f), "x-patholy-owner-action": "0" },
        {
          ...ownerHeaders(f),
          "cf-access-jwt-assertion": f.jwt({ sub: "lab-admin" }),
        },
        {
          ...ownerHeaders(f),
          "cf-access-jwt-assertion": f.jwt({ amr: ["pwd"] }),
        },
        {
          ...ownerHeaders(f),
          "cf-access-jwt-assertion": f.jwt({ amr: undefined }),
        },
      ])
        assert.equal(
          (await f.post("/v1/owner/customers/list", {}, h)).status,
          403,
        );
      assert.equal(
        (
          await f.post(
            "/v1/owner/customers/create",
            {
              displayName: "Synthetic",
              email: "synthetic@example.test",
              actor: "spoofed",
            },
            ownerHeaders(f),
          )
        ).status,
        403,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM customers").first()).n,
        0,
      );
      const c = await customer(f);
      assert(c);
      const row = await f.db.prepare("SELECT actor FROM owner_audit").first();
      assert.equal(row.actor, "synthetic-admin");
    } finally {
      await f.close();
    }
  },
);
test(
  "customer disable and explicit trial lifecycle enforce signed grants and preserve history",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      const c = await customer(f),
        l = await trial(f, c),
        b = activation(l.key),
        h = ownerHeaders(f);
      assert.equal(await status(await f.post("/v1/activate", b)), "active");
      assert.equal(
        (await f.post("/v1/owner/customers/disable", { customerId: c }, h))
          .status,
        200,
      );
      assert.equal(
        await status(
          await f.post("/v1/refresh", { ...b, requestId: randomUUID() }),
        ),
        "revoked",
      );
      assert.equal(
        (
          await f.post("/v1/activate", {
            ...b,
            deviceId: "b".repeat(64),
            requestId: randomUUID(),
          })
        ).status,
        403,
      );
      assert.equal(
        (await f.post("/v1/owner/customers/enable", { customerId: c }, h))
          .status,
        200,
      );
      assert.equal(
        await status(
          await f.post("/v1/refresh", { ...b, requestId: randomUUID() }),
        ),
        "active",
      );
      for (const action of ["suspend", "reactivate", "revoke"]) {
        assert.equal(
          (
            await f.post(
              `/v1/owner/licenses/${action}`,
              { licenseId: l.licenseId },
              h,
            )
          ).status,
          200,
        );
        assert.equal(
          await status(
            await f.post("/v1/refresh", { ...b, requestId: randomUUID() }),
          ),
          action === "reactivate" ? "active" : "revoked",
        );
      }
      assert.equal(
        (
          await f.post(
            "/v1/owner/licenses/renew",
            {
              licenseId: l.licenseId,
              expiresAt: Math.floor(Date.now() / 1000) + 604800 + 7200,
              seats: 2,
              offlineSeconds: 90,
            },
            h,
          )
        ).status,
        200,
      );
      assert.equal(
        await status(
          await f.post("/v1/refresh", { ...b, requestId: randomUUID() }),
        ),
        "revoked",
      );
      assert.equal(
        (
          await f.post(
            "/v1/owner/licenses/reactivate",
            { licenseId: l.licenseId },
            h,
          )
        ).status,
        200,
      );
      const list = await (
        await f.post("/v1/owner/licenses/list", { customerId: c }, h)
      ).json();
      assert.equal(list.licenses[0].kind, "trial");
      assert.equal(list.activations.length, 1);
      assert.equal(list.revocations.length, 1);
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM owner_audit").first()).n,
        10,
      );
      assert.equal(
        (
          await f.db
            .prepare(
              "SELECT count(*) n FROM licenses WHERE customer_id IS NULL",
            )
            .first()
        ).n,
        1,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "single-use invitation requires matching authenticated IdP customer and rolls back on failure",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      const c = await customer(f),
        h = ownerHeaders(f);
      const invite = await (
        await f.post(
          "/v1/owner/customers/invite",
          { customerId: c, expiresAt: Math.floor(Date.now() / 1000) + 300 },
          h,
        )
      ).json();
      const row = await f.db.prepare("SELECT * FROM invitations").first();
      assert.notEqual(row.token_hash, invite.inviteToken);
      const ch = {
        ...h,
        "cf-access-jwt-assertion": f.jwt({
          sub: "customer-subject",
          aud: ["synthetic-customer-audience"],
          email: "synthetic@example.test",
        }),
      };
      assert.equal(
        (
          await f.post(
            "/v1/customer/accept-invite",
            { token: invite.inviteToken },
            {
              ...ch,
              "cf-access-jwt-assertion": f.jwt({
                sub: "other",
                aud: ["synthetic-customer-audience"],
                email: "other@example.test",
              }),
            },
          )
        ).status,
        403,
      );
      const replies = await Promise.all([
        f.post("/v1/customer/accept-invite", { token: invite.inviteToken }, ch),
        f.post("/v1/customer/accept-invite", { token: invite.inviteToken }, ch),
      ]);
      assert.equal(replies.filter((r) => r.status === 200).length, 1);
      assert.equal(
        (await f.db.prepare("SELECT identity_subject FROM customers").first())
          .identity_subject,
        "customer-subject",
      );
      assert.equal(
        (
          await f.db
            .prepare(
              "SELECT count(*) n FROM owner_audit WHERE action='customer.invite.accept'",
            )
            .first()
        ).n,
        1,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM owner_guard").first()).n,
        0,
      );
      const second = await (
        await f.post(
          "/v1/owner/customers/invite",
          { customerId: c, expiresAt: Math.floor(Date.now() / 1000) + 300 },
          h,
        )
      ).json();
      await f.db.exec(
        "CREATE TRIGGER synthetic_owner_failure BEFORE INSERT ON owner_audit BEGIN SELECT RAISE(ABORT,'synthetic owner write failure'); END;",
      );
      assert.equal(
        (
          await f.post(
            "/v1/customer/accept-invite",
            { token: second.inviteToken },
            ch,
          )
        ).status,
        503,
      );
      assert.equal(
        (
          await f.db
            .prepare("SELECT consumed_at FROM invitations WHERE id!=?")
            .bind(row.id)
            .first()
        ).consumed_at,
        null,
      );
      assert.equal(
        (await f.post("/v1/owner/customers/disable", { customerId: c }, h))
          .status,
        503,
      );
      assert.equal(
        (await f.db.prepare("SELECT status FROM customers").first()).status,
        "active",
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "reset and concurrent transfers preserve tombstones and owner audits",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      const c = await customer(f),
        l = await trial(f, c),
        b = activation(l.key),
        h = ownerHeaders(f);
      assert.equal((await f.post("/v1/activate", b)).status, 200);
      const a = await f.db
        .prepare("SELECT * FROM activations WHERE license_id=?")
        .bind(l.licenseId)
        .first();
      const rs = await Promise.all(
        ["b", "c"].map((n) =>
          f.post(
            "/v1/owner/licenses/transfer",
            {
              licenseId: l.licenseId,
              activationId: a.id,
              deviceId: n.repeat(64),
            },
            h,
          ),
        ),
      );
      assert.equal(rs.filter((r) => r.status === 200).length, 1);
      assert.equal(
        (
          await f.db
            .prepare(
              "SELECT count(*) n FROM owner_audit WHERE action='trial.transfer'",
            )
            .first()
        ).n,
        1,
      );
      assert.equal(
        await status(
          await f.post("/v1/refresh", { ...b, requestId: randomUUID() }),
        ),
        "revoked",
      );
      const a2 = await f.db
        .prepare(
          "SELECT * FROM activations WHERE license_id=? AND status='active'",
        )
        .bind(l.licenseId)
        .first();
      const resets = await Promise.all(
        [1, 2].map(() =>
          f.post(
            "/v1/owner/licenses/reset",
            { licenseId: l.licenseId, activationId: a2.id },
            h,
          ),
        ),
      );
      assert.equal(resets.filter((r) => r.status === 200).length, 1);
      assert.equal(
        (
          await f.db
            .prepare(
              "SELECT count(*) n FROM activations WHERE license_id=? AND status='active'",
            )
            .bind(l.licenseId)
            .first()
        ).n,
        0,
      );
      assert.equal(
        (
          await f.db
            .prepare("SELECT count(*) n FROM activations WHERE license_id=?")
            .bind(l.licenseId)
            .first()
        ).n,
        2,
      );
    } finally {
      await f.close();
    }
  },
);
