import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
export async function startSyntheticWorker({
  seats = 1,
  offlineSeconds = 3600,
  expiresAt = Math.floor(Date.now() / 1000) + 86400,
  rateLimit = 10000,
  ownerSubjects = ["synthetic-admin"],
  customerMigration = true,
  mfaContract = "access-idp-amr-top-level-v1",
  createLicense = true,
  customerPortal = true,
} = {}) {
  const ed = generateKeyPairSync("ed25519"),
    rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }),
    jwk = rsa.publicKey.export({ format: "jwk" });
  jwk.kid = "synthetic-access";
  const token = randomBytes(32).toString("base64url"),
    issuer = "https://synthetic.cloudflareaccess.com";
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "synthetic",
          modules: await Promise.all(
            [
              "src/index.js",
              "src/ownerApi.js",
              "src/hostBoundary.js",
              "src/ownerConsole.js",
              "src/ownerMfa.js",
              "console/assets.js",
            ].map(async (file) => ({
              type: "ESModule",
              path: fileURLToPath(new URL("../" + file, import.meta.url)),
              contents: await readFile(
                new URL("../" + file, import.meta.url),
                "utf8",
              ),
            })),
          ),
          compatibilityDate: "2026-10-08",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          bindings: {
            OWNER_ORIGIN: "https://owner.example.invalid",
            API_ORIGIN: "https://license.example.invalid",
            SIGNING_KID: "synthetic-ed-1",
            SIGNING_PRIVATE_KEY: ed.privateKey
              .export({ type: "pkcs8", format: "der" })
              .toString("base64url"),
            RATE_LIMIT_SALT: randomBytes(32).toString("base64url"),
            RATE_LIMIT_MAX: String(rateLimit),
            RATE_LIMIT_WINDOW: "60",
            ADMIN_API_TOKEN: token,
            ACCESS_ISSUER: issuer,
            ACCESS_AUDIENCE: "synthetic-audience",
            ACCESS_JWKS_JSON: JSON.stringify({ keys: [jwk] }),
            ACCESS_ADMIN_SUBJECTS: JSON.stringify(ownerSubjects),
            CUSTOMER_ACCESS_AUDIENCE: "synthetic-customer-audience",
            OWNER_MFA_CONTRACT: mfaContract,
            CUSTOMER_PORTAL_ENABLED: customerPortal ? 'true' : 'false',
          },
        },
      ],
    }),
  );
  const db = await mf.getD1Database("DB");
  const sql = await readFile(
    new URL("../migrations/0001_licenses.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql.replaceAll("\n", " "));
  if (customerMigration)
    await db.exec(
      (
        await readFile(
          new URL("../migrations/0002_customers_owner.sql", import.meta.url),
          "utf8",
        )
      ).replaceAll("\n", " "),
    );
  if (customerMigration)
    await db.exec(
      (
        await readFile(
          new URL("../migrations/0003_owner_pagination.sql", import.meta.url),
          "utf8",
        )
      ).replaceAll("\n", " "),
    );
  if (customerMigration)
    await db.exec(
      (
        await readFile(
          new URL("../migrations/0004_confirmed_policy.sql", import.meta.url),
          "utf8",
        )
      ).replaceAll("\n", " "),
    );
  await mf.ready;
  const base = "https://owner.example.invalid",
    api = "https://license.example.invalid";
  const jwt = (overrides = {}) => {
    const head = Buffer.from(
        JSON.stringify({ alg: "RS256", kid: jwk.kid }),
      ).toString("base64url"),
      claims = Buffer.from(
        JSON.stringify({
          iss: issuer,
          aud: ["synthetic-audience"],
          sub: "synthetic-admin",
          type: "app",
          email: "synthetic-owner@example.invalid",
          ...(mfaContract === "access-oidc-custom-amr-v1"
            ? { custom: { amr: ["mfa"] } }
            : { amr: ["mfa"] }),
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          ...overrides,
        }),
      ).toString("base64url");
    return `${head}.${claims}.${sign("RSA-SHA256", Buffer.from(`${head}.${claims}`), rsa.privateKey).toString("base64url")}`;
  };
  const adminHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "cf-access-jwt-assertion": jwt(),
  };
  const post = async (
    path,
    data,
    headers = { "content-type": "application/json" },
  ) => {
    const licensingPath =
      path === "/v1/activate" ||
      path === "/v1/refresh" ||
      path.startsWith("/v1/customer/");
    const target = licensingPath ? api : base;
    const sent = new Headers(headers);
    if (path.startsWith("/v1/customer/") && sent.get("origin") === base)
      sent.set("origin", api);
    return mf.dispatchFetch(`${target}${path}`, {
      method: "POST",
      headers: sent,
      body: JSON.stringify(data),
    });
  };
  let created = {};
  if (createLicense) {
    const create = await post(
      "/v1/admin/create",
      { seats, offlineSeconds, expiresAt },
      adminHeaders,
    );
    if (create.status !== 200) {
      await mf.dispose();
      throw Error(`Fixture creation rejected ${create.status}`);
    }
    created = await create.json();
  }
  return {
    mf,
    db,
    url: base,
    apiUrl: api,
    key: created.key,
    licenseId: created.licenseId,
    kid: "synthetic-ed-1",
    publicKey: ed.publicKey.export({ type: "spki", format: "pem" }),
    post,
    adminHeaders,
    jwt,
    close: () => mf.dispose(),
  };
}
