> Historical verification record: applies to the version/date below. Current offline behavior and readiness are documented in README.md and OFFLINE_RELEASE.md; historical activation instructions do not apply.

# Domain, manual-key policy and public briefing verification

Verified 9 October 2026 from feature branch baseline `5dbe03e135a41980cf095aaa7269b60acc703390`. No deployment, DNS mutation, account change, paid charge or release publication occurred. `v1.1.0-rc.1` remains at `42db0dc` with its original artifacts.

## Passed

- Application suite: **131 passed** (15 system checks plus 116 Node tests), zero failures/skips; production frontend build passed. Includes authorization, numeric results, reference matching, immutable issuance/reprints, billing, credentials, encrypted backup and recovery.
- Worker/D1 suite: **29 passed**, zero failures/skips. Initial trial anchoring, concurrent claims/retries, failed transaction rollback, owner extension, migration preservation, 30-day cap/earlier expiry, disabled customer portal, manual activation without IdP, strict two-origin boundaries, signed MFA contracts, owner permissions and complete pagination.
- Desktop licensing/scheduler subset: **19 passed**, plus existing licensing IPC tests and **eight activation-first onboarding tests**. Initial online activation, signed denial, forged/mismatched/stale grants, expiry/rollback, final-five-day reminders, bounded background retry/cooldown and network-failure deadline preservation.
- Owner-console browser, pagination browser and real local Worker/D1 integration suites passed. Application authorization and recovery browser regressions also passed. Manual mode hides invitations and labels customer contact email without IdP onboarding; optional legacy portal still verified with an explicit synthetic fixture.
- Public briefing browser checks passed at **1366×768, 390×844 and 320×640**: exact contact text/mailto, focus containment/restoration, Escape/Close, no horizontal overflow, two loaded synthetic images, approved unchanged prerelease installer URL/version/hash and signing/readiness warnings, no external requests/forms/owner links/storage. Native Tab cycling initially failed containment; explicit edge cycling fixed it and the full test passed. Desktop/mobile screenshots visually inspected.
- Local Wrangler D1 journal applied all four migrations in the isolated `release/predeployment-verification/domain-d1` directory; repeat returned no migrations. Worker types and deployment dry-run passed; latest bundle **73.93 KiB / gzip 19.73 KiB**, no deploy.
- Newly rebuilt unsigned synthetic packaged executable passed activation-first setup/login/permissions (premature setup and bogus keys denied, close after activation resumes setup with unchanged seat count, close after setup resumes login, help Tab/Escape/focus tested), activation, seven-day trial, fresh-install trial preservation, renewal/revocation, restart, retained access, clinical-backup activation isolation, failure/offline deadline/clock checks, upgrade/recovery and compositor PDF regressions. Five PDF fixtures: draft/full-short/pad-short one page each; full/pad multipage ten pages each, A4 approximately 209.89×297.01 mm. All test processes closed gracefully.

## Synthetic package and screenshot provenance

QA executable (not a release artifact):
`release/domain-policy-qa-1791489483104-fe897f60-e71a-49be-aed9-f3b2cb47c72a/package/win-unpacked/Patholy Management System.exe`

SHA-256: `7ffb40461d51f7d444d9b9b92c99bc24c392c038fae65d7dfeaa8fb25fa34843`.

Production desktop URL/public keys remain unset. Synthetic signing material/trust is generated only in isolated QA fixtures, never a production activation bypass. The package is not published. Public images were captured in the earlier same-session package (clinical screens unchanged), copied only after visual inspection; provenance and capture helpers are documented in [website/patholy/assets/PROVENANCE.md](../website/patholy/assets/PROVENANCE.md). They contain synthetic patients only, no keys/passwords/owner customer records. No clinical reference values were changed.

## Remaining gates and limitations

Live IdP/Access MFA contract, cookie scope/host isolation, exact public route protection, alternative-host and remote capacity tests remain **PENDING**. Access explicitly reports not enabled; account subscriptions API authentication error 10000 prevents billing visibility, not proof that subscriptions do not exist. Free Website is confirmed but Workers/Zero Trust eligibility must be checked before approved deployment.

Physical printer alignment, PDF-driver compatibility, elevated installation/upgrade and actual power-loss tests remain **NOT TESTED**. Compositor PDFs do not certify printer drivers. Local OS control and failed persistence can weaken remembered revocation after restart; repair storage and revalidate, as documented in [LICENSING_POLICY.md](LICENSING_POLICY.md). Source scans and passing tests do not establish complete security.

No existing website files were replaced; only an independent `website/patholy` directory is prepared. Future integration must preserve the existing host's root content and surrounding paths. Minimal owner authentication/escrow inputs and the exact resource/DNS plan are in [CLOUDFLARE_DEPLOYMENT_PLAN.md](CLOUDFLARE_DEPLOYMENT_PLAN.md).
