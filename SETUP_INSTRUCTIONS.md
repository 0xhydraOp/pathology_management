# Development setup

Patholy Management System requires Node.js >=22.12.0 and npm. Run `npm ci`, then `npm run electron:dev`; a Vite-only browser is not the desktop application.

Fresh installations require administrator setup. No default password is distributed. Legacy defaults must be replaced. Production licensing is unconfigured, so new clinical mutations remain blocked; use explicit synthetic fixtures for automated testing, never a production bypass.

Run `npm test`, `npm run build`, and the browser/packaged suites documented in [PRERELEASE.md](docs/PRERELEASE.md). Worker tests run separately in `licensing-worker` and require no Cloudflare resources.

`npm run electron:build` creates unsigned Windows evaluation packages in `release/`. They are activation-pending prereleases and are not for real lab use. Preserve data before migration; see [RECOVERY.md](docs/RECOVERY.md). The installer retains the existing data-folder identity and does not delete lab data on uninstall.
