> Historical verification record: applies to the version/date below. Current offline behavior and readiness are documented in README.md and OFFLINE_RELEASE.md; historical activation instructions do not apply.

# Post-prerelease security verification

Review started from `42db0dcbd536e3823bdb9fbdf8c69bc881b327a3`; verification completed 8–9 October 2026. The published `v1.1.0-rc.1` tag, notes and four release assets remain unchanged. No Cloudflare resources, account settings or secrets were created or changed.

## Results

- Application suite: **116 passed**, zero failed or skipped; production frontend build passed.
- Worker/D1 suite: **21 passed**, zero failed or skipped. Includes signed owner authorization/MFA failures, cursor tampering/scope isolation, tied timestamps, more than 1,000 rows in each customer/licence/device/revocation collection and repeatable index migration.
- Chromium owner-console, pagination and real local Worker/D1 integration checks: **all passed**. Covers later-page actions, server search and stale customer/query/permission responses.
- Worker types and deployment dry-run: passed; no deployment. Bundle 68.48 KiB, gzip 18.45 KiB.
- Source/history pattern scan: 190 files, 19 reachable commits, 1,436 text objects, no additional pattern findings. Historical binary inspection is reported separately in [LFS_INSPECTION.md](LFS_INSPECTION.md): one verified object, none unavailable, confirmed legacy default-credential exposure requiring replacement/rotation.
- Independent API, browser and MFA review found no remaining critical/high implementation blocker in this changed scope. These checks do not establish complete security or absence of hidden sensitive data.

## Deployment gates and limitations

Owner MFA remains `UNVERIFIED` and denies administration until the selected real provider/Access contract is certified. Synthetic signed JWTs validate local enforcement, not live identity-provider behavior. See [MFA_CONTRACT.md](MFA_CONTRACT.md). Access returned an explicit not-enabled response; the connected zone listing was empty within its visible scope. Write permissions, subscriptions and inaccessible resources were not inferred.

Pagination is an indexed live keyset view rather than a frozen export. Refresh to include newer inserts; cursor-salt rotation requires restarting pagination. Remote performance and quota suitability remain unmeasured. Production desktop activation configuration remains unset.

No clinical source, clinical values, app version, installer or packaged executable changed in this review; packaged QA was not repeated. Physical printer alignment/driver compatibility, elevated installation/upgrade and actual power-loss testing remain **NOT TESTED**. Cloudflare live authentication, MFA, route/origin bypass tests and production deployment remain **PENDING**.
