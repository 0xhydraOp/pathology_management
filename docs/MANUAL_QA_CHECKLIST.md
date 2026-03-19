# Manual QA checklist (Pathology Lab app)

Run the app with **`npm run electron:dev`** (database + IPC). Browser-only `npm run dev` will show the yellow banner and DB actions will fail.

Automated smoke test: **`npm test`** (build, DB init, JSON assets, routes, Layout/print guard, date util).

## Desktop shell (Electron)
- [ ] Starting the app twice: second shortcut focuses the **existing** window (no second DB process).
- [ ] **Help → About** shows name + version; **File → Exit** quits.
- [ ] Dev build: **View → Toggle Developer Tools** / Reload appear; production build: zoom/fullscreen only.
- [ ] **Print preview** window opens PDF; **Ctrl+P** there still prints; closing preview saves its size.

## Login & shell
- [ ] Login with valid user → dashboard.
- [ ] Wrong password → error, no crash.
- [ ] **Logout** clears session.
- [ ] Sidebar **NavLink** highlights active page; each route loads.
- [ ] **Pin / on top** (Electron): toggles (if menu exposes it).
- [ ] **Ctrl+N** → New Registration (not while typing in input).
- [ ] **Ctrl+E** → Result entry.
- [ ] **Ctrl+P** on Reports → print trigger; from other pages → navigates to Reports.

## Dashboard
- [ ] Period chips (today / week / month) refresh counts.
- [ ] **Refresh** works.
- [ ] Pending order row → Result entry with `?order=id`.
- [ ] Order date column matches calendar (no “wrong day” for SQLite dates).

## New registration
- [ ] **Self** / **Clear** on referrer.
- [ ] Submit with name + ≥1 test → saves; navigates as designed.
- [ ] **Cancel** / **Close form** do not submit the form.

## Result entry
- [ ] Pending list filter + **↻** refresh.
- [ ] Click pending row → entry screen; dates display correctly.
- [ ] Save / Save only / Next pending; **Ctrl+S** saves.
- [ ] **Batch entry** opens/closes and saves one parameter across orders.
- [ ] Critical / validation modals: Confirm & Edit.

## Reports
- [ ] Filters, preview, **Print** (and Electron menu print when on this page — hash route `#/reports`).

## Billing
- [ ] Date range + payment filter; sort columns.
- [ ] Search: name, ID, referrer, **order #**, **barcode** substring.
- [ ] **View** / **Print** invoice; Paid/Unpaid toggle.
- [ ] **Recalc** with invoice open → totals refresh.

## Referrals / Referrer commission / Test prices / Settings
- [ ] Lists load; add/edit/delete where applicable; export if present.
- [ ] Settings persist after reload.

## Edge cases
- [ ] Empty lists show sensible empty states + **Register patient** where offered.
- [ ] Rapid navigation: no white screen (ErrorBoundary should rarely show).
