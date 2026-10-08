# Molla Digital / Patholy deployment review — 9 October 2026

Prepared only. No resources, DNS, subscriptions, invitations or account settings changed. The immutable v1.1.0-rc.1 release is unchanged. This plan supersedes the previous single-origin proposal.

## Read-only account evidence

Account ee7ee1773b4a103da1f8019ec2c58633; active full zone molladigital.com (9eecea4d90299f9e8549da52ab11514a), Free Website plan. DNS GET succeeded with zero records and total_count=0. Workers scripts, custom domains and D1 lists succeeded with zero records. Access organization, applications and identity providers explicitly returned access.api.error.not_enabled; workers.dev returned missing subdomain, not permission denial. Zone response advertises DNS/Worker/Access/D1 edit capabilities; actual writes were not exercised. Account subscriptions GET returned API authentication error 10000, so billing/subscription visibility is unavailable through this connection, not evidence of no subscription. Successful empty listings describe this connection's scope; do not infer resources outside it. Recheck immediately before any approved change.

Preserve apex/www, MX, TXT/SPF/DKIM/DMARC and unrelated records if added after inspection. Export the zone first; abort on conflicts at either proposed hostname. Do not change nameservers, registrar, mail service or create wildcard/apex routes.

## Exact proposed resources and routing

