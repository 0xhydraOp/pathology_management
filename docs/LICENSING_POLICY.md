# Confirmed Patholy licensing policy — 9 October 2026

This describes the feature branch following `5dbe03e`, not a replacement for the immutable `v1.1.0-rc.1` prerelease. Deployment and production desktop trust remain unset/pending.

Only the authenticated sole owner creates customer records, trials and licences in the private dashboard. The owner distributes activation keys directly to customers. No public issuance, Buy/Purchase action, checkout or payment processing exists. Customer IdP sign-in and invitations are unnecessary for this workflow; `CUSTOMER_PORTAL_ENABLED=false` disables invitation creation/pages/redemption in the prepared deployment. Existing optional portal records are retained. Public briefing contact email is not silently adopted as the owner authentication identity.

## Fresh-install onboarding

Fresh installations show activation first and require a successful verified server grant before local administrator setup. The customer chooses their own username/password; credentials stay local and use the existing salted scrypt hash. The owner never creates or receives these passwords. Backend setup is licensed and atomic, not just hidden in the UI.

Closing after activation retains device material and resumes setup without another seat. Closing before setup submission resumes the form; closing after committed setup returns to normal login. Failure to activate/persist the grant cannot proceed to setup. Expired allowance during incomplete setup returns to activation/verification. Initialized installations keep normal local login and existing data even if unlicensed/expired. Existing records, orphaned orders or prior setup audits without accounts require closed-app administrator recovery; they never qualify for anonymous fresh activation/setup. The activation screen offers “How to obtain a licence key” with `iamrobiul94@gmail.com`, no checkout.

The published installer linked by the briefing remains the older unchanged `1.1.0-rc.1`, accurately labelled unsigned/activation-pending. These onboarding improvements are reviewed branch changes and synthetic QA binaries, not silently substituted release artifacts.

## Time and permissions

- First activation requires successful online validation and a verified device-bound Ed25519 grant. A connection failure cannot activate a fresh installation.
- Initial trials last exactly **604,800 seconds (seven days)** from first committed server-side activation. Trial issuance requires explicit seats/allowance and omits arbitrary expiry. Allocation, start timestamp and retry identity commit together. Failed claims roll back; concurrent claims cannot move the start. Reinstall, retry, refresh, transfer, suspension/reactivation and restored clinical backups do not restart the same trial.
- Only the authenticated owner may deliberately grant a separate new trial or extend an already started trial. An extension must increase expiry and is audited; it is an explicit exception to the initial seven-day duration, not an automatic reset. Original start is retained. Unstarted trials cannot be extended through renewal.
- Paid validity and device seats are explicit per licence. Offline allowance is explicitly configured from 1 to **2,592,000 seconds (30 days)**, capped by expiry; shorter allowances are supported. No annual validity or one-seat business default is assumed. Zero/online-only is unsupported.
- Only a valid, authenticated signed response renews allowance. Unsigned denials, HTTP errors, timeouts, connection failures, malformed/forged grants and stale responses cannot extend it or overwrite a valid grant.
- Successful signed suspension/revocation is represented by the existing signed `revoked` status and overrides the saved grant. A computer remaining offline can continue until its existing signed allowance ends, up to 30 days for paid licences. Existing grants are not recalled remotely while offline.
- Backend registration, result changes and finalization require a valid allowance. Authenticated login/viewing, immutable issued reprints, backup/export and recovery remain available. Licence expiry never deletes/encrypts clinical records. Normal role restrictions still apply.

## Background validation and reminders

The main process validates an activated installation at startup and daily. Failures retry after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours, then a daily cooldown. One request runs at a time; requests have bounded timeout and response size. Successful manual activation/refresh resets the schedule. No repeated modal/popups are introduced. The final five days show a quiet reminder and the signed next-required-validation date. Short allowances naturally enter the reminder window immediately.

## Persistence, replay and privacy

Grant v1 remains strict and signed over its key ID/payload domain; only public verification keys are bundled. Grant timestamps originate on the server; revisions and issuance times reject older responses, revocation cannot be undone by an equal/older active response, and device mismatch fails. Request IDs make activation retry idempotent; atomic D1 seat guards prevent concurrent over-allocation. Keeping an old signed grant does not change its fixed deadline. Customer key theft still requires prompt owner revocation/transfer handling; high entropy/rate limits are not a substitute for secure direct delivery.

Activation material remains outside the clinical database and clinical backups. Restoring a backup preserves the target installation's licence state; copying clinical data to a fresh installation does not transfer activation and cannot reset server trial state. Installation identifiers derive from local random material rather than transmitted raw hardware IDs. Requests contain licensing metadata only.

Clock rollback detection uses server-issued times, persisted local high-water state and monotonic elapsed time during execution. Correct clock plus authenticated server validation is required after detected rollback. OS administrators can manipulate local storage, clocks or code; desktop licensing is not completely tamper-proof. A signed denial stays blocked in memory even if its local write fails; if storage cannot persist it, an old on-disk grant may survive restart until storage is repaired or a new successful check occurs. The app reports storage failure; repair access and revalidate. Actual power loss and adversarial OS control are not certified by synthetic process tests.

## Migration and deployment

Worker migration `0004_confirmed_policy.sql` adds `trial_started_at`; historical started trials infer their earliest activation and retain existing expiry/owner extensions. Existing unactivated trials start their seven days on the next successful first activation. Existing offline policies above 30 days are capped. Apply through the migration journal, once; direct repeat ALTER is unsupported. Clinical schemas/values and issued snapshots are untouched.

Owner Access MFA remains fail closed until the actual IdP/Access contract is demonstrated. Manual activation removes no owner security requirement. See [MFA_CONTRACT.md](MFA_CONTRACT.md), [CLOUDFLARE_DEPLOYMENT_PLAN.md](CLOUDFLARE_DEPLOYMENT_PLAN.md) and the local-only [public briefing instructions](../website/patholy/README.md). Live MFA, cookie scope, alternate-host protection and remote capacity remain **PENDING**.
