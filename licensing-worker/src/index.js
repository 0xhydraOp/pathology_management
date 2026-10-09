import { ownerConsoleResponse } from "./ownerConsole.js";
import { ownerApi, acceptInvitation } from "./ownerApi.js";
import { hasOwnerMfaEvidence } from "./ownerMfa.js";
import { permitsHost } from "./hostBoundary.js";
import { OWNER_EMAIL, authorizeOwner, handleAuthRequest } from "./ownerAuth.js";
import { ownerAuthConsoleResponse } from "./ownerAuthConsole.js";
export class RequestDenied extends Error {}
// D1 emits database errors rather than exposing a typed constraint code.
// Recognize only our explicit authorization/concurrency guards; infrastructure
// and all other errors remain service failures.
function expectedGuard(error) {
  return /(?:seat unavailable|license unavailable|request unavailable|trial unavailable|NOT NULL constraint failed: (?:activations\.license_id|owner_guard\.id))/.test(
    String(error?.message || ""),
  );
}
const enc = new TextEncoder();
export const b64 = (b) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const un64 = (s) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const now = () => Math.floor(Date.now() / 1000);
const response = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const denied = () =>
  response({ error: "Licence request could not be authorized." }, 403);
export async function hash(value) {
  return b64(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}
export function exactFields(value, fields) {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(value, field))
  )
    throw new RequestDenied("fields");
  return value;
}
export async function body(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new RequestDenied("body");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestDenied("body");
  let size = 0,
    chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new RequestDenied("size");
    }
    chunks.push(value);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(data));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new RequestDenied("body");
    return parsed;
  } catch {
    throw new RequestDenied("body");
  }
}
async function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}
export async function authenticateOwner(
  request,
  env,
  { requireToken = true } = {},
) {
  if (env.OWNER_AUTH_MODE === "workos") {
    try { return (await authorizeOwner(request, env)).id; }
    catch { throw new RequestDenied("auth"); }
  }
  if (env.OWNER_AUTH_MODE !== "access-certified") throw new RequestDenied("auth");
  if (
    requireToken &&
    (!env.ADMIN_API_TOKEN ||
      env.ADMIN_API_TOKEN.length < 43 ||
      !(await equalSecret(
        request.headers.get("authorization"),
        `Bearer ${env.ADMIN_API_TOKEN}`,
      )))
  )
    throw new RequestDenied("auth");
  const claims = await verifyAccess(request, env, env.ACCESS_AUDIENCE);
  const subjects = JSON.parse(env.ACCESS_ADMIN_SUBJECTS || "[]");
  if (
    !Array.isArray(subjects) ||
    subjects.length !== 1 ||
    subjects[0] !== claims.sub ||
    claims.email !== OWNER_EMAIL ||
    !hasOwnerMfaEvidence(claims, env.OWNER_MFA_CONTRACT)
  )
    throw new RequestDenied("auth");
  return claims.sub;
}
export async function verifyAccess(request, env, audience) {
  const token = request.headers.get("cf-access-jwt-assertion") || "";
  if (token.length > 8192) throw new RequestDenied("auth");
  const parts = token.split(".");
  if (parts.length !== 3) throw new RequestDenied("auth");
  let header, claims, signature;
  try {
    header = JSON.parse(new TextDecoder().decode(un64(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(un64(parts[1])));
    signature = un64(parts[2]);
    if (
      !header ||
      !claims ||
      typeof header !== "object" ||
      typeof claims !== "object"
    )
      throw new RequestDenied("auth");
  } catch {
    throw new RequestDenied("auth");
  }
  const time = now();
  if (
    header.alg !== "RS256" ||
    !header.kid ||
    claims.iss !== env.ACCESS_ISSUER ||
    !(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(
      audience,
    ) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= time ||
    !Number.isSafeInteger(claims.iat) ||
    claims.iat > time + 30 ||
    (claims.nbf !== undefined &&
      (!Number.isSafeInteger(claims.nbf) || claims.nbf > time)) ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.sub.length > 200
  )
    throw new RequestDenied("auth");
  if (
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER) ||
    !audience ||
    audience.startsWith("REPLACE")
  )
    throw Error("config");
  // A pinned JWKS is permitted for key provisioning/testing; no JWT verification bypass.
  const keys = env.ACCESS_JWKS_JSON
    ? JSON.parse(env.ACCESS_JWKS_JSON)
    : await (
        await fetch(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`, {
          signal: AbortSignal.timeout(5000),
        })
      ).json();
  const jwk = keys.keys?.find((k) => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) throw new RequestDenied("auth");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      enc.encode(`${parts[0]}.${parts[1]}`),
    ))
  )
    throw new RequestDenied("auth");
  return claims;
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
    b.offlineSeconds > 2592000
  )
    throw new RequestDenied("policy");
}
async function sign(row, activation, env) {
  const time = now(),
    status =
      row.status === "revoked" ||
      row.suspended === 1 ||
      row.customer_status === "disabled" ||
      activation.status === "revoked"
        ? "revoked"
        : row.expires_at <= time
          ? "expired"
          : "active";
  const payload = b64(
    enc.encode(
      JSON.stringify({
        v: 1,
        iss: "patholy-license",
        aud: "patholy-desktop",
        licenseId: row.id,
        activationId: activation.id,
        deviceId: activation.device_id,
        policyRevision: row.revision,
        issuedAt: time,
        expiresAt: row.expires_at,
        offlineUntil: Math.min(
          row.expires_at,
          time + Math.min(row.offline_seconds, 2592000),
        ),
        status,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    un64(env.SIGNING_PRIVATE_KEY),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  return {
    kid: env.SIGNING_KID,
    payload,
    signature: b64(
      await crypto.subtle.sign(
        "Ed25519",
        key,
        enc.encode(`patholy-grant-v1\n${env.SIGNING_KID}.${payload}`),
      ),
    ),
  };
}
async function rate(request, env) {
  const secret = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.RATE_LIMIT_SALT),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const key = b64(await crypto.subtle.sign("HMAC", secret, enc.encode(ip)));
  if (
    env.ACTIVATION_LIMITER &&
    !(await env.ACTIVATION_LIMITER.limit({ key })).success
  )
    return false;
  const window = Math.floor(now() / Number(env.RATE_LIMIT_WINDOW));
  const row = await env.DB.prepare(
    "INSERT INTO rate_buckets(bucket_key,window,count) VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
  )
    .bind(key, window)
    .first();
  return row.count <= Number(env.RATE_LIMIT_MAX);
}
async function activate(request, env, path) {
  if (!(await rate(request, env)))
    return response({ error: "Please retry later." }, 429);
  const b = exactFields(await body(request), [
    "key",
    "deviceId",
    "requestId",
    "appVersion",
  ]);
  if (
    typeof b.key !== "string" ||
    !/^PTH-[A-Za-z0-9_-]{43}$/.test(b.key) ||
    !/^[a-f0-9]{64}$/.test(b.deviceId) ||
    !uuid.test(b.requestId) ||
    typeof b.appVersion !== "string" ||
    b.appVersion.length > 40
  )
    return denied();
  const db = env.DB.withSession("first-primary"),
    row = await db
      .prepare(
        "SELECT l.*,c.status customer_status FROM licenses l LEFT JOIN customers c ON c.id=l.customer_id WHERE l.key_hash=?",
      )
      .bind(await hash(b.key))
      .first();
  if (!row) return denied();
  let activation = await db
    .prepare("SELECT * FROM activations WHERE license_id=? AND device_id=?")
    .bind(row.id, b.deviceId)
    .first();
  if (
    !activation &&
    (path.endsWith("/refresh") ||
      row.suspended === 1 ||
      row.customer_status === "disabled" ||
      row.status !== "active" ||
      (row.expires_at <= now() &&
        !(row.kind === "trial" && row.trial_started_at === null)))
  )
    return denied();
  try {
    const changes = [];
    // Start is committed with allocation and request identity. A failed claim
    // rolls the timestamp back, and concurrent retries cannot move the anchor.
    if (row.kind === "trial" && row.trial_started_at === null && !activation) {
      const started = now();
      // Validate signing configuration before committing the one-time start.
      await sign(
        { ...row, expires_at: started + 604800 },
        { id: crypto.randomUUID(), status: "active", device_id: b.deviceId },
        env,
      );
      changes.push(
        db
          .prepare(
            "UPDATE licenses SET trial_started_at=?,expires_at=?,revision=revision+1 WHERE id=? AND kind='trial' AND trial_started_at IS NULL AND status='active' AND suspended=0 AND (customer_id IS NULL OR EXISTS(SELECT 1 FROM customers WHERE id=licenses.customer_id AND status='active'))",
          )
          .bind(started, started + 604800, row.id),
      );
      changes.push(
        db
          .prepare(
            "INSERT INTO owner_audit(id,actor,action,customer_id,license_id,created_at,details) SELECT ?,?,'trial.start',?,?,?,? WHERE changes()=1",
          )
          .bind(
            crypto.randomUUID(),
            `license:${row.id}`,
            row.customer_id,
            row.id,
            started,
            JSON.stringify({ durationSeconds: 604800 }),
          ),
      );
    }
    changes.push(
      db
        .prepare(
          "INSERT INTO activations(id,license_id,device_id,status,created_at) SELECT ?,?,?,'active',? WHERE NOT EXISTS(SELECT 1 FROM activations WHERE license_id=? AND device_id=?)",
        )
        .bind(
          crypto.randomUUID(),
          row.id,
          b.deviceId,
          now(),
          row.id,
          b.deviceId,
        ),
      db
        .prepare(
          "INSERT OR IGNORE INTO requests(request_id,license_id,device_id,activation_id,created_at) SELECT ?,?,?,id,? FROM activations WHERE license_id=? AND device_id=?",
        )
        .bind(b.requestId, row.id, b.deviceId, now(), row.id, b.deviceId),
    );
    await db.batch(changes);
  } catch (error) {
    if (expectedGuard(error)) return denied();
    throw error;
  }
  const fresh = await db
    .prepare(
      "SELECT l.*,c.status customer_status FROM licenses l LEFT JOIN customers c ON c.id=l.customer_id WHERE l.id=?",
    )
    .bind(row.id)
    .first();
  activation = await db
    .prepare("SELECT * FROM activations WHERE license_id=? AND device_id=?")
    .bind(row.id, b.deviceId)
    .first();
  if (!activation) return denied();
  return response({ grant: await sign(fresh, activation, env) });
}
async function admin(request, env, action) {
  const who = await authenticateOwner(request, env),
    b = exactFields(
      await body(request),
      {
        create: ["expiresAt", "seats", "offlineSeconds"],
        renew: ["licenseId", "expiresAt", "seats", "offlineSeconds"],
        revoke: ["licenseId"],
        transfer: ["licenseId", "activationId", "deviceId"],
      }[action],
    ),
    db = env.DB.withSession("first-primary"),
    time = now();
  let id = b.licenseId,
    key;
  const statements = [];
  if (action === "create") {
    policy(b);
    id = crypto.randomUUID();
    key = `PTH-${b64(crypto.getRandomValues(new Uint8Array(32)))}`;
    statements.push(
      db
        .prepare(
          "INSERT INTO licenses(id,key_hash,expires_at,seats,offline_seconds,revision,status,created_at) VALUES(?,?,?,?,?,1,'active',?)",
        )
        .bind(
          id,
          await hash(key),
          b.expiresAt,
          b.seats,
          b.offlineSeconds,
          time,
        ),
    );
  } else {
    if (!uuid.test(id)) throw new RequestDenied("id");
    const row = await db
      .prepare(
        "SELECT l.*,c.status customer_status FROM licenses l LEFT JOIN customers c ON c.id=l.customer_id WHERE l.id=?",
      )
      .bind(id)
      .first();
    if (!row) return denied();
    if (action === "renew") {
      policy(b);
      if (
        row.kind === "trial" &&
        (row.trial_started_at === null || b.expiresAt <= row.expires_at)
      )
        throw new RequestDenied("trial");
      if (row.status === "revoked") return denied();
      const seats = await db
        .prepare(
          "SELECT count(*) n FROM activations WHERE license_id=? AND status='active'",
        )
        .bind(id)
        .first();
      if (b.seats < seats.n) throw new RequestDenied("seats");
      statements.push(
        db
          .prepare(
            "UPDATE licenses SET expires_at=?,seats=?,offline_seconds=?,revision=revision+1 WHERE id=?",
          )
          .bind(b.expiresAt, b.seats, b.offlineSeconds, id),
      );
    } else if (action === "revoke") {
      statements.push(
        db
          .prepare(
            "UPDATE licenses SET status='revoked',revision=revision+1 WHERE id=?",
          )
          .bind(id),
        db
          .prepare("INSERT INTO revocations VALUES(?,?,NULL,?,?)")
          .bind(crypto.randomUUID(), id, time, who),
      );
    } else if (action === "transfer") {
      if (
        !uuid.test(b.activationId) ||
        !/^[a-f0-9]{64}$/.test(b.deviceId) ||
        row.status !== "active" ||
        row.expires_at <= time
      )
        throw new RequestDenied("transfer");
      const old = await db
        .prepare(
          "SELECT * FROM activations WHERE id=? AND license_id=? AND status='active'",
        )
        .bind(b.activationId, id)
        .first();
      if (!old || old.device_id === b.deviceId) return denied();
      const existing = await db
        .prepare(
          "SELECT id FROM activations WHERE license_id=? AND device_id=?",
        )
        .bind(id, b.deviceId)
        .first();
      if (existing) return denied();
      statements.push(
        db
          .prepare(
            "UPDATE activations SET status='revoked' WHERE id=? AND status='active'",
          )
          .bind(old.id),
        db
          .prepare(
            "INSERT INTO activations VALUES(?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'active',?)",
          )
          .bind(crypto.randomUUID(), id, b.deviceId, time),
        db
          .prepare("INSERT INTO revocations VALUES(?,?,?,?,?)")
          .bind(crypto.randomUUID(), id, old.id, time, who),
        db
          .prepare("UPDATE licenses SET revision=revision+1 WHERE id=?")
          .bind(id),
      );
    } else throw new RequestDenied("action");
  }
  statements.push(
    db.prepare("INSERT INTO admin_audit VALUES(?,?,?,?,?,?)").bind(
      crypto.randomUUID(),
      who,
      action,
      id,
      time,
      JSON.stringify(
        action === "create" || action === "renew"
          ? {
              expiresAt: b.expiresAt,
              seats: b.seats,
              offlineSeconds: b.offlineSeconds,
            }
          : { activationId: b.activationId || null },
      ),
    ),
  );
  await db.batch(statements);
  return response({ licenseId: id, ...(key ? { key } : {}) });
}
export default {
  async fetch(request, env) {
    try {
      if (!permitsHost(request, env))
        return response({ error: "Not found." }, 404);
      const path = new URL(request.url).pathname;
      if (env.OWNER_AUTH_MODE === "workos") {
        if (request.method === "POST" && path.startsWith("/v1/owner-auth/"))
          return await handleAuthRequest(request, env);
        if (request.method === "GET") {
          // Public authentication shells disclose no customer or licence data.
          // Setup still requires a private, operator-issued single-use token.
          // Security/recovery pages are empty shells. Their APIs require a
          // verified setup session or a purpose-bound maintenance ceremony;
          // they expose no customer or licence data before owner readiness.
          const authPage = ownerAuthConsoleResponse(path);
          if (authPage) return authPage;
          if (path === "/" || path === "/owner" || path === "/owner/") {
            try { await authenticateOwner(request, env, { requireToken: false }); }
            catch { return new Response(null, { status: 302, headers: { Location: "/owner/login", "Cache-Control": "no-store" } }); }
          }
        }
      }
      if (
        !env.SIGNING_PRIVATE_KEY ||
        !env.SIGNING_KID ||
        env.SIGNING_KID.startsWith("REPLACE") ||
        !env.RATE_LIMIT_SALT ||
        env.RATE_LIMIT_SALT.length < 32 ||
        !Number.isInteger(Number(env.RATE_LIMIT_MAX)) ||
        Number(env.RATE_LIMIT_MAX) < 1 ||
        !Number.isInteger(Number(env.RATE_LIMIT_WINDOW)) ||
        Number(env.RATE_LIMIT_WINDOW) < 1
      )
        return response({ error: "Licensing service unavailable." }, 503);
      if (path === "/" && request.method === "GET") {
        await authenticateOwner(request, env, { requireToken: false });
        return new Response(null, {
          status: 302,
          headers: { Location: "/owner", "Cache-Control": "no-store" },
        });
      }
      if (
        request.method === "GET" &&
        (path === "/owner" ||
          path.startsWith("/owner/") ||
          path === "/invite" ||
          path.startsWith("/invite/"))
      ) {
        if (path === "/invite" || path.startsWith("/invite/"))
          await verifyAccess(request, env, env.CUSTOMER_ACCESS_AUDIENCE);
        else await authenticateOwner(request, env, { requireToken: false });
        return (
          ownerConsoleResponse(path, env.API_ORIGIN, env.CUSTOMER_PORTAL_ENABLED, env.OWNER_AUTH_MODE) ||
          response({ error: "Not found." }, 404)
        );
      }
      if (request.method !== "POST")
        return response({ error: "Not found." }, 404);
      if (path.startsWith("/v1/owner/"))
        return await ownerApi(request, env, path);
      if (path === "/v1/customer/accept-invite")
        return await acceptInvitation(request, env);
      if (path === "/v1/activate" || path === "/v1/refresh")
        return await activate(request, env, path);
      if (/^\/v1\/admin\/(create|renew|revoke|transfer)$/.test(path))
        return await admin(request, env, path.split("/").pop());
      return response({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof RequestDenied || expectedGuard(error))
        return denied();
      return response({ error: "Licensing service unavailable." }, 503);
    }
  },
  async scheduled(_event, env) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM rate_buckets WHERE window < ?").bind(
        Math.floor(now() / Number(env.RATE_LIMIT_WINDOW)) - 2,
      ),
      env.DB.prepare("DELETE FROM requests WHERE created_at < ?").bind(
        now() - 86400 * 30,
      ),
    ]);
    if (env.OWNER_AUTH_MODE === "workos") {
      // Retain administrative audits; remove expired authentication transport
      // metadata only. Failed migrations surface rather than creating tables.
      await env.DB.batch([
        env.DB.prepare("DELETE FROM owner_auth_rate WHERE window < ?").bind(Math.floor(now() / 60) - 2),
        env.DB.prepare("DELETE FROM owner_auth_pending WHERE expires_at < ?").bind(now() - 86400),
        env.DB.prepare("DELETE FROM owner_auth_sessions WHERE expires_at < ?").bind(now() - 86400 * 30),
        env.DB.prepare("DELETE FROM owner_auth_operator_tickets WHERE expires_at < ?").bind(now() - 86400 * 30),
      ]);
    }
  },
};
