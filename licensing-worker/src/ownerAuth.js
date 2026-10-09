import { createOwnerLifecycle } from "./ownerLifecycle.js";
import { decodeJwt } from "jose";
import { WorkOS } from "@workos-inc/node/worker";
import { seal, unseal, defaults } from "iron-webcrypto";

export const OWNER_EMAIL = "iamrobiul94@gmail.com";
export class OwnerAuthDenied extends Error {
  constructor() {
    super("Owner authentication could not be verified.");
  }
}
export class OwnerAuthUnavailable extends Error {
  constructor() {
    super("Owner authentication is unavailable. Contact the operator.");
  }
}
const SESSION = "__Host-patholy_owner",
  PENDING = "__Host-patholy_owner_pending";
const now = () => Math.floor(Date.now() / 1000),
  enc = new TextEncoder();
const b64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const digest = async (text) =>
  b64(await crypto.subtle.digest("SHA-256", enc.encode(text)));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const cookie = (name, value, age) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
function cookies(request) {
  const result = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const split = part.indexOf("=");
    if (split < 0) continue;
    const key = part.slice(0, split).trim();
    if (Object.hasOwn(result, key)) throw new OwnerAuthDenied();
    result[key] = part.slice(split + 1).trim();
  }
  return result;
}
function csrf(request, env) {
  if (
    new URL(request.url).origin !== env.OWNER_ORIGIN ||
    request.headers.get("origin") !== env.OWNER_ORIGIN ||
    request.headers.get("x-patholy-owner-action") !== "1"
  )
    throw new OwnerAuthDenied();
}
function exact(value, fields) {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== fields.length ||
    !fields.every((f) => Object.hasOwn(value, f))
  )
    throw new OwnerAuthDenied();
  return value;
}
async function input(request, fields) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new OwnerAuthDenied();
  const reader = request.body?.getReader();
  if (!reader) throw new OwnerAuthDenied();
  let length = 0,
    chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) {
      await reader.cancel();
      throw new OwnerAuthDenied();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return exact(JSON.parse(new TextDecoder().decode(bytes)), fields);
  } catch {
    throw new OwnerAuthDenied();
  }
}
function password(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 256)
    throw new OwnerAuthDenied();
}
function code(value) {
  if (typeof value !== "string" || !/^\d{6}$/.test(value))
    throw new OwnerAuthDenied();
}
function identity(user, record) {
  if (
    !user ||
    user.id !== record.user_id ||
    user.email !== OWNER_EMAIL ||
    user.emailVerified !== true ||
    (record.external_id && user.externalId !== record.external_id)
  )
    throw new OwnerAuthDenied();
}
function response(data, status = 200, setCookies = []) {
  const h = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  for (const c of setCookies) h.append("set-cookie", c);
  return new Response(JSON.stringify(data), { status, headers: h });
}
function audit(db, actor, action) {
  return db
    .prepare("INSERT INTO owner_audit VALUES(?,?,?,NULL,NULL,?,?)")
    .bind(crypto.randomUUID(), actor, action, now(), "{}");
}
const guard = (db) =>
  db
    .prepare(
      "INSERT INTO owner_auth_guard(id) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END)",
    )
    .bind(crypto.randomUUID());

