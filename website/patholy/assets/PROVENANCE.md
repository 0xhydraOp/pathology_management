# Synthetic screenshot provenance

Captured and visually inspected on 9 October 2026 from a locally rebuilt, unsigned Patholy Windows Electron QA package using explicit synthetic fixtures, isolated temporary directories and local licensing service only. No real lab database was opened.

- `app-dashboard.png`: actual 1366×768 application dashboard; no patient records, owner controls or activation keys displayed.
- `app-results.png`: actual 1366×1100 issued-report screen, explicitly named Synthetic demonstration patient/laboratory. Four synthetic zero results illustrate the review table; no clinical values/reference intervals were changed in the app. Existing configured lab logo is displayed as part of the captured application.

These are unedited screenshots; captions identify them as synthetic demonstration. The visible QA banner prevents them implying production activation. The fixture package is not the published prerelease and is not distributed with the website. No readable licence key, password, owner account or customer licence record is present.

Capture helpers: `scripts/test-packaged-licensing.cjs` and `scripts/capture-packaged-public.cjs`. Public-page tests produce additional screenshots locally under ignored `release/predeployment-verification/public-patholy`; they are not release artifacts.
