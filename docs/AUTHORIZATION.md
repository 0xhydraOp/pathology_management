# Application authorization and permission inventory

## Boundary and policy

Electron main-process sessions are the authorization source. Login verifies existing local credentials. Actor ID, username and role are taken from the current authenticated account, never from a renderer's arguments or sessionStorage. `getSession` returns only safe account fields. Only the current application window and its main frame, at the configured local file/dev URL, may invoke application IPC. PDF preview windows have no preload API.

Each protected call rechecks account existence, role, username and a credential fingerprint. Password changes, role changes, account deletion/renaming, logout, window destruction, origin changes and application restart invalidate access. Sessions have a 12-hour absolute lifetime; there is no idle timeout. A changed login cannot inherit an earlier asynchronous operation's authority. Backup dialogs and PDF preview generation use session leases checked after awaiting, and each preview's keyboard print path checks its owner lease. Revocation closes that session's open PDF previews.

The existing staff/admin roles are retained. Staff have lab-wide operational access; this task does not introduce per-patient assignments or new roles. Complete database backups include account hashes and therefore require admin, even when encrypted. Operational Excel exports remain staff-accessible to preserve existing referral/billing workflows.

The database/application policy includes **56 registered invoke channels**: 49 database and 7 application channels. Four separate licensing invoke channels are listed below. Print-trigger, permission-denied and licence-status subscriptions receive events and do not execute backend operations. Font-size preference and registration-draft storage are renderer-local, not privileged backend operations.

## Permission matrix

“Public” means callable before login by the trusted main application frame. “Staff” permits staff and admin. “Disabled” fails for everyone. Legacy restore channels remain disabled after an admin check. Validated restore uses prepare/confirm/cancel operations documented in RECOVERY.md.

The exhaustive channel and named-read tables below are generated from the dispatcher policies. Their implementations are in `electron/applicationIpc.cjs`, `electron/referenceIpc.cjs`, `electron/authorization.cjs`, `electron/applicationOperations.cjs`, `electron/readCatalogue.json` and `electron/main.js`.

| Channel | Required permission | Scope |
| --- | --- | --- |
| db:credentialState | public | Setup state only; no credentials |
| db:setupAdmin | public trusted main frame + valid signed licence | Atomic fresh setup only: zero users/patients/orders and no prior setup audit; otherwise login or offline recovery |
| licensing:onboarding | trusted main frame | Fresh eligibility and redacted licence state; initialized installations receive only freshInstallation=false |
| licensing:status | staff | Redacted installation status, no activation key |
| licensing:activate | admin, or trusted fresh bootstrap | Fresh eligibility/initialized session checked before request and again before signed-grant persistence |
| licensing:refresh | staff, or trusted fresh bootstrap | Same asynchronous authorization recheck; failure never extends grant |
| db:changePassword | credential | Authenticated self-service; current password required, restricted sessions allowed |
| db:prepareRestore | admin | File selection, lease recheck, authenticated backup/schema validation |
| db:confirmRestore | admin | Candidate/session/generation check, verified recovery copy and replacement |
| db:cancelRestore | admin | Discard this window candidate |
| db:verifyUser | public | Verify username/password; return safe identity |
| db:getSession | public | Current safe identity or null |
| db:logout | public | Revoke own session and previews |
| db:listReferenceSets | staff | Reference versions/rules |
| db:getReferenceContext | staff | Reference/critical context |
| db:saveReferenceDraft | admin | Versioned reference edit and previous/new audit |
| db:approveReferenceDraft | admin | Approve pending reference version |
| db:getReport | staff | Read draft preview or immutable issued snapshot |
| db:issueReport | staff | Explicit atomic issuance; authenticated issuer |
| db:getPrintProfile | staff | Current physical printing profile |
| db:validatePrintProfile | staff | Pure geometry validation |
| db:setPrintProfile | admin | Local printer profile configuration |
| db:reloadCatalogue | disabled | Disabled; catalogue identities protected |
| db:read | staff | Named patient/catalogue/result/billing/referral reads |
| db:registerPatientOrder | staff | Atomic new patient/order/ordered tests + existing bill computation |
| db:setPaymentStatus | staff | Only paid/unpaid for an existing order |
| db:saveOrderResults | staff | Existing atomic result save; issued results locked |
| db:nextPatientId | disabled | Standalone reservation disabled; atomic registration supplies IDs |
| db:logPrint | staff | Issued report only; authenticated print actor |
| db:computeOrderBillAndCommission | staff | Existing billing calculation for one order |
| db:getLabConfig | staff | Safe lab presentation fields |
| db:getDatabaseSize | staff | File size only |
| db:getLastBackupDate | staff | Backup timestamp only |
| db:exportOrdersExcel | staff | Operational order Excel export; allowlisted dates |
| db:exportReferralsExcel | staff | Operational referral Excel export; allowlisted dates |
| db:setRates | admin | Catalogue-ID/rate entries |
| db:setCommissions | admin | Default and referrer percentages |
| db:setLabConfig | admin | Allowlisted lab configuration fields |
| db:listUsers | admin | Safe account projection; no hashes |
| db:manageUser | admin | Validated account create/update/password change |
| db:deleteUser | admin | Delete account; keep at least one admin |
| db:backup | admin | Complete database backup |
| db:backupEncrypted | admin | AES-256-GCM backup with required user passphrase |
| db:backupChooseLocation | admin | Admin dialog and lease recheck; complete backup |
| db:backupEncryptedChooseLocation | admin | Admin dialog and lease recheck; encrypted backup |
| db:clearAllPatientData | admin | Existing destructive clear; preserve audits |
| db:restore | admin | Unavailable after admin check; no mutation |
| db:restoreBackup | admin | Unavailable after admin check; no mutation |
| db:init | disabled | Startup only; renderer disabled |
| db:query | disabled | Generic SQL disabled |
| db:run | disabled | Generic SQL disabled |
| db:get | disabled | Generic SQL disabled |
| db:all | disabled | Generic SQL disabled |
| app:print | staff | Authenticated main-view print dialog |
| app:printPreview | staff | Authenticated PDF preview; owner lease |
| app:setTitle | staff | Window title |
| app:setAlwaysOnTop | staff | Window pin preference |
| app:getAlwaysOnTop | staff | Window pin state |
| app:getVersion | public | Application version |
| app:getPath | admin | Only userData folder; no arbitrary OS path names |


