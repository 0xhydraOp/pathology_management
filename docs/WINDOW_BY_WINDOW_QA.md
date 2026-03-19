# Window-by-window QA (step-by-step)

Run **`npm run electron:dev`** so `window.db` works. Walk each screen in order; note pass/fail.

---

## 1. Login
| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open app | Splash → login |
| 1.2 | Empty submit / invalid creds | Inline error, no crash |
| 1.3 | Valid login | Dashboard |
| 1.4 | **Try launching app again** | Second instance focuses first (single DB) |

---

## 2. Dashboard
| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Change period (today / week / month) | Counts refresh |
| 2.2 | **Refresh** | Data reloads |
| 2.3 | Pending row click | Result entry with `?order=` |
| 2.4 | Quick actions | Correct routes |
| 2.5 | Date on pending list | Matches calendar (no off-by-one) |

---

## 3. New registration
| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Open form, **Self / Clear** referrer | Toggles / clears |
| 3.2 | Save with **no tests** | Toast: select at least one test |
| 3.3 | Save with name + tests | Redirect to result entry; toast on DB error |
| 3.4 | **Close / Cancel** | `type="button"` — does not submit form |

---

## 4. Result entry
| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Pending filter + refresh | List updates |
| 4.2 | Pending row **date** | Formatted (not raw SQLite drift) |
| 4.3 | Select patient → order row **date** | Same formatter |
| 4.4 | Numeric **min/max** violation | Toast warning (not browser alert) |
| 4.5 | Batch mode save error | Toast |
| 4.6 | Save / Save only / Next / Ctrl+S | As before; errors → toast |
| 4.7 | URL `?order=id` | Loads that order |

---

## 5. Reports
| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Date presets + range | List filters |
| 5.2 | Search by **order #** (digits only) | Filters / Enter selects first match |
| 5.3 | Barcode scan path | Order loads; date span adjusts |
| 5.4 | Print / preview | Works; **Ctrl+P** from menu on `#/reports` |
| 5.5 | Empty report → **Go to Result Entry** | `type="button"` navigation |

---

## 6. Billing
| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Range, payment filter, sort | OK |
| 6.2 | Search: name, ID, **order #**, barcode | Matches |
| 6.3 | Invoice dates | DD-MM-YYYY stable |
| 6.4 | **Recalc** with invoice open | Totals refresh |

---

## 7. Referrals
| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Period + search | Lists load |
| 7.2 | Export / invoice modals | No console errors |
| 7.3 | Display dates | No UTC shift on `YYYY-MM-DD` |

---

## 8. Referrer commission
| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Search, edit %, **Save All** | Persists |
| 8.2 | **Add Referrer** | Prompt; duplicate blocked |
| 8.3 | Buttons | Not accidental submit (toolbar, not in form) |

---

## 9. Test prices (Rate chart)
| Step | Action | Expected |
|------|--------|----------|
| 9.1 | Search, edit rates, **Save All** / **Reset** | OK |

---

## 10. Settings
| Step | Action | Expected |
|------|--------|----------|
| 10.1 | Lab save | Message |
| 10.2 | Backup + **Support** card | Version, path, DB size, refresh |
| 10.3 | Encrypted backup | Updates last-backup when applicable |

---

## 11. Shell / menu (Electron)
| Step | Action | Expected |
|------|--------|----------|
| 11.1 | **Help → About** | Version dialog |
| 11.2 | **File → Exit** | Quits |
| 11.3 | Dev: **View → DevTools** | Opens |
| 11.4 | Print preview window | PDF shows; close saves size |

---

## Fixes applied in code review pass
- **Result entry:** min/max alerts → **toasts**; order list **date** uses `formatOrderDateMediumIN`.
- **Reports:** search matches **numeric order id**; placeholder updated; key buttons **`type="button"`**.
- **Rate chart / Referrer commission:** save/add buttons **`type="button"`**.

Use **`npm test`** for automated smoke (build + DB + route guards).