// All cryptography is supplied by maintained SDK/library implementations.
// Only SDK-confirmed TOTP responses can create our server-side MFA receipt.
export function createOwnerAuth(env, { workos } = {}) {
  if (
    env.OWNER_AUTH_MODE !== "workos" ||
    typeof env.WORKOS_API_KEY !== "string" ||
    !env.WORKOS_API_KEY.startsWith("sk_") ||
    typeof env.WORKOS_CLIENT_ID !== "string" ||
    !/^client_[A-Za-z0-9]+$/.test(env.WORKOS_CLIENT_ID) ||
    typeof env.WORKOS_COOKIE_PASSWORD !== "string" ||
    env.WORKOS_COOKIE_PASSWORD.length < 32
  )
    throw new OwnerAuthUnavailable();
  const sdk =
    workos ||
    new WorkOS(env.WORKOS_API_KEY, {
      clientId: env.WORKOS_CLIENT_ID,
      issuer: `https://api.workos.com/user_management/${env.WORKOS_CLIENT_ID}`,
      maxRetries: 0,
      timeout: 10000,
      config: { signal: AbortSignal.timeout(10000) },
    });
  const db = env.DB.withSession("first-primary"),
    sealPassword = env.WORKOS_COOKIE_PASSWORD;
  const getIdentity = async () => {
    const record = await db
      .prepare(
        "SELECT * FROM owner_auth_identity WHERE id=1 AND state='active'",
      )
      .first();
    if (!record || record.email !== OWNER_EMAIL || !record.user_id)
      throw new OwnerAuthDenied();
    return record;
  };
  async function sealedPending(data) {
    return seal(data, sealPassword, { ...defaults, ttl: 600000 });
  }
  async function pending(request) {
    let data;
    try {
      data = await unseal(cookies(request)[PENDING] || "", sealPassword, {
        ...defaults,
        ttl: 600000,
      });
    } catch {
      throw new OwnerAuthDenied();
    }
    if (!data || data.expiresAt <= now() || typeof data.nonce !== "string")
      throw new OwnerAuthDenied();
    const record = await getIdentity(),
      row = await db
        .prepare(
          "SELECT * FROM owner_auth_pending WHERE nonce_hash=? AND consumed_at IS NULL AND expires_at>? AND attempts<5",
        )
        .bind(await digest(data.nonce), now())
        .first();
    if (
      !row ||
      row.user_id !== record.user_id ||
      row.epoch !== record.epoch ||
      row.stage !== data.stage ||
      data.userId !== record.user_id
    )
      throw new OwnerAuthDenied();
    return { data, row, record };
  }
  async function makePending(record, token, stage, factorId, challengeId) {
    if (typeof token !== "string" || token.length > 4096)
      throw new OwnerAuthDenied();
    const data = {
      nonce: random(),
      userId: record.user_id,
      epoch: record.epoch,
      pendingAuthenticationToken: token,
      stage,
      factorId: factorId || null,
      challengeId: challengeId || null,
      expiresAt: now() + 600,
    };
    await db
      .prepare(
        "INSERT INTO owner_auth_pending(nonce_hash,user_id,stage,epoch,expires_at) VALUES(?,?,?,?,?)",
      )
      .bind(
        await digest(data.nonce),
        record.user_id,
        stage,
        record.epoch,
        data.expiresAt,
      )
      .run();
    return response({ stage }, 200, [
      cookie(PENDING, await sealedPending(data), 600),
      cookie(SESSION, "", 0),
    ]);
  }
  async function factors(record) {
    const result = await sdk.multiFactorAuth.listUserAuthFactors({
      userId: record.user_id,
    });
    return await result.autoPagination();
  }
  async function passwordStep(record, current) {
    identity(await sdk.userManagement.getUser(record.user_id), record);
    try {
      const result = await sdk.userManagement.authenticateWithPassword({
        clientId: env.WORKOS_CLIENT_ID,
        email: OWNER_EMAIL,
        password: current,
      });
      if (result?.user?.id) {
        try {
          const claims = decodeJwt(result.accessToken);
          if (claims.sid)
            await sdk.userManagement.revokeSession({ sessionId: claims.sid });
        } catch {}
      }
      throw new OwnerAuthDenied();
    } catch (error) {
      if (error instanceof OwnerAuthDenied) throw error;
      const raw = error.rawData || error;
      const state = error.code || raw.code;
      if (!["mfa_challenge", "mfa_enrollment"].includes(state))
        throw new OwnerAuthDenied();
      if (
        !raw.user ||
        raw.user.id !== record.user_id ||
        raw.user.email !== OWNER_EMAIL ||
        raw.user.email_verified !== true
      )
        throw new OwnerAuthDenied();
      if (state === "mfa_enrollment") {
        if (record.factor_verified_at !== null) throw new OwnerAuthDenied();
        const user = raw.user;
        if (
          !user ||
          user.id !== record.user_id ||
          user.email !== OWNER_EMAIL ||
          user.email_verified !== true
        )
          throw new OwnerAuthDenied();
        if (record.factor_id) {
          const challenge = await sdk.multiFactorAuth.challengeFactor({
            authenticationFactorId: record.factor_id,
          });
          return {
            stage: "mfa",
            token: raw.pending_authentication_token,
            factorId: record.factor_id,
            challengeId: challenge.id,
          };
        }
        return { stage: "enroll", token: raw.pending_authentication_token };
      }
      const list = await factors(record),
        factor = list.find(
          (f) => f.type === "totp" && f.id === record.factor_id,
        );
      if (!factor) throw new OwnerAuthDenied();
      const challenge = await sdk.multiFactorAuth.challengeFactor({
        authenticationFactorId: factor.id,
      });
      return {
        stage: "mfa",
        token: raw.pending_authentication_token,
        factorId: factor.id,
        challengeId: challenge.id,
      };
    }
  }
  async function providerTotp(data, otp) {
    const result = await sdk.userManagement.authenticateWithTotp({
      clientId: env.WORKOS_CLIENT_ID,
      pendingAuthenticationToken: data.pendingAuthenticationToken,
      authenticationChallengeId: data.challengeId,
      code: otp,
      session: { sealSession: true, cookiePassword: sealPassword },
    });
    const record = await getIdentity();
    identity(result.user, record);
    if (
      result.authenticationMethod !== "Password" ||
      typeof result.sealedSession !== "string"
    )
      throw new OwnerAuthDenied();
    const verified = await sdk.userManagement
      .loadSealedSession({
        sessionData: result.sealedSession,
        cookiePassword: sealPassword,
      })
      .authenticate();
    if (!verified.authenticated || !verified.sessionId || verified.impersonator)
      throw new OwnerAuthDenied();
    identity(verified.user, record);
    return { result, verified, record };
  }
  async function authorize(request, { setup = false } = {}) {
    if (!setup && env.OWNER_AUTH_READY !== "true")
      throw new OwnerAuthUnavailable();
    const record = await getIdentity();
    if (
      !setup &&
      (!record.backup_factor_id || record.backup_verified_at === null)
    )
      throw new OwnerAuthDenied();
    const value = cookies(request)[SESSION];
    if (!value || value.length > 12000) throw new OwnerAuthDenied();
    const session = sdk.userManagement.loadSealedSession({
      sessionData: value,
      cookiePassword: sealPassword,
    });
    let local;
    try {
      local = await sdk.userManagement.getSessionFromCookie({
        sessionData: value,
        cookiePassword: sealPassword,
      });
    } catch {
      throw new OwnerAuthDenied();
    }
    if (!local?.accessToken) throw new OwnerAuthDenied();
    let metadata;
    try {
      metadata = decodeJwt(local.accessToken);
    } catch {
      throw new OwnerAuthDenied();
    }
    const localReceipt = await db
      .prepare(
        "SELECT sid FROM owner_auth_sessions WHERE sid=? AND user_id=? AND epoch=? AND revoked_at IS NULL AND expires_at>?",
      )
      .bind(metadata.sid, record.user_id, record.epoch, now())
      .first();
    if (metadata.sub !== record.user_id || !localReceipt)
      throw new OwnerAuthDenied();
    const verified = await session.authenticate();
    if (
      !verified.authenticated ||
      verified.impersonator ||
      verified.authenticationMethod !== "Password"
    )
      throw new OwnerAuthDenied();
    identity(verified.user, record);
    const receipt = await db
      .prepare(
        "SELECT * FROM owner_auth_sessions WHERE sid=? AND user_id=? AND epoch=? AND revoked_at IS NULL AND expires_at>?",
      )
      .bind(verified.sessionId, record.user_id, record.epoch, now())
      .first();
    if (
      !receipt ||
      receipt.mfa_verified_at > now() ||
      receipt.mfa_verified_at < now() - 43200
    )
      throw new OwnerAuthDenied();
    const live = await sdk.userManagement.listSessions(record.user_id);
    if (
      !(await live.autoPagination()).some(
        (s) =>
          s.id === verified.sessionId &&
          s.userId === record.user_id &&
          s.authMethod === "password" &&
          !s.impersonator &&
          s.status === "active" &&
          Date.parse(s.expiresAt) > Date.now(),
      )
    )
      throw new OwnerAuthDenied();
    // A logout or credential change during the provider round trip must not
    // revive an already revoked local receipt.
    const current = await db
      .prepare(
        "SELECT s.sid FROM owner_auth_sessions s JOIN owner_auth_identity i ON i.id=1 AND i.user_id=s.user_id AND i.epoch=s.epoch WHERE s.sid=? AND i.state='active' AND s.epoch=? AND s.revoked_at IS NULL AND s.expires_at>?",
      )
      .bind(verified.sessionId, record.epoch, now())
      .first();
    if (!current) throw new OwnerAuthDenied();
    return {
      id: record.user_id,
      email: OWNER_EMAIL,
      sessionId: verified.sessionId,
      mfaVerifiedAt: receipt.mfa_verified_at,
      epoch: record.epoch,
    };
  }
  async function revokeAll(record) {
    const sessions = await sdk.userManagement.listSessions(record.user_id);
    for (const s of await sessions.autoPagination())
      await sdk.userManagement.revokeSession({ sessionId: s.id });
  }
  async function throttle(route, request) {
    if (
      ![
        "bootstrap",
        "login",
        "enroll",
        "totp",
        "password",
        "backup-enroll",
        "backup-verify",
        "backup-cleanup",
        "recover",
        "recovery-enroll",
        "recovery-verify",
        "reconcile",
        "reconcile-info",
      ].includes(route)
    )
      return;
    const secret = await crypto.subtle.importKey(
      "raw",
      enc.encode(sealPassword),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const keys = await Promise.all(
      [
        `patholy-owner-auth:${route}:account`,
        `patholy-owner-auth:${route}:ip:${ip}`,
      ].map(async (value) =>
        b64(await crypto.subtle.sign("HMAC", secret, enc.encode(value))),
      ),
    );
    const window = Math.floor(now() / 60);
    for (const key of keys) {
      const r = await db
        .prepare(
          "INSERT INTO owner_auth_rate VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
        )
        .bind(key, window)
        .first();
      if (r.count > 10) throw new OwnerAuthDenied();
    }
  }
  const lifecycle = createOwnerLifecycle({
    env,
    sdk,
    db,
    sealPassword,
    authorizeSetup: (request) => authorize(request, { setup: true }),
    getIdentity,
    passwordStep,
    providerTotp,
    makePending,
    input,
    response,
    audit,
    guard,
    OWNER_EMAIL,
  });
  async function revokePending(request) {
    let data;
    try {
      const value = cookies(request)[PENDING];
      if (!value) return;
      data = await unseal(value, sealPassword, { ...defaults, ttl: 600000 });
    } catch {
      return;
    }
    if (
      !data ||
      typeof data.nonce !== "string" ||
      typeof data.userId !== "string"
    )
      return;
    const hash = await digest(data.nonce),
      ceremony = await db
        .prepare(
          "SELECT p.* FROM owner_auth_pending p JOIN owner_auth_identity i ON i.id=1 AND i.user_id=p.user_id AND i.epoch=p.epoch WHERE p.nonce_hash=? AND p.user_id=? AND p.consumed_at IS NULL",
        )
        .bind(hash, data.userId)
        .first();
    if (!ceremony) return;
    await db.batch([
      db
        .prepare(
          "UPDATE owner_auth_pending SET consumed_at=? WHERE nonce_hash=? AND user_id=? AND epoch=? AND consumed_at IS NULL",
        )
        .bind(now(), hash, ceremony.user_id, ceremony.epoch),
      guard(db),
      audit(db, ceremony.user_id, "owner.auth.pending.logout"),
      db.prepare("DELETE FROM owner_auth_guard"),
    ]);
  }
  async function handle(request) {
    let logoutRequested = false,
      releaseMaintenance = null;
    try {
      if (request.method !== "POST")
        return response({ error: "Not found." }, 404);
      csrf(request, env);
      const route = new URL(request.url).pathname.slice(
        "/v1/owner-auth/".length,
      );
      logoutRequested = route === "logout";
      await throttle(route, request);
      if (lifecycle.supports(route))
        return await lifecycle.handle(route, request);
      if (route === "bootstrap") {
        const b = await input(request, ["token", "password"]);
        password(b.password);
        if (typeof b.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(b.token))
          throw new OwnerAuthDenied();
        const record = await db
          .prepare(
            "SELECT * FROM owner_auth_identity WHERE id=1 AND state='unclaimed' AND user_id IS NULL",
          )
          .first();
        if (!record || record.email !== OWNER_EMAIL)
          throw new OwnerAuthDenied();
        const operationId = crypto.randomUUID(),
          externalId = "patholy-owner-" + operationId;
        await db.batch([
          db
            .prepare(
              "UPDATE owner_auth_identity SET state='provisioning',external_id=?,provision_operation_id=? WHERE id=1 AND state='unclaimed' AND user_id IS NULL AND external_id IS NULL",
            )
            .bind(externalId, operationId),
          guard(db),
          db
            .prepare(
              "UPDATE owner_auth_bootstrap SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?",
            )
            .bind(now(), await digest(b.token), now()),
          guard(db),
          db
            .prepare(
              "INSERT INTO owner_auth_operations(id,kind,external_id,stage,created_at) VALUES(?,'provision',?,'creating',?)",
            )
            .bind(operationId, externalId, now()),
          audit(db, "deployment-bootstrap", "owner.auth.bootstrap.claim"),
          db.prepare("DELETE FROM owner_auth_guard"),
        ]);
        const user = await sdk.userManagement.createUser({
          email: OWNER_EMAIL,
          password: b.password,
          emailVerified: true,
          externalId,
        });
        if (
          !user ||
          user.email !== OWNER_EMAIL ||
          user.emailVerified !== true ||
          typeof user.id !== "string" ||
          user.externalId !== externalId
        )
          throw new OwnerAuthDenied();
        await db.batch([
          db
            .prepare(
              "UPDATE owner_auth_identity SET user_id=?,state='active' WHERE id=1 AND state='provisioning' AND user_id IS NULL",
            )
            .bind(user.id),
          guard(db),
          db
            .prepare(
              "UPDATE owner_auth_operations SET user_id=?,stage='bound' WHERE id=? AND external_id=?",
            )
            .bind(user.id, operationId, externalId),
          audit(db, user.id, "owner.auth.bootstrap.complete"),
          db.prepare("DELETE FROM owner_auth_guard"),
        ]);
        const fresh = await getIdentity(),
          step = await passwordStep(fresh, b.password);
        return makePending(
          fresh,
          step.token,
          step.stage,
          step.factorId,
          step.challengeId,
        );
      }
      if (route === "login") {
        const b = await input(request, ["email", "password"]);
        if (b.email !== OWNER_EMAIL) throw new OwnerAuthDenied();
        password(b.password);
        const record = await getIdentity(),
          step = await passwordStep(record, b.password);
        return makePending(
          record,
          step.token,
          step.stage,
          step.factorId,
          step.challengeId,
        );
      }
      if (route === "enroll") {
        await input(request, []);
        const p = await pending(request);
        if (
          p.data.stage !== "enroll" ||
          p.record.factor_id !== null ||
          p.record.factor_verified_at !== null
        )
          throw new OwnerAuthDenied();
        await db.batch([
          db
            .prepare(
              "UPDATE owner_auth_pending SET stage='enrolling' WHERE nonce_hash=? AND stage='enroll' AND consumed_at IS NULL",
            )
            .bind(await digest(p.data.nonce)),
          guard(db),
          db.prepare("DELETE FROM owner_auth_guard"),
        ]);
        const factor = await sdk.multiFactorAuth.createUserAuthFactor({
          userId: p.record.user_id,
          type: "totp",
          totpIssuer: "Patholy Owner",
          totpUser: OWNER_EMAIL,
        });
        const f = factor.authenticationFactor,
          c = factor.authenticationChallenge;
        if (!f || f.type !== "totp" || !f.totp?.uri || !f.totp.secret || !c?.id)
          throw new OwnerAuthDenied();
        await db.batch([
          db
            .prepare(
              "UPDATE owner_auth_identity SET factor_id=? WHERE id=1 AND factor_id IS NULL AND factor_verified_at IS NULL AND state='active' AND epoch=? AND EXISTS(SELECT 1 FROM owner_auth_pending WHERE nonce_hash=? AND stage='enrolling' AND consumed_at IS NULL AND expires_at>?)",
            )
            .bind(f.id, p.record.epoch, await digest(p.data.nonce), now()),
          guard(db),
          db
            .prepare(
              "UPDATE owner_auth_pending SET stage='mfa' WHERE nonce_hash=? AND stage='enrolling'",
            )
            .bind(await digest(p.data.nonce)),
          guard(db),
          db.prepare("DELETE FROM owner_auth_guard"),
        ]);
        const data = {
          ...p.data,
          stage: "mfa",
          factorId: f.id,
          challengeId: c.id,
        };
        return response(
          { stage: "mfa", totpUri: f.totp.uri, secret: f.totp.secret },
          200,
          [cookie(PENDING, await sealedPending(data), 600)],
        );
      }
      if (route === "totp") {
        const b = await input(request, ["code"]);
        code(b.code);
        const p = await pending(request);
        if (p.data.stage !== "mfa" || p.data.factorId !== p.record.factor_id)
          throw new OwnerAuthDenied();
        const attempts = await db
          .prepare(
            "UPDATE owner_auth_pending SET attempts=attempts+1 WHERE nonce_hash=? AND attempts<5 AND consumed_at IS NULL RETURNING attempts",
          )
          .bind(await digest(p.data.nonce))
          .first();
        if (!attempts) throw new OwnerAuthDenied();
        const { result, verified, record } = await providerTotp(p.data, b.code);
        await db.batch([
          db
            .prepare(
              "UPDATE owner_auth_pending SET consumed_at=? WHERE nonce_hash=? AND consumed_at IS NULL AND expires_at>? AND epoch=?",
            )
            .bind(now(), await digest(p.data.nonce), now(), record.epoch),
          guard(db),
          db
            .prepare(
              "UPDATE owner_auth_identity SET factor_verified_at=COALESCE(factor_verified_at,?) WHERE id=1 AND factor_id=? AND state='active' AND epoch=?",
            )
            .bind(now(), p.data.factorId, record.epoch),
          guard(db),
          db
            .prepare("INSERT INTO owner_auth_sessions VALUES(?,?,?,?,?,NULL)")
            .bind(
              verified.sessionId,
              record.user_id,
              now(),
              now() + 43200,
              record.epoch,
            ),
          audit(db, record.user_id, "owner.auth.mfa.success"),
          db.prepare("DELETE FROM owner_auth_guard"),
        ]);
        return response(
          {
            authenticated: true,
            setupRequired:
              !record.backup_factor_id || record.backup_verified_at === null,
            ownerReady:
              env.OWNER_AUTH_READY === "true" &&
              Boolean(
                record.backup_factor_id && record.backup_verified_at !== null,
              ),
          },
          200,
          [
            cookie(SESSION, result.sealedSession, 43200),
            cookie(PENDING, "", 0),
          ],
        );
      }
      if (route === "status" || route === "session") {
        await input(request, []);
        const actor = await authorize(request, { setup: true });
        const record = await getIdentity();
        return response({
          authenticated: true,
          email: actor.email,
          backupCleanupPending: Boolean(
            await db
              .prepare(
                "SELECT id FROM owner_auth_operations WHERE kind='backup-enroll' AND stage='cleanup' AND user_id=? LIMIT 1",
              )
              .bind(record.user_id)
              .first(),
          ),
          recoveryConfigured: Boolean(
            record.backup_factor_id && record.backup_verified_at !== null,
          ),
          ownerReady:
            env.OWNER_AUTH_READY === "true" &&
            Boolean(
              record.backup_factor_id && record.backup_verified_at !== null,
            ),
        });
      }
      if (route === "logout") {
        await revokePending(request);
        await lifecycle.revokeCapability(request);
        await input(request, []);
        // Unsealing an app-issued cookie is sufficient only to revoke its own
        // receipt, never to read owner data. This also works for expired JWTs.
        let providerRevocationPending = false;
        const value = cookies(request)[SESSION];
        let session;
        try {
          session = value
            ? await sdk.userManagement.getSessionFromCookie({
                sessionData: value,
                cookiePassword: sealPassword,
              })
            : null;
        } catch {
          session = null;
        }
        const record = await db
          .prepare("SELECT * FROM owner_auth_identity WHERE id=1")
          .first();
        if (
          session?.user &&
          record &&
          session.user.id === record.user_id &&
          session.user.email === OWNER_EMAIL
        ) {
          let claims;
          try {
            claims = decodeJwt(session.accessToken);
          } catch {
            claims = null;
          }
          const receipt =
            claims?.sub === record.user_id && typeof claims.sid === "string"
              ? await db
                  .prepare(
                    "SELECT * FROM owner_auth_sessions WHERE sid=? AND user_id=? AND epoch=?",
                  )
                  .bind(claims.sid, record.user_id, record.epoch)
                  .first()
              : null;
          if (receipt) {
            await db.batch([
              db
                .prepare(
                  "UPDATE owner_auth_sessions SET revoked_at=? WHERE sid=?",
                )
                .bind(now(), receipt.sid),
              audit(db, record.user_id, "owner.auth.logout"),
            ]);
            try {
              await sdk.userManagement.revokeSession({
                sessionId: receipt.sid,
              });
            } catch {
              providerRevocationPending = true;
            }
          }
        }
        return response({ ok: true, providerRevocationPending }, 200, [
          lifecycle.clearCapabilityCookie(),
          cookie(SESSION, "", 0),
          cookie(PENDING, "", 0),
        ]);
      }
      if (route === "password") {
        releaseMaintenance = await lifecycle.beginMaintenance();
        const b = await input(request, [
          "currentPassword",
          "newPassword",
          "code",
        ]);
        password(b.currentPassword);
        password(b.newPassword);
        code(b.code);
        const actor = await authorize(request),
          record = await getIdentity(),
          step = await passwordStep(record, b.currentPassword);
        if (step.stage !== "mfa") throw new OwnerAuthDenied();
        await providerTotp(
          {
            pendingAuthenticationToken: step.token,
            challengeId: step.challengeId,
          },
          b.code,
        );
        await db.batch([
          db
            .prepare(
              "UPDATE owner_auth_identity SET epoch=epoch+1,state='credential-changing' WHERE id=1 AND state='active' AND epoch=? AND EXISTS(SELECT 1 FROM owner_auth_sessions WHERE sid=? AND user_id=owner_auth_identity.user_id AND epoch=owner_auth_identity.epoch AND revoked_at IS NULL AND expires_at>?)",
            )
            .bind(actor.epoch, actor.sessionId, now()),
          guard(db),
          db
            .prepare(
              "UPDATE owner_auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
            )
            .bind(now(), actor.id),
          audit(db, actor.id, "owner.auth.password.change.requested"),
          db.prepare("DELETE FROM owner_auth_guard"),
        ]);
        await lifecycle.checkLease();
        await sdk.userManagement.updateUser({
          userId: actor.id,
          password: b.newPassword,
        });
        await lifecycle.checkLease();
        await revokeAll(record);
        await lifecycle.checkLease();
        await db.batch([
          db
            .prepare(
              "UPDATE owner_auth_identity SET state='active' WHERE id=1 AND state='credential-changing' AND epoch=? AND recovery_operation_id IS NULL",
            )
            .bind(record.epoch + 1),
          guard(db),
          audit(db, actor.id, "owner.auth.password.complete"),
          db.prepare("DELETE FROM owner_auth_guard"),
        ]);
        return response({ ok: true, reauthenticationRequired: true }, 200, [
          cookie(SESSION, "", 0),
          cookie(PENDING, "", 0),
        ]);
      }
      return response({ error: "Not found." }, 404);
    } catch (error) {
      if (
        error instanceof OwnerAuthDenied ||
        [400, 401, 422].includes(error?.status) ||
        /owner_auth_guard.id/.test(String(error?.message))
      )
        return response(
          { error: "Owner authentication could not be verified." },
          401,
          logoutRequested
            ? [
                cookie(SESSION, "", 0),
                cookie(PENDING, "", 0),
                lifecycle.clearCapabilityCookie(),
              ]
            : [],
        );
      return response(
        {
          error:
            "Owner authentication is unavailable. Try again or contact the operator.",
        },
        503,
        logoutRequested
          ? [
              cookie(SESSION, "", 0),
              cookie(PENDING, "", 0),
              lifecycle.clearCapabilityCookie(),
            ]
          : [],
      );
    } finally {
      if (releaseMaintenance) await releaseMaintenance();
    }
  }
  return { authorize, handle };
}
export async function authorizeOwner(request, env) {
  return createOwnerAuth(env).authorize(request);
}
export async function handleAuthRequest(request, env) {
  try {
    return await createOwnerAuth(env).handle(request);
  } catch {
    return response({ error: "Owner authentication is not configured." }, 503);
  }
}
