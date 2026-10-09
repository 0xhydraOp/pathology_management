# Owner recovery, reconciliation and secure WorkOS connection

Reviewed **9 October 2026**. The sole owner email remains `iamrobiul94@gmail.com`. There is no customer website authentication, remote clinical access, public administrator claim, hidden account or shared password. These changes concern licensing administration only. Production readiness remains disabled.

## Authorization boundaries

| Operation | Required server proof |
| --- | --- |
| Customer/licence/device/audit controls | Configured readiness, exact pinned verified owner, primary password/TOTP session, independent recovery factor configured, current local receipt/epoch and active provider password session |
| Setup status/recovery-factor enrollment | Verified primary session, fresh password and primary TOTP for enrollment; setup alone exposes no customer/licence records |
| Lost-primary recovery | Authenticated operator-issued one-use ticket plus current password and the previously verified independent recovery TOTP |
| Unfinished initial provisioning repair | Operation/epoch-bound operator ticket plus correct provider password; neither primary nor recovery factor may previously have been verified |
| Recovery-factor replacement/retired-factor cleanup | Verified primary session and fresh password/primary TOTP |

Normal login always uses the primary authenticator. The independent recovery authenticator is enrolled through WorkOS's standalone factor/challenge APIs, without associating a second AuthKit login factor. D1 pins its ID to the immutable owner ID after successful verification. Keep its different secret on a separate protected device/offline medium, not only on the primary phone.

If the password or both factors and their protected recovery copies are lost, this procedure cannot prove ownership. Preserve records and seek separately verified provider/operator assistance. It deliberately does not downgrade to email OTP or clear MFA pins. Deletion of an already bound provider user is also fail-closed, not an invitation to adopt another account with that email.

## What a recovery does

1. The owner receives a private `/owner/recover#token=...` capability registered through authenticated deployment administration. It is purpose-, UID- and epoch-bound, hashed in D1, one-use and fifteen-minute limited. No endpoint issues this capability to an anonymous visitor.
2. The repair page removes the fragment from the URL. The backend checks the ticket, exact provider identity, password and independent recovery challenge. Ticket possession alone cannot reset a factor.
3. The backend increments the epoch, revokes local receipts and all provider-session pages, records the authenticated actor, and locks owner access. A short-lived maintenance cookie can only perform repair; it is not an owner session.
4. The owner enters the current password again. The backend removes the exact owner's user-associated factors, obtains a **fresh** documented `mfa_enrollment` response, creates a new factor and verifies it through `authenticateWithTotp`.
5. Only verified completion changes the primary pin and restores local state. Provider sessions are revoked; the owner must perform fresh normal login. Deployment readiness is never automatically enabled.

Failed/uncertain revocation remains locked. A fresh ticket with fresh password/recovery proof may resume a failed repair. Unknown factor creation is never adopted by timestamp or email; authorized retry cleans the exact user's associated factors before fresh enrollment. The unassociated recovery factor is retained. Every verification has an atomic five-attempt limit.

Recovery-factor replacement preserves the previous verified pin until the replacement code is accepted. Then the new pin/epoch, receipt revocations and audit commit together. If deletion of the retired provider factor fails, it is no longer accepted locally and `cleanupPending` is reported. Fresh primary authentication permits explicit retry through the Security screen.

## Durable provisioning and partial failures

Before creating a WorkOS user, D1 commits a random provisioning operation ID and a unique external ID. Provider retries use `getUserByExternalId` for that exact identifier; creation conflicts/timeouts do not trigger email search or silent account adoption. Binding checks the exact correlation, fixed verified email and correct password. Once a provider ID is bound, triggers forbid changing it; later reads use that ID.

An operator reconciliation ticket can repair an unbound operation or incomplete, bound **unverified** initial enrollment. It cannot reset a previously verified primary, even if the recovery factor has not been configured. Existing legacy bound IDs are preserved. An older unbound failure lacking any durable correlation cannot be guessed from email and remains blocked for manual provider review.

WorkOS/D1 are not one distributed transaction. Durable stages, leases and epoch checks prevent access during incomplete changes. Provider mutations are serialized, with a bounded request timeout, lease checks before/after calls and stale-response guards. An HTTP timeout does not prove that a remote mutation stopped. Unreturned standalone-factor creation can leave an unbound provider orphan; it grants no local authority and may require private provider cleanup. Audits and operation records are retained; no clinical or licensing records are reset to recover identity.

## Private operator tooling

Prerequisites: reviewed migrations through `0006`, an authenticated Cloudflare deployment operator, correct D1 binding, a trusted synchronized workstation clock, and an existing OS-protected **non-synchronized directory outside the repository**. Windows ACLs matter; mode bits are not enough. The tools create restricted child directories. Never paste setup links, passwords, seeds, API keys or recovery material into chat.

From the repository root, inspect only non-secret binding metadata after a separately approved deployment:

