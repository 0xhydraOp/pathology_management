# Patholy licensing — implementation and deployment review

Implementation history begins **8 October 2026**, application **1.0.4**, Electron **44.7.0**; the recorded hashes/test counts below describe earlier builds. The published `v1.1.0-rc.1` at `42db0dc` remains immutable. Current feature-branch changes add complete owner cursor pagination and explicit top-level/custom OIDC MFA contracts, with production `OWNER_MFA_CONTRACT=UNVERIFIED`; see [OWNER_ADMINISTRATION.md](OWNER_ADMINISTRATION.md), [MFA_CONTRACT.md](MFA_CONTRACT.md) and [LFS_INSPECTION.md](LFS_INSPECTION.md). Historical LFS source inspection was static only; all implementation test records/keys remain synthetic. No Cloudflare resource, secret, subscription or account setting was created or changed.

## Policy, architecture and protected operations

Every licence creation/renewal requires explicit `expiresAt` (future UTC epoch seconds), `seats` (1–10000) and `offlineSeconds` (1–31536000). There are **no annual, one-seat or offline-period business defaults**. Bounds are validation limits. Zero/online-only policy is not implemented: zero is rejected, rather than silently assigning grace; a request-scoped online-only mode would require separate work.

The Cloudflare Worker and D1 database hold licence policy, activation identifiers, revocations, request identity and administrative audit history. The clinical SQL.js database, schemas, references, formulas, billing and report content are unchanged. Licensing is enforced in authenticated Electron IPC, after the role/session check:

| Operation | Licence requirement |
| --- | --- |
| New patient/order registration | Valid signed allowance |
| Normal/batch result saving and clearing | Valid signed allowance |
| Report finalization | Valid signed allowance |
| Login, first administrator setup, credential changes | Existing authorization rules; licence not required |
| Existing patients/results, draft review, issued snapshots/reprints | Existing authorization rules; licence not required |
| Billing on existing orders, backup/export, validated restore, offline administrator recovery | Existing authorization rules; licence not required |
| Lab/reference/print settings and user management | Existing admin authorization; licence not required |

Licence failure never causes deletion/encryption of clinical data or alteration of an issued report. Existing explicit admin restore/destructive controls retain their prior authorization. Generic SQL remains disabled; no licensing API supplies SQL or client-selected actors. A status notice and activation/settings panel provide guidance without recurring popups. Print CSS hides licence notices and controls.

Desktop activation requires a current lab administrator session. Status/refresh are available to authenticated staff. Session leases are revalidated before asynchronous network calls and immediately before committing their response; logout or a changed session prevents a credential/grant commit. Automatic refresh uses the already activated installation, not a renderer-supplied identity.

## Keys, grants and privacy

Licence keys are `PTH-` plus 256 random bits. The server stores only SHA-256 digests; plaintext appears once in the authenticated creation response and the operator's protected output file. Keys are bearer secrets. No request body, key or patient information is logged by the implementation. Worker observability is disabled in the proposal to reduce accidental secret capture.

Only `{key, deviceId, requestId, appVersion}` is transmitted by the desktop. Unknown extra fields are rejected by the Worker. No lab/patient name, result, report, billing content, username or raw hardware identifier is sent. `deviceId` is SHA-256 of a random 32-byte installation secret. It identifies an installation under an OS account, not a provably unique physical computer. Raw IP addresses are not persisted: throttling uses a server-secret HMAC IP bucket, whose stale rows are cleaned up.

Grants have `{kid,payload,signature}`, with base64url payload/signature. Ed25519 signs UTF-8 `patholy-grant-v1\n` followed by `kid`, `.`, and the encoded payload. Exact signed fields are `v`, `iss`, `aud`, `licenseId`, `activationId`, `deviceId`, `policyRevision`, `issuedAt`, `expiresAt`, `offlineUntil`, `status`. Issuer/audience are `patholy-license` / `patholy-desktop`. The main process checks the pinned public key, signature, exact schema, identifier binding, safe integer times, revision and status. `offlineUntil` never exceeds licence expiry. Known expired/revoked activations receive a signed inactive status; unsigned errors cannot revoke or erase a previously verified allowance.

Signing private keys stay in Worker secrets and operator-controlled server provisioning material; they are never packaged in Electron. Desktop configuration contains verification public keys only. Rotate by shipping the new trusted public key first, then changing server signing kid/private key. Keep old public keys until outstanding leases expire. An unknown kid fails closed; the renderer cannot choose a verification key or endpoint.

