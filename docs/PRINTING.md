# Report preview, finalization and printing

## Workflow

Save & Preview Report opens Reports without issuing the order. Preview report, Print report and Ctrl+P never issue a draft. Every draft page carries DRAFT identification. Cancelling a preview, print dialog or finalization review leaves the draft editable. Failed previews do not fall back to unexpected physical printing.

Finalize report fetches current review information and shows results, saved units, reference text, flags and existing missing-interval/manual-review messages. Confirm finalization is the only issuance action. It invokes the existing authenticated, atomic backend issuance operation: result reconciliation, interval snapshots, units, flags, completion, immutable payload and issued status commit together. A SQL or persistence failure leaves a draft and displays the error. Issued results are read-only; amendments are outside this task.

Preview success does not create a print-log entry. Draft printing also does not create historical print evidence. A successful native print callback for an issued report can record the request; it does not prove that a physical sheet emerged. Each PDF preview window retains its own paper/copy settings. Ctrl+P prints the focused preview PDF, even with several previews open.

## Local paper profile

Settings → Paper & preprinted-pad profile stores one profile in the lab's local database. Saving requires an authenticated admin in Electron IPC/backend and records old/new settings and the actor. Other users can inspect settings and open a calibration page. Everything operates offline.

Preprinted mode omits the app logo, lab header and clinical footer. It prints patient details and four columns: test name, result (including a saved flag), unit and saved reference/review text. Full-report mode prints the saved lab presentation on blank paper. It uses the same patient/table components and includes the existing reader, issuance date/identity and clinical-correlation footer.

All editable dimensions are millimetres:

- Paper: A4, A5, Letter, Legal or custom width/height.
- Reserved header/footer bands; patient X/Y and table X/Y; four column widths.
- Horizontal/vertical offsets, font size and row spacing (additional vertical padding per row).

Positive offsets move patient details and the table right/down. Reserved bands and page numbering remain fixed; full-report branding occupies the reserved bands. Columns/positions must fit the selected paper after offsets. Validation rejects non-finite settings, unsupported sizes, overly narrow columns and insufficient space. Switching paper may require narrower columns and new positions before saving. Browser measurement additionally blocks printing if actual patient, header or footer text cannot fit. A5/custom presets do not automatically guess a lab's letterhead geometry.

Each page is measured with the actual font and column widths before printing. Ordinary rows stay together. A row longer than an entire page is split into labelled continuation fragments with a bounded repeated test identity; all clinical text remains present. Patient/order identification, table headings and Page N of M repeat. No clinical table enters the reserved bands. Increasing font/spacing can change pagination.

## Historical content versus physical calibration

Issued snapshots archive clinical results, parameter names, units, reference/version information, flags, review messages, patient/order presentation, lab text, report date and issuing identity. Editing those live records cannot alter the issued content used for reprints.

The current paper profile is physical printing configuration, not archived clinical content. Mode, paper dimensions, positions, columns, spacing, font size and offsets can change a reprint's geometry/pagination without modifying the issued payload. This allows alignment adjustment on a replacement printer. A reprint is content-preserving, not a byte-identical archival PDF. The packaged logo asset and available fonts are not archived in the database; changing those assets can change full-report appearance. Older-report provenance limitations remain in REFERENCE_INTERVALS.md.

Version 3 adds only `lab_print_profile` and a migration stamp. Existing parameter IDs, clinical values, reference rules, approvals and issued snapshots remain intact. Startup makes and integrity-checks an exact pre-upgrade backup before mutation; the existing transaction/temporary-file replacement governs migration. Synthetic tests cover version-2 backup, replacement failure, unchanged original bytes, retry and repeatability. Default geometry retains a roughly 50 mm letterhead band; each lab must calibrate it.

## Calibration guide

1. Choose the same paper size in Settings and the printer driver. For custom paper, configure matching physical stock in the driver.
2. Open the patient-free calibration page. It shows reserved bands, patient/table origins and a 100 mm ruler.
3. Use 100% / Actual size. Disable Fit to page and browser headers/footers. Use zero software margins where supported.
4. Print and measure the 100 mm line with a physical ruler. Correct driver scaling before changing offsets.
5. Compare origin marks with the preprinted letterhead. Adjust positions/offsets while keeping content within the reserved bands. Hardware margins can prevent edge-to-edge printing; allow for them when designing the profile.

The PDF/CSS ruler is verified at 100 mm. Physical alignment, hardware margins and packaged Electron/driver behavior require printer QA; no physical printer was available for this task.

## Verification

`npm test` includes six targeted profile/dispatch tests plus existing result/interval/atomic issuance regressions. All databases use explicit synthetic temporary directories with legacy migration disabled. No real lab database is opened.

Optional browser suites:

```powershell
$env:T001_PLAYWRIGHT_PATH = 'path-to-installed-playwright'
$env:REFERENCE_TEST_PYTHON = 'path-to-python-with-pypdf-pypdfium2-pdfplumber'
$env:REFERENCE_TEST_ARTIFACT_DIR = 'optional-outside-repository-artifact-directory'
node scripts/test-result-ui.cjs
node scripts/test-reference-ui.cjs
node scripts/test-print-layout.cjs
```

The workflow suite verifies preview/cancellation, explicit finalization failure/retry, immutable reprints and settings/calibration keyboard behavior. PDF checks cover both modes, short and 80-result reports, very long reference/review text, drafts, custom 180 × 240 mm paper, offsets, missing intervals, page counts/text, physical media dimensions, patient identity and rendered bounds. Selected first/last pages are rendered as PNGs for visual review.

Application-wide IPC authorization and removal of generic renderer SQL are documented in AUTHORIZATION.md. Filesystem power-loss durability, OneDrive/recovery, signed archival PDFs and amendments remain separate work. The product is not claimed fully secured.
