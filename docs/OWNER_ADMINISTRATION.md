# System-owner administration

Prepared locally for Patholy Management System on 8 October 2026. Nothing has been deployed and no Cloudflare account setting or resource has been changed.

## Three identities

| Identity | Authority |
| --- | --- |
| Sole system owner | Customer access, invitations, trials, licences, seats, suspension/revocation/reactivation, activation reset/transfer and licensing audit review. |
| Lab administrator | That installation's local users/settings, backups/recovery and activation with an owner-issued key. No entitlement administration. |
| Lab staff | Existing permitted daily operations. No owner or local administrator controls. |

The owner console is a separate web application served by the licensing Worker. Local usernames, roles, patient records and lab passwords never authenticate its APIs. Each server request verifies the Access JWT signature, issuer, audience, expiry and configured owner subject. Browser mutations must additionally pass same-origin checks. The browser never receives the administrative CLI bearer secret or signing private key.

`ACCESS_ADMIN_SUBJECTS` must be a JSON array containing exactly one subject. Empty or multi-owner configuration is denied. `ACCESS_AUDIENCE` is the owner Access application audience; `CUSTOMER_ACCESS_AUDIENCE` is a different customer audience. Owner JWTs must include signed `amr: ["mfa", ...]`; claims without MFA fail closed. Confirm the chosen IdP actually supplies that claim before enabling production. API role/actor fields are rejected rather than trusted.

| Server operation | Required identity |
| --- | --- |
| GET `/owner`, `/owner/*` | Sole owner, valid owner Access audience, signed MFA |
| POST `/v1/owner/customers/{list,create,disable,enable,invite}` | Sole owner + same-origin and `X-Patholy-Owner-Action: 1` |
| POST `/v1/owner/licenses/{list,create,renew,suspend,reactivate,revoke,reset,transfer}` | Same owner requirements; creation must identify its customer |
| POST `/v1/owner/audit/list` | Same owner requirements; cursor pagination |
| GET `/invite`, `/invite/*`; POST `/v1/customer/accept-invite` | Valid customer Access audience; acceptance additionally requires matching invited email, same-origin checks and unused token |
| POST `/v1/admin/{create,renew,revoke,transfer}` | Sole owner + MFA + administrative bearer secret (CLI compatibility) |
| POST `/v1/{activate,refresh}` | Possession of the licence key, bounded metadata and rate limit; no owner authority |

## Authentication and invitations

Use a trusted identity provider and Cloudflare Access with an explicit sole-owner allow policy and required MFA, preferably a hardware security key. Configure the identity provider's recovery process and keep its recovery material offline. There is no hidden owner account. Cloudflare documents [MFA enforcement](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/mfa-requirements/) and [signed application tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/). Deployment must verify the actual chosen identity provider and MFA claims; local signed fixtures cannot certify that integration.

Customer invitations are the selected alternative to temporary passwords. The service does not store customer passwords, readable or hashed, and cannot reveal an existing password. Password resets happen at the configured identity provider. Invitations use random, expiring, single-use secrets stored only as digests; the owner distributes a generated invitation securely. Issuing an invitation does not send email automatically or create a clinical user. Accepting customer access does not grant owner authority or independently create an entitlement.

Do not use an invitation URL query parameter for its bearer secret: fragments are not sent to the server or ordinary HTTP access logs. The invitation page exchanges the secret only in its authenticated request body. Never put keys/invitations in tickets, analytics, console logs or shared screenshots.

## Entitlement operations

All terms are explicit: UTC expiry, device-seat count and signed offline allowance. No annual duration, default trial length, seat count or offline period is a business default. Trials use the same signed-grant and backend enforcement as licences; a customer cannot grant or extend a trial. Sensitive changes are committed with authenticated owner audit entries. Audit history includes administrative actions and activation history, without patient details or plaintext secrets.

Account disabling and licence/trial suspension or revocation take effect on the next successful server check. An offline installation may continue until its already signed allowance ends. Revocation cannot remotely erase records or invalidate files already printed/exported. Re-enabling an account does not silently recreate revoked entitlements. Device resets and transfers affect licensing activation metadata only, never the clinical database.

