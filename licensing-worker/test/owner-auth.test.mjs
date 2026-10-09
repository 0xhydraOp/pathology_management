import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomUUID, createHash } from "node:crypto";
import { WorkOS } from "@workos-inc/node";
import {
  createOwnerAuth,
  OWNER_EMAIL,
  OwnerAuthDenied,
} from "../src/ownerAuth.js";
import { startSyntheticWorker } from "./fixture.mjs";

export async function fixture() {
  const f = await startSyntheticWorker(),
    rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }),
    user = {
      object: "user",
      id: "user_synthetic",
      email: OWNER_EMAIL,
      email_verified: true,
      first_name: null,
      last_name: null,
      profile_picture_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  const provider = {
    factor: null,
    backup: null,
    challenges: new Map(),
    createFailure: false,
    backupFailure: false,
    deleteFailure: false,
    pauseFactors: null,
    pausePassword: null,
    primaryFailure: false,
    missingUser: false,
    providerCalls: 0,
    sessions: new Map(),
    password: "synthetic-password-123",
    disabledMfa: false,
    wrongUser: false,
    revokeFailure: false,
    passwordFailure: false,
    pauseTotp: null,
    pauseList: null,
  };
  const issuer = "https://api.workos.com/user_management/client_synthetic";
  function jwt(sid) {
    const header = Buffer.from(
        JSON.stringify({ alg: "RS256", kid: "synthetic-rsa" }),
      ).toString("base64url"),
      payload = Buffer.from(
        JSON.stringify({
          iss: issuer,
          sub: user.id,
          sid,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url");
    return `${header}.${payload}.${sign("RSA-SHA256", Buffer.from(header + "." + payload), rsa.privateKey).toString("base64url")}`;
  }
  const sdk = new WorkOS("sk_synthetic", {
    clientId: "client_synthetic",
    issuer,
    maxRetries: 0,
    fetchFn: async (url, init = {}) => {
      provider.providerCalls++;
      const path = new URL(url).pathname,
        b = init.body ? JSON.parse(init.body) : {},
        reply = (x, status = 200) => Response.json(x, { status });
      if (path === "/user_management/users" && init.method === "POST") {
        assert.equal(b.email, OWNER_EMAIL);
        assert.equal(b.email_verified, true);
        provider.password = b.password;
        user.external_id = b.external_id;
        if (provider.createFailure)
          throw Error("synthetic unknown create outcome");
        return reply(user);
      }
      if (path.startsWith("/user_management/users/external_id/"))
        return user.external_id === decodeURIComponent(path.split("/").pop())
          ? reply(user)
          : reply({ message: "not found" }, 404);
      if (path === "/user_management/users/" + user.id && init.method === "GET")
        return reply(user);
      if (path === "/auth/factors/enroll" && init.method === "POST") {
        assert.equal(b.type, "totp");
        assert.equal(b.user_id, undefined);
        provider.backup = {
          id: "backup_" + randomUUID(),
          type: "totp",
          totp: {
            uri: "otpauth://totp/Recovery?secret=BACKUP",
            secret: "BACKUP",
          },
        };
        if (provider.backupFailure) throw Error("synthetic uncertain backup");
        return reply(provider.backup);
      }
      if (path.startsWith("/auth/factors/") && init.method === "DELETE") {
        if (provider.deleteFailure) throw Error("synthetic delete outage");
        if (provider.factor?.id === path.split("/").pop())
          provider.factor = null;
        return new Response(null, { status: 204 });
      }
      if (path.endsWith("/verify")) {
        const challenge = provider.challenges.get(path.split("/").at(-2));
        if (!challenge || b.code !== "123456")
          return reply({ valid: false, challenge });
        provider.challenges.delete(challenge.id);
        return reply({ valid: true, challenge });
      }
      if (path === "/user_management/authenticate") {
        if (b.grant_type === "password") {
          if (b.email !== OWNER_EMAIL || b.password !== provider.password)
            return reply(
              {
                code: "invalid_credentials",
                message: "synthetic incorrect credentials",
              },
              401,
            );
          if (!provider.disabledMfa)
            return reply(
              {
                code: provider.factor ? "mfa_challenge" : "mfa_enrollment",
                message: "synthetic step",
                pending_authentication_token: "synthetic-pending",
                user: provider.missingUser ? undefined : user,
              },
              400,
            );
        } else {
          assert.equal(b.grant_type, "urn:workos:oauth:grant-type:mfa-totp");
          assert.equal(b.pending_authentication_token, "synthetic-pending");
          if (b.code !== "123456")
            return reply(
              { code: "invalid_code", message: "synthetic incorrect code" },
              401,
            );
          if (provider.pauseTotp) await provider.pauseTotp();
        }
        const sid = "session_" + randomUUID();
        provider.sessions.set(sid, {
          object: "session",
          id: sid,
          user_id: user.id,
          auth_method: "password",
          status: "active",
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        return reply({
          user: provider.wrongUser ? { ...user, id: "user_other" } : user,
          access_token: jwt(sid),
          refresh_token: "synthetic-refresh",
          authentication_method: "Password",
        });
      }
      if (path.endsWith("/auth_factors") && init.method === "GET") {
        if (provider.pauseFactors) await provider.pauseFactors();
        return reply({
          object: "list",
          data: provider.factor ? [provider.factor] : [],
          list_metadata: { before: null, after: null },
        });
      }
      if (path.endsWith("/auth_factors") && init.method === "POST") {
        provider.factor = {
          object: "authentication_factor",
          id: "factor_synthetic",
          type: "totp",
          totp: {
            uri: "otpauth://totp/Synthetic?secret=SYNTHETIC",
            secret: "SYNTHETIC",
          },
          user_id: user.id,
        };
        if (provider.primaryFailure) throw Error("synthetic uncertain primary");
        return reply({
          authentication_factor: provider.factor,
          authentication_challenge: { id: "challenge_synthetic" },
        });
      }
      if (path.endsWith("/challenge")) {
        const factorId = path.split("/").at(-2),
          challenge = {
            object: "authentication_challenge",
            id: "challenge_" + randomUUID(),
            authentication_factor_id: factorId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 600000).toISOString(),
          };
        provider.challenges.set(challenge.id, challenge);
        return reply(challenge);
      }
      if (path.endsWith("/sessions") && init.method === "GET") {
        const snapshot = [...provider.sessions.values()];
        if (provider.pauseList) await provider.pauseList();
        return reply({
          object: "list",
          data: snapshot,
          list_metadata: { before: null, after: null },
        });
      }
      if (path === "/user_management/sessions/revoke") {
        if (provider.revokeFailure) throw Error("synthetic network failure");
        provider.sessions.delete(b.session_id);
        return new Response(null, { status: 204 });
      }
      if (
        path === "/user_management/users/" + user.id &&
        init.method === "PUT"
      ) {
        if (provider.passwordFailure)
          throw Error("synthetic password update failure");
        if (provider.pausePassword) await provider.pausePassword();
        provider.password = b.password;
        return reply(user);
      }
      throw Error("Unexpected synthetic provider endpoint " + path);
    },
  });
  sdk.userManagement.getJWKS = async () =>
    crypto.subtle.importKey(
      "jwk",
      rsa.publicKey.export({ format: "jwk" }),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  const env = {
      DB: f.db,
      OWNER_ORIGIN: "https://owner.example.invalid",
      OWNER_AUTH_MODE: "workos",
      OWNER_AUTH_READY: "true",
      WORKOS_API_KEY: "sk_synthetic",
      WORKOS_CLIENT_ID: "client_synthetic",
      WORKOS_COOKIE_PASSWORD: "synthetic-session-secret-".repeat(3),
    },
    auth = createOwnerAuth(env, { workos: sdk });
  let jar = {};
  const req = (route, data = {}, extra = {}) =>
    new Request(env.OWNER_ORIGIN + "/v1/owner-auth/" + route, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: env.OWNER_ORIGIN,
        "x-patholy-owner-action": "1",
        cookie: Object.entries(jar)
          .map(([k, v]) => k + "=" + v)
          .join("; "),
        ...extra,
      },
      body: JSON.stringify(data),
    });
  const call = async (route, data, extra) => {
    const response = await auth.handle(req(route, data, extra));
    for (const entry of response.headers.getSetCookie()) {
      const [pair] = entry.split(";"),
        split = pair.indexOf("=");
      jar[pair.slice(0, split)] = pair.slice(split + 1);
    }
    return response;
  };
  const token = Buffer.from("synthetic-bootstrap-secret-32bytes!")
    .toString("base64url")
    .slice(0, 43);
  await f.db
    .prepare(
      "INSERT INTO owner_auth_identity(id,email,user_id,state,epoch) VALUES(1,?,NULL,'unclaimed',1)",
    )
    .bind(OWNER_EMAIL)
    .run();
  await f.db
    .prepare("INSERT INTO owner_auth_bootstrap VALUES(?,?,?,NULL)")
    .bind(
      randomUUID(),
      createHash("sha256").update(token).digest("base64url"),
      Math.floor(Date.now() / 1000) + 300,
    )
    .run();
  return { f, provider, auth, env, jar, req, call, token, close: f.close };
}
export async function established(x) {
  assert.equal(
    (
      await x.call("bootstrap", {
        token: x.token,
        password: x.provider.password,
      })
    ).status,
    200,
  );
  assert.equal((await x.call("enroll", {})).status, 200);
  assert.equal((await x.call("totp", { code: "123456" })).status, 200);
  assert.equal(
    (
      await x.call("backup-enroll", {
        currentPassword: x.provider.password,
        code: "123456",
      })
    ).status,
    200,
  );
  assert.equal((await x.call("backup-verify", { code: "123456" })).status, 200);
  assert.equal(
    (
      await x.call("login", {
        email: OWNER_EMAIL,
        password: x.provider.password,
      })
    ).status,
    200,
  );
  assert.equal((await x.call("totp", { code: "123456" })).status, 200);
}
test(
  "two owner sessions revoke together after password change, without MFA or Access alternatives",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      const first = x.jar["__Host-patholy_owner"];
      assert.equal(
        (
          await x.call("login", {
            email: OWNER_EMAIL,
            password: x.provider.password,
          })
        ).status,
        200,
      );
      assert.equal((await x.call("totp", { code: "123456" })).status, 200);
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT count(*) n FROM owner_auth_sessions WHERE revoked_at IS NULL",
            )
            .first()
        ).n,
        2,
      );
      assert.equal(
        (
          await x.call("password", {
            currentPassword: x.provider.password,
            newPassword: "synthetic-two-session-password",
            code: "123456",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT count(*) n FROM owner_auth_sessions WHERE revoked_at IS NULL",
            )
            .first()
        ).n,
        0,
      );
      x.jar["__Host-patholy_owner"] = first;
      assert.equal((await x.call("status", {})).status, 401);
      assert.equal(x.provider.sessions.size, 0);
    } finally {
      await x.close();
    }
  },
);
test(
  "bootstrap is expiring, tamper resistant and single-use across concurrent requests",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      assert.equal(
        (
          await x.call("bootstrap", {
            token: "x".repeat(43),
            password: x.provider.password,
          })
        ).status,
        401,
      );
      assert.equal(
        (await x.f.db.prepare("SELECT state FROM owner_auth_identity").first())
          .state,
        "unclaimed",
      );
      await x.f.db
        .prepare("UPDATE owner_auth_bootstrap SET expires_at=1")
        .run();
      assert.equal(
        (
          await x.call("bootstrap", {
            token: x.token,
            password: x.provider.password,
          })
        ).status,
        401,
      );
      assert.equal(
        (await x.f.db.prepare("SELECT state FROM owner_auth_identity").first())
          .state,
        "unclaimed",
      );
      await x.f.db
        .prepare("UPDATE owner_auth_bootstrap SET expires_at=?")
        .bind(Math.floor(Date.now() / 1000) + 300)
        .run();
      const results = await Promise.all([
        x.call("bootstrap", { token: x.token, password: x.provider.password }),
        x.call("bootstrap", { token: x.token, password: x.provider.password }),
      ]);
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      assert.equal(
        (
          await x.call("bootstrap", {
            token: x.token,
            password: x.provider.password,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT count(*) n FROM owner_audit WHERE action='owner.auth.bootstrap.complete'",
            )
            .first()
        ).n,
        1,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "persistent authentication throttle and five-attempt MFA cap cannot be reset by cookies",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      await x.call("login", {
        email: OWNER_EMAIL,
        password: x.provider.password,
      });
      for (let i = 0; i < 5; i++)
        assert.equal((await x.call("totp", { code: "000000" })).status, 401);
      assert.equal((await x.call("totp", { code: "123456" })).status, 401);
      for (let i = 0; i < 11; i++)
        assert.equal(
          (
            await x.call("login", {
              email: OWNER_EMAIL,
              password: "synthetic-wrong-password",
            })
          ).status,
          401,
        );
      assert.equal(
        (
          await x.call("login", {
            email: OWNER_EMAIL,
            password: x.provider.password,
          })
        ).status,
        401,
      );
      assert(
        (
          await x.f.db
            .prepare("SELECT max(count) n FROM owner_auth_rate")
            .first()
        ).n > 10,
      );
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT count(*) n FROM owner_auth_sessions WHERE revoked_at IS NULL",
            )
            .first()
        ).n,
        1,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "logout clears cookies and revokes the local receipt despite provider outage or stale JWT",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      const saved = x.jar["__Host-patholy_owner"];
      x.provider.revokeFailure = true;
      const r = await x.call("logout", {});
      assert.equal(r.status, 200);
      assert.equal((await r.json()).providerRevocationPending, true);
      assert.equal(x.jar["__Host-patholy_owner"], "");
      x.jar["__Host-patholy_owner"] = saved;
      assert.equal((await x.call("status", {})).status, 401);
      assert.equal((await x.call("logout", {})).status, 200);
      assert.equal(x.jar["__Host-patholy_owner"], "");
      x.jar["__Host-patholy_owner"] = "tampered";
      assert.equal((await x.call("logout", {})).status, 200);
      assert.equal(x.jar["__Host-patholy_owner"], "");
    } finally {
      await x.close();
    }
  },
);
test(
  "password update failure locks the identity and never claims completion",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      x.provider.passwordFailure = true;
      assert.equal(
        (
          await x.call("password", {
            currentPassword: x.provider.password,
            newPassword: "synthetic-new-password-123",
            code: "123456",
          })
        ).status,
        503,
      );
      const row = await x.f.db
        .prepare("SELECT state,epoch FROM owner_auth_identity")
        .first();
      assert.equal(row.state, "credential-changing");
      assert.equal(row.epoch, 3);
      assert.equal(
        (
          await x.call("login", {
            email: OWNER_EMAIL,
            password: x.provider.password,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT count(*) n FROM owner_audit WHERE action='owner.auth.password.complete'",
            )
            .first()
        ).n,
        0,
      );
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT count(*) n FROM owner_audit WHERE action='owner.auth.password.change.requested'",
            )
            .first()
        ).n,
        1,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "logout during password/TOTP reauthentication prevents the later password mutation",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      let resolve, entered;
      const ready = new Promise((r) => (entered = r));
      x.provider.pauseTotp = () =>
        new Promise((r) => {
          resolve = r;
          entered();
        });
      const previous = x.provider.password,
        pending = x.call("password", {
          currentPassword: previous,
          newPassword: "synthetic-raced-password-123",
          code: "123456",
        });
      await ready;
      assert.equal((await x.call("logout", {})).status, 200);
      resolve();
      assert.equal((await pending).status, 401);
      assert.equal(x.provider.password, previous);
      assert.equal(
        (await x.f.db.prepare("SELECT epoch FROM owner_auth_identity").first())
          .epoch,
        2,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "unconfigured real Worker WorkOS mode never falls back to Access JWT or administrative bearer",
  { timeout: 60000 },
  async () => {
    const f = await startSyntheticWorker({
      authMode: "workos",
      createLicense: false,
    });
    try {
      const h = {
        ...f.adminHeaders,
        origin: f.url,
        "x-patholy-owner-action": "1",
      };
      for (const route of ["/v1/owner/customers/list", "/v1/admin/create"]) {
        const r = await f.post(
          route,
          route.includes("/admin/")
            ? {
                seats: 1,
                offlineSeconds: 60,
                expiresAt: Math.floor(Date.now() / 1000) + 1000,
              }
            : {},
          h,
        );
        assert.notEqual(r.status, 200);
      }
      assert.equal(
        (await f.mf.dispatchFetch(f.url + "/owner/login")).status,
        200,
      );
      assert.equal(
        (await f.mf.dispatchFetch(f.url + "/owner/security", { headers: h }))
          .status,
        200,
      );
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM licenses").first()).n,
        0,
      );
    } finally {
      await f.close();
    }
  },
);
test(
  "official WorkOS SDK seals owner session only after password and TOTP, with single-use D1 receipt",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      assert.equal(
        (
          await x.call("bootstrap", {
            token: x.token,
            password: x.provider.password,
          })
        ).status,
        200,
      );
      assert.equal((await x.call("status", {})).status, 401);
      assert.equal((await x.call("enroll", {})).status, 200);
      assert.equal((await x.call("totp", { code: "000000" })).status, 401);
      assert.equal((await x.call("totp", { code: "123456" })).status, 200);
      assert.equal((await x.call("status", {})).status, 200);
      assert.equal((await x.call("totp", { code: "123456" })).status, 401);
      await assert.rejects(x.auth.authorize(x.req("status")), OwnerAuthDenied);
      assert.equal(
        (
          await x.call("backup-enroll", {
            currentPassword: x.provider.password,
            code: "123456",
          })
        ).status,
        200,
      );
      assert.equal(
        (await x.call("backup-verify", { code: "123456" })).status,
        200,
      );
      await x.call("login", {
        email: OWNER_EMAIL,
        password: x.provider.password,
      });
      await x.call("totp", { code: "123456" });
      const actor = await x.auth.authorize(x.req("status"));
      assert.equal(actor.email, OWNER_EMAIL);
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT count(*) n FROM owner_auth_sessions WHERE revoked_at IS NULL",
            )
            .first()
        ).n,
        1,
      );
      assert(
        !JSON.stringify(await (await x.call("status", {})).json()).includes(
          "accessToken",
        ),
      );
      x.jar.__Host_patholy_owner = "forged";
      x.jar["__Host-patholy_owner"] = "forged";
      assert.equal((await x.call("status", {})).status, 401);
    } finally {
      await x.close();
    }
  },
);
test(
  "wrong owner, password-only provider success, CSRF and removed MFA factor never grant control",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      assert.equal(
        (
          await x.call("login", {
            email: "other@example.test",
            password: x.provider.password,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await x.call(
            "login",
            { email: OWNER_EMAIL, password: x.provider.password },
            { origin: "https://attacker.test" },
          )
        ).status,
        401,
      );
      x.provider.disabledMfa = true;
      assert.equal(
        (
          await x.call("login", {
            email: OWNER_EMAIL,
            password: x.provider.password,
          })
        ).status,
        401,
      );
      x.provider.disabledMfa = false;
      x.provider.factor = null;
      assert.equal(
        (
          await x.call("login", {
            email: OWNER_EMAIL,
            password: x.provider.password,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await x.call("bootstrap", {
            token: x.token,
            password: x.provider.password,
          })
        ).status,
        401,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "provider revocation and local password epoch revoke sessions; password change requires fresh TOTP",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      const actor = await x.auth.authorize(x.req("status"));
      x.provider.sessions.delete(actor.sessionId);
      assert.equal((await x.call("status", {})).status, 401);
      assert.equal(
        (
          await x.call("login", {
            email: OWNER_EMAIL,
            password: x.provider.password,
          })
        ).status,
        200,
      );
      assert.equal((await x.call("totp", { code: "123456" })).status, 200);
      assert.equal(
        (
          await x.call("password", {
            currentPassword: x.provider.password,
            newPassword: "synthetic-new-password-123",
            code: "000000",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await x.call("password", {
            currentPassword: x.provider.password,
            newPassword: "synthetic-new-password-123",
            code: "123456",
          })
        ).status,
        200,
      );
      assert.equal((await x.call("status", {})).status, 401);
      assert.equal(
        (await x.f.db.prepare("SELECT epoch FROM owner_auth_identity").first())
          .epoch,
        3,
      );
      assert.equal(x.provider.sessions.size, 0);
    } finally {
      await x.close();
    }
  },
);
async function maintenanceTicket(x, purpose) {
  const r = await x.f.db
      .prepare("SELECT * FROM owner_auth_identity WHERE id=1")
      .first(),
    token = randomUUID().replaceAll("-", "") + "abcdefghijk";
  await x.f.db
    .prepare(
      "INSERT INTO owner_auth_operator_tickets(id,token_hash,user_id,operation_id,purpose,epoch,expires_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      randomUUID(),
      createHash("sha256").update(token).digest("base64url"),
      r.user_id,
      r.provision_operation_id,
      purpose,
      r.epoch,
      Math.floor(Date.now() / 1000) + 300,
    )
    .run();
  return token;
}
test(
  "unknown user creation reconciles only exact durable external ID and consumes operator ticket",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      x.provider.createFailure = true;
      assert.equal(
        (
          await x.call("bootstrap", {
            token: x.token,
            password: x.provider.password,
          })
        ).status,
        503,
      );
      const r = await x.f.db
        .prepare("SELECT * FROM owner_auth_identity")
        .first();
      assert.equal(r.state, "provisioning");
      assert.ok(r.external_id);
      const token = await maintenanceTicket(x, "provision-reconcile");
      x.provider.createFailure = false;
      assert.equal(
        (await x.call("reconcile", { token, password: x.provider.password }))
          .status,
        200,
      );
      assert.equal(
        (await x.call("reconcile", { token, password: x.provider.password }))
          .status,
        401,
      );
      const active = await x.f.db
        .prepare("SELECT * FROM owner_auth_identity")
        .first();
      assert.equal(active.user_id, "user_synthetic");
      assert.equal(active.external_id, r.external_id);
      await assert.rejects(
        x.f.db
          .prepare("UPDATE owner_auth_identity SET user_id='replacement'")
          .run(),
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "independent backup plus password and ticket replaces primary only after new MFA and revokes all sessions",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      const token = await maintenanceTicket(x, "primary-recovery");
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "000000",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        200,
      );
      assert.equal((await x.call("status", {})).status, 401);
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        401,
      );
      assert.equal(
        (await x.call("recovery-enroll", { password: x.provider.password }))
          .status,
        200,
      );
      assert.equal(
        (await x.call("recovery-verify", { code: "000000" })).status,
        401,
      );
      assert.equal(
        (await x.call("recovery-verify", { code: "123456" })).status,
        200,
      );
      assert.equal(x.provider.sessions.size, 0);
      assert.equal(
        (
          await x.call("login", {
            email: OWNER_EMAIL,
            password: x.provider.password,
          })
        ).status,
        200,
      );
      assert.equal((await x.call("totp", { code: "123456" })).status, 200);
      await x.auth.authorize(x.req("status"));
      const op = await x.f.db
        .prepare("SELECT * FROM owner_auth_operations WHERE kind='recovery'")
        .first();
      assert.equal(op.stage, "complete");
    } finally {
      await x.close();
    }
  },
);
test(
  "fresh strong operator proof can resume interrupted recovery without trusting old capability",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      let token = await maintenanceTicket(x, "primary-recovery");
      x.provider.revokeFailure = true;
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        503,
      );
      const old = x.jar["__Host-patholy_owner_maintenance"];
      x.provider.revokeFailure = false;
      token = await maintenanceTicket(x, "primary-recovery");
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        200,
      );
      const fresh = x.jar["__Host-patholy_owner_maintenance"];
      x.jar["__Host-patholy_owner_maintenance"] = old;
      assert.equal(
        (await x.call("recovery-enroll", { password: x.provider.password }))
          .status,
        401,
      );
      x.jar["__Host-patholy_owner_maintenance"] = fresh;
      assert.equal(
        (await x.call("recovery-enroll", { password: x.provider.password }))
          .status,
        200,
      );
      assert.equal(
        (await x.call("recovery-verify", { code: "123456" })).status,
        200,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "uncertain mandatory backup enrollment permits only fresh primary proof to supersede",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await x.call("bootstrap", {
        token: x.token,
        password: x.provider.password,
      });
      await x.call("enroll", {});
      await x.call("totp", { code: "123456" });
      x.provider.backupFailure = true;
      assert.equal(
        (
          await x.call("backup-enroll", {
            currentPassword: x.provider.password,
            code: "123456",
          })
        ).status,
        503,
      );
      x.provider.backupFailure = false;
      assert.equal(
        (
          await x.call("backup-enroll", {
            currentPassword: x.provider.password,
            code: "000000",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await x.call("backup-enroll", {
            currentPassword: x.provider.password,
            code: "123456",
          })
        ).status,
        200,
      );
      const responses = await Promise.all(
        Array.from({ length: 9 }, () =>
          x.call("backup-verify", { code: "000000" }),
        ),
      );
      assert.ok(responses.every((r) => r.status === 401));
      const op = await x.f.db
        .prepare(
          "SELECT * FROM owner_auth_operations WHERE kind='backup-enroll' AND stage='verify'",
        )
        .first();
      assert.equal(op.attempts, 5);
      await assert.rejects(x.auth.authorize(x.req("status")), OwnerAuthDenied);
    } finally {
      await x.close();
    }
  },
);
test(
  "unknown primary enrollment is cleaned only after a fresh operator ticket and independent proof",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      let token = await maintenanceTicket(x, "primary-recovery");
      await x.call("recover", {
        token,
        password: x.provider.password,
        code: "123456",
      });
      x.provider.primaryFailure = true;
      assert.equal(
        (await x.call("recovery-enroll", { password: x.provider.password }))
          .status,
        503,
      );
      assert.equal(
        (await x.call("recovery-enroll", { password: x.provider.password }))
          .status,
        401,
      );
      x.provider.primaryFailure = false;
      token = await maintenanceTicket(x, "primary-recovery");
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        200,
      );
      assert.equal(
        (await x.call("recovery-enroll", { password: x.provider.password }))
          .status,
        200,
      );
      assert.equal(
        (await x.call("recovery-verify", { code: "123456" })).status,
        200,
      );
      const op = await x.f.db
        .prepare(
          "SELECT count(*) n FROM owner_auth_operations WHERE kind='recovery'",
        )
        .first();
      assert.equal(op.n, 2);
    } finally {
      await x.close();
    }
  },
);
test(
  "forged and locally revoked session cookies cannot trigger provider transport",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      x.jar["__Host-patholy_owner"] = "forged";
      const before = x.provider.providerCalls;
      await assert.rejects(x.auth.authorize(x.req("status")), OwnerAuthDenied);
      assert.equal(x.provider.providerCalls, before);
    } finally {
      await x.close();
    }
  },
);
test(
  "maintenance tickets cannot override lost factors, expired epochs, passwords or owner identity",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      let token = await maintenanceTicket(x, "primary-recovery");
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: "incorrect-password-123",
            code: "123456",
          })
        ).status,
        401,
      );
      await x.f.db
        .prepare(
          "UPDATE owner_auth_operator_tickets SET epoch=epoch+1 WHERE consumed_at IS NULL",
        )
        .run();
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        401,
      );
      token = await maintenanceTicket(x, "primary-recovery");
      await x.f.db
        .prepare(
          "UPDATE owner_auth_operator_tickets SET expires_at=1 WHERE consumed_at IS NULL",
        )
        .run();
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        401,
      );
      token = await maintenanceTicket(x, "primary-recovery");
      await x.f.db
        .prepare("UPDATE owner_auth_identity SET backup_verified_at=NULL")
        .run();
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT count(*) n FROM owner_auth_operations WHERE kind='recovery'",
            )
            .first()
        ).n,
        0,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "bound but unverified initial factor resumes after uncertain create and database persistence failure",
  { timeout: 60000 },
  async () => {
    for (const failure of ["provider", "database"]) {
      const x = await fixture();
      try {
        await x.call("bootstrap", {
          token: x.token,
          password: x.provider.password,
        });
        if (failure === "provider") x.provider.primaryFailure = true;
        else
          await x.f.db.exec(
            "CREATE TRIGGER synthetic_factor_failure BEFORE UPDATE OF factor_id ON owner_auth_identity WHEN NEW.factor_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
          );
        assert.equal((await x.call("enroll", {})).status, 503);
        const original = await x.f.db
          .prepare("SELECT * FROM owner_auth_identity")
          .first();
        assert.equal(original.factor_verified_at, null);
        assert.equal(original.user_id, "user_synthetic");
        x.provider.primaryFailure = false;
        if (failure === "database")
          await x.f.db.exec("DROP TRIGGER synthetic_factor_failure");
        const token = await maintenanceTicket(x, "provision-reconcile");
        assert.equal(
          (await x.call("reconcile", { token, password: x.provider.password }))
            .status,
          200,
        );
        assert.equal((await x.call("enroll", {})).status, 200);
        assert.equal((await x.call("totp", { code: "123456" })).status, 200);
        await assert.rejects(
          x.auth.authorize(x.req("status")),
          OwnerAuthDenied,
        );
        const final = await x.f.db
          .prepare("SELECT * FROM owner_auth_identity")
          .first();
        assert.equal(final.user_id, original.user_id);
        assert.equal(final.external_id, original.external_id);
        const forbidden = await maintenanceTicket(x, "provision-reconcile");
        assert.equal(
          (
            await x.call("reconcile", {
              token: forbidden,
              password: x.provider.password,
            })
          ).status,
          401,
        );
      } finally {
        await x.close();
      }
    }
  },
);
test(
  "provider password pending token must include exact bound owner rather than email-only or absent identity",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      x.provider.missingUser = true;
      assert.equal(
        (
          await x.call("login", {
            email: OWNER_EMAIL,
            password: x.provider.password,
          })
        ).status,
        401,
      );
      const token = await maintenanceTicket(x, "primary-recovery");
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT count(*) n FROM owner_auth_operations WHERE kind='recovery'",
            )
            .first()
        ).n,
        0,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "backup rotation preserves old factor until verification then revokes sessions and supports cleanup retry",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      const before = await x.f.db
        .prepare("SELECT * FROM owner_auth_identity")
        .first();
      await x.call("backup-enroll", {
        currentPassword: x.provider.password,
        code: "123456",
      });
      assert.equal(
        (
          await x.f.db
            .prepare("SELECT backup_factor_id FROM owner_auth_identity")
            .first()
        ).backup_factor_id,
        before.backup_factor_id,
      );
      assert.equal(
        (await x.call("backup-verify", { code: "000000" })).status,
        401,
      );
      assert.equal(
        (
          await x.f.db
            .prepare("SELECT backup_factor_id FROM owner_auth_identity")
            .first()
        ).backup_factor_id,
        before.backup_factor_id,
      );
      x.provider.deleteFailure = true;
      const r = await x.call("backup-verify", { code: "123456" });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).cleanupPending, true);
      const after = await x.f.db
        .prepare("SELECT * FROM owner_auth_identity")
        .first();
      assert.notEqual(after.backup_factor_id, before.backup_factor_id);
      assert.equal(after.epoch, before.epoch + 1);
      assert.equal((await x.call("status", {})).status, 401);
      x.provider.deleteFailure = false;
      await x.call("login", {
        email: OWNER_EMAIL,
        password: x.provider.password,
      });
      await x.call("totp", { code: "123456" });
      assert.equal(
        (
          await x.call("backup-cleanup", {
            currentPassword: x.provider.password,
            code: "123456",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT count(*) n FROM owner_auth_operations WHERE stage='cleanup'",
            )
            .first()
        ).n,
        0,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "durable external lease blocks supersession and stale paused cleanup cannot delete a newer factor",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      let token = await maintenanceTicket(x, "primary-recovery");
      await x.call("recover", {
        token,
        password: x.provider.password,
        code: "123456",
      });
      let resume, entered;
      const begun = new Promise((r) => (entered = r)),
        paused = new Promise((r) => (resume = r));
      x.provider.pauseFactors = async () => {
        entered();
        await paused;
      };
      const pending = x.call("recovery-enroll", {
        password: x.provider.password,
      });
      await begun;
      token = await maintenanceTicket(x, "primary-recovery");
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await x.call("password", {
            currentPassword: x.provider.password,
            newPassword: "other-password-123",
            code: "123456",
          })
        ).status,
        401,
      );
      await x.f.db
        .prepare(
          "UPDATE owner_auth_external_lease SET nonce='newer-owner-operation'",
        )
        .run();
      const factor = x.provider.factor;
      resume();
      assert.equal((await pending).status, 401);
      assert.equal(x.provider.factor, factor);
      assert.equal(
        (
          await x.f.db
            .prepare("SELECT nonce FROM owner_auth_external_lease")
            .first()
        ).nonce,
        "newer-owner-operation",
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "password provider mutation holds the same lease against simultaneous recovery",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      let resume, entered;
      const begun = new Promise((r) => (entered = r)),
        paused = new Promise((r) => (resume = r));
      x.provider.pausePassword = async () => {
        entered();
        await paused;
      };
      const pending = x.call("password", {
        currentPassword: x.provider.password,
        newPassword: "changed-password-123",
        code: "123456",
      });
      await begun;
      const token = await maintenanceTicket(x, "primary-recovery");
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        401,
      );
      resume();
      assert.equal((await pending).status, 200);
      assert.equal(
        (await x.f.db.prepare("SELECT state FROM owner_auth_identity").first())
          .state,
        "active",
      );
      assert.equal(
        (
          await x.f.db
            .prepare("SELECT count(*) n FROM owner_auth_external_lease")
            .first()
        ).n,
        0,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "logout invalidates its own recovery capability while keeping locked recovery resumable only by fresh proof",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      let token = await maintenanceTicket(x, "primary-recovery");
      await x.call("recover", {
        token,
        password: x.provider.password,
        code: "123456",
      });
      const cap = x.jar["__Host-patholy_owner_maintenance"];
      assert.equal((await x.call("logout", {})).status, 200);
      assert.equal(x.jar["__Host-patholy_owner_maintenance"], "");
      const r = await x.f.db
        .prepare("SELECT * FROM owner_auth_operations WHERE kind='recovery'")
        .first();
      assert.equal(r.stage, "superseded");
      assert.equal(r.nonce_hash, null);
      assert.equal(
        (await x.f.db.prepare("SELECT state FROM owner_auth_identity").first())
          .state,
        "credential-changing",
      );
      x.jar["__Host-patholy_owner_maintenance"] = cap;
      assert.equal(
        (await x.call("recovery-enroll", { password: x.provider.password }))
          .status,
        401,
      );
      token = await maintenanceTicket(x, "primary-recovery");
      assert.equal(
        (
          await x.call("recover", {
            token,
            password: x.provider.password,
            code: "123456",
          })
        ).status,
        200,
      );
      assert.equal(
        (await x.call("recovery-enroll", { password: x.provider.password }))
          .status,
        200,
      );
    } finally {
      await x.close();
    }
  },
);
test(
  "logout invalidates backup capability without replacing old factor; forged cookies cannot revoke another operation",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      const original = (
        await x.f.db
          .prepare("SELECT backup_factor_id FROM owner_auth_identity")
          .first()
      ).backup_factor_id;
      await x.call("backup-enroll", {
        currentPassword: x.provider.password,
        code: "123456",
      });
      const cap = x.jar["__Host-patholy_owner_maintenance"];
      x.jar["__Host-patholy_owner_maintenance"] = "forged";
      await x.call("logout", {});
      assert.equal(
        (
          await x.f.db
            .prepare(
              "SELECT stage FROM owner_auth_operations WHERE kind='backup-enroll' AND new_factor_id!=old_factor_id ORDER BY created_at DESC LIMIT 1",
            )
            .first()
        ).stage,
        "verify",
      );
      x.jar["__Host-patholy_owner_maintenance"] = cap;
      await x.call("logout", {});
      x.jar["__Host-patholy_owner_maintenance"] = cap;
      assert.equal(
        (await x.call("backup-verify", { code: "123456" })).status,
        401,
      );
      assert.equal(
        (
          await x.f.db
            .prepare("SELECT backup_factor_id FROM owner_auth_identity")
            .first()
        ).backup_factor_id,
        original,
      );
      const audit = await x.f.db
        .prepare(
          "SELECT actor FROM owner_audit WHERE action='owner.auth.maintenance.logout'",
        )
        .all();
      assert.equal(audit.results.length, 1);
      assert.equal(audit.results[0].actor, "user_synthetic");
    } finally {
      await x.close();
    }
  },
);
test(
  "logout consumes only its own password/MFA pending ceremony and rejects captured-cookie replay",
  { timeout: 60000 },
  async () => {
    const x = await fixture();
    try {
      await established(x);
      await x.call("login", {
        email: OWNER_EMAIL,
        password: x.provider.password,
      });
      const pending = x.jar["__Host-patholy_owner_pending"];
      assert.equal((await x.call("logout", {})).status, 200);
      x.jar["__Host-patholy_owner_pending"] = pending;
      assert.equal((await x.call("totp", { code: "123456" })).status, 401);
      const audit = await x.f.db
        .prepare(
          "SELECT actor FROM owner_audit WHERE action='owner.auth.pending.logout'",
        )
        .all();
      assert.equal(audit.results.length, 1);
      assert.equal(audit.results[0].actor, "user_synthetic");
      await x.call("login", {
        email: OWNER_EMAIL,
        password: x.provider.password,
      });
      assert.equal((await x.call("totp", { code: "123456" })).status, 200);
    } finally {
      await x.close();
    }
  },
);