```powershell
node licensing-worker/scripts/owner-maintenance.mjs --inspect
```

Prepare a private JSON configuration with exactly these fields:

| Field | Recovery | Provisioning reconciliation |
| --- | --- | --- |
| `ownerOrigin` | `https://admin.molladigital.com` | Same |
| `outputParent` | Existing protected directory | Same |
| `purpose` | `primary-recovery` | `provision-reconcile` |
| `ownerUserId` | Actual inspected immutable UID | Actual bound UID, or JSON `null` only while unbound |
| `ownerEpoch` | Actual inspected integer | Actual inspected integer |
| `operationId` | JSON `null` | Actual inspected provisioning UUID |

```powershell
node licensing-worker/scripts/owner-maintenance.mjs "C:\PatholyOwnerPrivate\maintenance-config.json" --prepare-only
```

Preparation performs no remote operation and creates **unregistered** material. After separate deployment/setup authorization, use `--register-remote` with that config to generate/register a fresh link through authenticated D1 administration. The placeholder D1 binding currently rejects remote execution. Inspect private state rather than blindly rerunning after an uncertain CLI result. Read/deliver the restricted `.secret.json` link file privately; stdout never contains the token. Registration is transactional and cannot invalidate an earlier ticket when UID/epoch/purpose checks fail.

## Exact owner actions to connect WorkOS

1. Create/control a WorkOS project through its official dashboard; protect the **dashboard/operator account** with its own MFA and recovery material. Do not confuse that team's MFA reset with application-user recovery. Keep staging and production environments, client IDs, keys and D1 authority separate.
2. In the staging environment enable password authentication and **required MFA**. Disable public signup, SSO, social/OAuth, Magic Auth, passkeys and other alternative owner login methods. Preserve the provider's password-strength/leaked-password checks. No customer accounts or invitations are needed.
3. Verify account-specific production activation terms and that `/auth/factors/enroll`, factor challenges/verification/deletion and AuthKit APIs are included without a paid add-on. Official pricing confirms AuthKit's first one million monthly active users are free, but does not explicitly establish standalone MFA entitlement. Obtain that confirmation in your account/provider support; **do not enable a paid option or enter an unapproved subscription**. The optional $99/month WorkOS custom domain is unnecessary for our own Worker UI. [Official pricing](https://workos.com/pricing).
4. Store the staging API key in an OS-protected file outside this repository and synchronized storage. Retrieve the actual staging client ID from WorkOS; do not invent one. Prepare the explicit private staging-probe config described in [WORKOS_PROVIDER_EVIDENCE.md](WORKOS_PROVIDER_EVIDENCE.md). Its synthetic domain must be under your control and start with `qa.`. The probe calls no invitation or email-sending API; check provider automatic-notification settings in staging before running.
5. After confirming the key's environment and authorizing synthetic staging writes, run:

```powershell
node licensing-worker/scripts/provider-contract-smoke.mjs "C:\PatholyOwnerPrivate\staging-probe.json" --authorized-staging-write
```

The generic API-key prefix cannot independently attest staging. Dashboard verification is required. The probe creates only random synthetic identities/factors, tests documented password/MFA/reset/revocation contracts, and cleans known resources. It stores a private cleanup manifest for uncertain outcomes and prints sanitized stage results only. **This has not been run against WorkOS in this task.**

6. Before any later authorized deployment, securely install `WORKOS_API_KEY` and a CSPRNG-generated `WORKOS_COOKIE_PASSWORD` (at least 32 characters) as **Worker secrets**, and the actual corresponding `WORKOS_CLIENT_ID` as configuration. Never put secret values in source, shell arguments, chat or screenshots. Production uses a fresh, separately reviewed authority and production key; never swap a staging key into a database with a pinned production identity.
7. Keep `OWNER_AUTH_READY=false`. Under the separate deployment task apply all six journalled migrations, verify managed HTTPS certificates and HTTP redirects for the three approved hostnames, and issue the private bootstrap with the existing `owner-bootstrap.mjs` tool. Choose your password in its validated HTTPS screen and verify both authenticators. Passwords remain provider-managed; customers never receive owner controls. Run host-bypass, provider, recovery, authorization and capacity tests against isolated staging authority; staging readiness may be enabled only for that isolated test environment while production remains disabled.
8. Enable production readiness only after the recorded provider/HTTPS/recovery/authorization tests pass. Public website deployment can proceed independently under its own approval. Desktop production activation configuration and the immutable `v1.1.0-rc.1` download remain unchanged until their separate verification/release approval.

## Evidence boundary

Local tests use official Node/Worker SDKs, real cryptographic checks, synthetic outbound HTTPS/JWKS responses and temporary D1. They verify app state, permissions and failure behavior, not live-provider availability, entitlement or production Free CPU. See [OWNER_AUTH_VERIFICATION.md](OWNER_AUTH_VERIFICATION.md) for exact results. No resources, DNS, provider account settings, paid services or published artifacts were changed here.
