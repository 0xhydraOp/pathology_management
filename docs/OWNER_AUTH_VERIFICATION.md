# Owner authentication preparation — 9 October 2026

Baseline: `97e3cf681c7ec9582c5400da639d38fb72e942d1`, branch `feature/editable-reference-intervals`. The initially empty index tree was `5bdaa6e5ac1b2eb2b033473beab86e908f412cca`; reviewed preparation and lifecycle changes are now intended for the authorized feature-branch commit. No deployment, provider account operation, paid service, invitation, DNS change, clinical database access or published artifact replacement occurred.

## Implementation and review

- Public homepage and Patholy footer link directly to HTTPS `admin.molladigital.com`; visibility grants no authority.
- WorkOS AuthKit SDK 11.0.0 owns password authentication and sealed sessions. iron-webcrypto 2.0.0 protects pending ceremonies; jose 6.2.12 decodes already SDK-unsealed data for logout only, never as an authorization decision.
- Owner operations require the exact confirmed email and pinned provider user/factor, successful password/TOTP transaction, a matching D1 session receipt, a current epoch, and an active unexpired provider password session. WorkOS mode never falls back to Access JWTs or an administrative bearer.
- Bootstrap requires an operator-registered hashed 256-bit single-use token, with a fifteen-minute expiry. No public claim/signup route or default password exists.
- CSRF/host checks, persistent throttling, five-attempt MFA ceremonies, logout, and reauthenticated password changes are enforced server-side. Password changes revoke local receipts before provider writes; uncertain failures lock the identity. Audits distinguish requested and completed changes without passwords or factor seeds.
- Review corrected factor-reenrollment and post-provider-await races, SDK session-field assumptions, actor integration, and password-length consistency. An independent security review found no remaining demonstrated critical/high bypass in this disabled preparation.
- Controlled primary-factor recovery requires a private operator ticket, current password and previously verified independent recovery TOTP. It locks authority, revokes sessions and audits the verified actor before replacement. Durable provisioning correlation uses a unique external ID and immutable provider ID, never email-only adoption. Logout invalidates its own pending MFA and maintenance ceremonies as well as sessions.

## Verification

All fixtures and credentials were synthetic; provider requests used local test transport, not live authentication.

| Check | Outcome |
| --- | --- |
| Application suite | 15 system + 116 targeted tests passed; zero failures |
| Worker/D1 suite | 64 tests passed; zero failures or skips |
| Owner authentication/lifecycle tests | Included in the Worker suite: bootstrap tampering/expiry/concurrency/replay, MFA receipts/forgery, wrong identity, CSRF, throttling, provider revocation, password changes, lost-primary recovery, partial provider/D1 failures, exact-ID reconciliation, backup rotation/cleanup, immutable identity pins, and captured pending/maintenance-cookie replay after logout |
| Actual Worker SDK integration | Configured Worker, temporary D1 and synthetic HTTPS/JWKS transport: setup, both factors, fresh login, authorized customer/licence operations and authenticated audit actor passed; not live WorkOS evidence |
| Provider-probe guards | Four tests passed; wrong configuration and active-session revocation evidence rejected. Opt-in live staging probe prepared, not executed |
| Private operator tooling | Synthetic SQL registration, stale UID/epoch, rollback, verified-owner protection and immutable correlation tested; no remote registration performed |
| Routing tests | Authentication shells available without signing secrets; protected operations blocked before readiness; public/licence/HTTP/alternate hosts cannot reach owner setup or APIs |
| Browser checks | Public homepage/briefing, owner authentication/security, existing owner controls and 1,007-customer pagination passed |
| Visual review | Empty-field login/security screenshots inspected at 1366, 1920 and 390 pixels; public pages checked at 1366, 390 and 320 pixels |
| Production frontend build | Passed |
| Worker dry run / generated bindings | Passed; dry run made no upload |
| Worker dependency audit | Zero reported findings; this does not prove absence of vulnerabilities |
| Changed-file credential payload scan | Zero high-confidence matches; no environment files, private key payloads, databases or backups included. This limited pattern check is not a complete security proof |
| Whitespace / staging | `git diff --check` passed; no pre-existing staged work was changed; only reviewed source, tests, documentation and dependency notices are included |

Screenshots are ignored QA outputs under `release/predeployment-verification/owner-auth/` and `release/predeployment-verification/public-patholy/`. They contain no passwords, bootstrap links or enrollment seeds. Existing clinical/printing code and immutable release `v1.1.0-rc.1` remain unchanged.

## Live gates and limitations

`OWNER_AUTH_READY=false`, the client ID is unset, and no provider secrets are committed. Approve/configure the provider separately, verify actual production/free-tier eligibility, and certify password/TOTP, cookie/host isolation, revocation, recovery and remote CPU/quota behavior before enabling it. SDK access-token expiry can end a session before the twelve-hour receipt ceiling; automatic refresh is not implemented.

Lost-primary recovery and provisioning reconciliation are implemented and tested locally. Loss of the password or both factors and their recovery copies cannot satisfy this mechanism; separately verified provider/operator assistance is required, with no automatic identity rebind. WorkOS/D1 cannot commit together: uncertain remote effects remain locked and require reconciliation; an unreturned standalone-factor creation may leave an unbound provider orphan. See [OWNER_RECOVERY_AND_RECONCILIATION.md](OWNER_RECOVERY_AND_RECONCILIATION.md) for the exact supported recovery boundary and connection steps, and [WORKOS_PROVIDER_EVIDENCE.md](WORKOS_PROVIDER_EVIDENCE.md) for official contracts and unresolved production entitlement. Live provider, HTTPS, recovery, authorization and capacity certification remain mandatory. Public website deployment can be reviewed separately. Physical printing, elevated installation/upgrade and actual power-loss checks were not performed in this task.