## Scoped reads and commands

Generic `query`, `run`, `get`, `all`, renderer initialization, catalogue reload and standalone patient-ID reservation are disabled, including direct legacy IPC calls. Generic methods are removed from preload. No renderer SQL is accepted, including SELECTs, joins, unions, schema inspection, triggers or subqueries. There is no general audit/credential-table read endpoint.

`db:read` accepts only a fixed operation name and bound scalar arguments. Each static read's declared permission is enforced; all current reads are staff operations. SQL lives exclusively in the backend catalogue. Dynamic reads accept allowlisted date fields or positive order IDs. Referral invoices batch IDs in groups of 1,000 to preserve large-period invoices. The backend constructs placeholders; it never interpolates renderer SQL.

| Read operation | Backend scope | Bound arguments | Permission |
| --- | --- | --- | --- |
| catalogue.referenceParameters | parameters | 0 scalar(s) | staff |
| billing.orders | orders, patients | 2 scalar(s) | staff |
| billing.testCount | order_tests | 1 scalar(s) | staff |
| billing.invoiceTests | order_tests, parameters | 1 scalar(s) | staff |
| billing.rates | test_rates | 0 scalar(s) | staff |
| billing.accessCode | orders | 1 scalar(s) | staff |
| billing.recalculationOrders | orders | 2 scalar(s) | staff |
| billing.order | orders, patients | 1 scalar(s) | staff |
| dashboard.todayPatients | patients | 1 scalar(s) | staff |
| dashboard.periodPatients | patients | 2 scalar(s) | staff |
| dashboard.pendingCount | orders | 0 scalar(s) | staff |
| dashboard.topReferrers | patients, orders | 2 scalar(s) | staff |
| dashboard.pendingOrders | orders, patients | 0 scalar(s) | staff |
| catalogue.registrationParameters | parameters | 0 scalar(s) | staff |
| registration.referrerSuggestions | patients, referrer_commission_pct | 2 scalar(s) | staff |
| catalogue.rates | parameters, test_rates | 0 scalar(s) | staff |
| referrals.ranking | patients, orders | 2 scalar(s) | staff |
| referrals.dayPerformance | patients, orders | 1 scalar(s) | staff |
| referrals.periodPerformance | patients, orders | 2 scalar(s) | staff |
| referrals.commissions | order_commission_log, orders | 2 scalar(s) | staff |
| referrals.patients | patients, orders | 3 scalar(s) | staff |
| referrals.invoiceOrders | orders, patients, order_commission_log | 3 scalar(s) | staff |
| referrals.rate | referrer_commission_pct | 1 scalar(s) | staff |
| configuration.defaultCommission | lab | 0 scalar(s) | staff |
| referrals.names | patients | 0 scalar(s) | staff |
| configuration.commissions | referrer_commission_pct | 0 scalar(s) | staff |
| reports.byBarcode | orders, patients | 1 scalar(s) | staff |
| reports.order | orders, patients | 1 scalar(s) | staff |
| catalogue.numericParameters | parameters | 0 scalar(s) | staff |
| results.batchOrders | orders, patients | 0 scalar(s) | staff |
| results.ordersForParameter | order_tests, orders | 1 scalar(s) | staff |
| results.patientSearch | patients | 3 scalar(s) | staff |
| results.patientOrders | orders | 1 scalar(s) | staff |
| results.order | orders, patients | 1 scalar(s) | staff |
| results.issuedMarker | issued_reports | 1 scalar(s) | staff |
| results.orderedTests | order_tests, parameters | 1 scalar(s) | staff |
| results.savedValues | order_results | 1 scalar(s) | staff |
| catalogue.formulas | formulas | 0 scalar(s) | staff |
| results.nextOrder | orders | 1 scalar(s) | staff |
| reports.orders | orders, patients | optional dateFrom/dateTo | staff |
| results.pendingOrders | orders, patients | optional dateFrom/dateTo | staff |
| referrals.invoiceTests | order_tests, parameters | 1–1000 positive order IDs per batch | staff |