## Desktop storage, offline use and clock changes

Production activation material is in `%APPDATA%\PatholyManagementSystem\licensing\activation.enc`, separate from `lab.db` and its backups. It contains the installation secret, key, grant and clock checkpoints, encrypted with Electron safeStorage/Windows DPAPI. File replacement uses a flushed sibling temporary file. No plaintext storage fallback is allowed; Linux `basic_text` is rejected. Windows ACLs inherit from the parent directory; mode 0600 does not establish a Windows ACL.

Restoring/copying a clinical backup cannot transfer activation. Lost OS profiles/activation storage or a new installation require support-assisted device transfer/new activation. Copying all protected material under the same OS authority, cloning an OS image or patching the executable is a different threat. A locally controlled desktop is **not completely tamper-proof**.

The app revalidates on startup and while open. Active leases refresh at half the remaining allowance, capped at five minutes and floored at one second; failed/ended checks retry after one minute. Very short policies can exhaust the configured throttle and are operationally impractical. Network/quota/server failures retain only the existing signed allowance; they cannot extend it. After that allowance or expiry ends, the three clinical mutations stop, while safe retained-data operations remain available.

Persisted wall-clock high water and process monotonic elapsed time detect backward changes; a 120-second clock tolerance is a security setting, **not offline grace**. Effective deadlines do not move backwards. Clock-checkpoint persistence failures remain restricted until storage succeeds. Correct the system clock and obtain a fresh signed verification to clear a clock review. Offline revocation/transfer is necessarily delayed until reconnection or the signed deadline; a transferred old device may temporarily retain its previous offline lease.

## Activation and administration

In the app: sign in as lab administrator, open **Licence & activation** or Settings, enter the supplied key and activate. Status shows expiry, offline deadline and last verification. The **Support identifiers** section supplies installation, licence and activation IDs for controlled transfers. Staff can view status/revalidate but cannot replace the key.

Operator administration is intentionally a small file-based CLI, not a dashboard. See [Worker operations](../licensing-worker/README.md). Administrative routes require both a high-entropy `ADMIN_API_TOKEN` and a verified Cloudflare Access RS256 JWT: pinned issuer/audience, valid dates and an explicit subject allowlist. The Access application's policy must require named administrators and MFA. Audit actors come from verified JWT subjects, never from request fields.

Generate server material on a protected operator workstation:

```
cd licensing-worker
node tools/generate-signing-key.mjs NEW-private.secret.json NEW-public.json approved-key-id
```

The generator refuses overwrites and creates signing/admin/rate secrets plus a separate public-key file. Restrict Windows ACLs, encrypt offline escrow, and never commit private files. Insert the public key under its kid in `electron/licensing-config.json`; configure the approved HTTPS origin and rebuild the production desktop. Do not distribute the synthetic QA package.

Administration command:

```
node tools/admin.mjs operator-config.json create request.json NEW-response.secret.json
```

Operator config supplies `url`, `tokenFile` and `accessJwtFile`; secrets are read from protected files, not command-line values. `create` needs explicit policy; `renew` also needs `licenseId`; `revoke` needs `licenseId`; `transfer` needs `licenseId`, old `activationId` and the new installation's `deviceId`. Obtain support identifiers from the desktop. Transfer atomically revokes the old activation, allocates the unused target and records audit/revocation history. A revoked device cannot self-reactivate with the old key. Renewal can extend an expired active licence, but cannot revive a revoked licence or reduce seats below active allocations.

Creation plaintext keys cannot be reconstructed from D1. Keep the creation response securely. After an uncertain create response, inspect administrative history before retrying; do not assume an unsuccessful network response proves no licence was created. Admin creation does not have an idempotency key. Activation has UUID request identity plus unique licence/device rows; retries cannot consume an extra seat. Request identities are retained for 30 days, while activation/revocation/audit history is retained.

## Server migrations and disaster recovery

The owner-console extension adds migration `0002_customers_owner.sql`. It preserves the original licence/activation IDs and key/grant format, adds customer association, trial kind and suspension metadata, and separate invitation/owner-audit tables. Earlier CLI-only descriptions below remain historical API context: the current server permits exactly one owner subject, requires signed MFA evidence, and provides explicit owner reactivation in addition to revocation. No local lab administrator is an owner. Legacy unassigned licences are retained rather than silently reassigned. See [OWNER_ADMINISTRATION.md](OWNER_ADMINISTRATION.md).

