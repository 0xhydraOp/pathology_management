import { generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const [privateFile, publicFile, kid] = process.argv.slice(2);
if (!privateFile || !publicFile || !kid || !/^[A-Za-z0-9_-]{1,64}$/.test(kid))
  throw Error(
    "Usage: node tools/generate-signing-key.mjs NEW-private-secret-file NEW-public-file kid",
  );
const pair = generateKeyPairSync("ed25519");
await writeFile(
  privateFile,
  JSON.stringify({
    SIGNING_PRIVATE_KEY: pair.privateKey
      .export({ type: "pkcs8", format: "der" })
      .toString("base64url"),
    ADMIN_API_TOKEN: randomBytes(32).toString("base64url"),
    RATE_LIMIT_SALT: randomBytes(32).toString("base64url"),
  }),
  { flag: "wx", mode: 0o600 },
);
await writeFile(
  publicFile,
  JSON.stringify({
    kid,
    publicKey: pair.publicKey.export({ type: "spki", format: "pem" }),
  }),
  { flag: "wx", mode: 0o600 },
);
console.log(
  "New server secret and desktop public-key files created. Protect private file permissions; do not commit it.",
);