Atomic `registerPatientOrder` preserves the existing patient-ID format, selected catalogue IDs/test ordering, local order date, referrer normalization and billing calculations. There are no patient/order/test identity update or deletion APIs apart from the existing admin-wide clear. `setPaymentStatus` accepts only paid/unpaid. Rates and commission configuration use validated admin commands; no billing rule/formula or clinical value is changed by this implementation.

User management APIs are admin-only and return safe projections. New passwords use independently salted scrypt hashes and backend policy validation. Credential changes revoke affected sessions; the last administrator cannot be removed through these APIs. Fresh installations require setup. Legacy defaults require authenticated replacement before normal operation. See [RECOVERY.md](RECOVERY.md) for credentials, recovery and backup compatibility.

## Audit and issued content

Registration, result saves, payment changes, billing recalculation, issuance, issued print requests, configuration, user management, exports, backups and destructive clearing record the authenticated actor. New security audits contain operation/target/count/status or necessary configuration metadata, not passwords, hashes, backup secrets, patient names, addresses or result values. Existing reference editing keeps its required previous/new rule audit.

Database mutation audits commit with their changes. Failed audit insertion rolls registration/configuration back; result-save audits join the existing result transaction, and issuance audits join the existing atomic issuance transaction. Export/backup files are external side effects: request/completed audit entries surround them; a requested-only entry can represent failure. They are not claimed atomic with the database/file output. No secrets or patient details are logged in errors.

Issued snapshots and result locks are preserved. Staff cannot rewrite issued results or bypass status/identity/audit protection with SQL. Billing/payment changes affect only financial state, not an issued snapshot. Only successful issued native print requests can be logged, and actor text is supplied by the authenticated session. Drafts/previews are not issuance evidence. The explicit admin-wide clear deliberately removes patients, orders and their issued snapshots while preserving configuration/reference/security audit history and recording a deletion count. Existing UI confirmations remain.

## UI and compatibility

Preload reports permission errors through the existing toast UI. Existing page error messages also show the denial; expired/invalid sessions return the app to login. Staff Settings reads remain available without requesting the admin-only filesystem path. Configuration controls that are already read-only remain so, and direct calls are still checked independently.

Small visual corrections remove garbled Reports icons/text, place print/finalize actions before the paper preview, center the finalization dialog and align print-settings fields. The application structure/navigation and printing modes are retained. Screenshots use synthetic patients and a synthetic local lab.

## Verification and limitations

See `AUTHORIZATION_VERIFICATION.md` for exact outcomes, screenshots, changed files and preserved staging. Fixtures use explicit temporary databases with legacy migration disabled. No real lab database was opened.

Remaining release blockers/limitations:

- Mandatory setup/default-password replacement and authenticated backup/restore are now implemented; legacy backup conversion remains offline specialist work. See RECOVERY.md.
- Validated restore preserves complete database content. Power-loss and OneDrive/file-interference limitations remain; the storage engine is unchanged.
- OS users with file access can inspect/tamper with local databases/backups. This IPC policy is not filesystem encryption or tamper resistance. Staff bulk exports intentionally permit lab-wide operational data.
- Packaged Electron/driver and physical-printer QA remain required. Revocation can stop future printing/close previews, but cannot recall an already submitted print job or exported file.
- Broad application execution security, CSP/navigation defenses and dependency/security release auditing are not claimed complete here. This work closes the renderer SQL and operation-authorization paths; it does not claim the product fully secured.

## Credential and recovery follow-up

The earlier bootstrap/default-encryption/disabled-restore limitations are superseded by [RECOVERY.md](RECOVERY.md). There are no production bootstrap credentials. Legacy PBKDF2 is upgrade-on-login; authenticated portable backup and explicit validated restore are implemented. Existing filesystem, execution and release QA limitations remain.

## Licensing identity boundary

System-owner licensing administration is a separate server identity, never a local lab role. Lab administrators manage local users/settings and may activate an installation using an owner-issued key; staff retain permitted daily workflows. Neither role can create licences/trials, add seats, extend validity or access the owner console. Main-process licence enforcement restricts registration, result editing and finalization when the signed allowance ends; login, viewing, issued reprints, backup/export and recovery remain available. The licensing service receives no clinical records and exposes no clinical deletion or remote-access operation. See [LICENSING.md](LICENSING.md) and [OWNER_ADMINISTRATION.md](OWNER_ADMINISTRATION.md).
