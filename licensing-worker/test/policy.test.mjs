import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { startSyntheticWorker } from "./fixture.mjs";
const SEVEN_DAYS = 604800,
  THIRTY_DAYS = 2592000;
function headers(f) {
  const h = { ...f.adminHeaders, origin: f.url, "x-patholy-owner-action": "1" };
  delete h.authorization;
  return h;
}
const owner = (f, action, data) =>
  f.post("/v1/owner/" + action, data, headers(f));
async function createTrial(
  f,
  { seats = 1, offlineSeconds = THIRTY_DAYS } = {},
) {
  const c = await owner(f, "customers/create", {
    displayName: "Synthetic policy customer",
    email: `synthetic-${randomUUID()}@example.test`,
  });
  assert.equal(c.status, 200);
  const customerId = (await c.json()).customerId;
  const l = await owner(f, "licenses/create", {
    customerId,
    kind: "trial",
    seats,
    offlineSeconds,
  });
  assert.equal(l.status, 200);
  return { ...(await l.json()), customerId };
}
const request = (key, deviceId = "a".repeat(64), requestId = randomUUID()) => ({
  key,
  deviceId,
  requestId,
  appVersion: "synthetic-policy",
});
const payload = async (response) => {
  assert.equal(response.status, 200);
  return JSON.parse(
    Buffer.from((await response.json()).grant.payload, "base64url"),
  );
};
test(
  "pending trial filters stay usable and manual key activation needs no customer portal or identity",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker({ customerPortal: false });
    try {
      const trial = await createTrial(f),
        customer = await f.db
          .prepare("SELECT * FROM customers WHERE id=?")
          .bind(trial.customerId)
          .first();
      assert.equal(customer.identity_subject, null);
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM invitations").first()).n,
        0,
      );
      const list = async (status) =>
        (
          await (
            await owner(f, "licenses/list", {
              customerId: trial.customerId,
              status,
            })
          ).json()
        ).licenses;
      assert.equal((await list("pending")).length, 1);
      assert.equal((await list("active")).length, 1);
      assert.equal((await list("expired")).length, 0);
      assert.equal(
        (
          await owner(f, "customers/invite", {
            customerId: trial.customerId,
            expiresAt: Math.floor(Date.now() / 1000) + 300,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await f.mf.dispatchFetch(f.apiUrl + "/invite", {
            headers: {
              "cf-access-jwt-assertion": f.jwt({
                sub: "customer",
                aud: ["synthetic-customer-audience"],
                email: customer.email,
              }),
            },
          })
        ).status,
        404,
      );
      const grant = await payload(
        await f.post("/v1/activate", request(trial.key)),
      );
      assert.equal(grant.status, "active");
      assert.equal((await list("pending")).length, 0);
      assert.equal((await list("active")).length, 1);
      assert.equal((await list("expired")).length, 0);
      assert.equal(
        (
          await f.db
            .prepare("SELECT identity_subject FROM customers WHERE id=?")
            .bind(trial.customerId)
            .first()
        ).identity_subject,
        null,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM invitations").first()).n,
        0,
      );
      await f.db
        .prepare("UPDATE licenses SET expires_at=? WHERE id=?")
        .bind(Math.floor(Date.now() / 1000) - 1, trial.licenseId)
        .run();
      assert.equal((await list("pending")).length, 0);
      assert.equal((await list("active")).length, 0);
      assert.equal((await list("expired")).length, 1);
    } finally {
      await f.close();
    }
  },
);
test(
  "migration preserves historical trial anchor/expiry and caps oversized stored allowances",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker({ customerMigration: false });
    try {
      for (const name of [
        "0002_customers_owner.sql",
        "0003_owner_pagination.sql",
      ])
        await f.db.exec(
          (
            await readFile(
              new URL("../migrations/" + name, import.meta.url),
              "utf8",
            )
          ).replaceAll("\n", " "),
        );
      const time = Math.floor(Date.now() / 1000),
        trialId = randomUUID(),
        activationId = randomUUID();
      await f.db
        .prepare(
          "INSERT INTO licenses(id,key_hash,expires_at,seats,offline_seconds,revision,status,created_at,customer_id,kind,suspended) VALUES(?,?,?,?,?,1,'active',?,NULL,'trial',0)",
        )
        .bind(
          trialId,
          "synthetic-historical-trial",
          time + 1000,
          1,
          THIRTY_DAYS + 100,
          time - 1000,
        )
        .run();
      await f.db
        .prepare("INSERT INTO activations VALUES(?,?,?,'active',?)")
        .bind(activationId, trialId, "c".repeat(64), time - 100)
        .run();
      const before = await f.db
        .prepare("SELECT * FROM licenses WHERE id=?")
        .bind(trialId)
        .first();
      await f.db.exec(
        (
          await readFile(
            new URL("../migrations/0004_confirmed_policy.sql", import.meta.url),
            "utf8",
          )
        ).replaceAll("\n", " "),
      );
      const after = await f.db
        .prepare("SELECT * FROM licenses WHERE id=?")
        .bind(trialId)
        .first();
      assert.equal(after.id, before.id);
      assert.equal(after.key_hash, before.key_hash);
      assert.equal(after.expires_at, before.expires_at);
      assert.equal(after.trial_started_at, time - 100);
      assert.equal(after.offline_seconds, THIRTY_DAYS);
      assert.equal(after.revision, before.revision);
      await assert.rejects(
        f.db
          .prepare("UPDATE licenses SET trial_started_at=? WHERE id=?")
          .bind(time, trialId)
          .run(),
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "first successful trial activation is exactly seven days, concurrent claims/retries cannot restart it",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      const l = await createTrial(f),
        before = await f.db
          .prepare("SELECT * FROM licenses WHERE id=?")
          .bind(l.licenseId)
          .first();
      assert.equal(before.trial_started_at, null);
      assert.equal(before.expires_at, 0);
      assert.equal((await f.post("/v1/refresh", request(l.key))).status, 403);
      const same = request(l.key),
        attempts = await Promise.all(
          Array.from({ length: 12 }, () => f.post("/v1/activate", same)),
        );
      assert(attempts.every((r) => r.status === 200));
      const grants = await Promise.all(attempts.map(payload)),
        started = await f.db
          .prepare("SELECT * FROM licenses WHERE id=?")
          .bind(l.licenseId)
          .first();
      assert.equal(started.expires_at - started.trial_started_at, SEVEN_DAYS);
      assert(started.trial_started_at >= before.created_at);
      assert(
        grants.every(
          (g) =>
            g.expiresAt === started.expires_at &&
            g.offlineUntil === started.expires_at,
        ),
      );
      assert.equal(
        (
          await f.db
            .prepare(
              "SELECT count(*) n FROM owner_audit WHERE license_id=? AND action='trial.start'",
            )
            .bind(l.licenseId)
            .first()
        ).n,
        1,
      );
      assert.equal(
        (await f.post("/v1/activate", request(l.key, "b".repeat(64)))).status,
        403,
      );
      await assert.rejects(
        f.db
          .prepare("UPDATE licenses SET trial_started_at=NULL WHERE id=?")
          .bind(l.licenseId)
          .run(),
      );
      assert.equal(
        (await owner(f, "licenses/suspend", { licenseId: l.licenseId })).status,
        200,
      );
      assert.equal(
        (await owner(f, "licenses/reactivate", { licenseId: l.licenseId }))
          .status,
        200,
      );
      const activation = await f.db
        .prepare("SELECT * FROM activations WHERE license_id=?")
        .bind(l.licenseId)
        .first();
      assert.equal(
        (
          await owner(f, "licenses/transfer", {
            licenseId: l.licenseId,
            activationId: activation.id,
            deviceId: "c".repeat(64),
          })
        ).status,
        200,
      );
      const fresh = await payload(
        await f.post("/v1/refresh", request(l.key, "c".repeat(64))),
      );
      assert.equal(fresh.expiresAt, started.expires_at);
      assert.equal(
        (
          await f.db
            .prepare("SELECT trial_started_at FROM licenses WHERE id=?")
            .bind(l.licenseId)
            .first()
        ).trial_started_at,
        started.trial_started_at,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "failed concurrent seat/idempotency/write claims leave an unstarted trial and no partial audit",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      const l = await createTrial(f);
      await f.db.exec(
        "CREATE TRIGGER synthetic_trial_failure BEFORE INSERT ON requests BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;",
      );
      assert.equal((await f.post("/v1/activate", request(l.key))).status, 503);
      let row = await f.db
        .prepare("SELECT * FROM licenses WHERE id=?")
        .bind(l.licenseId)
        .first();
      assert.equal(row.trial_started_at, null);
      assert.equal(row.expires_at, 0);
      assert.equal(
        (
          await f.db
            .prepare("SELECT count(*) n FROM activations WHERE license_id=?")
            .bind(l.licenseId)
            .first()
        ).n,
        0,
      );
      assert.equal(
        (
          await f.db
            .prepare(
              "SELECT count(*) n FROM owner_audit WHERE action='trial.start'",
            )
            .first()
        ).n,
        0,
      );
      await f.db.exec("DROP TRIGGER synthetic_trial_failure;");
      const replies = await Promise.all(
        ["a", "b", "c"].map((d) =>
          f.post("/v1/activate", request(l.key, d.repeat(64))),
        ),
      );
      assert.equal(replies.filter((r) => r.status === 200).length, 1);
      row = await f.db
        .prepare("SELECT * FROM licenses WHERE id=?")
        .bind(l.licenseId)
        .first();
      assert.equal(row.expires_at - row.trial_started_at, SEVEN_DAYS);
      assert.equal(
        (
          await f.db
            .prepare("SELECT count(*) n FROM activations WHERE license_id=?")
            .bind(l.licenseId)
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
  "explicit owner trial extension is audited, requires a started trial and never moves its anchor",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      const l = await createTrial(f),
        renew = {
          licenseId: l.licenseId,
          expiresAt: Math.floor(Date.now() / 1000) + SEVEN_DAYS * 2,
          seats: 1,
          offlineSeconds: THIRTY_DAYS,
        };
      assert.equal((await owner(f, "licenses/renew", renew)).status, 403);
      await payload(await f.post("/v1/activate", request(l.key)));
      const first = await f.db
        .prepare("SELECT * FROM licenses WHERE id=?")
        .bind(l.licenseId)
        .first();
      assert.equal(
        (
          await owner(f, "licenses/renew", {
            ...renew,
            expiresAt: first.expires_at,
          })
        ).status,
        403,
      );
      assert.equal((await owner(f, "licenses/renew", renew)).status, 200);
      const next = await f.db
        .prepare("SELECT * FROM licenses WHERE id=?")
        .bind(l.licenseId)
        .first();
      assert.equal(next.trial_started_at, first.trial_started_at);
      assert.equal(next.expires_at, renew.expiresAt);
      assert.equal(
        (
          await f.db
            .prepare(
              "SELECT count(*) n FROM owner_audit WHERE license_id=? AND action='trial.renew'",
            )
            .bind(l.licenseId)
            .first()
        ).n,
        1,
      );
      await f.db
        .prepare("UPDATE licenses SET expires_at=? WHERE id=?")
        .bind(Math.floor(Date.now() / 1000) - 1, l.licenseId)
        .run();
      const expired = await payload(
        await f.post("/v1/refresh", request(l.key)),
      );
      assert.equal(expired.status, "expired");
      assert.equal(
        (await f.post("/v1/activate", request(l.key, "b".repeat(64)))).status,
        403,
      );
      assert.equal(
        (
          await f.db
            .prepare("SELECT trial_started_at FROM licenses WHERE id=?")
            .bind(l.licenseId)
            .first()
        ).trial_started_at,
        first.trial_started_at,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "paid offline grants cap at thirty days and expiry, larger administrative policy rejects",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker({
      offlineSeconds: THIRTY_DAYS,
      expiresAt: Math.floor(Date.now() / 1000) + THIRTY_DAYS * 2,
    });
    try {
      const active = await payload(
        await f.post("/v1/activate", request(f.key)),
      );
      assert.equal(active.offlineUntil - active.issuedAt, THIRTY_DAYS);
      const config = {
        licenseId: f.licenseId,
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        seats: 1,
        offlineSeconds: THIRTY_DAYS,
      };
      assert.equal(
        (
          await f.post(
            "/v1/admin/renew",
            { ...config, offlineSeconds: THIRTY_DAYS + 1 },
            f.adminHeaders,
          )
        ).status,
        403,
      );
      assert.equal(
        (await f.post("/v1/admin/renew", config, f.adminHeaders)).status,
        200,
      );
      const capped = await payload(await f.post("/v1/refresh", request(f.key)));
      assert.equal(capped.offlineUntil, capped.expiresAt);
      // Even an old oversized stored allowance cannot mint an oversized grant.
      await f.db
        .prepare(
          "UPDATE licenses SET expires_at=?,offline_seconds=? WHERE id=?",
        )
        .bind(
          Math.floor(Date.now() / 1000) + THIRTY_DAYS * 2,
          THIRTY_DAYS * 10,
          f.licenseId,
        )
        .run();
      const legacy = await payload(await f.post("/v1/refresh", request(f.key)));
      assert.equal(legacy.offlineUntil - legacy.issuedAt, THIRTY_DAYS);
    } finally {
      await f.close();
    }
  },
);
