# Offline billing ledger and reconciliation

New ledger amounts use validated decimal strings (for example `120.50`) and safe integer paise. The original bill charge is captured once. Changing catalogue rates, clinical results or report versions cannot reprice that account. Existing REAL-valued prices remain preserved; migration rounds only the new explicit paise baseline to the nearest paise. New rates/totals/commissions must round-trip exactly through the retained invoice storage boundary; oversized values that would lose paise are rejected atomically.

Payment, refund, reversal and charge-cancellation entries are append-only. Staff can view accounts, reconcile and record payments. Refunds, reversals and charge cancellations require an authenticated local administrator and a reason. Roles and actor identities are checked from the database, not supplied by the screen. Audit entries record authenticated users; ledger entries preserve the username even if a staff account is later deleted.

Each posted request has a persistent unique identity and canonical amount, bill, action, reason and authenticated-actor binding. Retrying the same request returns the committed event; reusing its identity for another operation fails. Ledger entry, paid/unpaid projection and audit use the database's file-backed atomic operation. A failed file replacement restores in-memory state and leaves the previous database usable. This is not a claim of guaranteed recovery from every filesystem or power-loss failure.

Refunds/reversals must identify a payment recorded for that bill and cannot exceed its remaining unrefunded amount. Charge cancellation reduces the charge and may create customer credit; it does not automatically pay out that credit. A separate authorized refund against an eligible recorded payment is required. Cancellation does not erase patients, tests or issued reports.

Legacy paid/unpaid status is adopted as an explicitly incomplete baseline. No historical payment date, method or actor is invented. Legacy baseline payments cannot be refunded automatically because eligibility cannot be established; review old receipts under a separately documented reconciliation process. Missing historical line prices are labelled rather than replaced with today's catalogue price. Existing full-outstanding mark-paid actions remain idempotent; mark-unpaid cannot erase recorded payment history.

Daily reconciliation uses the local business date captured when each new event is recorded. It lists charges, collections, refunds/reversals, cancellations and net collections for the chosen dates. Current outstanding and customer-credit balances cover all accounts and are clearly separate from period activity. Legacy baseline activity is excluded from dated collections and explicitly counted as incomplete history.

Synthetic regression coverage includes strict decimal parsing, role spoofing, actor-bound retries, concurrent duplicate claims, partial payments, excessive and cross-bill refunds, cancellations/credits, legacy completeness, original-charge retention, audit actors, failed persistence rollback and reopening. No payment gateway or network service is used.

Explicit confirmation of a zero-outstanding bill updates its paid projection and authenticated audit only. It does not invent a zero-value payment event.