Reset revokes an activation and frees its seat while retaining the old device tombstone. That installation cannot claim the same key again; transfer authorizes a previously unused installation ID. Obtain the target installation ID from the desktop's Support identifiers. Reactivation explicitly restores a suspended/revoked licence with a future expiry; extend an expired licence first. Reactivating a licence does not resurrect individually revoked device seats. Trials are recorded as `kind=trial`; their extensions and revocations are audited as trial actions.

When entitlement ends, clinical records remain local and accessible through login, existing-record viewing, immutable issued-report reprinting, backup/export and recovery. New registration, result editing and finalization are blocked by the Electron main process. There is no licensing API for remote patient access, deletion or encryption.

## Deployment and recovery

Apply the versioned D1 migrations to the licensing database only. Existing licence and activation IDs, signing format and desktop backup format must remain compatible. Before applying remotely, export the authority database and verify a separate recovery copy. Retain audit/revocation history and encrypted signing-secret escrow. Reconcile changes after any authority restore before serving grants; restoring an old snapshot can revive previously revoked access.

The proposed deployment remains one Worker and one D1 database, with separate Access audiences/policies for owner administration and invitation acceptance. Public desktop activation/refresh routes remain rate-limited. Owner MFA, customer identity integration, hostname, signing-key escrow and actual Cloudflare quotas/CPU must be verified before real customers are admitted. See [LICENSING.md](LICENSING.md) for the complete resource proposal and Free-plan limits.

Local operating-system authority can tamper with a desktop; licensing is not completely tamper-proof. Offline revocation is deliberately bounded by the configured lease. No clinical storage engine replacement or remote clinical control is introduced.

## Local verification and known limits

- `npm test`: 105 existing desktop/system/licensing checks passed, zero failures/skips.
- `cd licensing-worker; npm test`: 15 actual Miniflare/Worker/D1 tests passed, zero failures/skips. Covers owner/MFA/CSRF/lab-role exclusion, ambiguous owner configuration, invitation expiry/identity binding/concurrent consumption, rollback, trial lifecycle, customer disable, transfer/reset races, migration preservation and audit pagination with over 1,000 same-time events.
- `node scripts/test-owner-console.cjs`: Chromium UI regression passed with synthetic API fixtures, including secret clearing, safe text, cancellation, invitations, explicit policy fields, devices, permission feedback and loading older audit events.
- `node scripts/test-owner-integration.cjs`: actual console → signed synthetic Access fixture → actual Worker/D1 passed for customer creation, invitation, trial, revoke/reactivate, audit, customer rejection from owner APIs and single-use acceptance. The fixture proxy is never shipped or imported by production.
- Worker dry-run: 54.12 KiB, gzip 15.26 KiB; local migrations applied and repeat reported no pending migrations. No remote execution.
- Real packaged synthetic desktop passed setup/login, permissions, activation, renewal/revocation, restart, encrypted backup/restore, clinical-database copy isolation, offline-server shutdown/lease expiry, simulated process-clock rollback, issuance and immutable reprints. PDF compositor output: five fixtures, 23 pages; first/last full and pad pages visually inspected.

Customer and licence/device/revocation lists currently display at most 1,000 rows per response. Administrative audit history has cursor pagination and is retained; larger customer/device inventories require extending list pagination or an authorized D1 export. Existing legacy unassigned licences remain unassigned and preserved, not automatically linked to a customer. The CLI can still manage them; the customer-centric console lists associated licences.

The owner console has been inspected at 1366×768 and 1920×1080 with synthetic records. Live IdP redirects/MFA enforcement, remote CPU/quota/load, authority disaster-recovery rehearsal, physical printing, elevated installation/upgrade and actual power loss remain NOT TESTED. No real lab database was opened.

Branch: `feature/editable-reference-intervals`; HEAD: `902cebda110bba7afb4230d4a7d3d5649a36c457`. All changes are uncommitted. The 12 previously staged paths and index tree `0e163d4b2f1215af54f28e05f2af280c1b4b71d8` are preserved. See `release/licensing-verification/production-builds.json` for final production build paths and SHA-256 hashes; the synthetic QA package must never be distributed to labs.
