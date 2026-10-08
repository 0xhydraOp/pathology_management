import {
  authenticateOwner,
  verifyAccess,
  body,
  exactFields,
  RequestDenied,
  b64,
  hash,
} from "./index.js";
const now = () => Math.floor(Date.now() / 1000);
const idOK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const reply = (data) =>
  Response.json(data, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
function id(value) {
  if (!idOK.test(value)) throw new RequestDenied("id");
  return value;
}
function policy(b, { trial = false } = {}) {
  if (
    (!trial && (!Number.isSafeInteger(b.expiresAt) || b.expiresAt <= now())) ||
    !Number.isInteger(b.seats) ||
    b.seats < 1 ||
    b.seats > 10000 ||
    !Number.isInteger(b.offlineSeconds) ||
    b.offlineSeconds < 1 ||
    b.offlineSeconds > 2592000
  )
    throw new RequestDenied("policy");
}
function csrf(request) {
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    request.headers.get("x-patholy-owner-action") !== "1"
  )
    throw new RequestDenied("csrf");
}
function audit(db, actor, action, customerId, licenseId, details = {}) {
  return db
    .prepare("INSERT INTO owner_audit VALUES(?,?,?,?,?,?,?)")
    .bind(
      crypto.randomUUID(),
      actor,
      action,
      customerId,
      licenseId,
      now(),
      JSON.stringify(details),
    );
}
const fields = {
  "customers/list": [],
  "customers/create": ["displayName", "email"],
  "customers/disable": ["customerId"],
  "customers/enable": ["customerId"],
  "customers/invite": ["customerId", "expiresAt"],
  "licenses/list": ["customerId"],
  "licenses/create": [
    "customerId",
    "kind",
    "expiresAt",
    "seats",
    "offlineSeconds",
  ],
  "licenses/renew": ["licenseId", "expiresAt", "seats", "offlineSeconds"],
  "licenses/suspend": ["licenseId"],
  "licenses/reactivate": ["licenseId"],
  "licenses/revoke": ["licenseId"],
  "licenses/reset": ["licenseId", "activationId"],
  "licenses/transfer": ["licenseId", "activationId", "deviceId"],
  "audit/list": [],
  "devices/list": ["customerId"],
  "revocations/list": ["customerId"],
};
// Keyset pages are bounded technical queries, not business policy. A cursor is
// authenticated and bound to the resource, scope and filters that minted it.
const PAGE_SIZE = 200;
const pageFields = {
  "customers/list": ["cursor", "query", "status"],
  "licenses/list": ["cursor", "kind", "status"],
  "devices/list": ["cursor", "licenseId", "status"],
  "revocations/list": ["cursor", "licenseId"],
};
function optionalFields(value, required, optional) {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !required.every((key) => Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  ) {
    throw new RequestDenied("fields");
  }
  return value;
}
function option(value, choices) {
  if (value === undefined) return "all";
  if (!choices.includes(value)) throw new RequestDenied("filter");
  return value;
}
const cursorText = new TextEncoder();
async function cursorKey(env) {
  return crypto.subtle.importKey(
    "raw",
    cursorText.encode(env.RATE_LIMIT_SALT),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
function decodeCursor64(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new RequestDenied("cursor");
  try {
    return Uint8Array.from(
      atob(value.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
  } catch {
    throw new RequestDenied("cursor");
  }
}
async function parseCursor(value, scope, env) {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > 2048)
    throw new RequestDenied("cursor");
  const parts = value.split(".");
  if (parts.length !== 2) throw new RequestDenied("cursor");
  const payloadBytes = decodeCursor64(parts[0]),
    signature = decodeCursor64(parts[1]);
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      await cursorKey(env),
      signature,
      cursorText.encode(`patholy-owner-page-v1\n${parts[0]}`),
    ))
  )
    throw new RequestDenied("cursor");
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    throw new RequestDenied("cursor");
  }
  exactFields(payload, ["v", "scope", "createdAt", "id"]);
  if (
    payload.v !== 1 ||
    payload.scope !== JSON.stringify(scope) ||
    !Number.isSafeInteger(payload.createdAt) ||
    payload.createdAt < 0
  )
    throw new RequestDenied("cursor");
  id(payload.id);
  return payload;
}
async function page(
  db,
  env,
  scope,
  cursor,
  select,
  predicate,
  bindings,
  alias,
) {
  const after = await parseCursor(cursor, scope, env);
  const where = [...predicate];
  const values = [...bindings];
  if (after) {
    where.push(
      `(${alias}.created_at<? OR (${alias}.created_at=? AND ${alias}.id<?))`,
    );
    values.push(after.createdAt, after.createdAt, after.id);
  }
  const statement = db.prepare(
    `${select}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${alias}.created_at DESC,${alias}.id DESC LIMIT ${PAGE_SIZE + 1}`,
  );
  const rows = (
    await (values.length ? statement.bind(...values) : statement).all()
  ).results;
  const records = rows.slice(0, PAGE_SIZE),
    last = records.at(-1);
  let nextCursor = null;
  if (rows.length > PAGE_SIZE) {
    const payload = b64(
      cursorText.encode(
        JSON.stringify({
          v: 1,
          scope: JSON.stringify(scope),
          createdAt: last.created_at,
          id: last.id,
        }),
      ),
    );
    nextCursor = `${payload}.${b64(await crypto.subtle.sign("HMAC", await cursorKey(env), cursorText.encode(`patholy-owner-page-v1\n${payload}`)))}`;
  }
  return { records, nextCursor };
}
async function devicePage(db, env, b, cursor) {
  const customerId = id(b.customerId),
    licenseId = b.licenseId === undefined ? null : id(b.licenseId);
  const status = option(b.status, ["all", "active", "revoked"]);
  const predicate = ["l.customer_id=?"],
    bindings = [customerId];
  if (licenseId !== null) {
    predicate.push("a.license_id=?");
    bindings.push(licenseId);
  }
  if (status !== "all") {
    predicate.push("a.status=?");
    bindings.push(status);
  }
  return page(
    db,
    env,
    { resource: "devices", customerId, licenseId, status },
    cursor,
    "SELECT a.id,a.license_id,a.device_id,a.status,a.created_at FROM activations a JOIN licenses l ON l.id=a.license_id",
    predicate,
    bindings,
    "a",
  );
}
async function revocationPage(db, env, b, cursor) {
  const customerId = id(b.customerId),
    licenseId = b.licenseId === undefined ? null : id(b.licenseId);
  const predicate = ["l.customer_id=?"],
    bindings = [customerId];
  if (licenseId !== null) {
    predicate.push("r.license_id=?");
    bindings.push(licenseId);
  }
  return page(
    db,
    env,
    { resource: "revocations", customerId, licenseId },
    cursor,
    "SELECT r.id,r.license_id,r.activation_id,r.created_at,r.actor FROM revocations r JOIN licenses l ON l.id=r.license_id",
    predicate,
    bindings,
    "r",
  );
}
export async function ownerApi(request, env, path) {
  const who = await authenticateOwner(request, env, { requireToken: false });
  csrf(request);
  const route = path.slice("/v1/owner/".length);
  if (route === "customers/invite" && env.CUSTOMER_PORTAL_ENABLED !== "true")
    throw new RequestDenied("portal disabled");
  if (!fields[route]) throw new RequestDenied("route");
  const raw = await body(request);
  const b =
    route === "licenses/create" && raw.kind === "trial"
      ? exactFields(raw, ["customerId", "kind", "seats", "offlineSeconds"])
      : pageFields[route]
        ? optionalFields(raw, fields[route], pageFields[route])
        : exactFields(
            raw,
            route === "audit/list" && Object.hasOwn(raw, "cursor")
              ? ["cursor"]
              : fields[route],
          );
  const db = env.DB.withSession("first-primary");
  if (route === "customers/list") {
    const status = option(b.status, ["all", "active", "disabled"]);
    if (
      b.query !== undefined &&
      (typeof b.query !== "string" || b.query.length > 120)
    )
      throw new RequestDenied("filter");
    const query = (b.query || "").trim().toLowerCase(),
      predicate = [],
      bindings = [];
    if (status !== "all") {
      predicate.push("c.status=?");
      bindings.push(status);
    }
    if (query) {
      const match = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      predicate.push(
        "(lower(c.display_name) LIKE ? ESCAPE '\\' OR lower(c.email) LIKE ? ESCAPE '\\')",
      );
      bindings.push(match, match);
    }
    const result = await page(
      db,
      env,
      { resource: "customers", status, query },
      b.cursor,
      "SELECT c.id,c.display_name,c.email,c.status,c.identity_subject,c.created_at FROM customers c",
      predicate,
      bindings,
      "c",
    );
    return reply({ customers: result.records, nextCursor: result.nextCursor });
  }
  if (route === "devices/list") {
    const result = await devicePage(db, env, b, b.cursor);
    return reply({
      activations: result.records,
      nextCursor: result.nextCursor,
    });
  }
  if (route === "revocations/list") {
    const result = await revocationPage(db, env, b, b.cursor);
    return reply({
      revocations: result.records,
      nextCursor: result.nextCursor,
    });
  }
  if (route === "customers/create") {
    if (
      typeof b.displayName !== "string" ||
      b.displayName.trim().length < 1 ||
      b.displayName.length > 120 ||
      typeof b.email !== "string" ||
      b.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)
    )
      throw new RequestDenied("customer");
    const customerId = crypto.randomUUID();
    await db.batch([
      db
        .prepare("INSERT INTO customers VALUES(?,?,?,'active',NULL,?)")
        .bind(customerId, b.displayName.trim(), b.email.toLowerCase(), now()),
      audit(db, who, "customer.create", customerId, null),
    ]);
    return reply({ customerId });
  }
  if (route.startsWith("customers/")) {
    const customerId = id(b.customerId),
      c = await db
        .prepare("SELECT * FROM customers WHERE id=?")
        .bind(customerId)
        .first();
    if (!c) throw new RequestDenied("customer");
    if (route === "customers/invite") {
      if (
        !Number.isSafeInteger(b.expiresAt) ||
        b.expiresAt <= now() ||
        b.expiresAt > now() + 604800 ||
        c.status !== "active"
      )
        throw new RequestDenied("invite");
      const token = b64(crypto.getRandomValues(new Uint8Array(32)));
      await db.batch([
        db
          .prepare(
            "INSERT INTO owner_guard(id) VALUES(CASE WHEN EXISTS(SELECT 1 FROM customers WHERE id=? AND status='active') THEN ? ELSE NULL END)",
          )
          .bind(customerId, crypto.randomUUID()),
        db
          .prepare(
            "UPDATE invitations SET consumed_at=? WHERE customer_id=? AND consumed_at IS NULL",
          )
          .bind(now(), customerId),
        db
          .prepare("INSERT INTO invitations VALUES(?,?,?,?,?,NULL,?)")
          .bind(
            crypto.randomUUID(),
            customerId,
            await hash(token),
            c.email,
            b.expiresAt,
            now(),
          ),
        audit(db, who, "customer.invite", customerId, null, {
          expiresAt: b.expiresAt,
        }),
        db.prepare("DELETE FROM owner_guard"),
      ]);
      return reply({ customerId, inviteToken: token, expiresAt: b.expiresAt });
    }
    const status = route === "customers/disable" ? "disabled" : "active";
    await db.batch([
      db
        .prepare("UPDATE customers SET status=? WHERE id=?")
        .bind(status, customerId),
      db
        .prepare("UPDATE licenses SET revision=revision+1 WHERE customer_id=?")
        .bind(customerId),
      audit(
        db,
        who,
        route === "customers/disable" ? "customer.disable" : "customer.enable",
        customerId,
        null,
      ),
    ]);
    return reply({ customerId, status });
  }
  if (route === "audit/list") {
    const cursor = b.cursor;
    if (cursor !== undefined) {
      exactFields(cursor, ["createdAt", "id"]);
      if (!Number.isSafeInteger(cursor.createdAt) || cursor.createdAt < 0)
        throw new RequestDenied("cursor");
      id(cursor.id);
    }
    const union =
      "SELECT id,actor,action,customer_id,license_id,created_at,details FROM owner_audit UNION ALL SELECT a.id,a.actor,a.action,l.customer_id,a.license_id,a.created_at,a.details FROM admin_audit a JOIN licenses l ON l.id=a.license_id";
    const query = db.prepare(
      `SELECT * FROM (${union}) ${cursor ? "WHERE created_at<? OR (created_at=? AND id<?)" : ""} ORDER BY created_at DESC,id DESC LIMIT 1001`,
    );
    const rows = (
      await (
        cursor
          ? query.bind(cursor.createdAt, cursor.createdAt, cursor.id)
          : query
      ).all()
    ).results;
    const events = rows.slice(0, 1000),
      last = events.at(-1);
    return reply({
      events,
      nextCursor:
        rows.length > 1000 ? { createdAt: last.created_at, id: last.id } : null,
    });
  }
  if (route === "licenses/list") {
    const customerId = id(b.customerId),
      kind = option(b.kind, ["all", "trial", "licence"]),
      status = option(b.status, [
        "all",
        "active",
        "revoked",
        "suspended",
        "expired",
        "pending",
      ]);
    const predicate = ["l.customer_id=?"],
      bindings = [customerId];
    if (kind !== "all") {
      predicate.push("l.kind=?");
      bindings.push(kind);
    }
    if (status === "revoked") predicate.push("l.status='revoked'");
    else if (status === "suspended")
      predicate.push("l.status='active' AND l.suspended=1");
    else if (status === "expired") {
      predicate.push(
        "l.status='active' AND l.suspended=0 AND l.expires_at<=? AND (l.kind!='trial' OR l.trial_started_at IS NOT NULL)",
      );
      bindings.push(now());
    } else if (status === "pending") {
      predicate.push(
        "l.status='active' AND l.suspended=0 AND l.kind='trial' AND l.trial_started_at IS NULL",
      );
    } else if (status === "active") {
      predicate.push(
        "l.status='active' AND l.suspended=0 AND (l.expires_at>? OR (l.kind='trial' AND l.trial_started_at IS NULL))",
      );
      bindings.push(now());
    }
    const licenses = await page(
      db,
      env,
      { resource: "licenses", customerId, kind, status },
      b.cursor,
      "SELECT l.id,l.customer_id,l.kind,l.trial_started_at,l.status,l.suspended,l.expires_at,l.seats,l.offline_seconds,l.revision,l.created_at,(SELECT count(*) FROM activations a WHERE a.license_id=l.id AND a.status='active') active_seats FROM licenses l",
      predicate,
      bindings,
      "l",
    );
    // Preserve legacy first-page arrays while exposing independent continuations.
    const scope = { customerId };
    const [devices, revocations] = await Promise.all([
      devicePage(db, env, scope, undefined),
      revocationPage(db, env, scope, undefined),
    ]);
    return reply({
      licenses: licenses.records,
      activations: devices.records,
      revocations: revocations.records,
      nextCursor: licenses.nextCursor,
      nextCursors: {
        licenses: licenses.nextCursor,
        activations: devices.nextCursor,
        revocations: revocations.nextCursor,
      },
    });
  }
  if (route === "licenses/create") {
    policy(b, { trial: b.kind === "trial" });
    const customerId = id(b.customerId);
    if (!["trial", "licence"].includes(b.kind)) throw new RequestDenied("kind");
    const c = await db
      .prepare("SELECT id FROM customers WHERE id=? AND status='active'")
      .bind(customerId)
      .first();
    if (!c) throw new RequestDenied("customer");
    const licenseId = crypto.randomUUID(),
      key = `PTH-${b64(crypto.getRandomValues(new Uint8Array(32)))}`;
    await db.batch([
      db
        .prepare(
          "INSERT INTO owner_guard(id) VALUES(CASE WHEN EXISTS(SELECT 1 FROM customers WHERE id=? AND status='active') THEN ? ELSE NULL END)",
        )
        .bind(customerId, crypto.randomUUID()),
      db
        .prepare(
          "INSERT INTO licenses(id,key_hash,expires_at,seats,offline_seconds,revision,status,created_at,customer_id,kind,suspended) VALUES(?,?,?,?,?,1,'active',?,?,?,0)",
        )
        .bind(
          licenseId,
          await hash(key),
          b.kind === "trial" ? 0 : b.expiresAt,
          b.seats,
          b.offlineSeconds,
          now(),
          customerId,
          b.kind,
        ),
      audit(
        db,
        who,
        b.kind === "trial" ? "trial.grant" : "license.create",
        customerId,
        licenseId,
        {
          ...(b.kind === "trial"
            ? { startsOnFirstActivation: true, durationSeconds: 604800 }
            : { expiresAt: b.expiresAt }),
          seats: b.seats,
          offlineSeconds: b.offlineSeconds,
        },
      ),
      db.prepare("DELETE FROM owner_guard"),
    ]);
    return reply({ licenseId, key });
  }
  const licenseId = id(b.licenseId),
    l = await db
      .prepare("SELECT * FROM licenses WHERE id=?")
      .bind(licenseId)
      .first();
  if (!l) throw new RequestDenied("license");
  const changes = [];
  let action = route.slice("licenses/".length);
  let details = {};
  if (action === "renew") {
    policy(b);
    if (
      l.kind === "trial" &&
      (l.trial_started_at === null || b.expiresAt <= l.expires_at)
    )
      throw new RequestDenied("trial");
    changes.push(
      db
        .prepare(
          "UPDATE licenses SET expires_at=?,seats=?,offline_seconds=?,revision=revision+1 WHERE id=?",
        )
        .bind(b.expiresAt, b.seats, b.offlineSeconds, licenseId),
    );
    details = {
      expiresAt: b.expiresAt,
      seats: b.seats,
      offlineSeconds: b.offlineSeconds,
    };
  } else if (action === "suspend")
    changes.push(
      db
        .prepare(
          "UPDATE licenses SET suspended=1,revision=revision+1 WHERE id=?",
        )
        .bind(licenseId),
    );
  else if (action === "reactivate") {
    if (
      l.expires_at <= now() &&
      !(l.kind === "trial" && l.trial_started_at === null)
    )
      throw new RequestDenied("expired");
    changes.push(
      db
        .prepare(
          "UPDATE licenses SET suspended=0,status='active',revision=revision+1 WHERE id=?",
        )
        .bind(licenseId),
    );
  } else if (action === "revoke")
    changes.push(
      db
        .prepare(
          "UPDATE licenses SET status='revoked',revision=revision+1 WHERE id=?",
        )
        .bind(licenseId),
      db
        .prepare("INSERT INTO revocations VALUES(?,?,NULL,?,?)")
        .bind(crypto.randomUUID(), licenseId, now(), who),
    );
  else if (action === "reset" || action === "transfer") {
    id(b.activationId);
    const a = await db
      .prepare(
        "SELECT * FROM activations WHERE id=? AND license_id=? AND status='active'",
      )
      .bind(b.activationId, licenseId)
      .first();
    if (!a) throw new RequestDenied("activation");
    changes.push(
      db
        .prepare(
          "UPDATE activations SET status='revoked' WHERE id=? AND status='active'",
        )
        .bind(a.id),
    );
    if (action === "transfer") {
      if (!/^[a-f0-9]{64}$/.test(b.deviceId) || b.deviceId === a.device_id)
        throw new RequestDenied("device");
      const used = await db
        .prepare(
          "SELECT id FROM activations WHERE license_id=? AND device_id=?",
        )
        .bind(licenseId, b.deviceId)
        .first();
      if (used) throw new RequestDenied("device");
      changes.push(
        db
          .prepare(
            "INSERT INTO activations VALUES(?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'active',?)",
          )
          .bind(crypto.randomUUID(), licenseId, b.deviceId, now()),
      );
    } else
      changes.push(
        db
          .prepare(
            "INSERT INTO owner_guard(id) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END)",
          )
          .bind(crypto.randomUUID()),
      );
    changes.push(
      db
        .prepare("INSERT INTO revocations VALUES(?,?,?,?,?)")
        .bind(crypto.randomUUID(), licenseId, a.id, now(), who),
      db
        .prepare("UPDATE licenses SET revision=revision+1 WHERE id=?")
        .bind(licenseId),
    );
    details = { activationId: a.id };
  } else throw new RequestDenied("action");
  changes.push(
    audit(
      db,
      who,
      `${l.kind === "trial" ? "trial" : "license"}.${action}`,
      l.customer_id,
      licenseId,
      details,
    ),
  );
  changes.push(db.prepare("DELETE FROM owner_guard"));
  await db.batch(changes);
  return reply({ licenseId });
}
export async function acceptInvitation(request, env) {
  csrf(request);
  const claims = await verifyAccess(request, env, env.CUSTOMER_ACCESS_AUDIENCE);
  if (typeof claims.email !== "string" || claims.email_verified === false)
    throw new RequestDenied("identity");
  const b = exactFields(await body(request), ["token"]);
  if (typeof b.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(b.token))
    throw new RequestDenied("invite");
  const db = env.DB.withSession("first-primary");
  const invite = await db
    .prepare(
      "SELECT i.*,c.status,c.identity_subject FROM invitations i JOIN customers c ON c.id=i.customer_id WHERE i.token_hash=? AND i.consumed_at IS NULL AND i.expires_at>? AND c.status='active'",
    )
    .bind(await hash(b.token), now())
    .first();
  if (
    !invite ||
    invite.email.toLowerCase() !== claims.email.toLowerCase() ||
    (invite.identity_subject && invite.identity_subject !== claims.sub)
  )
    throw new RequestDenied("invite");
  await db.batch([
    db
      .prepare(
        "UPDATE invitations SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>?",
      )
      .bind(now(), invite.id, now()),
    db
      .prepare(
        "INSERT INTO owner_guard(id) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END)",
      )
      .bind(crypto.randomUUID()),
    db
      .prepare(
        "UPDATE customers SET identity_subject=? WHERE id=? AND status='active' AND (identity_subject IS NULL OR identity_subject=?)",
      )
      .bind(claims.sub, invite.customer_id, claims.sub),
    db
      .prepare(
        "INSERT INTO owner_guard(id) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END)",
      )
      .bind(crypto.randomUUID()),
    audit(db, claims.sub, "customer.invite.accept", invite.customer_id, null),
    db.prepare("DELETE FROM owner_guard"),
  ]);
  return reply({ customerId: invite.customer_id });
}
