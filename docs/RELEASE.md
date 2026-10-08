# Reviewed release process

Current candidate: **1.1.0-rc.1**, unsigned and activation pending. See [PRERELEASE.md](PRERELEASE.md). GitHub publication does not deploy Cloudflare. The former automatic latest-release workflow and obsolete default-password instructions are superseded.

1. Review the complete working tree and staged work, secrets/history and clinical/recovery paths. Obtain independent security, clinical and packaging reviews. Confirm copyright ownership and notices.
2. Run `npm ci`, `npm test`, browser/Worker/D1/PDF regressions and targeted failure tests using explicit temporary synthetic databases. Never open real lab data. Audit dependencies while documenting coverage limitations.
3. Commit reviewed source on the feature branch. Build from that exact clean commit; embed/record the source SHA. Keep production licensing unset until live service verification.
4. Build the explicitly named prerelease installer with `npm run electron:build`. Verify packaged behavior, archive contents, public/unconfigured trust material, licence notices and source commit. Do not publish synthetic QA packages.
5. Create SHA-256 checksums and an explicit manifest `{commit,version,assets:[{path,sha256}]}`. Include only the reviewed installer, installer archive, checksums and sanitized verification/notes. Never attach the whole release directory.
6. Push the feature branch normally. Check rules; do not force-push or merge the default branch. Publish a new prerelease targeting the exact commit: `node scripts/create-release.js manifest.json release-notes.md`. It refuses a dirty tree, mismatched commit/version/hash, guessed assets and existing releases.
7. Read back the release/tag/asset metadata, download uploaded checksum text and compare it. Record public links and remaining limitations. Physical printer/driver, elevated installation/upgrade and power-loss checks stay NOT TESTED unless performed.

GitHub Actions is manual verification/build only, has read-only repository permission and never publishes automatically on tag pushes. Source and dependencies retain their own licence rights. Old historical LFS archives are not new candidate assets.
