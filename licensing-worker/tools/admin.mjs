// Secrets are read from protected files, never command-line values or console output.
import { readFile, writeFile } from "node:fs/promises";
const [configFile, action, requestFile, outputFile] = process.argv.slice(2);
if (
  !configFile ||
  !["create", "renew", "revoke", "transfer"].includes(action) ||
  !requestFile ||
  !outputFile
)
  throw Error(
    "Usage: node tools/admin.mjs config-file action request-file NEW-output-file",
  );
const cfg = JSON.parse(await readFile(configFile, "utf8"));
const url = new URL(cfg.url);
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash
)
  throw Error("HTTPS licensing origin required");
const token = (await readFile(cfg.tokenFile, "utf8")).trim(),
  jwt = (await readFile(cfg.accessJwtFile, "utf8")).trim();
if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt))
  throw Error("Invalid credential-file format; no credentials logged.");
const result = await fetch(new URL(`/v1/admin/${action}`, url), {
  method: "POST",
  redirect: "error",
  signal: AbortSignal.timeout(15000),
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "cf-access-jwt-assertion": jwt,
    cookie: `CF_Authorization=${jwt}`,
  },
  body: await readFile(requestFile, "utf8"),
});
if (!result.ok)
  throw Error(
    `Administrative operation rejected (${result.status}); no credentials logged.`,
  );
await writeFile(outputFile, JSON.stringify(await result.json(), null, 2), {
  flag: "wx",
  mode: 0o600,
});
console.log(
  "Operation completed. Sensitive response saved to the requested new file.",
);
