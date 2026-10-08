# Patholy Management System

Electron + React desktop workspace for local pathology-lab records, results, approved reference intervals, report issuance, billing and printing.

**1.1.0-rc.1 is an activation-pending prerelease, not a production lab release.** No production activation service or verification keys are configured. Registration, result editing and finalization are blocked; login, existing-record viewing, issued reprints, backup/export and recovery remain available. It does not ship a licence bypass or synthetic activation keys. Do not test against real patient data.

## Setup and verification

Use Node.js >=22.12.0. `npm ci`, then `npm run electron:dev`. Fresh installations require administrator creation; there are no usable default credentials. Legacy defaults require replacement before normal operation. Licensed synthetic tests use explicit temporary fixtures; ordinary development retains backend licence enforcement.

`npm test` runs the local integrity, authorization, recovery and licensing suites. Browser/packaged tests require Playwright and PDF checks require the documented Python dependencies. `cd licensing-worker; npm ci; npm test; npm run dry-run` tests the Worker locally without deployment. All tests must use temporary synthetic databases.

## Windows evaluation build

`npm run electron:build` produces the clearly named activation-pending NSIS prerelease and installer ZIP under ignored `release/`. Windows binaries are unsigned. Read [PRERELEASE.md](docs/PRERELEASE.md) before use. The installed administrator-recovery launcher uses the bundled Electron runtime; no separate Node installation is required.

Data location retains the legacy package identity for compatibility: typically `%APPDATA%\mondal-diagnostic-centre`. Uninstallation preserves lab data. Back up before installation/migration; never use a synthetic QA package with a real lab. See [recovery instructions](docs/RECOVERY.md), [printing guide](docs/PRINTING.md) and [reference intervals](docs/REFERENCE_INTERVALS.md).

## Release process

GitHub publication is separate from building. Use explicit reviewed asset paths, a clean exact source commit, SHA-256 manifest, release notes and a new prerelease tag. `scripts/create-release.js` requires these inputs; it does not guess files or overwrite an existing release. CI builds verification artifacts only and does not automatically publish on tag pushes.

## Licensing service

Clinical data stays local. Hosted activation sends licensing metadata only. The sole system owner manages entitlements; local lab administrators/staff cannot grant licences. Cloudflare resources remain undeployed. See [licensing](docs/LICENSING.md), [owner administration](docs/OWNER_ADMINISTRATION.md) and the [deployment plan](docs/CLOUDFLARE_DEPLOYMENT_PLAN.md).

MIT permits reuse, modification and redistribution of this project's code, including changes to licensing integration. Those rights do not grant access to the separately operated hosted activation service or its secrets. MIT does not relicense dependencies or remove their notices.

## Licence

[MIT](LICENSE), copyright 2026 Robiul Islam Molla (holder confirmed by the repository owner). [Third-party notices](THIRD_PARTY_NOTICES.md) accompany Windows distributions. Clinical rules require independent lab validation; this prerelease is not clinical certification.
