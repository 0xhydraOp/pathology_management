# System-owner administration

Current deployment preparation (9 October 2026): admin.molladigital.com is the private owner workspace; license.molladigital.com is the activation API. Manual owner-issued keys require no customer identity-provider onboarding; the optional invitation portal is disabled in production configuration. Initial trials are seven days from first committed activation, paid offline allowance is capped at 30 days, and quiet reminders begin in the last five days. Older configuration/examples below are implementation history where they differ. [Confirmed policy](LICENSING_POLICY.md) and [deployment plan](CLOUDFLARE_DEPLOYMENT_PLAN.md) are authoritative. No deployment occurred.

Prepared locally for Patholy Management System on 8 October 2026. Nothing has been deployed and no Cloudflare account setting or resource has been changed.

## Three identities

| Identity | Authority |
| --- | --- |
| Sole system owner | Customer access, invitations, trials, licences, seats, suspension/revocation/reactivation, activation reset/transfer and licensing audit review. |
| Lab administrator | That installation's local users/settings, backups/recovery and activation with an owner-issued key. No entitlement administration. |
| Lab staff | Existing permitted daily operations. No owner or local administrator controls. |

The owner console is a separate web application served by the licensing Worker. Local usernames, roles, patient records and lab passwords never authenticate its APIs. Each server request verifies the Access JWT signature, issuer, audience, expiry and configured owner subject. Browser mutations must additionally pass same-origin checks. The browser never receives the administrative CLI bearer secret or signing private key.

`ACCESS_ADMIN_SUBJECTS` must be a JSON array containing exactly one subject. Empty or multi-owner configuration is denied. `ACCESS_AUDIENCE` is the owner audience; `CUSTOMER_ACCESS_AUDIENCE` is separate. The explicit `OWNER_MFA_CONTRACT` selects certified top-level `amr` or configured OIDC `custom.amr`; both require exact authenticator-derived `mfa`. The repository's `UNVERIFIED` setting denies owner access. Access does not universally supply this claim. Verify the actual provider, forwarding, signed location and policy before selecting a contract. See [MFA_CONTRACT.md](MFA_CONTRACT.md). API role/actor fields are never trusted.

| Server operation | Required identity |
| --- | --- |
| GET `/owner`, `/owner/*` | Sole owner, valid owner Access audience, signed MFA |
| POST `/v1/owner/customers/{list,create,disable,enable,invite}` | Sole owner + same-origin and `X-Patholy-Owner-Action: 1` |
| POST `/v1/owner/licenses/{list,create,renew,suspend,reactivate,revoke,reset,transfer}` | Same owner requirements; creation must identify its customer |
| POST `/v1/owner/audit/list` | Same owner requirements; cursor pagination |
| POST `/v1/owner/devices/list`, `/v1/owner/revocations/list` | Same owner requirements; scoped/filter-bound cursor pagination |
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

## Current branch pagination and verification

These changes follow commit `42db0dc`; they do not alter `v1.1.0-rc.1`, its tag or assets. Migration `0003_owner_pagination.sql` adds repeatable indexes only, preserving IDs/values. No clinical migration is introduced.

Customer, licence, device and revocation pages contain at most 200 records with deterministic `created_at DESC,id DESC` ordering. Opaque HMAC cursors bind collection, customer, licence and filters; every page checks owner authentication and CSRF. Customer search runs across the database, not just loaded records. Each stream has its own continuation control, including the customer selector and active-installation dialog. Status reversal/reset/transfer actions can reach older records. View/customer/query changes invalidate stale responses and failures; permission denial clears cached rows/cursors. No 1,000-record ceiling remains.

This is live keyset pagination, not a frozen export. Newer inserts require Refresh, and status/search-membership changes are reflected in the live collection. Salt rotation invalidates old cursor MACs; restart at the first page. Do not infer remote Free-plan capacity from local query tests.

- The immutable prerelease's app/system suite passed 116 checks. No clinical/desktop implementation was changed here.
- `cd licensing-worker; npm test`: 21 actual Worker/D1 checks passed, zero failures/skips. New tests cover 1,051 records per collection, tied timestamps, forged/cross-scope/filter cursors, later-page device actions, repeatable indexes, both explicit MFA contracts and unknown-contract denial. Existing seats/trials/rollback/identity tests remain passing.
- `node scripts/test-owner-console.cjs`: Chromium UI regression passed with synthetic API fixtures, including secret clearing, safe text, cancellation, invitations, explicit policy fields, devices, permission feedback and loading older audit events.
- `node scripts/test-owner-integration.cjs`: actual console → signed synthetic Access fixture → actual Worker/D1 passed for customer creation, invitation, trial, revoke/reactivate, audit, customer rejection from owner APIs and single-use acceptance. The fixture proxy is never shipped or imported by production.
- `node scripts/test-owner-pagination.cjs`: synthetic Chromium tests cover 1,007 customers, older licence/device/revocation pages, active-device actions, server-wide search, context/query races and denial cleanup.
- Worker bundle dry-run passes; no remote execution. Desktop packaged checks and their limits are recorded in the unchanged prerelease verification report rather than re-certified by these server/console changes.

Administrative audit history retains its existing 1,000-event **page size with continuation**, not a total cap. Legacy unassigned licences remain unassigned and preserved; CLI compatibility can manage them, while the customer console lists associated licences. Full D1 exports remain a recovery tool, not a prerequisite for browsing older customer/device rows.

The owner console has been inspected at 1366×768 and 1920×1080 with synthetic records. Live IdP redirects/MFA enforcement, remote CPU/quota/load, authority disaster-recovery rehearsal, physical printing, elevated installation/upgrade and actual power loss remain NOT TESTED. No real lab database was opened.

Branch: `feature/editable-reference-intervals`; reviewed changes will be committed/pushed separately from the immutable prerelease. See [PRERELEASE.md](PRERELEASE.md) for released-build limitations and [LFS_INSPECTION.md](LFS_INSPECTION.md) for the subsequent historical artifact review. The synthetic QA package must never be distributed to labs.
