import { seal, unseal, defaults } from "iron-webcrypto";
import { decodeJwt } from "jose";
import { OwnerAuthDenied, OwnerAuthUnavailable } from "./ownerAuth.js";
const now = () => Math.floor(Date.now() / 1000),
  enc = new TextEncoder();
const b64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const hash = async (value) =>
  b64(await crypto.subtle.digest("SHA-256", enc.encode(value)));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const cookie = (name, value, age) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const CAP = "__Host-patholy_owner_maintenance";
const emptyCookies = [
  cookie(CAP, "", 0),
  cookie("__Host-patholy_owner", "", 0),
  cookie("__Host-patholy_owner_pending", "", 0),
];
function secret(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value))
    throw new OwnerAuthDenied();
}
function password(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 256)
    throw new OwnerAuthDenied();
}
function otp(value) {
  if (typeof value !== "string" || !/^\d{6}$/.test(value))
    throw new OwnerAuthDenied();
}
export function createOwnerLifecycle(ctx) {
  const {
    env,
    sdk: rawSdk,
    db,
    sealPassword,
    authorizeSetup,
    getIdentity,
    passwordStep,
    providerTotp,
    makePending,
    input,
    response,
    audit,
    guard,
    OWNER_EMAIL,
  } = ctx;
  let lease = null;
  async function checkLease() {
    if (!lease) return;
    const row = await db
      .prepare(
        "SELECT nonce FROM owner_auth_external_lease WHERE id=1 AND nonce=? AND expires_at>?",
      )
      .bind(lease, now() + 30)
      .first();
    if (!row) throw new OwnerAuthDenied();
  }
  // Provider mutations are serialized. Every next SDK call rechecks the durable
  // lease; expiry has a 30-second margin beyond the SDK's 10-second request limit.
  const sdk = new Proxy(rawSdk, {
    get(target, name) {
      const namespace = target[name];
      if (!["userManagement", "multiFactorAuth"].includes(name))
        return namespace;
      return new Proxy(namespace, {
        get(object, key) {
          const value = object[key];
          if (key === "loadSealedSession") return value.bind(object);
          return typeof value === "function"
            ? async (...args) => {
                await checkLease();
                const result = await value.apply(object, args);
                await checkLease();
                return result;
              }
            : value;
        },
      });
    },
  });
  const routes = [
    "backup-enroll",
    "backup-verify",
    "backup-cleanup",
    "recover",
    "recovery-enroll",
    "recovery-verify",
    "reconcile",
    "reconcile-info",
  ];
  async function owner() {
    const row = await db
      .prepare("SELECT * FROM owner_auth_identity WHERE id=1")
      .first();
    if (!row || row.email !== OWNER_EMAIL) throw new OwnerAuthDenied();
    return row;
  }
  function userMatch(user, record) {
    if (
      !user ||
      user.id !== record.user_id ||
      user.email !== OWNER_EMAIL ||
      user.emailVerified !== true ||
      (record.external_id && user.externalId !== record.external_id)
    )
      throw new OwnerAuthDenied();
  }
  async function revokeAll(record) {
    const list = await sdk.userManagement.listSessions(record.user_id);
    for (const session of await list.autoPagination())
      await sdk.userManagement.revokeSession({ sessionId: session.id });
  }
  async function primaryProof(request, current, code) {
    password(current);
    otp(code);
    const actor = await authorizeSetup(request),
      record = await getIdentity(),
      step = await passwordStep(record, current);
    if (step.stage !== "mfa" || step.factorId !== record.factor_id)
      throw new OwnerAuthDenied();
    const proof = await providerTotp(
      { pendingAuthenticationToken: step.token, challengeId: step.challengeId },
      code,
    );
    await sdk.userManagement.revokeSession({
      sessionId: proof.verified.sessionId,
    });
    return { actor, record };
  }
  async function passwordProof(record, current, expected) {
    password(current);
    userMatch(await sdk.userManagement.getUser(record.user_id), record);
    try {
      const result = await sdk.userManagement.authenticateWithPassword({
        clientId: env.WORKOS_CLIENT_ID,
        email: OWNER_EMAIL,
        password: current,
      });
      if (result?.user) {
        userMatch(result.user, record);
        const claims = decodeJwt(result.accessToken);
        if (typeof claims.sid === "string")
          await sdk.userManagement.revokeSession({ sessionId: claims.sid });
        throw new OwnerAuthDenied();
      }
      throw new OwnerAuthDenied();
    } catch (error) {
      if (error instanceof OwnerAuthDenied) throw error;
      const raw = error.rawData || {},
        kind = error.code || raw.code;
      if (expected && kind !== expected) throw new OwnerAuthDenied();
      if (
        !["mfa_challenge", "mfa_enrollment"].includes(kind) ||
        typeof raw.pending_authentication_token !== "string"
      )
        throw new OwnerAuthDenied();
      if (
        !raw.user ||
        raw.user.id !== record.user_id ||
        raw.user.email !== OWNER_EMAIL ||
        raw.user.email_verified !== true
      )
        throw new OwnerAuthDenied();
      return raw.pending_authentication_token;
    }
  }
  async function cap(data) {
    return cookie(
      CAP,
      await seal(data, sealPassword, { ...defaults, ttl: 600000 }),
      600,
    );
  }
  async function operation(request, kind) {
    const text = (request.headers.get("cookie") || "")
      .split(";")
      .map((x) => x.trim())
      .filter((x) => x.startsWith(CAP + "="));
    if (text.length !== 1) throw new OwnerAuthDenied();
    let data;
    try {
      data = await unseal(text[0].slice(CAP.length + 1), sealPassword, {
        ...defaults,
        ttl: 600000,
      });
    } catch {
      throw new OwnerAuthDenied();
    }
    if (!data || typeof data.id !== "string" || typeof data.nonce !== "string")
      throw new OwnerAuthDenied();
    const op = await db
        .prepare(
          "SELECT * FROM owner_auth_operations WHERE id=? AND kind=? AND nonce_hash=? AND expires_at>?",
        )
        .bind(data.id, kind, await hash(data.nonce), now())
        .first(),
      record = await owner();
    if (
      !op ||
      op.user_id !== record.user_id ||
      op.epoch !== record.epoch ||
      op.attempts >= 5
    )
      throw new OwnerAuthDenied();
    return { data, op, record };
  }
  async function ticket(token, purpose, record) {
    secret(token);
    const t = await db
      .prepare(
        "SELECT * FROM owner_auth_operator_tickets WHERE token_hash=? AND purpose=? AND consumed_at IS NULL AND expires_at>? AND epoch=?",
      )
      .bind(await hash(token), purpose, now(), record.epoch)
      .first();
    if (
      !t ||
      (purpose === "primary-recovery" && t.user_id !== record.user_id) ||
      (purpose === "provision-reconcile" &&
        t.operation_id !== record.provision_operation_id)
    )
      throw new OwnerAuthDenied();
    return t;
  }
  function consume(t) {
    return db
      .prepare(
        "UPDATE owner_auth_operator_tickets SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>? AND epoch=?",
      )
      .bind(now(), t.id, now(), t.epoch);
  }
  async function verifyStandalone(challengeId, factorId, code) {
    otp(code);
    const proof = await sdk.multiFactorAuth.verifyChallenge({
      authenticationChallengeId: challengeId,
      code,
    });
    if (
      !proof.valid ||
      proof.challenge?.authenticationFactorId !== factorId ||
      proof.challenge.id !== challengeId
    )
      throw new OwnerAuthDenied();
  }
  async function handle(route, request) {
    if (route === "reconcile-info") {
      const b = await input(request, ["token"]),
        record = await owner();
      secret(b.token);
      const t = await db
        .prepare(
          "SELECT * FROM owner_auth_operator_tickets WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? AND epoch=?",
        )
        .bind(await hash(b.token), now(), record.epoch)
        .first();
      if (
        !t ||
        (t.purpose === "primary-recovery" && t.user_id !== record.user_id) ||
        (t.purpose === "provision-reconcile" &&
          t.operation_id !== record.provision_operation_id)
      )
        throw new OwnerAuthDenied();
      return response({ purpose: t.purpose });
    }
    if (route === "reconcile") {
      const b = await input(request, ["token", "password"]);
      password(b.password);
      const record = await owner(),
        t = await ticket(b.token, "provision-reconcile", record);
      const bound = record.user_id !== null;
      if (
        !record.external_id ||
        !record.provision_operation_id ||
        record.factor_verified_at !== null ||
        record.backup_verified_at !== null ||
        !["provisioning", "active"].includes(record.state) ||
        (bound && t.user_id !== record.user_id) ||
        (!bound && t.user_id !== null)
      )
        throw new OwnerAuthDenied();
      const op = await db
        .prepare(
          "SELECT * FROM owner_auth_operations WHERE id=? AND kind='provision' AND external_id=?",
        )
        .bind(record.provision_operation_id, record.external_id)
        .first();
      if (!op) throw new OwnerAuthDenied();
      await db.batch([
        consume(t),
        guard(db),
        db
          .prepare(
            "UPDATE owner_auth_identity SET state='provisioning',epoch=epoch+1 WHERE id=1 AND epoch=? AND factor_verified_at IS NULL AND backup_verified_at IS NULL AND provision_operation_id=?",
          )
          .bind(record.epoch, op.id),
        guard(db),
        db
          .prepare(
            "UPDATE owner_auth_operations SET stage='reconciling' WHERE id=? AND kind='provision' AND EXISTS(SELECT 1 FROM owner_auth_identity WHERE id=1 AND epoch=? AND factor_verified_at IS NULL AND backup_verified_at IS NULL AND provision_operation_id=?)",
          )
          .bind(op.id, record.epoch + 1, op.id),
        guard(db),
        audit(
          db,
          "deployment-maintenance",
          "owner.auth.provision.reconcile.started",
        ),
        db.prepare("DELETE FROM owner_auth_guard"),
      ]);
      record.epoch++;
      record.state = "provisioning";
      let user;
      if (bound) {
        user = await sdk.userManagement.getUser(record.user_id);
        userMatch(user, record);
        if (user.externalId !== record.external_id) throw new OwnerAuthDenied();
        await passwordProof(record, b.password);
        const factors = await (
          await sdk.multiFactorAuth.listUserAuthFactors({
            userId: record.user_id,
          })
        ).autoPagination();
        for (const factor of factors) {
          if (factor.userId !== record.user_id) throw new OwnerAuthDenied();
          try {
            await sdk.multiFactorAuth.deleteFactor(factor.id);
          } catch (error) {
            if (error.status !== 404) throw error;
          }
        }
      } else {
        try {
          user = await sdk.userManagement.getUserByExternalId(
            record.external_id,
          );
        } catch (error) {
          if (error.status !== 404) throw error;
          try {
            user = await sdk.userManagement.createUser({
              email: OWNER_EMAIL,
              password: b.password,
              emailVerified: true,
              externalId: record.external_id,
            });
          } catch (error) {
            if (error.status !== 409) throw error;
            user = await sdk.userManagement.getUserByExternalId(
              record.external_id,
            );
          }
        }
      }
      if (
        !user ||
        user.externalId !== record.external_id ||
        user.email !== OWNER_EMAIL ||
        user.emailVerified !== true ||
        (record.external_id && user.externalId !== record.external_id)
      )
        throw new OwnerAuthDenied();
      const candidate = { ...record, user_id: user.id },
        token = await passwordProof(candidate, b.password, "mfa_enrollment");
      await db.batch([
        db
          .prepare(
            "UPDATE owner_auth_identity SET user_id=?,state='active',factor_id=NULL WHERE id=1 AND state IN('provisioning','active') AND user_id IS ? AND provision_operation_id=? AND external_id=? AND epoch=? AND factor_verified_at IS NULL AND backup_verified_at IS NULL",
          )
          .bind(
            user.id,
            record.user_id,
            record.provision_operation_id,
            record.external_id,
            record.epoch,
          ),
        guard(db),
        db
          .prepare(
            "UPDATE owner_auth_operations SET user_id=?,stage='bound' WHERE id=? AND stage='reconciling'",
          )
          .bind(user.id, op.id),
        guard(db),
        db
          .prepare(
            "UPDATE owner_auth_pending SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL",
          )
          .bind(now(), user.id),
        db
          .prepare(
            "UPDATE owner_auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
          )
          .bind(now(), user.id),
        audit(db, user.id, "owner.auth.provision.reconciled"),
        db.prepare("DELETE FROM owner_auth_guard"),
      ]);
      await revokeAll(candidate);
      const active = await getIdentity();
      return makePending(active, token, "enroll");
    }
    if (route === "backup-enroll") {
      const b = await input(request, ["currentPassword", "code"]),
        { actor, record } = await primaryProof(
          request,
          b.currentPassword,
          b.code,
        ),
        id = crypto.randomUUID(),
        nonce = random();
      await db.batch([
        db.prepare(
          "UPDATE owner_auth_operations SET stage='superseded' WHERE kind='backup-enroll' AND stage IN('creating','verify')",
        ),
        db
          .prepare(
            "INSERT INTO owner_auth_operations(id,kind,user_id,stage,old_factor_id,nonce_hash,epoch,expires_at,created_at) SELECT ?,'backup-enroll',?,'creating',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM owner_auth_identity i JOIN owner_auth_sessions s ON s.user_id=i.user_id AND s.epoch=i.epoch WHERE i.id=1 AND i.state='active' AND i.epoch=? AND s.sid=? AND s.revoked_at IS NULL AND s.expires_at>?)",
          )
          .bind(
            id,
            record.user_id,
            record.backup_factor_id,
            await hash(nonce),
            record.epoch,
            now() + 600,
            now(),
            actor.epoch,
            actor.sessionId,
            now(),
          ),
        guard(db),
        audit(db, record.user_id, "owner.auth.backup.enroll.requested"),
        db.prepare("DELETE FROM owner_auth_guard"),
      ]);
      const factor = await sdk.multiFactorAuth.enrollFactor({
        type: "totp",
        issuer: "Patholy Owner Recovery",
        user: OWNER_EMAIL,
      });
      if (!factor.id || !factor.totp?.uri || !factor.totp.secret)
        throw new OwnerAuthDenied();
      const challenge = await sdk.multiFactorAuth.challengeFactor({
        authenticationFactorId: factor.id,
      });
      await db.batch([
        db
          .prepare(
            "UPDATE owner_auth_operations SET stage='verify',new_factor_id=? WHERE id=? AND stage='creating' AND expires_at>? AND EXISTS(SELECT 1 FROM owner_auth_identity WHERE id=1 AND epoch=? AND state='active' AND backup_factor_id IS ?)",
          )
          .bind(factor.id, id, now(), record.epoch, record.backup_factor_id),
        guard(db),
        db.prepare("DELETE FROM owner_auth_guard"),
      ]);
      return response(
        {
          stage: "backup-confirm",
          totpUri: factor.totp.uri,
          secret: factor.totp.secret,
        },
        200,
        [await cap({ id, nonce, challengeId: challenge.id })],
      );
    }
    if (route === "backup-verify") {
      const b = await input(request, ["code"]),
        { op, data, record } = await operation(request, "backup-enroll");
      if (op.stage !== "verify" || record.backup_factor_id !== op.old_factor_id)
        throw new OwnerAuthDenied();
      const claimed = await db
        .prepare(
          "UPDATE owner_auth_operations SET attempts=attempts+1 WHERE id=? AND attempts<5 AND expires_at>? AND epoch=? RETURNING id",
        )
        .bind(op.id, now(), record.epoch)
        .first();
      if (!claimed) throw new OwnerAuthDenied();
      await verifyStandalone(data.challengeId, op.new_factor_id, b.code);
      await db.batch([
        db
          .prepare(
            "UPDATE owner_auth_identity SET backup_factor_id=?,backup_verified_at=?,epoch=epoch+1 WHERE id=1 AND state='active' AND epoch=? AND backup_factor_id IS ? AND EXISTS(SELECT 1 FROM owner_auth_operations WHERE id=? AND epoch=? AND expires_at>? AND stage='verify')",
          )
          .bind(
            op.new_factor_id,
            now(),
            record.epoch,
            op.old_factor_id,
            op.id,
            record.epoch,
            now(),
          ),
        guard(db),
        db
          .prepare(
            "UPDATE owner_auth_operations SET stage=? WHERE id=? AND stage='verify'",
          )
          .bind(op.old_factor_id ? "cleanup" : "complete", op.id),
        guard(db),
        db
          .prepare(
            "UPDATE owner_auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
          )
          .bind(now(), record.user_id),
        audit(db, record.user_id, "owner.auth.backup.verified"),
        db.prepare("DELETE FROM owner_auth_guard"),
      ]);
      let cleanupPending = false;
      try {
        await revokeAll(record);
        if (op.old_factor_id) {
          await sdk.multiFactorAuth.deleteFactor(op.old_factor_id);
          await db
            .prepare(
              "UPDATE owner_auth_operations SET stage='complete' WHERE id=? AND stage='cleanup'",
            )
            .bind(op.id)
            .run();
        }
      } catch {
        cleanupPending = true;
      }
      return response(
        { ok: true, reauthenticationRequired: true, cleanupPending },
        200,
        emptyCookies,
      );
    }
    if (route === "backup-cleanup") {
      const b = await input(request, ["currentPassword", "code"]),
        { record } = await primaryProof(request, b.currentPassword, b.code);
      const rows = await db
        .prepare(
          "SELECT * FROM owner_auth_operations WHERE kind='backup-enroll' AND stage='cleanup' AND user_id=?",
        )
        .bind(record.user_id)
        .all();
      for (const op of rows.results) {
        if (op.old_factor_id === record.backup_factor_id)
          throw new OwnerAuthDenied();
        try {
          await sdk.multiFactorAuth.deleteFactor(op.old_factor_id);
        } catch (error) {
          if (error.status !== 404) throw error;
        }
        await db.batch([
          db
            .prepare(
              "UPDATE owner_auth_operations SET stage='complete' WHERE id=? AND stage='cleanup'",
            )
            .bind(op.id),
          audit(db, record.user_id, "owner.auth.backup.cleanup.complete"),
        ]);
      }
      return response({ ok: true });
    }
    if (route === "recover") {
      const b = await input(request, ["token", "password", "code"]),
        record = await owner();
      if (
        !record.user_id ||
        !record.backup_factor_id ||
        record.backup_verified_at === null ||
        !["active", "credential-changing"].includes(record.state)
      )
        throw new OwnerAuthDenied();
      const t = await ticket(b.token, "primary-recovery", record),
        pendingToken = await passwordProof(record, b.password);
      const challenge = await sdk.multiFactorAuth.challengeFactor({
        authenticationFactorId: record.backup_factor_id,
      });
      await verifyStandalone(challenge.id, record.backup_factor_id, b.code);
      const id = crypto.randomUUID(),
        nonce = random();
      await db.batch([
        consume(t),
        guard(db),
        db
          .prepare(
            "UPDATE owner_auth_identity SET state='credential-changing',epoch=epoch+1,recovery_operation_id=? WHERE id=1 AND user_id=? AND epoch=?",
          )
          .bind(id, record.user_id, record.epoch),
        guard(db),
        db
          .prepare(
            "INSERT INTO owner_auth_operations(id,kind,user_id,stage,old_factor_id,nonce_hash,epoch,expires_at,created_at) VALUES(?,'recovery',?,'revoking',?,?,?,?,?)",
          )
          .bind(
            id,
            record.user_id,
            record.factor_id,
            await hash(nonce),
            record.epoch + 1,
            now() + 600,
            now(),
          ),
        db
          .prepare(
            "UPDATE owner_auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
          )
          .bind(now(), record.user_id),
        audit(db, record.user_id, "owner.auth.recovery.started"),
        db.prepare("DELETE FROM owner_auth_guard"),
      ]);
      // Scoped cookie permits only recovery operations, even if network cleanup fails.
      const setCookie = await cap({ id, nonce, pendingToken });
      try {
        await revokeAll(record);
        await db
          .prepare(
            "UPDATE owner_auth_operations SET stage='ready' WHERE id=? AND stage='revoking'",
          )
          .bind(id)
          .run();
        return response({ stage: "recovery-enroll" }, 200, [
          setCookie,
          ...emptyCookies.slice(1),
        ]);
      } catch {
        return response(
          { stage: "recovery-enroll", retryRequired: true },
          503,
          [setCookie, ...emptyCookies.slice(1)],
        );
      }
    }
    if (route === "recovery-enroll") {
      const b = await input(request, ["password"]);
      password(b.password);
      const { op, data, record } = await operation(request, "recovery");
      if (
        record.recovery_operation_id !== op.id ||
        record.state !== "credential-changing"
      )
        throw new OwnerAuthDenied();
      if (op.stage === "revoking") {
        await revokeAll(record);
        await db
          .prepare(
            "UPDATE owner_auth_operations SET stage='ready' WHERE id=? AND stage='revoking'",
          )
          .bind(op.id)
          .run();
        op.stage = "ready";
      }
      if (op.stage !== "ready") throw new OwnerAuthDenied();
      await db.batch([
        db
          .prepare(
            "UPDATE owner_auth_operations SET stage='removing' WHERE id=? AND stage='ready'",
          )
          .bind(op.id),
        guard(db),
        db.prepare("DELETE FROM owner_auth_guard"),
      ]);
      const factors = await (
        await sdk.multiFactorAuth.listUserAuthFactors({
          userId: record.user_id,
        })
      ).autoPagination();
      for (const factor of factors) {
        if (factor.userId !== record.user_id) throw new OwnerAuthDenied();
        try {
          await sdk.multiFactorAuth.deleteFactor(factor.id);
        } catch (error) {
          if (error.status !== 404) throw error;
        }
      }
      await db
        .prepare(
          "UPDATE owner_auth_operations SET stage='enrolling' WHERE id=? AND stage='removing'",
        )
        .bind(op.id)
        .run();
      const freshToken = await passwordProof(
        record,
        b.password,
        "mfa_enrollment",
      );
      const value = await sdk.multiFactorAuth.createUserAuthFactor({
          userId: record.user_id,
          type: "totp",
          totpIssuer: "Patholy Owner",
          totpUser: OWNER_EMAIL,
        }),
        factor = value.authenticationFactor,
        challenge = value.authenticationChallenge;
      if (
        !factor?.id ||
        !factor.totp?.uri ||
        !factor.totp.secret ||
        !challenge?.id
      )
        throw new OwnerAuthDenied();
      await db.batch([
        db
          .prepare(
            "UPDATE owner_auth_operations SET stage='verify',new_factor_id=? WHERE id=? AND stage='enrolling'",
          )
          .bind(factor.id, op.id),
        guard(db),
        audit(db, record.user_id, "owner.auth.recovery.factor.created"),
        db.prepare("DELETE FROM owner_auth_guard"),
      ]);
      return response(
        {
          stage: "recovery-confirm",
          totpUri: factor.totp.uri,
          secret: factor.totp.secret,
        },
        200,
        [
          await cap({
            ...data,
            pendingToken: freshToken,
            challengeId: challenge.id,
          }),
        ],
      );
    }
    if (route === "recovery-verify") {
      const b = await input(request, ["code"]),
        { op, data, record } = await operation(request, "recovery");
      otp(b.code);
      if (
        op.stage !== "verify" ||
        !op.new_factor_id ||
        record.state !== "credential-changing" ||
        record.recovery_operation_id !== op.id
      )
        throw new OwnerAuthDenied();
      const claimed = await db
        .prepare(
          "UPDATE owner_auth_operations SET attempts=attempts+1 WHERE id=? AND attempts<5 AND expires_at>? AND epoch=? RETURNING id",
        )
        .bind(op.id, now(), record.epoch)
        .first();
      if (!claimed) throw new OwnerAuthDenied();
      const result = await sdk.userManagement.authenticateWithTotp({
        clientId: env.WORKOS_CLIENT_ID,
        pendingAuthenticationToken: data.pendingToken,
        authenticationChallengeId: data.challengeId,
        code: b.code,
        session: { sealSession: true, cookiePassword: sealPassword },
      });
      userMatch(result.user, record);
      if (result.authenticationMethod !== "Password" || !result.sealedSession)
        throw new OwnerAuthDenied();
      const verified = await sdk.userManagement
        .loadSealedSession({
          sessionData: result.sealedSession,
          cookiePassword: sealPassword,
        })
        .authenticate();
      if (
        !verified.authenticated ||
        verified.impersonator ||
        verified.authenticationMethod !== "Password"
      )
        throw new OwnerAuthDenied();
      userMatch(verified.user, record);
      await revokeAll(record);
      await db.batch([
        db
          .prepare(
            "UPDATE owner_auth_identity SET factor_id=?,factor_verified_at=?,state='active',recovery_operation_id=NULL WHERE id=1 AND state='credential-changing' AND recovery_operation_id=? AND epoch=? AND EXISTS(SELECT 1 FROM owner_auth_operations WHERE id=? AND epoch=? AND expires_at>? AND stage='verify')",
          )
          .bind(
            op.new_factor_id,
            now(),
            op.id,
            record.epoch,
            op.id,
            record.epoch,
            now(),
          ),
        guard(db),
        db
          .prepare(
            "UPDATE owner_auth_operations SET stage='complete' WHERE id=? AND stage='verify'",
          )
          .bind(op.id),
        guard(db),
        audit(db, record.user_id, "owner.auth.recovery.complete"),
        db.prepare("DELETE FROM owner_auth_guard"),
      ]);
      return response(
        { ok: true, reauthenticationRequired: true },
        200,
        emptyCookies,
      );
    }
    throw new OwnerAuthDenied();
  }
  async function revokeCapability(request) {
    const parts = (request.headers.get("cookie") || "")
      .split(";")
      .map((value) => value.trim())
      .filter((value) => value.startsWith(CAP + "="));
    if (parts.length !== 1) return false;
    let data;
    try {
      data = await unseal(parts[0].slice(CAP.length + 1), sealPassword, {
        ...defaults,
        ttl: 600000,
      });
    } catch {
      return false;
    }
    if (!data || typeof data.id !== "string" || typeof data.nonce !== "string")
      return false;
    const nonceHash = await hash(data.nonce),
      op = await db
        .prepare(
          "SELECT o.* FROM owner_auth_operations o JOIN owner_auth_identity i ON i.id=1 AND i.user_id=o.user_id AND i.epoch=o.epoch WHERE o.id=? AND o.nonce_hash=? AND o.kind IN('backup-enroll','recovery') AND o.stage NOT IN('complete','cleanup','superseded')",
        )
        .bind(data.id, nonceHash)
        .first();
    if (!op) return false;
    await db.batch([
      db
        .prepare(
          "UPDATE owner_auth_operations SET nonce_hash=NULL,stage='superseded' WHERE id=? AND nonce_hash=? AND user_id=? AND epoch=? AND stage NOT IN('complete','cleanup','superseded')",
        )
        .bind(op.id, nonceHash, op.user_id, op.epoch),
      guard(db),
      audit(db, op.user_id, "owner.auth.maintenance.logout"),
      db.prepare("DELETE FROM owner_auth_guard"),
    ]);
    return true;
  }
  async function beginMaintenance() {
    const nonce = random();
    const acquired = await db
      .prepare(
        "INSERT INTO owner_auth_external_lease(id,nonce,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET nonce=excluded.nonce,expires_at=excluded.expires_at WHERE owner_auth_external_lease.expires_at<=? RETURNING nonce",
      )
      .bind(nonce, now() + 180, now())
      .first();
    if (!acquired) throw new OwnerAuthDenied();
    lease = nonce;
    return async () => {
      await db
        .prepare("DELETE FROM owner_auth_external_lease WHERE id=1 AND nonce=?")
        .bind(nonce)
        .run();
      lease = null;
    };
  }
  return {
    revokeCapability,
    clearCapabilityCookie: () => cookie(CAP, "", 0),
    beginMaintenance,
    checkLease,
    supports: (route) => routes.includes(route),
    handle: async (route, request) => {
      if (
        ![
          "backup-enroll",
          "backup-cleanup",
          "recover",
          "recovery-enroll",
          "reconcile",
        ].includes(route)
      )
        return handle(route, request);
      const release = await beginMaintenance();
      try {
        return await handle(route, request);
      } finally {
        await release();
      }
    },
  };
}