Migration: `licensing-worker/migrations/0001_licenses.sql`, tracked by Wrangler. Local apply plus repeated apply passed; the repeat reported no pending migrations. No clinical migration is added. D1 transactional batches/triggers enforce seats and renewal capacity; compare-and-swap guards make transfer races roll back. Key/request identity collisions and failed audit writes roll back their related mutations.

Preserve D1 exports, revocation/admin audit history and encrypted server-secret escrow. Export with authorized D1 tooling after deployment; rehearse importing to a separate recovery database. Never restore an old authority database directly into service before reconciling revocations, transfers and renewals: an old snapshot can resurrect entitlements. D1 Time Travel is helpful but not independent backup escrow. Losing signing material requires new key publication; compromise requires rotation and review of outstanding offline leases. Signing failure after allocation may retain a seat, but retry reuses its existing activation. There is no remote patient-data recovery mechanism in licensing.

## Costs and limits — verified 8 October 2026

| Service | Free-plan limit / implication |
| --- | --- |
| Workers | 100,000 requests/day; 10 ms CPU/invocation. Local success does not certify remote CPU use. [Official pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| D1 | 5 million rows read/day; 100,000 rows written/day; 5 GB total storage. Index writes add to row-write usage. [Official pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| D1 database/recovery | 500 MB per Free database; ten databases/account; seven-day Time Travel. [Official limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Access / Zero Trust | Free tier advertises a 50-user limit; the owner and invited customer Access identities count separately from installed device seats. A large customer portal may exceed Free eligibility even if Worker/D1 quotas fit. Account/IdP eligibility and MFA setup must be reviewed before deployment. [Official plans](https://www.cloudflare.com/plans/zero-trust-services/) |

The proposed Free resources can cost $0 within their allowances, excluding domain/IdP/operator-workstation costs. No paid plan was selected or enabled. For comparison only, Workers Paid starts at $5/month with metered overages; that is **not** the current proposal. Free D1 query limits now fail until midnight UTC when exhausted; stored data remains intact. [Quota enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)

At the five-minute refresh cap, one continuously open installation makes approximately 288 scheduled refresh requests/day, plus startup/manual checks. Each accepted request writes a throttle row and normally a request-identity row, with index costs and cleanup in addition. Do not infer a supported lab count from request quota alone; measure D1 metadata and remote CPU. Distributed abuse/shared-IP deployments can exhaust quotas, and the configurable 30/minute IP throttle can affect many labs sharing one address. Native edge RateLimit is per-location/eventually consistent and is not the seat authority. [RateLimit semantics](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [D1 batch guarantees](https://developers.cloudflare.com/d1/worker-api/d1-database/)

## Verification and remaining risks

- Existing app suite plus licensing: **15 system + 90 Node tests = 105 passed**, zero failures/skips.
- Worker: **15 tests passed**, using actual local Miniflare/workerd/D1. Concurrent seats/retries, renewal, transfer races, revocation, identity spoofing, rate limiting, exact field privacy checks and injected transaction/audit failures covered, plus the sole-owner/customer/invitation lifecycle and audit pagination. Worker bundle dry-run passed (54.12 KiB, gzip 15.26 KiB), without deployment.
- Result, reference, authorization and recovery browser regressions passed. Browser PDF suite: nine fixtures/19 pages, including custom paper/calibration and long reference/review text.
- Real packaged synthetic build: activation UI, real Worker signatures, DPAPI, retry, renewal, signed revocation, startup persistence, backend denial, backup isolation, explicit finalization and immutable report checks passed. Actual Worker shutdown retained the lease until a three-second synthetic deadline, then restricted mutations. Process-clock rollback was detected without changing the computer's clock. A database-only copy had no activation.
- Production package with unconfigured endpoint/keys: no file/env bypass; login, historical viewing, issued preview/reprinting, encrypted backup and export worked; clinical mutations were denied. Production does not load external test trust keys.
- Packaged PDF compositor: five fixtures/23 pages; draft/short reports one page each, long full/pad reports ten each. Text, identifiers, numbering, dimensions and first/last renders verified. Physical/driver certification is not established by these PDFs.
- Production and Worker dependency audits report **zero findings**, not absence of vulnerabilities. Worker local tooling pins Wrangler 4.148.0 and its Miniflare 5.20261006.0-alpha dependency; alpha local tooling is a maintenance risk despite passing actual runtime tests.

Remote deployment, Access/MFA configuration, global load/CPU/quota suitability and authority disaster-recovery rehearsal are **not performed**. PDF-driver output, physical alignment, elevated installation/upgrade and actual power loss remain **NOT TESTED**. Local tampering, deliberate activation-state cloning under OS authority and delayed offline revocation remain explicit limitations. The application is not claimed fully secured.

Final unsigned Windows builds, version 1.0.4:

| Build path | SHA-256 |
| --- | --- |
| `release/licensed-product/win-unpacked/Patholy Management System.exe` | `0dc8b3891ec4158dcbb12f258750866dffda0f8cdd6c357b5f2e54f8c631a8bf` |
| `release/licensed-product/Patholy Management System Setup 1.0.4.exe` | `88dc0b0389a35f0d12331b4e9ca35a9f2725f6deffe0bf5c063500962f532c17` |
| `release/licensing-synthetic-qa/win-unpacked/Patholy Management System.exe` (synthetic QA only) | `c8251cd4d42ac1a452ed76351f091a8835f0e43640ca0713840556457839432b` |

The production package deliberately has no configured licence endpoint/public keys yet and therefore restricts clinical mutations. It has no synthetic trust flag; the separate QA package pins a local synthetic public key and is explicitly labelled. Do not distribute either as a commercially activated release before production configuration and remote verification.

## Exact proposed deployment — final review, not executed

The latest read-only account inspection and final route/authentication plan are in [CLOUDFLARE_DEPLOYMENT_PLAN.md](CLOUDFLARE_DEPLOYMENT_PLAN.md). They supersede the earlier hostname-only Access proposal below: use Worker-level sole-owner protection with exact activation/refresh public overrides and a more-specific customer application. The connected account currently has no accessible zones/Workers/D1/custom domains, no workers.dev subdomain and Access is not enabled. No ready production hostname exists. Live Access/MFA evidence and alternate-origin tests remain release gates; production desktop configuration is still empty.

Read-only MCP verified connected account **ee7ee1773b4a103da1f8019ec2c58633** and no existing Worker/D1 named `patholy-licensing` on 8 October 2026. Proposed additions:

1. **One Worker `patholy-licensing`**, compatibility date `2026-10-08`, `nodejs_compat`; `workers_dev` and preview URLs disabled. One approved existing-zone HTTPS hostname is still required; no domain purchase is proposed.
2. **One D1 `patholy-licensing`**, binding `DB`, apply `0001_licenses.sql`. The configuration retains the all-zero placeholder ID until creation is authorized; no automatic provisioning.
3. RateLimit binding **`ACTIVATION_LIMITER`**, proposed namespace **1001**, 30/60 seconds; confirm namespace suitability before use. Hourly cron **`0 * * * *`** cleans only stale throttle/request-identity metadata.
4. **One owner Access application `patholy-licensing-owner`** covering `/owner`, `/owner/*`, `/v1/owner/*` and `/v1/admin/*` at the approved hostname, restricted to the sole owner with required MFA. A separate customer Access application/audience covers `/invite`, `/invite/*` and `/v1/customer/*`; customers cannot obtain the owner audience or owner controls. Public activation/refresh remain key-authenticated and rate-limited. Confirm Free Access eligibility/user limits for customer identities as well as the owner before deployment.
5. Worker secrets **`SIGNING_PRIVATE_KEY`, `ADMIN_API_TOKEN`, `RATE_LIMIT_SALT`, `ACCESS_ADMIN_SUBJECTS`**; variables `SIGNING_KID`, `ACCESS_ISSUER`, `ACCESS_AUDIENCE`, operational rate settings. No secret is in the desktop or repository.
6. After live service certification, rebuild the production desktop with approved HTTPS origin/public keys. Every licence/trial term still requires an explicit owner choice. Apply `0001`, `0002` and index-only `0003` migrations; configure separate customer AUD and the single owner subject. Select `OWNER_MFA_CONTRACT` only after real provider/policy/claim certification; never assume every Access JWT carries top-level `amr`. See the current owner/MFA guides. No desktop trust configuration is changed by this branch work.

Before any account mutation: approve hostname, named operators/MFA/IdP, signing kid/key escrow, namespace and resource plan. The connected MCP supports D1/Worker/secret/Access API operations; this session used only docs/search/GET. Future approved deployment can use that connection where supported, with Wrangler for migrations/bundle tooling. No payment/subscription change, clinical upload or automated deployment is proposed.
