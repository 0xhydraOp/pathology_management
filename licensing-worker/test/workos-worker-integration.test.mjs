import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign,
  randomUUID,
  createHash,
  randomBytes,
} from "node:crypto";
import { OWNER_EMAIL } from "../src/ownerAuth.js";
import { startSyntheticWorker } from "./fixture.mjs";
function syntheticVendor() {
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }),
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
  const transport = async (url, init = {}) => {
    provider.providerCalls++;
    assert.equal(new URL(url).hostname, "api.workos.com");
    if (new URL(url).pathname.startsWith("/sso/jwks/"))
      return Response.json({
        keys: [
          {
            ...rsa.publicKey.export({ format: "jwk" }),
            kid: "synthetic-rsa",
            alg: "RS256",
            use: "sig",
          },
        ],
      });
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
      if (provider.factor?.id === path.split("/").pop()) provider.factor = null;
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
    if (path === "/user_management/users/" + user.id && init.method === "PUT") {
      if (provider.passwordFailure)
        throw Error("synthetic password update failure");
      if (provider.pausePassword) await provider.pausePassword();
      provider.password = b.password;
      return reply(user);
    }
    throw Error("Unexpected synthetic provider endpoint " + path);
  };
  return {
    provider,
    outboundService: async (request) =>
      transport(request.url, {
        method: request.method,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : await request.text(),
      }),
  };
}
test(
  "actual Worker SDK authentication bridges immutable owner actor to console and audited licensing APIs",
  { timeout: 60000 },
  async () => {
    const vendor = syntheticVendor(),
      f = await startSyntheticWorker({
        authMode: "workos",
        createLicense: false,
        customerPortal: false,
        workosBindings: {
          WORKOS_API_KEY: "sk_synthetic",
          WORKOS_CLIENT_ID: "client_synthetic",
          WORKOS_COOKIE_PASSWORD: "synthetic-session-secret-".repeat(3),
          OWNER_AUTH_READY: "true",
        },
        outboundService: vendor.outboundService,
      });
    try {
      const token = randomBytes(32).toString("base64url");
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
      const jar = {};
      async function post(path, body = {}) {
        const r = await f.mf.dispatchFetch(f.url + path, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: f.url,
            "x-patholy-owner-action": "1",
            cookie: Object.entries(jar)
              .map(([k, v]) => k + "=" + v)
              .join("; "),
          },
          body: JSON.stringify(body),
        });
        for (const c of r.headers.getSetCookie()) {
          const pair = c.split(";")[0],
            i = pair.indexOf("=");
          jar[pair.slice(0, i)] = pair.slice(i + 1);
        }
        return r;
      }
      const auth = (route, body) => post("/v1/owner-auth/" + route, body);
      assert.equal((await post("/v1/owner/customers/list")).status, 403);
      assert.equal(
        (await auth("bootstrap", { token, password: vendor.provider.password }))
          .status,
        200,
      );
      assert.equal((await auth("enroll", {})).status, 200);
      assert.equal((await auth("totp", { code: "123456" })).status, 200);
      assert.equal((await post("/v1/owner/customers/list")).status, 403);
      assert.equal(
        (
          await auth("backup-enroll", {
            currentPassword: vendor.provider.password,
            code: "123456",
          })
        ).status,
        200,
      );
      assert.equal(
        (await auth("backup-verify", { code: "123456" })).status,
        200,
      );
      assert.equal(
        (
          await auth("login", {
            email: OWNER_EMAIL,
            password: vendor.provider.password,
          })
        ).status,
        200,
      );
      assert.equal((await auth("totp", { code: "123456" })).status, 200);
      const current = jar["__Host-patholy_owner"];
      const shell = await f.mf.dispatchFetch(f.url + "/owner", {
        headers: { cookie: "__Host-patholy_owner=" + current },
      });
      assert.equal(shell.status, 200);
      assert.match(await shell.text(), /Patholy/);
      const create = await post("/v1/owner/customers/create", {
        displayName: "Synthetic integration lab",
        email: "lab@example.invalid",
      });
      assert.equal(create.status, 200);
      const body = await create.json(),
        customerId = body.customerId || body.customer?.id || body.id;
      assert.ok(customerId);
      const listing = await post("/v1/owner/customers/list");
      assert.equal(listing.status, 200);
      assert.match(await listing.text(), /Synthetic integration lab/);
      const licence = await post("/v1/owner/licenses/create", {
        customerId,
        kind: "licence",
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
        seats: 1,
        offlineSeconds: 3600,
      });
      assert.equal(licence.status, 200);
      const audits = await f.db
        .prepare(
          "SELECT actor FROM owner_audit WHERE action IN('customer.create','license.create')",
        )
        .all();
      assert.ok(audits.results.length >= 2);
      assert.ok(audits.results.every((x) => x.actor === "user_synthetic"));
      jar["__Host-patholy_owner"] = "forged";
      assert.equal((await post("/v1/owner/customers/list")).status, 403);
      jar["__Host-patholy_owner"] = current;
      await auth("logout", {});
      jar["__Host-patholy_owner"] = current;
      assert.equal((await post("/v1/owner/customers/list")).status, 403);
      assert.equal(
        (await f.db.prepare("SELECT count(*) n FROM customers").first()).n,
        1,
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