- One Worker patholy-licensing, existing bundled Patholy owner console and API; compatibility 2026-10-08, nodejs_compat. workers_dev=false, preview_urls=false, no auxiliary routes/origin server. Admin landing redirects to /owner after authentication, with Molla Digital branding and Patholy service context; no public website or multi-service platform.
- Two Worker Custom Domains: admin.molladigital.com and license.molladigital.com. Approved creation generates Cloudflare-managed DNS and certificates for these exact names; do not invent a CNAME target or add a manual origin record. No apex/www changes. Use routes entries with custom_domain=true as prepared in wrangler.jsonc, only after approval. [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
- One D1 patholy-licensing, binding DB. Apply 0001_licenses.sql, 0002_customers_owner.sql, 0003_owner_pagination.sql, 0004_confirmed_policy.sql in order using Wrangler's migration journal. 0003 is repeatable index-only; 0004 adds trial start metadata, infers existing starts from earliest activation and clamps existing offline policies to the confirmed 30-day maximum. It preserves existing started-trial expiry/owner extensions rather than restarting trials. SQL ALTER statements are not manually rerunnable; the journal skips applied migrations. No clinical database changes.
- ACTIVATION_LIMITER namespace 1001 (verify unused), 30 requests/60 seconds; D1 remains the seat authority and durable retry/rate guard. Hourly cleanup cron; observability disabled to avoid routine metadata logging. No R2, Pages, Tunnel, email sender or paid resource.

| Host and paths | Edge protection | Worker enforcement |
| --- | --- | --- |
| admin /, /owner and /owner/*; POST /v1/owner/* and /v1/admin/{create,renew,revoke,transfer} | Sole-owner Access application, certified IdP plus MFA | Exact OWNER_ORIGIN, signed owner AUD/issuer/subject/MFA contract; same-origin CSRF on console API, CLI also secret |
| license /invite and /v1/customer/* | Disabled in confirmed manual-key configuration | CUSTOMER_PORTAL_ENABLED=false rejects these routes |
| license POST /v1/activate and /v1/refresh | Exact public exceptions, no interactive Access requirement | Key/device/rate/concurrency checks and signed response; no clinical payload |
| Everything else, including apex/www, workers.dev, preview, wrong-host owner calls, HTTP or nonstandard ports | Default deny/protection; no DNS/route registration | 404 before authentication/body processing |

Public desktop requests are main-process HTTPS, with no browser Origin. No CORS allow headers are emitted, OPTIONS is rejected; foreign browser Origins are rejected on activation/refresh. Owner fetches remain relative to admin and no credentials are shared with license. Forwarded-host headers never select a host. Separate applications/audiences prevent customer tokens granting owner access.

## Access and MFA prerequisites

Enable a Zero Trust organization only after approval. Recommend team name molla-digital if available (choose another on collision), owner application/MFA sessions 15 minutes, approved hardware security key and documented IdP recovery. These are technical recommendations, not licence terms.

Prepare patholy-owner Access application with sole-owner email, certified Login Method, Require MFA and the exact admin hostname plus Worker-level fallback destination (worker type with actual Worker ID). The fallback protects every route/alternate hostname; only exact /v1/activate and /v1/refresh public path exceptions. Even if a Worker-level public path applies on another host, the Worker rejects that host. Add preview_worker defense if supported; previews remain disabled. No customer Access application/IdP is required for manual key activation. CUSTOMER_PORTAL_ENABLED=false disables invitation creation, pages and redemption. Optional existing portal data is preserved; enabling it later requires a separate reviewed customer app/AUD and explicit approval, never owner policy weakening. [Worker Access hierarchy](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

ACCESS_AUDIENCE comes from the actual owner app, never guesses. CUSTOMER_ACCESS_AUDIENCE remains unset/unused while the optional portal is disabled. ACCESS_ADMIN_SUBJECTS is exactly one privately verified signed owner sub. OWNER_MFA_CONTRACT remains UNVERIFIED until upstream IdP and downstream Access evidence passes [MFA_CONTRACT.md](MFA_CONTRACT.md). Recommended Generic OIDC with a suitable existing Entra tenant: genuine provider MFA, built-in ID-token amr optional claim, Access configured OIDC forwarding into custom.amr. Do not populate it from user profiles or assume every Access token has top-level amr=mfa.

Use single-host cookie scope, HttpOnly/Secure and a supported SameSite policy (start Lax for IdP redirects, verify). No wildcard/multi-domain app or parent-domain cookie; inspect actual Set-Cookie and requests to apex/www/future services before acceptance. Worker sets no authentication cookies itself. Browser binding cookies are additional defense but may break the nonbrowser CLI: initially leave binding off for compatibility unless a separate reviewed CLI flow is introduced. JWT/MFA/secret/CSRF enforcement stays mandatory. [Access cookies](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/).

## Confirmed licence policy and customer flow

First activation is online. A new trial lasts exactly 604,800 seconds from the first committed successful server activation; network/retry/reinstall/clinical restore does not reset it. Trial issuance has no arbitrary expiry input. Explicit owner extension after activation is audited and retains the original start. Only the owner can intentionally issue another trial; customer/reinstall flows cannot. Paid validity and seats remain explicit per licence; offline allowance is explicitly configured between 1 and 2,592,000 seconds, always capped by expiry (zero/online-only unsupported). A shorter allowance is permitted; 30 days is the paid maximum, not an automatic paid validity/seat default.

Background validation runs at startup and daily, retrying failures after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours, then daily cooldown. Failures never extend a grant. Valid signed denial overrides the existing allowance. Quiet reminder in its last five days shows the required validation date. At expiry backend blocks registration/result edits/finalization; authenticated viewing, issued reprints, backups/exports/recovery continue. Revoked offline paid devices can continue until their existing grant ends, up to 30 days. See [LICENSING_POLICY.md](LICENSING_POLICY.md).

Only the authenticated owner creates customer metadata and issues trial/licence keys in the private dashboard. The owner distributes keys directly through an approved private channel. Customers enter their key in the desktop app; no customer IdP, invitation redemption, password, purchase or checkout is required. Customer records are licensing metadata, not remote lab accounts. Existing invitation tables/linked identities are preserved but the optional portal is disabled. The app sends no invitations or messages. Desktop activation sends a high-entropy key over HTTPS, installation hash, request ID and app version, never patient data.

The separate website/patholy briefing targets molladigital.com/patholy, with synthetic screenshots and a contact-only accessible modal for iamrobiul94@gmail.com. It makes no API requests and exposes no owner controls, keys or customer information. It is not deployed or bundled into Electron. Integrate only that path into the existing website after separate approval, leaving existing site files and apex/www DNS intact.

## Keys, secrets, configuration and escrow

Recommend SIGNING_KID patholy-2026-10-k1, increment suffix for rotation. Generate Ed25519 using tools/generate-signing-key.mjs on a trusted workstation in a nonsynced, OS-restricted directory; exclusive new private/public files. Do not run generation in this task. On Windows mode bits alone do not replace ACLs: restrict directory to owner OS account/SYSTEM first, verify inherited ACLs, encrypt offline escrow, retain at least two verified protected copies. Never paste private keys/tokens into chat or logs.

Install SIGNING_PRIVATE_KEY, ADMIN_API_TOKEN and RATE_LIMIT_SALT using Wrangler secret bulk with the protected JSON file; install ACCESS_ADMIN_SUBJECTS as a protected secret; no command-line secret values. Confirm required CLI syntax with installed Wrangler help. Set team issuer, actual app AUDs and certified contract in reviewed vars; never deploy replacement placeholders. Private signing keys stay in Worker secrets only; desktop gets SPKI public keys only.

Rotation: distribute a verified desktop update containing old+new public keys before switching server kid/key. Retain the old verifier key for all outstanding offline grants and old clients during the planned transition; revoke compromised signing keys through a deliberate update/operations process. Cursor/rate salt rotation invalidates continuation cursors (restart pages), but must not reset licence/trial records. Document escrow access, restore authority and key compromise procedures. Production desktop serviceUrl/publicKeys remain empty until live acceptance; prepare https://license.molladigital.com only then.

## Deployment sequence — future approval required

1. Confirm minimal inputs below, quotas and account plan; freeze unrelated DNS. Save zone inventory, reviewed commit/config and encrypted key escrow; export any existing D1 before mutation.
2. Enable Access/IdP with exact owner app and Worker protection and prepared protection. Generate protected keys. Create D1 and apply journalled migrations; verify schema/audit rows. Capture real database and Worker IDs.
3. Publish reviewed Worker with origins/issuer/AUDs, secrets and UNVERIFIED owner contract, workers.dev/preview disabled. Create exact custom domains and fallback protection; fail closed until configuration is complete. No customer key distribution yet.
4. Privately certify upstream MFA/ID-token and downstream Access claim contract, policy precedence, all APIs and cookie scope. Select the verified contract; never remove MFA checks to pass a test.
5. Run synthetic live acceptance and load/quota observation. Only after all pass, set desktop endpoint/public keys in a reviewed future build and repeat packaged activation/backup/recovery tests. Existing prerelease tag/artifacts are not replaced.

## Live acceptance gates

Owner MFA succeeds; password-only/wrong provider/owner/audience/customer/service/stale/forged tokens fail on console and every API. Test direct Worker/preview/version host, wrong host and public exceptions (no redirect for activation), no alternate origin route; cookie absent from apex/www/future services. Validate TLS and MFA logout/expiry.

Exercise seven-day first activation, failed transaction then retry, trial reinstall/reactivation/restore and explicit extension, paid 30-day cap/earlier expiry, reminder, refresh/backoff, signed revocation/suspension, replay/seat races, >1,000-record pagination, audits and rollback. Record only sanitized outcomes. Observe remote CPU/D1 row counts before treating Free as sufficient. Live MFA/hostname/cookie protection and remote capacity are PENDING; local mocks do not certify them.

## Rollback

Before each change preserve reviewed config, exact DNS/app IDs and encrypted D1 export. Disable desktop distribution/customer mutations first on failure. Revert only a compatible Worker version retaining strict host/MFA and policy constraints; do not fall back to a weaker old single-origin/policy build. Retain D1/audits/keys, do not reverse/drop migrations. If authority data recovery is required, restore into a separate verified database and reconcile grants/extensions/revocations/activations since export before switching binding; a stale export can resurrect rights or trials. Remove only newly created custom-domain records/apps if abandoning installation, restoring prior exact DNS. Never touch apex/www/mail/unrelated records. Network outages cannot extend signed desktop allowances; rollback cannot recall grants already held offline.

## Plan and cost evidence

Verified official documentation 9 October 2026: [Workers](https://developers.cloudflare.com/workers/platform/pricing/) Free 100,000 requests/day, 10 ms CPU/invocation; paid Standard starts $5/month plus usage. [D1](https://developers.cloudflare.com/d1/platform/pricing/) Free 5 million reads/day, 100,000 writes/day, 5 GB total storage; [limits](https://developers.cloudflare.com/d1/platform/limits/) Free database size limit also applies (500 MB per database). Index writes consume additional quota. Access Free is advertised for up to 50 identities; [current plan overview](https://www.cloudflare.com/plans/zero-trust-services/) and [official Free-tier announcement](https://blog.cloudflare.com/teams-plans/). Only owner dashboard sign-in currently requires Access; no customer identities are enrolled for manual keys. Public machine activation is not an Access identity per request. Confirm enrolment/billing eligibility and aggregate account usage at approval; Free Website alone does not establish Workers/Zero Trust subscription. Estimated incremental Cloudflare cost $0 only within confirmed Free quotas; domain renewal and any IdP subscription are separate. No paid change authorized or performed. Local Ed25519/JWT/SQL tests do not demonstrate fit within 10 ms remote CPU.

## Minimal owner decisions

- Sole-owner email (not inferred from account login), chosen controllable IdP and MFA/recovery setup; no passwords/keys in chat.
- Approve protected encrypted signing-key escrow and the proposed technical team name/session settings.

Domain/subdomains, direct owner key distribution and seven-day/30-day/five-day policy are confirmed. Customer identity-provider setup is not required. Per-customer paid expiry and seat count are required at issuance, not deployment defaults. No additional commercial defaults are assumed.
