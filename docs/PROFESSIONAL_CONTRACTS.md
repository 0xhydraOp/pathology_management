# Professional-readiness integration contract

Fully offline; no remote services or clinical-value approvals. Lead owns database.js, professionalMigration.cjs, databaseSchema.json, recovery.cjs, applicationOperations.cjs, applicationIpc.cjs, referenceIpc.cjs, preload.js and package files. Workstream agents own their new domain modules, focused tests and their assigned screens/docs. Changes to shared files are proposed to the lead.

## Report amendments

Original issued_reports remains immutable version 1. New finalized versions are append-only JSON payloads in report_versions, with order_id/version uniqueness, parent_version, authenticated issuer, timestamp, reason and changed_fields. Drafts live separately in report_amendment_drafts with UUID identity, base_version, optimistic revision, payload, creator and state. At most one active draft per order. Creation request IDs are persistent and bound to the request/user. Conflicting/stale drafts fail; duplicate finalization returns the same committed version. No original result rows, order_tests, billing prices or patient records are rewritten by amendments.

Admins may create/edit/finalize corrections; staff may view/reprint authorized records and all versions. Corrections concern results of existing ordered tests. Unchanged rows retain their saved content, flags, interval/unit and presentation; changed rows use captured interval/critical/formula provenance, never silently current catalogue settings. Older snapshots lacking provenance must use explicit manual-review handling or reject unreliable automatic derived recomputation. Printing labels version/reason/lineage in both modes and retains pagination. Snapshot and audit commit atomically; failure/reopen preserve the prior issued version.

Implemented IPC: listReportVersions(orderId), getReportVersion(orderId,version), createReportAmendment({orderId,baseVersion,reason,requestId}), saveReportAmendment({draftId,revision,changes}), finalizeReportAmendment({draftId,revision}), cancelReportAmendment({draftId,revision}). Payloads never accept actor/role/username. getReport(orderId) returns latest issued version; explicit historical access remains available.

## Billing ledger

Use safe integer minor currency units (paise), validated decimal-string input, and exact arithmetic for new ledger calculations. Preserve original billed prices/REAL history. billing_accounts captures charge_minor and explicit legacy baseline/incomplete-history metadata. billing_events append charge/payment/refund/reversal/cancellation entries with UUID, unique idempotency key, canonical request binding, actor, ISO timestamp, local business date, reason and related-event identity. Never erase/rewrite posted money events; balance is derived from events plus explicit legacy baseline. No past payment timestamps or events are invented.

Staff may read/reconcile and record payments. Refund/reversal/cancellation require admin and reason. Refunds cannot exceed eligible unrefunded recorded payments. Persist idempotency with request mismatch rejection. Cancellation must not erase clinical reports. Clinical amendments never reprice bills. Preserve legacy mark-paid workflow through an idempotent full-outstanding payment; mark-unpaid cannot silently erase payment history.

Implemented IPC: getBillingAccount(orderId), postBillingEvent({orderId,kind,amount,relatedEventId,reason,requestId,method}), getBillingReconciliation({dateFrom,dateTo}). Canonical currency helpers must not depend on network or new services. Report clear/destructive operations cannot erase issued versions or posted ledger history.

## Migration, recovery and backups

Additive professional schema version 2 with journalled migration and verified byte-identical usable database backup before mutation. Existing reports are adopted as version 1 without changing their JSON payload. Legacy money baselines are explicitly incomplete history. Never invent past events. Restore supports validated older supported backups by offline additive normalization before replacement; newer unsupported schemas fail. Main integration owner updates schema/relationship validation and all shared hooks.

Backup status distinguishes verified external/user-selected backups from local automatic recovery copies. Reminders are configurable, non-blocking and contain no passphrase. Success metadata is written only after file verification; cancellation/failure must not advance it. Reset/restoration must not falsely claim an unavailable external backup. No silently retained passphrase or database fallback on corruption.

## Acceptance

Synthetic temporary databases only. Test direct unauthorized IPC/actor spoofing, request collisions, optimistic concurrency, atomic rollback and file-write failures, migration backup/failure/retry/reopen, historical snapshots/prices, restore compatibility, explicit local dates, fresh/legacy users and process locking. Inspect browser screens and PDF text/geometry/rendered pages. Packaged Windows candidate is built from exact final commit; release publication is separately authorized after verification; no domain/service changes. Windows versions/VMs/physical printers/elevated operations/power loss are recorded as NOT TESTED unless performed.

Registration retry identities are persisted in registration_requests with an authenticated actor, canonical request hash and committed order identity, in the same transaction as patient/order/charge/audit creation. Current UI keeps the request identity across an interrupted response; matching retries return the previous order, mismatched details/operators fail. Legacy callers without request IDs remain independent registrations.
