# Final deployment review — no deployment authorized

Post-prerelease branch update: complete customer/licence/device/revocation cursor pagination is now implemented; live Access/IdP MFA certification is still pending. `v1.1.0-rc.1` and its artifacts remain unchanged. Technical signing-kid recommendation: `patholy-2026-10-k1`, then increment the suffix for rotation; no key material is generated or installed. Owners need not invent key IDs. Read-only recheck on 8 October again returned explicit Access `not_enabled`, not permission denial; zone listing returned an empty accessible scope. Neither result proves write permissions or absence of resources outside the connection's visibility. See [MFA_CONTRACT.md](MFA_CONTRACT.md) and [LFS_INSPECTION.md](LFS_INSPECTION.md).

Verified read-only with Cloudflare MCP on 8 October 2026. Account: `ee7ee1773b4a103da1f8019ec2c58633`. GET requests found zero accessible zones, Workers, D1 databases and Worker custom domains. No workers.dev subdomain exists. Access organization, apps and identity-provider endpoints report Access is not enabled. These reads establish available inventory, not write permissions, plan eligibility or billing status. No account mutation, invitation, message or key generation was performed.

## Input checklist

- [ ] Domain you control and permission to onboard its zone into this account (or identify an existing zone/account accessible through a different authorized connection). Choose one licensing hostname under that domain. No concrete hostname is available today.
- [ ] Sole owner's identity email and chosen IdP. Never infer the owner from the Cloudflare account email. Obtain the authenticated Access `sub` only after a real verified login.
- [ ] Owner MFA method and recovery procedure; owner session duration and independent-MFA duration. Prefer a supported IdP that reports MFA and a hardware security key. No durations silently selected.
- [ ] Customer sign-in provider: existing OIDC/SAML identities or explicitly approved Access email OTP for customers only. Owner email OTP alone is not sufficient. Choose how customers get/reset IdP credentials and how the customer email allowlist is maintained.
- [ ] Secure manual invitation/key delivery channel. No automated email integration is included.
- [ ] Explicit licence/trial expiry, seats and offline allowance per issuance. No annual term, trial length, one-seat default or offline period is approved. Technical offline bounds are 1–31,536,000 seconds; online-only zero is unsupported.
- [ ] Approve the recommended technical signing-key naming, encrypted escrow/access and recovery process. No commercial term is inferred from it.
- [ ] Free-plan eligibility, expected identities/request volume, namespace 1001 availability and permission for any future paid change. Current proposal authorizes no charges.

## Hostname choices

Recommended: one custom hostname `H` on your own active Cloudflare zone. `H` is a placeholder, not a chosen domain. Existing implementation assumes one origin for console, invitations and API. This needs zone onboarding first; no domain purchase is proposed.

Alternative: register an account workers.dev subdomain later, then use `patholy-licensing.<selected-subdomain>.workers.dev`. None exists now. This is not the prepared production configuration: it keeps workers.dev/preview URLs disabled. A workers.dev deployment would require revising the exposure plan and proving the same Worker-level Access protections. An externally managed domain cannot be assumed usable as a Worker custom domain without the appropriate zone setup.

## Exact resource proposal

1. One Worker `patholy-licensing`, compatibility `2026-10-08`, `nodejs_compat`, bundled console, observability disabled; only the approved custom domain `H`. Keep `workers_dev:false`, `preview_urls:false`; no auxiliary routes or HTTP origin server.
2. One D1 database `patholy-licensing`, binding `DB`; apply `0001_licenses.sql`, `0002_customers_owner.sql`, then index-only `0003_owner_pagination.sql`. Its ID remains the placeholder until an approved creation returns the real ID.
3. One RateLimit binding `ACTIVATION_LIMITER`, namespace `1001` subject to collision review, 30 requests/60 seconds; D1 remains the atomic seat authority. One hourly cleanup cron `0 * * * *`.
4. One **Worker-level** self-hosted Access application `patholy-licensing-owner`, sole-owner allow policy plus required MFA. Protect the Worker itself across domains; include preview protection as defense in depth if supported as a second destination. Public overrides must be **only exact** `/v1/activate` and `/v1/refresh`, without wildcards.
5. One more-specific customer self-hosted Access application `patholy-licensing-customers`, with four destinations `H/invite`, `H/invite/*`, `H/v1/customer`, `H/v1/customer/*`, restricted to approved customer identities and selected IdP. It overrides the owner's Worker fallback only for customer paths. No owner/admin route is public or included in that policy.
6. Zero Trust organization and approved IdP registration are prerequisites, not existing resources. No Pages project, R2, email sender, Tunnel, account-wide Access change or paid subscription is proposed.

Owner Worker destination uses API type `worker` with the actual Worker ID; optional preview destination uses `preview_worker`. Public overrides use `{behavior:"public",path_pattern:"/v1/activate"}` and the equivalent exact refresh path. Fill IDs/AUDs from approved API responses, never guesses. Use standard self-hosted applications, not the distinct end-user application type whose policy/MFA capabilities differ.

