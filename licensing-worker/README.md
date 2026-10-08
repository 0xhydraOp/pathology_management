# Local Worker implementation

Current deployment preparation (9 October 2026): admin.molladigital.com is the private owner workspace; license.molladigital.com is the activation API. Manual owner-issued keys require no customer identity-provider onboarding; the optional invitation portal is disabled in production configuration. Initial trials are seven days from first committed activation, paid offline allowance is capped at 30 days, and quiet reminders begin in the last five days. Older configuration/examples below are implementation history where they differ. [Confirmed policy](../docs/LICENSING_POLICY.md) and [deployment plan](../docs/CLOUDFLARE_DEPLOYMENT_PLAN.md) are authoritative. No deployment occurred.

## Owner-console extension

Current post-prerelease branch: 200-record scoped cursor pages fully enumerate customers, licences, devices and revocations; repeatable index-only migration `0003` supports these queries. See [current owner guide](../docs/OWNER_ADMINISTRATION.md). Every page retains owner/CSRF enforcement. `OWNER_MFA_CONTRACT` defaults to `UNVERIFIED`; the selected and live-certified contract explicitly chooses signed top-level `amr` or configured OIDC `custom.amr`. There is no universal Access MFA-claim assumption. See [MFA certification](../docs/MFA_CONTRACT.md). These changes do not replace `v1.1.0-rc.1` artifacts.

The current implementation includes a sole-owner console at `/owner` and customer invitation acceptance at `/invite`. See [owner operating instructions](../docs/OWNER_ADMINISTRATION.md) for the authoritative API/identity matrix, MFA prerequisites, invitation lifecycle, verification and limitations. `0002_customers_owner.sql` extends `0001_licenses.sql` without replacing legacy IDs or key hashes. Earlier CLI-only descriptions below are retained as compatibility context; multiple administrative subjects are no longer permitted. The owner JWT must contain signed `amr` evidence for MFA. Customer authentication uses the separate `CUSTOMER_ACCESS_AUDIENCE`; customer identities and local lab roles never authorize owner operations.

Build static console sources with `node console/build-assets.cjs` after editing HTML/CSS/JS. Generated assets are bundled into the Worker; no separate hosting is required. Tests use explicit synthetic signed identities, not an authentication bypass. Owner APIs require same-origin requests/action header. Invitations are hashed, single-use and identity-bound; IdP password recovery replaces disclosure. All inventory streams now paginate; old release documentation's 1,000-row display bound describes the immutable prerelease, not this branch.

No resource has been created or deployed. `wrangler.jsonc` deliberately contains a non-deployable database ID and unconfigured Access/signing values. Replace these only after deployment review. All fixtures generate synthetic keys/users and ephemeral D1 data; never use lab records.

## Local verification

`npm ci`, `npm test`, `npm run dry-run`. Tests execute the actual Worker inside Miniflare/workerd with real local D1, not a SQL mock. `test/fixture.mjs` exports `startSyntheticWorker()` for desktop integration fixtures, with `{url,key,kid,publicKey,licenseId,post,db,adminHeaders,jwt,close}`. Always close it.

Wrangler 4.148.0 is the current pinned v4 tool; its Miniflare 5.20261006.0-alpha dependency is pinned explicitly and tested through its exported v4 options adapter. Sharp 0.35.5 is a deliberate toolchain override for GHSA-wq5f-xc86-pv6w. No runtime npm dependencies are bundled in the Worker. A zero audit report means no reported advisories in coverage, not proof of absence of vulnerabilities.

## Policy and API

Creation and renewal require explicit integer `expiresAt` (future UTC epoch seconds), `seats` (1–10000), and `offlineSeconds` (1–31536000). These bounds are implementation validation, not approved business defaults. No annual term, seat count or offline period is assumed. Zero/online-only allowance is not supported by this version.

POST `/v1/activate` and `/v1/refresh` accept only licence key, pseudonymous device ID, UUID request ID and app version. Keys are `PTH-` plus 256 random bits encoded base64url; only SHA-256 digests are stored. A key is a bearer secret. Refresh requires its possession; a holder who also knows a device identifier can retrieve that device's signed grant, though the desktop rejects a different device ID. Protect distribution of the key.

Grant payload/signature are base64url, Ed25519 over UTF-8 `patholy-grant-v1\n` + `kid` + `.` + payload. Signing private key is a PKCS8 DER base64url server secret. Key IDs allow desktop trust-key rotation; ship the new verification key before changing the active signing key. Retain old public keys through outstanding offline leases.

