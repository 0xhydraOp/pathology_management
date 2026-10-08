# Local Patholy briefing

Prepared for `https://molladigital.com/patholy/` (redirect `/patholy` to `/patholy/` only in the existing site's future path configuration). No deployment or DNS/account change occurred. This independent static directory is not part of the Electron build or licensing Worker; do not replace the existing site's root/index, navigation or other paths. Existing website hosting configuration is not present in this repository, so integration into its current host must be reviewed separately.

Serve the `website` directory with a local static HTTP server and browse `/patholy/`. Test with `node scripts/test-public-patholy.cjs` and `T001_PLAYWRIGHT_PATH` pointing to the trusted Playwright installation.

The contact-only native dialog supports keyboard focus containment, Escape, Close, focus restoration and mobile screens. It contains the requested developer address and mailto link. No forms, analytics, external fonts, remote API calls, activation keys, owner controls or customer records are included. Owner email/MFA identity must still be separately confirmed.

The download section links the already approved, unchanged GitHub Windows installer `1.1.0-rc.1` and its verified SHA-256. It explicitly states unsigned/activation-pending status, synthetic evaluation only, unavailable clinical mutations and that this older binary predates the branch's activation-first onboarding. No new binary is published or presented as production-ready. Update download version/hash only after a separately approved, verified release; do not replace this tag's artifacts.

Screenshots are actual locally packaged application captures with explicitly synthetic fixtures; see `assets/PROVENANCE.md`. They are examples, not evidence of clinical validation, live licensing, driver compatibility or physical printer alignment. Production activation remains pending and the published prerelease remains unchanged.

Future integration: copy only this directory's HTML/CSS/JS/images into the existing website's `/patholy/` path; retain surrounding content. Set HTTP headers matching the document CSP plus `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. The document CSP is a local fallback (frame-ancestors requires a response header). No DNS additions or owner/customer cookies are needed for this public page. Hosting is a separate later approved step.