Worker-level Access closes the alternate-hostname gap that hostname-only rules leave. More-specific hostname/path rules take precedence, so audit every rule after creation and after route changes. The original path-only proposal is superseded by this Worker fallback. [Worker protection/hierarchy](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [path matching](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/).

| Path / access route | Edge protection | Worker verification |
| --- | --- | --- |
| `/owner`, `/owner/*`, `/v1/owner/*`, `/v1/admin/*` | Owner Worker fallback, certified IdP and MFA | RS256/JWKS, issuer, owner AUD, validity, sole subject, human app token, exact selected `OWNER_MFA_CONTRACT`; CLI also bearer secret |
| `/invite`, `/invite/*`, `/v1/customer/*` | Customer application | Customer AUD/issuer/signature/times; redemption also email, token and atomic identity checks |
| Exact `/v1/activate`, `/v1/refresh` | Deliberate public overrides | Licence bearer key, strict metadata/rate limits and signed device-bound grants |
| Alternate domain / disabled workers.dev / previews | Disabled or owner fallback; no additional public override | Same mandatory owner JWT validation; no direct clinical origin exists |

Console owner mutations also require matching Origin and `X-Patholy-Owner-Action:1`; a customer JWT, local lab role, forged identity header or bearer token alone cannot authorize them. Backend validation does not replace edge Access protection. There is currently no deployed Access configuration to certify; live route tests below are a mandatory release gate.

## Exact sign-in and invitation flow

Owner opens `https://H/owner` → Access → certified IdP → MFA → signed application token. The Worker verifies RS256/team JWKS, issuer, audience, validity and the sole configured owner subject. The explicit selected contract checks authenticator-derived `mfa` at top-level `amr` or configured OIDC `custom.amr`, never arbitrary locations or unsigned headers. `UNVERIFIED` denies owner access. No owner email/sub is trusted from UI bodies. The Access policy must restrict Login Method to the certified provider. [Concrete provider/configuration and local/live test boundary](MFA_CONTRACT.md).

Cloudflare supports IdP-reported MFA and independent MFA, but not every provider emits the same token claims. The current code does **not** treat `hwk`, an unsigned header or completion of an MFA dialog alone as equivalent to `amr:mfa`. Real signed tokens must be checked privately; record only the pass/fail result and claim names, never the token. If the selected MFA flow does not yield that exact signed evidence, stop deployment and revise/test the verifier deliberately; never remove its MFA requirement to make login work. [Official MFA documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/mfa-requirements/).

Owner creates a customer and an invitation with an explicit expiry. The console reveals the generated `https://H/invite#token=...` link once. The owner copies it and delivers it manually through the approved secure channel. The service sends no email/messages. Add the customer's exact identity email to the Access customer policy (or approved IdP group) before delivery; the current console does not synchronize that edge allowlist.

Customer opens the link → customer Access application → configured IdP or approved customer-only OTP → `/invite`. The page removes the fragment from browser history and posts the token on confirmation. The server compares the signed identity email to the invitation, requires a live active account and atomically consumes/binds the hashed token. Wrong identity, replay, expiry and disabled accounts fail. No customer password is created locally; IdP password-reset flows apply. The invite grants no owner authority and does not activate a desktop. Deliver the separate licence key securely to the lab administrator for desktop activation. Test fragment survival across live Access/IdP redirects; if stripped, sign in first and reopen the original link. No query-string token workaround.

## Complete owner inventory management

All customer/licence/device/revocation streams now have 200-record keyset pages and independent continuation controls. Scoped HMAC cursors bind collection, customer, licence and filters; every page still requires owner/MFA and CSRF. Server-wide customer search reaches older accounts, the selector pages through every customer, and active-device actions page within the chosen licence. No 1,000-row ceiling remains. Audit history retains 1,000-event pages with continuation.

Lists are live views, not frozen exports: refresh to see newer inserts or changed filter membership. Rotation of the rate/cursor salt requires starting fresh pages. Full D1 exports remain protected disaster-recovery metadata, not a workaround for inaccessible old rows. Use audited APIs for mutations, never manual D1 entitlement edits. Local tests cover over 1,000 records per collection; remote Free CPU/quota suitability remains unmeasured.

## Keys, secrets and rotation

Generate only after hostname/authentication choices are approved, on a trusted workstation in a non-synced protected directory:

`node tools/generate-signing-key.mjs <NEW-private.secret.json> <NEW-public.json> <approved-kid>`

Existing generator uses Ed25519 and 256-bit random admin/rate secrets, refuses overwrites and prints only a success message. Unix mode 0600 is not a Windows ACL guarantee: restrict directory/file ACLs first; use encrypted offline escrow. Never run Get-Content/cat on private files, put secrets on command lines, attach them here or use verbose HTTP logs. Validate private/public consistency without printing material. Generate synthetic test keys separately.

Install `SIGNING_PRIVATE_KEY`, `ADMIN_API_TOKEN`, `RATE_LIMIT_SALT`, `ACCESS_ADMIN_SUBJECTS` as Worker secrets through protected stdin/files using Wrangler or an approved confidential secret channel. Do not interpolate secrets into MCP visible tool arguments; MCP resource capability is not a reason to expose secrets in chat. Set public vars `SIGNING_KID`, `ACCESS_ISSUER`, owner/customer AUDs and the existing operational throttle. Keep fixture JWKS/keys and synthetic flags out of production.

Rotation: generate new kid/key; preserve encrypted old escrow; privately verify new signatures; after the live service passes tests, distribute a desktop containing old+new public keys; then switch server kid/private key; keep old public trust through every outstanding lease/client migration. Never bundle private keys. A compromised key may require a desktop trust update; offline signed grants cannot be instantly recalled. Rotate admin token independently and retain unchanged seat/audit data. Production desktop endpoint/public-key configuration remains empty throughout initial live verification.

## Costs and deployment sequence

Estimated Cloudflare cost is $0 only within Free eligibility/quotas, excluding domain/IdP and operator costs. Workers Free: 100,000 requests/day, 10 ms CPU/invocation; D1: 5M reads/day, 100K writes/day, 5GB total (500MB/database); Access Free: 50 identities, including owner/customers. Paid Access currently advertises $7/user/month; not selected or authorized. Quota exhaustion can stop checks while existing signed leases run down. Measure remote CPU/D1 writes rather than claiming a supported lab count. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Access pricing](https://www.cloudflare.com/plans/zero-trust-services/).

After separate deployment authorization:

1. Confirm checklist, Free eligibility/permissions, domain/zone and exact owner/customer policy. Configure IdP/Access prerequisites; retain recovery material. No account-wide policy changes.
2. Create D1, export/verify pre-migration recovery data when applicable, apply all three tracked migrations, record real IDs. Keep Worker unrouted and workers.dev/previews off.
3. Upload Worker without a public domain, install secrets through the confidential channel; read back names only. Create Worker-level owner Access protection and customer application, record AUDs, verify no broad Bypass/service-auth or conflicting more-specific rules. Bootstrap sole owner subject through a valid IdP/Access login, never trust an unverified decoded token.
4. Configure issuer/AUD/kid, connect only approved H after protections exist. GET resource/policy inventory and compare to the route matrix. Enable cleanup cron only for this database.
5. Run live synthetic tests below. Keep desktop config empty; use a separate synthetic test build pinned to the new public key. Record evidence, no secrets.
6. Only after all release gates pass, separately approve production desktop endpoint/public-key inclusion and rebuild. Real licence/trial terms still require explicit owner choices.

## Mandatory live tests

- Unauthenticated owner console/assets and every current owner/admin API: blocked by Access, no sensitive JSON. Enumerate every handler, not only root URLs.
- Owner with genuine MFA succeeds; owner without MFA, wrong IdP/subject/AUD, customer/lab admin/staff, stale token and forged assertions fail. Certify the actual provider and signed claim location for the selected contract, including missing/trimmed claims; do not assume a universal Access `amr`. Logout/session expiry must stop mutations.
- Inspect all domains/routes, Worker default Access, preview/version URLs and HTTP/HTTPS behavior. workers.dev/previews disabled; any reachable alternative remains owner-protected. Test exact public overrides do not expose `/v1/owner/*`, `/v1/admin/*`, encoded/path variants or unknown routes. No backing origin IP/server is present.
- Customer sign-in/invitation redirect-fragment preservation; matching, wrong, expired/replayed invitation; customer cannot access any owner route. Confirm manual Access policy enrollment and no automatic email.
- Synthetic activation, seats/concurrency, retries, renew/trial/revoke/disable/transfer, audit rollback, clock/offline deadline, server failure and restored clinical backup isolation. Full export retrieves >1,000 synthetic records; targeted owner mutations work on an older ID; audit pagination returns all events.
- Measure remote CPU/quotas; configure no paid upgrade automatically. Re-run issuer/signature/JWKS checks after rotation. Rehearse authority export/import in an isolated recovery environment.

## Rollback

Before changing code/settings, retain Worker version/config, Access application/policy export, full D1 export and encrypted secret escrow. For initial failed authentication, remove the custom-domain exposure/route or block it, retain Access protection, disable issuing new keys, and keep desktop config unset. Do not disable Access or enable workers.dev as a troubleshooting shortcut.

Rollback code to a compatible reviewed Worker version; this customer schema is additive, but do not return to the older multi-owner backend or weaker MFA enforcement. Keep D1 and audit history intact. Never automatically reverse migrations/drop tables. Restore authority data into a separate verified recovery database, reconcile renewals/revocations/transfers since export, then switch binding only after testing. An old export can resurrect entitlements. Failed service checks cannot extend desktop leases; existing local records remain available. No clinical database is changed. A rollback cannot recall already signed offline grants or printed reports.
