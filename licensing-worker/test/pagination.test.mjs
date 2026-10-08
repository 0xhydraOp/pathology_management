import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { startSyntheticWorker } from "./fixture.mjs";

const COUNT = 1051;
const uuid = (group, n) =>
  `${group.padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const customerId = uuid("c1", 1),
  otherCustomerId = uuid("c1", 2);
const headers = (f) => {
  const h = {
    ...f.adminHeaders,
    origin: new URL(f.url).origin,
    "x-patholy-owner-action": "1",
  };
  delete h.authorization;
  return h;
};
const post = (f, route, data) => f.post(`/v1/owner/${route}`, data, headers(f));
async function seed(f) {
  const time = Math.floor(Date.now() / 1000),
    sql = await readFile(
      new URL("../migrations/0003_owner_pagination.sql", import.meta.url),
      "utf8",
    );
  const prior = await f.db.prepare("SELECT * FROM licenses").first();
  const indexes = (await f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name").all()).results;
  await f.db.exec(sql.replaceAll("\n", " "));
  await f.db.exec(sql.replaceAll("\n", " "));
  assert.deepEqual((await f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name").all()).results,indexes);
  assert.deepEqual(await f.db.prepare("SELECT * FROM licenses").first(), prior);
  const numbers = `WITH RECURSIVE n(value) AS(SELECT 1 UNION ALL SELECT value+1 FROM n WHERE value<${COUNT})`;
  await f.db.exec(
    `${numbers} INSERT INTO customers SELECT printf('000000c1-0000-4000-8000-%012x',value),'Synthetic customer '||value,'synthetic-'||value||'@example.test','active',NULL,${time} FROM n;`,
  );
  await f.db.exec(
    `${numbers} INSERT INTO licenses(id,key_hash,expires_at,seats,offline_seconds,revision,status,created_at,customer_id,kind,suspended) SELECT printf('00000011-0000-4000-8000-%012x',value),'synthetic-hash-'||value,${time + 86400},1,60,1,'active',${time},'${customerId}','licence',0 FROM n;`,
  );
  await f.db.exec(
    `${numbers} INSERT INTO activations SELECT printf('000000a1-0000-4000-8000-%012x',value),printf('00000011-0000-4000-8000-%012x',value),printf('%064x',value),'active',${time} FROM n;`,
  );
  await f.db.exec(
    `${numbers} INSERT INTO revocations SELECT printf('000000b1-0000-4000-8000-%012x',value),printf('00000011-0000-4000-8000-%012x',value),printf('000000a1-0000-4000-8000-%012x',value),${time},'synthetic-owner' FROM n;`,
  );
  return time;
}
async function allPages(f, route, input, arrayKey, { first, onFirst } = {}) {
  let cursor,
    records = [],
    pageNumber = 0,
    response = first;
  for (;;) {
    if (!response) {
      const r = await post(f, route, {
        ...input,
        ...(cursor ? { cursor } : {}),
      });
      assert.equal(r.status, 200);
      response = await r.json();
    }
    const rows = response[arrayKey];
    assert(rows.length <= 200);
    records.push(...rows);
    pageNumber++;
    if (pageNumber === 1 && onFirst) await onFirst(response);
    cursor = response.nextCursor;
    if (!cursor) break;
    assert.equal(typeof cursor, "string");
    assert(pageNumber < 20);
    response = undefined;
  }
  assert.equal(new Set(records.map((r) => r.id)).size, records.length);
  return records;
}
test(
  "all customer/licence/device/revocation pages retain >1000 same-timestamp records and legacy streams",
  { timeout: 120000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      await seed(f);
      const legacy = await (
        await post(f, "licenses/list", { customerId })
      ).json();
      assert.equal(legacy.licenses.length, 200);
      assert.equal(legacy.activations.length, 200);
      assert.equal(legacy.revocations.length, 200);
      assert.equal(legacy.nextCursor, legacy.nextCursors.licenses);
      assert(legacy.nextCursors.activations);
      assert(legacy.nextCursors.revocations);
      const customers = await allPages(f, "customers/list", {}, "customers");
      const licenses = await allPages(
        f,
        "licenses/list",
        { customerId },
        "licenses",
      );
      const devices = await allPages(
        f,
        "devices/list",
        { customerId, status: "active" },
        "activations",
      );
      const revocations = await allPages(
        f,
        "revocations/list",
        { customerId },
        "revocations",
      );
      for (const rows of [customers, licenses, devices, revocations]) {
        assert.equal(rows.length, COUNT);
        assert.deepEqual(
          rows.map((r) => r.id),
          rows
            .map((r) => r.id)
            .sort()
            .reverse(),
        );
      }
      const resumedDevices = await post(f, "devices/list", {
        customerId,
        cursor: legacy.nextCursors.activations,
      });
      assert.equal(resumedDevices.status, 200);
      const resumedRevocations = await post(f, "revocations/list", {
        customerId,
        cursor: legacy.nextCursors.revocations,
      });
      assert.equal(resumedRevocations.status, 200);
      const one = await (
        await post(f, "devices/list", {
          customerId,
          licenseId: uuid("11", 1),
          status: "active",
        })
      ).json();
      assert.equal(one.activations.length, 1);
      assert.equal(one.nextCursor, null);
      const wildcard = await (
        await post(f, "customers/list", { query: "%" })
      ).json();
      assert.equal(wildcard.customers.length, 0);
    } finally {
      await f.close();
    }
  },
);
test(
  "opaque cursors reject forgery, resource/customer/licence/filter changes and unauthorized pages",
  { timeout: 120000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      await seed(f);
      const c = await (await post(f, "customers/list", {})).json(),
        l = await (await post(f, "licenses/list", { customerId })).json(),
        d = await (
          await post(f, "devices/list", { customerId, status: "active" })
        ).json(),
        r = await (await post(f, "revocations/list", { customerId })).json();
      const bad = [
        ["customers/list", { cursor: l.nextCursor }],
        [
          "customers/list",
          { cursor: c.nextCursor, query: "Synthetic customer 1" },
        ],
        ["customers/list", { cursor: c.nextCursor, status: "disabled" }],
        [
          "licenses/list",
          { customerId: otherCustomerId, cursor: l.nextCursor },
        ],
        ["licenses/list", { customerId, kind: "trial", cursor: l.nextCursor }],
        [
          "licenses/list",
          { customerId, status: "revoked", cursor: l.nextCursor },
        ],
        [
          "devices/list",
          { customerId, status: "revoked", cursor: d.nextCursor },
        ],
        [
          "devices/list",
          {
            customerId,
            licenseId: uuid("11", 1),
            status: "active",
            cursor: d.nextCursor,
          },
        ],
        ["revocations/list", { customerId, cursor: d.nextCursor }],
        [
          "revocations/list",
          { customerId, licenseId: uuid("11", 1), cursor: r.nextCursor },
        ],
        [
          "revocations/list",
          { customerId: otherCustomerId, cursor: r.nextCursor },
        ],
      ];
      for (const [route, input] of bad)
        assert.equal((await post(f, route, input)).status, 403);
      for (const cursor of [
        null,
        {},
        [],
        42,
        "",
        c.nextCursor + ".extra",
        c.nextCursor.replace(/^./, c.nextCursor[0] === "a" ? "b" : "a"),
        "x".repeat(2049),
      ])
        assert.equal((await post(f, "customers/list", { cursor })).status, 403);
      assert.equal(
        (
          await post(f, "customers/list", {
            cursor: c.nextCursor,
            role: "owner",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await f.post(
            "/v1/owner/customers/list",
            { cursor: c.nextCursor },
            {
              ...headers(f),
              "cf-access-jwt-assertion": f.jwt({ sub: "customer" }),
            },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await f.post(
            "/v1/owner/customers/list",
            { cursor: c.nextCursor },
            { ...headers(f), origin: "https://attacker.test" },
          )
        ).status,
        403,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "keyset continuation survives live changes and can reset/transfer devices after the old 1000-row cutoff",
  { timeout: 120000 },
  async () => {
    const f = await startSyntheticWorker();
    try {
      const time = await seed(f),
        first = await (await post(f, "customers/list", {})).json();
      const newId = randomUUID();
      const records = await allPages(f, "customers/list", {}, "customers", {
        first,
        onFirst: async () => {
          await f.db
            .prepare("INSERT INTO customers VALUES(?,?,?,'active',NULL,?)")
            .bind(newId, "Synthetic newer", "newer@example.test", time + 1)
            .run();
          await f.db
            .prepare(
              "UPDATE customers SET display_name='Synthetic edited' WHERE id=?",
            )
            .bind(uuid("c1", 10))
            .run();
        },
      });
      assert.equal(records.length, COUNT);
      assert(!records.some((r) => r.id === newId));
      assert(
        records.some(
          (r) =>
            r.id === uuid("c1", 10) && r.display_name === "Synthetic edited",
        ),
      );
      const refreshed = await (await post(f, "customers/list", {})).json();
      assert.equal(refreshed.customers[0].id, newId);
      const devices = await allPages(
        f,
        "devices/list",
        { customerId, status: "active" },
        "activations",
      );
      assert.equal(devices.length, COUNT);
      const late = devices.at(-1);
      assert.equal(late.id, uuid("a1", 1));
      assert.equal(
        (
          await post(f, "licenses/reset", {
            licenseId: late.license_id,
            activationId: late.id,
          })
        ).status,
        200,
      );
      const next = devices.at(-2),
        deviceId = "f".repeat(64);
      assert.equal(
        (
          await post(f, "licenses/transfer", {
            licenseId: next.license_id,
            activationId: next.id,
            deviceId,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await f.db
            .prepare("SELECT status FROM activations WHERE id=?")
            .bind(late.id)
            .first()
        ).status,
        "revoked",
      );
      assert.equal(
        (
          await f.db
            .prepare("SELECT status FROM activations WHERE id=?")
            .bind(next.id)
            .first()
        ).status,
        "revoked",
      );
      assert.equal(
        (
          await f.db
            .prepare(
              "SELECT count(*) n FROM activations WHERE license_id=? AND device_id=?",
            )
            .bind(next.license_id, deviceId)
            .first()
        ).n,
        1,
      );
      assert.equal(
        (
          await f.db
            .prepare(
              "SELECT count(*) n FROM owner_audit WHERE action IN('license.reset','license.transfer')",
            )
            .first()
        ).n,
        2,
      );
    } finally {
      await f.close();
    }
  },
);
