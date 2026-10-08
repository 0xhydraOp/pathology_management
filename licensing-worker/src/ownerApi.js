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
function policy(b) {
  if (
    !Number.isSafeInteger(b.expiresAt) ||
    b.expiresAt <= now() ||
    !Number.isInteger(b.seats) ||
    b.seats < 1 ||
    b.seats > 10000 ||
    !Number.isInteger(b.offlineSeconds) ||
    b.offlineSeconds < 1 ||
    b.offlineSeconds > 31536000
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
};
export async function ownerApi(request, env, path) {
  const who = await authenticateOwner(request, env, { requireToken: false });
  csrf(request);
  const route = path.slice("/v1/owner/".length);
  if (!fields[route]) throw new RequestDenied("route");
  const raw = await body(request);
  const b = exactFields(
    raw,
    route === "audit/list" && Object.hasOwn(raw, "cursor")
      ? ["cursor"]
      : fields[route],
  );
  const db = env.DB.withSession("first-primary");
  if (route === "customers/list")
    return reply({
      customers: (
        await db
          .prepare(
            "SELECT id,display_name,email,status,identity_subject,created_at FROM customers ORDER BY created_at DESC LIMIT 1000",
          )
          .all()
      ).results,
    });
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
    const customerId = id(b.customerId);
    const licenses = (
      await db
        .prepare(
          "SELECT l.id,l.customer_id,l.kind,l.status,l.suspended,l.expires_at,l.seats,l.offline_seconds,l.revision,l.created_at,(SELECT count(*) FROM activations a WHERE a.license_id=l.id AND a.status='active') active_seats FROM licenses l WHERE l.customer_id=? ORDER BY l.created_at DESC LIMIT 1000",
        )
        .bind(customerId)
        .all()
    ).results;
    const activations = (
      await db
        .prepare(
          "SELECT a.id,a.license_id,a.device_id,a.status,a.created_at FROM activations a JOIN licenses l ON l.id=a.license_id WHERE l.customer_id=? LIMIT 1000",
        )
        .bind(customerId)
        .all()
    ).results;
    const revocations = (
      await db
        .prepare(
          "SELECT r.id,r.license_id,r.activation_id,r.created_at,r.actor FROM revocations r JOIN licenses l ON l.id=r.license_id WHERE l.customer_id=? ORDER BY r.created_at DESC LIMIT 1000",
        )
        .bind(customerId)
        .all()
    ).results;
    return reply({ licenses, activations, revocations });
  }
  if (route === "licenses/create") {
    policy(b);
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
          b.expiresAt,
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
          expiresAt: b.expiresAt,
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
    if (l.expires_at <= now()) throw new RequestDenied("expired");
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
