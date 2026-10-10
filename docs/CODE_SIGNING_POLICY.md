# Code signing policy — SignPath Foundation application

Status (10 October 2026): **proposed; not approved or configured**. Published v1.1.0 application and installer remain unsigned. No paid subscription, test certificate or self-signed certificate is a substitute for trusted release signing. Free Foundation eligibility is determined by SignPath, not by a generic signing quota.

## Project and responsibilities

- Repository: https://github.com/0xhydraOp/pathology_management
- Product: Pathology Management System; fully offline Windows Electron application with Inno Setup installer.
- Licence: MIT, copyright 2026 Robiul Islam Molla. Dependencies retain their licences; Foundation must review eligibility of the complete artifact.
- Maintainer/committer, reviewer and release-signing approver: Robiul Islam Molla (`0xhydraOp`). A sole-maintainer approval arrangement must be accepted by SignPath; it is not claimed to provide independent human review.
- GitHub and SignPath accounts must use MFA. This document does not assert that account MFA has been verified.

If approved and enabled, the release page will carry the required attribution: “Free code signing provided by SignPath.io, certificate by SignPath Foundation”. This quotation describes the proposed service; it is not a claim that the present unsigned release received signing. The Foundation certificate identifies SignPath Foundation, rather than the developer, as certificate publisher.

## Privacy

The application operates locally and does not send patient data, credentials, reports or usage analytics to a remote authentication/licensing service. User-initiated local export/backup and printing remain local OS operations. Signing uploads reviewed build artifacts and repository/build-origin metadata only; no lab databases, backups, secrets, logs or screenshots may enter those artifacts. Provider account information is handled under SignPath's terms/privacy notices. Private signing keys remain with the provider and must never enter source, chat or build logs.

## Application and secure setup

1. The maintainer applies at https://signpath.org/apply.html for this public repository, using their own authenticated account, and accepts the provider's terms directly. Approval is pending; no application was submitted by this documentation change.
2. Confirm free Foundation service and trusted release certificate availability. Do not enable a paid product automatically. MFA is mandatory for GitHub and SignPath.
3. Link only this repository through the provider's supported GitHub integration. Require GitHub-hosted build-origin verification; arbitrary locally uploaded binaries are not an approved Foundation signing path.
4. Configure explicit project, artifact configurations and release policies in SignPath. Keep app signing and installer signing distinct; restrict product name/version, expected filenames and reviewed branches/tags. Never sign unrelated upstream binaries using the project policy; existing Electron/dependency binaries require the provider's artifact review.
5. Store the limited signing-submit API token directly in a protected GitHub Actions environment as `SIGNPATH_API_TOKEN`; never paste it in chat. Provider organization/project/policy identifiers are configuration, not credentials. Configure manual release-signing approval and narrowly scoped repository/build permissions.
6. Review/pin the official submit action to an immutable reviewed revision, configure actual approved identifiers, and test only after approval. No unconfigured signing job or production certificate is silently enabled by this document.

## Signed build sequence

- Build and test an exact reviewed source commit on GitHub-hosted Windows runners. Run source/data/secret hygiene checks; embed source SHA and matching version/product metadata.
- Upload the application's reviewed artifact through GitHub Actions. Request application signing with the approved origin-verifying policy and manual approval. Verify the returned Authenticode signature, trusted chain, timestamp and expected publisher/certificate policy; a test certificate must fail release readiness.
- Compile Inno from the signed application directory. Inno's private signing keys are unnecessary: submit the completed installer as a second approved GitHub-origin artifact for signing. Its embedded application must retain its valid signature.
- Verify the returned installer signature and timestamp. Install/test those exact signed bytes using isolated synthetic data, including offline setup, recovery, report preservation and uninstall data survival.
- Generate fresh SHA-256 values only after signing. Signing changes bytes, so unsigned checksums cannot be reused. Publish a new reviewed signed release/version; never move v1.1.0 or replace its unsigned artifacts. Signing is not proof of complete security, clinical correctness or guaranteed SmartScreen reputation.

## Current blockers

Foundation approval, authenticated SignPath setup, MFA confirmation, provider-issued policy/configuration identifiers, securely installed submit token, verified hosted-build integration and actual trusted signature tests are pending. An account/API token alone does not establish approval or a usable release certificate. These cannot be replaced with a local bypass or fabricated certificate.

Official sources verified 10 October 2026:
- https://signpath.org/terms.html
- https://signpath.org/apply.html
- https://docs.signpath.io/trusted-build-systems/github
- https://docs.signpath.io/managing-certificates
