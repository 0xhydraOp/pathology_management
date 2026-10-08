# Owner MFA contract — verified documentation, live certification pending

Reviewed 8 October 2026. This describes post-prerelease branch changes, not the immutable `v1.1.0-rc.1` binaries. Cloudflare Access is not enabled in the inspected account; no IdP or live MFA token could be tested. No account settings changed.

## What the official sources establish

Cloudflare supports provider-reported MFA and independent MFA, but does not promise that every Access application JWT contains top-level `amr:["mfa"]`. Its independent-MFA documentation describes interpreting upstream authenticator methods; that is not a promise of an identical downstream JWT. [MFA requirements](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/mfa-requirements/), [independent MFA](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/independent-mfa/).

Configured OIDC claims are carried in the Access token's `custom` object. They can be trimmed when cookie limits are exceeded. Missing evidence must deny owner access; group names or optional profile attributes are not MFA proof. [Application tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/).

## Explicit verifier contracts

`OWNER_MFA_CONTRACT` is a server setting, never a renderer/request field. The repository sets it to `UNVERIFIED`, which denies owner console, owner API and CLI administration even if a signed token happens to contain `mfa`. Customer invitation identity and public activation routes do not acquire owner rights.

| Selected contract | Required signed evidence |
| --- | --- |
| `access-idp-amr-top-level-v1` | Own top-level `amr` array containing exact `mfa`, after live certification of that location |
| `access-oidc-custom-amr-v1` | Own `custom.amr` array containing exact `mfa`, from a configured trusted OIDC claim |
| Missing, `UNVERIFIED` or unknown | Deny |

Only the chosen location counts. Methods must be a bounded string array; `otp`, `hwk`, `pwd`, a string `mfa`, an unrelated claim or unsigned headers cannot substitute. Org/non-identity tokens, absent human email or explicitly unverified email fail. RS256/JWKS, issuer, owner audience, validity and the sole owner subject remain mandatory before evidence is considered. CLI additionally requires the administrative bearer secret. No fallback weakens this when claims are absent/trimmed.

## Concrete recommended provider/configuration

Recommend **Generic OIDC backed by an existing Microsoft Entra tenant**, if the owner controls a suitable tenant and its MFA policy. This is a proposed provider, not an account selected or registered automatically. An equivalent trusted OIDC provider is acceptable only after the same certification.

1. Register the owner OIDC application and require genuine MFA at the provider; use the tenant's supported per-app authentication policy. Verify tenant licensing/permissions before any change; no subscription is purchased here. Never populate `amr` from a user-editable profile field or a static rule returning `mfa` for everyone.
2. For an Entra OIDC v2 application, request built-in `amr` in **ID-token optional claims** (`optionalClaims.idToken` with `name:"amr"`). Current Microsoft documentation supports this; older guidance asserting v2 can never supply AMR is outdated. Preserve existing optional claims. An access token for another resource is not the ID token Access consumes. [Microsoft optional claims](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims).
3. Configure Access Generic OIDC with tenant-specific authorization/token/JWKS endpoints, application client ID/secret, appropriate redirect URI, `openid/email/profile` identity requirements and `amr` under **OIDC Claims**. Verify the test identity exposes that claim. Do not send secrets to chat or command logs. [Generic OIDC configuration](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/generic-oidc/).
4. The owner Access policy must allow only the exact owner's identity, restrict **Login Method to this certified IdP**, and require MFA. Deny alternate providers/service-auth/bypass routes. Customer policy is separate. Independent Access MFA can be additional protection, but is not an assumed replacement for this downstream evidence contract.
5. Recommend the custom contract only after verifying that the real Access-signed application JWT carries the authenticator-derived array at `custom.amr` with `mfa`. If it does not, stop: diagnose provider configuration/claim forwarding or deliberately implement another documented contract with tests. Do not enable an owner bypass.

## Live certification still required

Use a future isolated synthetic customer environment on the approved hostname. First verify upstream ID-token signature/issuer/audience and actual MFA-derived AMR. Then verify the downstream Access JWT independently against team JWKS: signature, issuer, app audience, expiry, human token type, single owner subject, exact selected claim location and array. Record only claim names and pass/fail outcomes; never record tokens, private keys or customer details in public evidence.

Test MFA-completed login succeeds; password-only, wrong IdP, wrong owner, customer, org/service token, missing/trimmed claims, stale token, forged token and altered claim location all fail at the owner console **and every owner/CLI API**. Check application/policy precedence and every hostname/preview path. Recommend 15-minute owner application and MFA sessions as technical starting points, subject to verified provider behavior; these are unrelated to commercial licence/offline terms. Certify logout and expiry. Do not infer a recent authenticator challenge merely from token `iat`.

Local tests use genuinely signed synthetic Access-shaped JWTs for both explicit contracts and all deny cases. They prove verifier behavior and signature validation, not Cloudflare policy correctness, IdP implementation or live MFA prompts. Live certification remains **PENDING**. Desktop production endpoint/public keys remain empty until the complete service passes verification.