Unknown keys, exhausted seats and invalid requests receive generic authorization errors. Known expired/revoked activations receive a signed inactive grant. Device rows are retained after transfer/revocation so an old key cannot reactivate that device. Renewal cannot revive a revoked licence. Transfer requires an active old activation and a previously unused target device ID.

Deliberate validation/authentication and transaction guard failures return non-revealing HTTP 403. Unexpected D1/storage, signing or certificate-service errors return generic HTTP 503 without error details or key logging. Clients retain their previous verified lease on unsigned errors. A signing failure after allocation can leave the allocated device row; a successful retry reuses that row rather than consuming another seat. Local tests inject storage failure inside activation/audit batches and verify rollback. Actual Cloudflare CPU/memory limits and global distributed load have not been measured; local success is not Free-plan certification.

SQL triggers enforce seat allocation and policy reductions. Activation and request identity are committed together by D1 batch; collisions roll allocation back. Transfer uses a compare-and-swap guard that throws inside the batch; all mutation, revocation and admin audit records roll back on any failure. Reads use `first-primary` sessions. Native RateLimit is per-location and eventually consistent; D1 allocation remains the authority.

## Administration

POST `/v1/admin/create`, `/renew`, `/revoke`, `/transfer` require BOTH:

- `Authorization: Bearer <256-bit ADMIN_API_TOKEN>`.
- `Cf-Access-Jwt-Assertion` with verified RS256 signature, pinned team issuer, application audience, valid times and a subject explicitly allowed in `ACCESS_ADMIN_SUBJECTS` (JSON array).

Configure an Access self-hosted application restricted to the admin paths, explicit named administrators and MFA. Merely supplying a username/role/actor field grants no authority. Audit actors come from the verified JWT subject. `ACCESS_JWKS_JSON` optionally pins provisioned public keys; leave unset in normal operation so Access certs are retrieved. It never disables verification.

`node tools/generate-signing-key.mjs NEW-private.secret.json NEW-public.json key-id` creates server secrets and the distributable desktop public key. It refuses to overwrite files. On Windows mode 0600 does not establish an ACL: store secret files in an OS-protected directory and verify access before use. Never commit them.

`node tools/admin.mjs config.json create request.json NEW-response.secret.json` reads secrets from files and saves the one-time plaintext licence key only to the new output file. Config: `{"url":"https://licensing.example","tokenFile":"protected/token.txt","accessJwtFile":"protected/access-jwt.txt"}`. Request creation/renewal includes explicit policy; renewal also `licenseId`; revoke `licenseId`; transfer `licenseId`, `activationId`, `deviceId`. No secrets appear in command-line arguments or logs. The API cannot recover a lost plaintext licence key; retain the issued response securely.

## Proposed deployment and recovery

Review first: one Worker named `patholy-licensing`, one D1 database named `patholy-licensing`, the initial migration, one unique RateLimit namespace, hourly metadata cleanup cron, an admin-only Access application and an HTTPS licence endpoint. Populate database ID, team issuer, Access audience and signing kid. Set server secrets `SIGNING_PRIVATE_KEY`, `ADMIN_API_TOKEN`, `RATE_LIMIT_SALT`, `ACCESS_ADMIN_SUBJECTS`. No clinical database, patient information, result or report reaches this service.

Only after explicit deployment authorization: create D1, insert its ID, apply migration remotely, configure Access, upload secrets from protected files, deploy Worker and ship the desktop with its endpoint/public keys. Do not enable remote bindings during local testing. This repository runs dry-run only.

D1 export/Time Travel and secret escrow are separate parts of disaster recovery. Keep encrypted protected exports and server signing/token secrets; rehearse restoration to a separate database first. A recovered D1 may resurrect revoked records if its backup predates revocation: reconcile audit/revocation history before re-enabling service. Signing-secret loss requires new key publication; signing compromise requires rotation and short outstanding leases. Old offline grants may remain valid until their signed deadline after revocation or transfer; there is no immediate offline revocation.

## Operational limits

Operational anti-abuse configuration is 30 requests per 60 seconds by HMAC IP bucket (editable), plus the native same-limit edge binding. Shared-IP labs can share this limit. HMAC salt stays server-side; raw IPs are not persisted. Every allowed rate-check performs a D1 write; distributed abuse can exhaust Free quotas despite per-IP throttles. Add edge protection/monitoring before wider distribution. Hourly cleanup removes inactive rate buckets and request IDs older than 30 days; licence/device/audit history persists. Platform quota errors fail closed and never erase lab data. No request-body or key logging is implemented; observability is disabled in this proposal to avoid accidental secret capture.

Official references verified 2026-10-08: [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [RateLimit locality/accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/). Free-plan pricing/limits are documented in the lead licensing operations guide.
