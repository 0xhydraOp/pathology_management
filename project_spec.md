# Pathological Lab Management System — Project Specification

**Version:** 1.8  
**Date:** March 18, 2026  
**Last updated:** March 18, 2026  
**Target:** Indian Small Pathology Labs (Universal/Offline)  
**Lab:** MONDAL DIAGNOSTIC CENTRE

---

## 1. Executive Summary

A **universal, offline-first** desktop application for pathology laboratories in India. The system handles patient registration, investigation management, report generation, and thermal/impact printer output. Labs use pre-printed stationery pads (with lab branding and doctor's signature already on the pad) in the printer; the software prints only variable data (patient details, results, date).

---

## 2. Vision & Goals

| Goal | Description |
|------|-------------|
| **Universal** | Any pathology lab can adopt it without custom development |
| **Offline** | Fully functional without internet; suitable for rural/small labs |
| **Pad-based printing** | Lab inserts branded pad; software prints variable content only |
| **Automated ranges** | Normal/abnormal ranges calculated from age, sex, and reference values |
| **Indian context** | INR, Indian naming, common investigations, regulatory awareness |

---

## 3. Target Users

- **Primary:** Small pathology labs (1–5 staff, 20–100 orders/day)
- **Secondary:** Medium labs (5–15 staff)
- **Geography:** India (urban and semi-urban)
- **Technical level:** Basic computer literacy; minimal IT support

---

## 4. Core Features

### 4.1 Lab Configuration (One-time Setup)

- **Lab profile:** Name, address, phone, email, registration number (if any)
- **Logo:** Upload lab logo for reports
- **Printer:** Select default printer; default paper A4
- **Pad layout:** A4 paper with pre-printed header (lab branding on pad); software leaves **1.5 inch top gap** then prints patient details, test department, and results only; no software-printed letterhead
- **Print calibration:** Grid print, visual margin adjustment, save alignment (see Section 10.4)
- **Pathologist:** Name(s), qualification (for "Read by" on report)
- **Clinical correlation line:** Customizable footer text (default: "Please correlate clinically")
- **Report watermark:** Optional; custom text (default: "DRAFT REPORT"); printed diagonally for draft reports
- **Staff/Operators:** List of staff names (reception, technician, etc.) for "Printed by" on report

### 4.2 Patient Management

- **Patient registration fields:** Name, Age (YY format — years, e.g. 45 Y), Sex, Referred by (referring doctor), Address (dedicated address box)
- **Referred by — autocomplete:** When user types a referrer name, it is automatically saved. Next time, typing first few letters shows matching referrers from previously entered names; user selects from dropdown (Enter to select). No duplicate entry needed for same referrer.
- **Patient ID:** Auto-generated, format `PT{seq}-{MON}-{YEAR}` (e.g. PT01-MAR-2026)
  - Sequence resets every month (new month starts from PT01)
  - Month: 3-letter short form (JAN, FEB, MAR, … DEC)
- **Data storage:** All patient data saved in app database (SQLite); organized month-wise (by registration month)
- Search and reuse existing patients
- Optional: Aadhaar (for future compliance)

### 4.3 Investigation Management

- **Pre-loaded catalogue:** ~100 common investigations (see Section 8); data in `pathology_parameters.json` + `test_profiles.json` (Section 7)
- **Investigation types:**
  - **Single-value:** e.g., Hb, RBC, WBC
  - **Panel:** e.g., CBC, LFT, KFT
  - **Text:** e.g., Urine microscopy, culture
- **Per test:**
  - **section** — report section (e.g. Hematology, Biochemistry); used for grouping on report
  - Name, unit, decimal places, **display_order** (order on report; e.g. CBC: 1 Haemoglobin, 2 RBC, 3 WBC, 4 Platelet, 5 PCV)
  - Reference range (normal min/max)
  - Age/sex-specific ranges (optional)
  - **Result validation rules:**
    - **min_allowed_value** — minimum value accepted (reject entry below this; prevents typos)
    - **max_allowed_value** — maximum value accepted (reject entry above this; prevents typos)
    - **decimal_precision** — number of decimal places allowed (e.g. 2 → 12.34)
  - **Normal / Low / High / Critical:** Automatically calculated from result vs range (no manual input)
  - **Critical alert popup:** When critical value is entered and user **leaves the field (on blur)**, system shows popup: "CRITICAL VALUE DETECTED" with "Confirm result" — user must confirm before proceeding (does not fire while typing partial values)

### 4.3.1 Investigation Editor (Template Editor) — *Removed in v1.7*

*Deferred.* Labs can reload catalogue from JSON via Settings → Reload Catalogue. Customization UI planned for future release.

### 4.4 Order & Billing

- Link orders to patient (Patient ID used on report)
- Select investigations per order
- Basic billing: amount per test, total, payment status
- Receipt printing (optional)

### 4.5 Report Generation & Printing

- **Print option:** Print button/option available in the app (e.g. from report preview or order list)
- **Print Preview (Windows):** Electron uses `printToPDF()` to generate PDF; opens in new window for preview before printing (avoids "print preview not supported" in system dialog)
- **Report watermark option:** Optional watermark for draft reports; e.g. "DRAFT REPORT" printed diagonally across the page; user can enable when printing draft
- **Printout design:** Clean, easy to read — not messy (see Section 5.4)
- **Report layout:**
  - **From pad:** Lab name, address, logo, pathologist signature (all pre-printed on pad)
  - **From software:** 1.5 inch top gap; then:
    - **Patient details:** Name, Patient ID, Age, Sex, Phone, Referred by, Address (card layout)
    - **Department/section title** (e.g. Hematology, Biochemistry)
    - Investigation results with units
    - **Numerical values in BOLD**
    - **Reference range in brackets** (e.g. (13.0 - 17.0)) — alphanumeric, patient-friendly
    - **Normal / Low / High** automatically calculated and displayed; abnormal highlighted (red/underline)
    - **Minimal footer:** Read by, Printed by, Date & Time, Clinical correlation line
- **Range logic (fully automatic):**
  - Use age/sex-specific range if defined; else default range
  - Normal / Low / High / Critical calculated automatically from result vs range
  - Range displayed in brackets so patient understands report status

### 4.6 App UI — User-Friendly & Dashboard

- **User-friendly UI:** Simple, intuitive interface; easy for lab staff with basic computer skills; clear labels, logical flow, minimal clutter
- **Real-time clock:** Live date/time display (DD-MM-YYYY HH:MM:SS); updates every second; same format used when printing

### 4.6.1 Dashboard Design

**Layout:** Desktop — sidebar + main content.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Logo]  MONDAL DIAGNOSTIC CENTRE              17-03-2026 14:35:42   [User] │
├────────────┬────────────────────────────────────────────────────────────────┤
│  Dashboard │  Good morning, welcome to MONDAL Diagnostic Centre             │
│  New Reg.  │  [Today] [This Week] [This Month]              [↻ Refresh]     │
│  Enter Res.│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  Reports   │  │ New Reg.    │ │ Enter Res.  │ │ Reports     │               │
│  Referrals │  └─────────────┘ └─────────────┘ └─────────────┘               │
│  Inv. Edit │  Ctrl+N New Reg · Ctrl+E Results · Ctrl+P Reports              │
│  Settings  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                         │
│            │  │ 320      │ │ 12       │ │ 5        │                         │
│            │  │ Patients │ │ Today's  │ │ Pending  │                         │
│            │  └──────────┘ └──────────┘ └──────────┘                         │
│            │  ┌─────────────────────┐ ┌─────────────────────┐               │
│            │  │ Orders awaiting     │ │ Top Referrers       │               │
│            │  │ #101 Rajesh 17 Mar  │ │ 1 Dr. Sharma  ██ 45 │               │
│            │  │ #102 Priya  16 Mar  │ │ 2 Dr. Patel   █  32 │               │
│            │  └─────────────────────┘ └─────────────────────┘               │
└────────────┴────────────────────────────────────────────────────────────────┘
```

**Header:** Lab logo + name (left); live clock + Logout (right). Default logo: `assets/logo.png` (MONDAL DIAGNOSTIC CENTRE).

**Greeting:** Time-based — "Good morning", "Good afternoon", or "Good evening" (before 12:00, 12:00–17:00, after 17:00).

**Period selector:** Today | This Week | This Month — filters stats and referrers. Uses local date (IST-aware).

**Quick actions (3 cards):** New Registration, Enter Results & Print, Reports — each navigates to respective page.

**Keyboard shortcut hint:** Ctrl+N New Reg · Ctrl+E Results · Ctrl+P Reports (displayed below quick actions).

**Stats (3 cards):**
- **Patients [period]** — count for selected period; click → New Registration
- **Today's patients** — count registered today
- **Pending reports** — orders with status pending/partial; highlighted when > 0; click → Result Entry

**Orders awaiting results:** List of recent pending/partial orders; click row → Result Entry for that order.

**Top Referrers:** Referrer name + bar + count for selected period; link to Referrals page.

**Refresh button:** Manual reload of all dashboard stats.

**Sidebar navigation:** Dashboard, New Registration, Enter Results & Print, Reports, Referrals, Settings.

**Simplified workflow (implemented):**
1. **New Registration** — Patient details + Ref. By + tests in one form; saves and goes to result entry
2. **Enter Results & Print** — Select registered patient → select order → enter test values → Save & Print
3. **Reports** — View and print reports; search by patient/mobile/ref; Print Preview (PDF) on Windows

**Typography:** Headings 16–24px semibold; body 14px; stat numbers 26–32px bold; labels 12–13px.

**Spacing & shadows:** Card padding 16–24px; card gap 16–20px; card shadow `0 2px 12px rgba(0,0,0,0.06)`.

### 4.6.2 Window & Desktop Behavior (Electron)

- **Dynamic window title:** Title updates with current page (e.g. "MONDAL DIAGNOSTIC CENTRE - Dashboard", "- Reports")
- **Window state persistence:** Remembers size, position, maximized state, and always-on-top on restart
- **Minimum window size:** 900×600 to prevent layout breakage
- **Print preview window:** Centered on first open; remembers size on subsequent opens
- **Always on top:** Toggle in header (Pin button) for lab desk workflow
- **Splash screen:** Brief loading screen while database initializes
- **Global shortcut:** Ctrl+P triggers print (main window) or prints PDF (preview window)

### 4.7 Referral / Commission Tracking

Labs are commission-based; when someone refers a patient, the lab owner needs to track referrals for commission payout.

- **Referral summary report:** Which referrer ("Referred by") gave how many patients
- **Filter options (all counted internally by system):**
  - **Last week** — previous 7 days
  - **This month** — current calendar month
  - **Last month** — previous calendar month
  - **This year** — full calendar year (e.g. 2026)
  - **All time** — all-time total per referrer
  - **Custom** — from date–to date (e.g. 01-03-2026 to 31-03-2026)
- **Counting:** Patient counts calculated automatically from stored data (by order date); no manual entry
- **Output:** List of referrers with patient count and **percentage share** per selected period
- **Card view:** Referrers displayed as clickable cards; each card shows name, patient count, and performance breakdown (Today, This Week, This Month, Last Month)
- **Click-through:** Click a referrer card → modal shows list of patients referred by that person
- **Double-click:** Double-click a referrer card → performance report modal with week/month/custom date filters and patient list
- **Export to Excel:** Export referral data (Referrer, PatientCount) for commission tracking; saved to %APPDATA%/MondalDiagnosticCentre/exports/
- **Refresh button:** Manual reload of referral data
- **Use case:** Lab owner calculates commission per doctor/referrer for settlement

### 4.8 Business Performance Tracking

Lab owner can track overall business performance with filter options (all counted internally):

- **Filter options:**
  - **Week** — last 7 days or selected week
  - **Month** — selected month (e.g. March 2026)
  - **Year** — full calendar year (e.g. 2026)
  - **From date–to date** — custom date range (e.g. 01-03-2026 to 31-03-2026)
- **Metrics (calculated internally):** Total patients, total orders, total revenue, tests done, payment status summary, etc.
- **Output:** Summary view of lab business performance for the selected period
- **Use case:** Lab owner monitors business growth, revenue, and activity

### 4.9 Machine Import Profiles

Map machine output parameters to system investigations for result import from lab analyzers.

- **machine_import_profiles:** Per-machine profile with parameter mappings
- **Mapping:** machine_parameter → system_parameter (investigation)

**Example mapping:**

| machine_parameter | system_parameter |
|------------------|------------------|
| HB | Hemoglobin |
| PLT | Platelet Count |
| RBC | Red Blood Cells |
| WBC | White Blood Cells |
| PCV | Packed Cell Volume |

- Lab can create profiles per machine (e.g. CBC analyzer, LFT analyzer)
- When importing results from machine file/interface, system uses mapping to assign values to correct investigation

### 4.10 Data & Backup

- **App database:** All patient data (name, age, sex, address, referred by, etc.), orders, results, and reports saved in the app database (SQLite)
- **Default data protection — database encryption:** SQLite files are easily copied; database encryption (AES) at rest planned for future release
- **Backup option:** Backup button/option available in the app (e.g. from dashboard, Settings, or menu)
- **Backup location:** Default backup stored in app data folder (e.g. `%APPDATA%/MondalDiagnosticCentre/backups/`); user can also choose local PC folder (e.g. Desktop, USB drive) for backup/restore
- **Export to Excel option:** Export data to Excel (.xlsx) — patients, orders, results, reports; available from menu or Reports/Data section. See Section 4.10.1 for column schema.
- Local SQLite database (offline); AES encryption at rest planned (SQLite files easily copied — encryption would protect patient data)
- Export: PDF, Excel
- Backup/restore to app folder or user-selected local folder
- Optional: Daily auto-backup

### 4.10.1 Excel Export Schema

| Sheet | Columns |
|-------|---------|
| **Patients** | patient_id, name, age, sex, phone, address, referred_by, created_at |
| **Orders** | order_id, patient_id, referring_doctor, order_date, report_date, status, total_amount, payment_status |
| **Results** | order_id, patient_id, parameter_code, parameter_name, result_value, result_text, unit, flag, reference_range |
| **Print Log** | order_id, printed_at, printed_by, copy_number |

*Date format: DD-MM-YYYY. One row per result (long format). Filter by date range when exporting.*

---

## 5. Report Format Specification

### 5.1 Pad Layout (Pre-printed)

- **Paper:** A4
- **Header:** Pre-printed on pad (lab logo, name, address); software leaves **1.5 inch top gap** then prints content

```
┌─────────────────────────────────────────────────────────┐
│              PRE-PRINTED HEADER (on pad)                 │
│  [LAB LOGO]              MONDAL DIAGNOSTIC CENTRE         │
│                              Full Address                │
│                         Phone | Email                    │
│  Reg. No: ___________    (if applicable)                 │
├─────────────────────────────────────────────────────────┤
│  [1.5" gap] [Printable area - patient, department, results]│
│                                                          │
│                                                          │
│                                                          │
│                                                          │
│                                                          │
│                                                          │
│  _________________________                               │
│  Pathologist Signature (pre-printed & pre-signed on pad) │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Software-Printed Content

| Field | Source | Format |
|-------|--------|--------|
| Patient Name | Database | Bold, 12pt |
| Age / Sex | Database | 10pt (Age in YY format, e.g. 45 Y) |
| Patient ID | Database | 10pt (e.g. PT01-MAR-2026) |
| Referred By | Database | 10pt (referring doctor) |
| Address | Database | 10pt (dedicated address box) |
| Date & Time | Captured at print time | DD-MM-YYYY HH:MM:SS |
| Investigation | Catalogue | 10pt |
| **Result Value** | Entry | **BOLD, 12pt** |
| Unit | Catalogue | 10pt |
| Reference Range | Auto-calculated | 10pt, in brackets (e.g. (13.0 - 17.0)); alphanumeric |
| Normal/Low/High | Auto-calculated | [N]/[L]/[H]/[C]; Normal: black, Abnormal: red |
| Pathologist Signature | Pre-printed on pad | Already signed by doctor; not printed by software |
| Read By | Pathologist name | 10pt |
| Printed By | Staff/operator name (selected at print) | 10pt |
| Date & Time | Captured at print time | DD-MM-YYYY HH:MM:SS |
| Clinical correlation | Lab config (footer, bottom of report) | 9pt, italic (e.g. "Please correlate clinically") |
| Watermark (optional) | User option when printing draft | Diagonal text, e.g. "DRAFT REPORT" |

### 5.2.1 Report Watermark Option

- **Use case:** Draft reports — mark as draft before final approval
- **Option:** User can enable watermark when printing (e.g. checkbox "Print as draft")
- **Format:** Text (e.g. "DRAFT REPORT") printed **diagonally** across the page; semi-transparent so content remains readable
- **Lab config:** Optional custom watermark text (default: "DRAFT REPORT")

### 5.3 Range & Flagging Rules (Fully Automatic)

- **Automatic calculation:** Normal, Low, High, Critical are calculated by software from result vs reference range (no manual input)
- **Range display:** Reference range always shown in **brackets** (alphanumeric), e.g. (13.0 - 17.0), (70 - 100), (4000 - 11000) — so patient understands their report status
- **Normal [N]:** Value within reference range → black
- **Low [L]:** Below minimum → red/bold
- **High [H]:** Above maximum → red/bold
- **Critical [C]:** Beyond critical threshold (if defined) → red + **popup alert on blur**

### 5.3.1 Critical Alert Popup

When user enters a result that falls in the critical range (critical_low or critical_high) and **leaves the field (on blur)**, the system shows a popup:

**Example:** Potassium = 7.2 (critical high)

```
┌─────────────────────────────────────────┐
│     CRITICAL VALUE DETECTED             │
│                                         │
│  Potassium: 7.2 mEq/L                  │
│  (Critical range)                       │
│                                         │
│  [Confirm result]  [Edit / Cancel]      │
└─────────────────────────────────────────┘
```

- User must **Confirm result** to accept and save, or **Edit/Cancel** to correct
- Popup appears **on blur** (when user tabs out or clicks away) — does not fire while typing partial values (e.g. typing "7" for Hb before completing "7.5")
- Prevents accidental submission of critical values without acknowledgment

### 5.4 Report Design — Clean & Easy to Read

Printout must look **easy and uncluttered**, not messy. Apply these principles:

| Principle | Guideline |
|-----------|-----------|
| **Spacing** | Adequate whitespace between sections; consistent line spacing |
| **Alignment** | Columns aligned (test name left, value centre, range right); no overlapping text |
| **Grouping** | Tests grouped by section (Hematology, Biochemistry, LFT, KFT, Lipid, Serology, Immunology/Serology, Blood Group Tests, Surgery, etc.) |
| **Hierarchy** | Clear visual hierarchy: section headers → test names → values; avoid clutter |
| **Readability** | Simple, legible font; consistent font sizes; no cramped or crowded layout |
| **Structure** | Logical flow: patient info (name, age, sex, referred by, address) → results by section → footer (Read by, Printed by, etc.) |
| **No clutter** | Avoid unnecessary borders, excessive lines, or decorative elements |

### 5.5 Report Rendering Example

The report engine should render results like this. Section headers in UPPERCASE; separator line; each row: test name (left), value + unit, reference range in brackets, flag (↓/↑ for Low/High if applicable).

```
HEMATOLOGY
--------------------------------
Hemoglobin        12.5 g/dL    (13-17)   ↓
RBC               4.8 M/uL     (4.5-5.5)

BIOCHEMISTRY
--------------------------------
Fasting Glucose   95 mg/dL    (70-100)

LIPID PROFILE
--------------------------------
Total Cholesterol 180 mg/dL
HDL               48 mg/dL
LDL               110 mg/dL
```

**Rendering rules:**
- Section order from `report_sections.json` (display_order)
- Within each section, tests ordered by parameter `display_order`
- Format: `{Test Name}  {Value} {Unit}  ({low}-{high})  {flag}`
- Flag: ↓ Low, ↑ High, or omit if Normal; Critical uses [C]
- Reference range in brackets; omit if no range defined (e.g. some derived tests)
- Align columns for readability (test names left, values/units centre, range right)

---

## 6. Technical Architecture

### 6.1 Technology Stack (Recommended)

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Desktop app** | Electron + React / Tauri + React | Cross-platform, offline |
| **Database** | SQLite (SQLCipher or similar) | File-based, no server, portable; AES encryption at rest |
| **Printing** | System print API (e.g., Node/Web) | Works with local printers |
| **Reports** | HTML/CSS → Print / PDF | Flexible layout, print-friendly |

### 6.1.1 Database Encryption (Default Data Protection)

- **Problem:** SQLite files are easily copied; patient data at risk if file is stolen or lost
- **Solution:** AES encryption at rest (e.g. SQLCipher, or application-level encryption)
- **Implementation:** Database file encrypted; decryption key managed by app (e.g. derived from lab-specific passphrase or stored securely)

### 6.2 Alternative Stacks

- **.NET (WPF/WinForms):** Strong for Windows-only, good print control
- **Python + PyQt:** Good for rapid development, cross-platform

### 6.3 Deployment

- **Offline installer:** NSIS installer (.exe); installable without internet; bundled runtime (no separate Node/.NET install)
- **Build outputs:** NSIS Setup (.exe), ZIP archive (portable), win-unpacked folder (portable .exe)
- **Target OS:** Windows 10 minimum
- No cloud dependency; runs fully offline

### 6.4 Minimum System Requirements

| Requirement | Minimum |
|-------------|---------|
| **OS** | Windows 10 minimum |
| **RAM** | 4 GB |
| **Disk** | 500 MB free space |

---

## 7. Investigation Data Structure — JSON Schema (Core)

**This is the heart of the system.** All investigation logic (ranges, validation, flagging, display) must use this canonical structure. Follows the structure real LIS systems use.

**Two data files:**
- `pathology_parameters.json` — individual tests (code, name, ranges, unit, etc.)
- `test_profiles.json` — panels/profiles (name, tests array referencing investigation codes)

### 7.1 JSON Schema — How Every Parameter Must Look

Every numeric investigation must follow this structure:

```json
{
  "code": "HB",
  "name": "Hemoglobin",
  "section": "Hematology",
  "display_order": 1,
  "type": "numeric",
  "unit": "g/dL",
  "decimal": 1,
  "ranges": [
    {"sex": "male", "min_age": 18, "max_age": 150, "low": 13, "high": 17},
    {"sex": "female", "min_age": 18, "max_age": 150, "low": 12, "high": 15},
    {"sex": "any", "min_age": 1, "max_age": 17, "low": 11, "high": 14}
  ],
  "critical": {
    "low": 7,
    "high": 20
  }
}
```

**Range object:** `sex` = "male" | "female" | "any"; `min_age`, `max_age` in years; `low`, `high` = reference bounds. Match patient age + sex to first matching range.

### 7.2 Panel / Profile — JSON Schema

Panels (profiles) are defined in a **separate file** `test_profiles.json`:

```json
{
  "name": "CBC",
  "tests": ["HB", "RBC", "WBC", "PLT", "PCV", "MCV", "MCH", "MCHC", "ESR", "NEUT", "LYMPH", "EOS", "MONO", "BASO"]
}
```

- `name` — profile display name
- `tests` — array of investigation codes (references `pathology_parameters.json`)

### 7.3 Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Short code (e.g. HB, PLT); used in machine import mapping |
| `name` | string | Yes | Display name (e.g. Hemoglobin, Platelet Count) |
| `section` | string | Yes | Report section (e.g. Hematology, Biochemistry) |
| `display_order` | number | Yes | Order on report (1, 2, 3…) |
| `type` | string | Yes | `"numeric"`, `"derived"`, `"panel"`, or `"text"` |
| `unit` | string | For numeric, derived | Unit of measure (e.g. g/dL, /uL) |
| `decimal` | number | For numeric, derived | Decimal places for result (0, 1, 2) |
| `ranges` | array | For numeric; optional for derived | Array of range objects (see below) |
| `critical` | object | No | `low`, `high`; triggers alert popup |
| `tests` | array | For profile | Array of investigation codes (in `test_profiles.json`) |
| `values` | array | For text | Predefined options (e.g. ["Reactive", "Non Reactive"]); optional for free-text |
| `formula` | string | For derived | Expression using parameter codes (e.g. "TC - HDL - (TG / 5)") |
| `depends_on` | array | For derived | Array of parameter codes required for calculation (e.g. ["TC","HDL","TG"]) |
| `min_allowed_value` | number | For numeric | Reject entry below this (prevents typos) |
| `max_allowed_value` | number | For numeric | Reject entry above this (prevents typos) |

**Result entry validation:** Numeric: reject if value < min_allowed_value or > max_allowed_value. Text with `values`: restrict to dropdown options (e.g. HBsAg: Reactive, Non Reactive).

**Range object (each element in `ranges` array):**

| Field | Type | Description |
|-------|------|-------------|
| `sex` | string | "male" \| "female" \| "any" |
| `min_age` | number | Minimum age in years |
| `max_age` | number | Maximum age in years |
| `low` | number | Reference range minimum |
| `high` | number | Reference range maximum |

### 7.4 Range Logic

- Match patient **age** and **sex** to first matching range (age within min_age–max_age, sex matches or sex="any")
- Value < low → Low [L]; value > high → High [H]
- Value < critical.low or > critical.high → Critical [C] + popup

### 7.5 Derived Tests

For calculated parameters: `type: "derived"`. Value is computed from other parameters; not entered manually.

| Field | Required | Description |
|-------|----------|-------------|
| `formula` | Yes | Expression using parameter codes as variables (e.g. `"TC - HDL - (TG / 5)"`) |
| `depends_on` | Yes | Array of parameter codes the formula uses (e.g. `["TC","HDL","TG"]`) |
| `unit` | Yes | Unit of result (e.g. mg/dL) |
| `decimal` | Yes | Decimal places for displayed result |
| `ranges` | Optional | Same as numeric; for Normal/Low/High interpretation |
| `critical` | Optional | Same as numeric; for critical alerts |

**Example (LDL Cholesterol — Friedewald formula):**

```json
{
  "code": "LDL",
  "name": "LDL Cholesterol",
  "section": "Lipid",
  "display_order": 4,
  "type": "derived",
  "unit": "mg/dL",
  "decimal": 0,
  "formula": "TC - HDL - (TG / 5)",
  "depends_on": ["TC", "HDL", "TG"],
  "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 0, "high": 100}]
}
```

**Evaluation:** Substitute each code in the formula with its numeric result; evaluate expression. If any dependency is missing, show "—" or "Calc. not possible". Formula supports `+`, `-`, `*`, `/`, `()`.

**Friedewald (LDL) limit:** When TG > 400 mg/dL, LDL formula is invalid. Show "—" or "Not calculable (TG > 400)".

**Formula edge cases (division by zero):** When denominator = 0 (e.g. A/G when GLOB = 0), show "—" or "N/A" instead of error. Validate before evaluation; if any operand would cause division by zero, skip calculation.

### 7.6 Text/Qualitative Tests

For non-numeric tests: `type: "text"` — no ranges, no critical. Optional `values` array = predefined options (dropdown, e.g. ["Reactive", "Non Reactive"]). Omit `values` for free-text.

### 7.7 Starter Catalogue — pathology_parameters.json

**File:** `pathology_parameters.json` (alias: investigations catalogue)

All parameters must follow the schema in 7.1. Example (HB) and abbreviated entries. For `ranges`: match patient age + sex to first matching range. Text type: optional `values` for dropdown.

```json
{
  "investigations": [
    {"code": "HB", "name": "Hemoglobin", "section": "Hematology", "display_order": 1, "type": "numeric", "unit": "g/dL", "decimal": 1, "ranges": [{"sex": "male", "min_age": 18, "max_age": 150, "low": 13, "high": 17}, {"sex": "female", "min_age": 18, "max_age": 150, "low": 12, "high": 15}, {"sex": "any", "min_age": 1, "max_age": 17, "low": 11, "high": 14}], "critical": {"low": 7, "high": 20}},
    {"code": "RBC", "name": "Red Blood Cells", "section": "Hematology", "display_order": 2, "type": "numeric", "unit": "million/uL", "decimal": 2, "ranges": [{"sex": "male", "min_age": 18, "max_age": 150, "low": 4.5, "high": 5.5}, {"sex": "female", "min_age": 18, "max_age": 150, "low": 4.0, "high": 5.0}]},
    {"code": "WBC", "name": "White Blood Cells", "section": "Hematology", "display_order": 3, "type": "numeric", "unit": "/uL", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 4000, "high": 11000}]},
    {"code": "PLT", "name": "Platelet Count", "section": "Hematology", "display_order": 4, "type": "numeric", "unit": "/uL", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 150000, "high": 400000}]},
    {"code": "PCV", "name": "Packed Cell Volume", "section": "Hematology", "display_order": 5, "type": "numeric", "unit": "%", "decimal": 1, "ranges": [{"sex": "male", "min_age": 18, "max_age": 150, "low": 40, "high": 50}, {"sex": "female", "min_age": 18, "max_age": 150, "low": 36, "high": 46}]},
    {"code": "MCV", "name": "Mean Corpuscular Volume", "section": "Hematology", "display_order": 6, "type": "numeric", "unit": "fL", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 80, "high": 100}]},
    {"code": "MCH", "name": "Mean Corpuscular Hemoglobin", "section": "Hematology", "display_order": 7, "type": "numeric", "unit": "pg", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 27, "high": 32}]},
    {"code": "MCHC", "name": "Mean Corpuscular Hemoglobin Concentration", "section": "Hematology", "display_order": 8, "type": "numeric", "unit": "g/dL", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 32, "high": 36}]},
    {"code": "ESR", "name": "Erythrocyte Sedimentation Rate", "section": "Hematology", "display_order": 9, "type": "numeric", "unit": "mm/hr", "decimal": 0, "ranges": [{"sex": "male", "min_age": 18, "max_age": 150, "low": 0, "high": 15}, {"sex": "female", "min_age": 18, "max_age": 150, "low": 0, "high": 20}]},
    {"code": "NEUT", "name": "Neutrophils", "section": "Hematology", "display_order": 10, "type": "numeric", "unit": "%", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 40, "high": 70}]},
    {"code": "LYMPH", "name": "Lymphocytes", "section": "Hematology", "display_order": 11, "type": "numeric", "unit": "%", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 20, "high": 45}]},
    {"code": "EOS", "name": "Eosinophils", "section": "Hematology", "display_order": 12, "type": "numeric", "unit": "%", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 1, "high": 6}]},
    {"code": "MONO", "name": "Monocytes", "section": "Hematology", "display_order": 13, "type": "numeric", "unit": "%", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 2, "high": 10}]},
    {"code": "BASO", "name": "Basophils", "section": "Hematology", "display_order": 14, "type": "numeric", "unit": "%", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 0, "high": 2}]},
    {"code": "FBS", "name": "Fasting Blood Sugar", "section": "Biochemistry", "display_order": 1, "type": "numeric", "unit": "mg/dL", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 70, "high": 100}]},
    {"code": "PPBS", "name": "Post Prandial Blood Sugar", "section": "Biochemistry", "display_order": 2, "type": "numeric", "unit": "mg/dL", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 70, "high": 140}]},
    {"code": "RBS", "name": "Random Blood Sugar", "section": "Biochemistry", "display_order": 3, "type": "numeric", "unit": "mg/dL", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 70, "high": 140}]},
    {"code": "HBA1C", "name": "HbA1c", "section": "Biochemistry", "display_order": 4, "type": "numeric", "unit": "%", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 4, "high": 5.6}]},
    {"code": "UREA", "name": "Blood Urea", "section": "Biochemistry", "display_order": 5, "type": "numeric", "unit": "mg/dL", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 15, "high": 40}]},
    {"code": "CREAT", "name": "Serum Creatinine", "section": "Biochemistry", "display_order": 6, "type": "numeric", "unit": "mg/dL", "decimal": 2, "ranges": [{"sex": "male", "min_age": 18, "max_age": 150, "low": 0.7, "high": 1.3}, {"sex": "female", "min_age": 18, "max_age": 150, "low": 0.6, "high": 1.1}]},
    {"code": "URIC", "name": "Uric Acid", "section": "Biochemistry", "display_order": 7, "type": "numeric", "unit": "mg/dL", "decimal": 1, "ranges": [{"sex": "male", "min_age": 18, "max_age": 150, "low": 3.4, "high": 7.0}, {"sex": "female", "min_age": 18, "max_age": 150, "low": 2.4, "high": 6.0}]},
    {"code": "SOD", "name": "Sodium", "section": "Biochemistry", "display_order": 8, "type": "numeric", "unit": "mEq/L", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 136, "high": 145}]},
    {"code": "POT", "name": "Potassium", "section": "Biochemistry", "display_order": 9, "type": "numeric", "unit": "mEq/L", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 3.5, "high": 5.0}]},
    {"code": "CHL", "name": "Chloride", "section": "Biochemistry", "display_order": 10, "type": "numeric", "unit": "mEq/L", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 98, "high": 106}]},
    {"code": "ALT", "name": "SGPT (ALT)", "section": "Biochemistry", "display_order": 11, "type": "numeric", "unit": "U/L", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 7, "high": 56}]},
    {"code": "AST", "name": "SGOT (AST)", "section": "Biochemistry", "display_order": 12, "type": "numeric", "unit": "U/L", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 10, "high": 40}]},
    {"code": "ALP", "name": "Alkaline Phosphatase", "section": "Biochemistry", "display_order": 13, "type": "numeric", "unit": "U/L", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 44, "high": 147}]},
    {"code": "BILT", "name": "Total Bilirubin", "section": "Biochemistry", "display_order": 14, "type": "numeric", "unit": "mg/dL", "decimal": 2, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 0.1, "high": 1.2}]},
    {"code": "BILD", "name": "Direct Bilirubin", "section": "Biochemistry", "display_order": 15, "type": "numeric", "unit": "mg/dL", "decimal": 2, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 0, "high": 0.3}]},
    {"code": "TP", "name": "Total Protein", "section": "Biochemistry", "display_order": 16, "type": "numeric", "unit": "g/dL", "decimal": 2, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 6, "high": 8.3}]},
    {"code": "ALB", "name": "Albumin", "section": "Biochemistry", "display_order": 17, "type": "numeric", "unit": "g/dL", "decimal": 2, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 3.4, "high": 5.4}]},
    {"code": "TC", "name": "Total Cholesterol", "section": "Lipid", "display_order": 1, "type": "numeric", "unit": "mg/dL", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 0, "high": 200}]},
    {"code": "TG", "name": "Triglycerides", "section": "Lipid", "display_order": 2, "type": "numeric", "unit": "mg/dL", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 0, "high": 150}]},
    {"code": "HDL", "name": "HDL Cholesterol", "section": "Lipid", "display_order": 3, "type": "numeric", "unit": "mg/dL", "decimal": 0, "ranges": [{"sex": "male", "min_age": 18, "max_age": 150, "low": 40, "high": 100}, {"sex": "female", "min_age": 18, "max_age": 150, "low": 50, "high": 100}]},
    {"code": "LDL", "name": "LDL Cholesterol", "section": "Lipid", "display_order": 4, "type": "derived", "unit": "mg/dL", "decimal": 0, "formula": "TC - HDL - (TG / 5)", "depends_on": ["TC", "HDL", "TG"], "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 0, "high": 100}]},
    {"code": "VLDL", "name": "VLDL Cholesterol", "section": "Lipid", "display_order": 5, "type": "derived", "unit": "mg/dL", "decimal": 0, "formula": "TG / 5", "depends_on": ["TG"], "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 5, "high": 40}]},
    {"code": "TSH", "name": "Thyroid Stimulating Hormone", "section": "Thyroid", "display_order": 1, "type": "numeric", "unit": "uIU/mL", "decimal": 2, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 0.4, "high": 4.0}]},
    {"code": "T3", "name": "Total T3", "section": "Thyroid", "display_order": 2, "type": "numeric", "unit": "ng/dL", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 80, "high": 200}]},
    {"code": "T4", "name": "Total T4", "section": "Thyroid", "display_order": 3, "type": "numeric", "unit": "ug/dL", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 5, "high": 12}]},
    {"code": "CRP", "name": "C Reactive Protein", "section": "Serology", "display_order": 1, "type": "numeric", "unit": "mg/L", "decimal": 1, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 0, "high": 6}]},
    {"code": "RF", "name": "Rheumatoid Factor", "section": "Serology", "display_order": 2, "type": "numeric", "unit": "IU/mL", "decimal": 0, "ranges": [{"sex": "any", "min_age": 0, "max_age": 150, "low": 0, "high": 14}]},
    {"code": "HBSAG", "name": "HBsAg", "section": "Serology", "display_order": 3, "type": "text", "values": ["Reactive", "Non Reactive"]},
    {"code": "HIV", "name": "HIV 1 & 2", "section": "Serology", "display_order": 4, "type": "text", "values": ["Reactive", "Non Reactive"]},
    {"code": "HCV", "name": "Anti HCV", "section": "Serology", "display_order": 5, "type": "text", "values": ["Reactive", "Non Reactive"]},
    {"code": "WIDAL", "name": "Widal Test", "section": "Serology", "display_order": 6, "type": "text"},
    {"code": "DENGUE_NS1", "name": "Dengue NS1", "section": "Serology", "display_order": 7, "type": "text", "values": ["Positive", "Negative"]},
    {"code": "UPT", "name": "Urine Pregnancy Test", "section": "Serology", "display_order": 8, "type": "text", "values": ["Positive", "Negative"]}
  ]
}
```

### 7.8 Test Profiles (Panels) — test_profiles.json

Second JSON file. Profiles reference investigation codes from the investigations file.

**File:** `test_profiles.json`

```json
{
  "profiles": [
    {"name": "CBC", "tests": ["HB", "RBC", "WBC", "PLT", "PCV", "MCV", "MCH", "MCHC", "ESR", "NEUT", "LYMPH", "EOS", "MONO", "BASO"]},
    {"name": "Liver Function Test", "tests": ["ALT", "AST", "ALP", "BILT", "BILD", "TP", "ALB"]},
    {"name": "Kidney Function Test", "tests": ["UREA", "CREAT", "URIC", "SOD", "POT", "CHL"]},
    {"name": "Lipid Profile", "tests": ["TC", "TG", "HDL", "LDL", "VLDL"]},
    {"name": "Thyroid Profile", "tests": ["T3", "T4", "TSH"]},
    {"name": "Diabetes Panel", "tests": ["FBS", "PPBS", "HBA1C"]}
  ]
}
```

| Field | Description |
|-------|-------------|
| `name` | Profile display name (e.g. "CBC", "Liver Function Test") |
| `tests` | Array of investigation codes from investigations file; order = display order |

**Data files:** `pathology_parameters.json` (individual tests) + `test_profiles.json` (panels/profiles)

### 7.9 Report Section Mapping — report_sections.json

**File:** `report_sections.json`

Maps parameter `section` to report layout. Each report section has `parameter_sections` — which parameter sections appear under that report header.

| Report section | parameter_sections | Example parameters |
|----------------|--------------------|--------------------|
| Hematology | ["Hematology"] | HB, RBC, WBC |
| Lipid Profile | ["Lipid"] | TC, TG, HDL, LDL |
| Biochemistry | ["Biochemistry"] | FBS, UREA, CREAT |

*Report engine logic:*
- `parameter_sections`: include all params whose `section` is in this array
- `parameter_codes`: include only these params (overrides sections; use for subsets like Liver vs Kidney)

### 7.10 JSON → Database Load (Migration)

On **first run** (or when DB is empty), load JSON catalog into database:

1. Read `pathology_parameters.json` → insert into `parameters`, `parameter_ranges`, `formulas`
2. Read `test_profiles.json` → insert into `test_profiles`, `profile_parameters`
3. Read `report_sections.json` → used at runtime for report layout (or store in config table)

*When JSON files change:* Re-run migration or use "Reload catalogue" in Settings. Existing results are preserved; only catalogue tables are refreshed.

---

## 8. Pre-loaded Investigation Catalogue (~100)

### Section Headers (category / section_header)

| category | section_header |
|----------|----------------|
| haematology | HAEMATOLOGY |
| biochemistry | BIOCHEMISTRY |
| immunology | IMMUNOLOGY |
| serology | SEROLOGY |
| urine | URINE ANALYSIS |
| stool | STOOL |

### 8.1 Haematology (CBC & related) — category: Hematology

| display_order | Code | Test Name | Unit | Normal Range (Adult) |
|---------------|------|------------|------|----------------------|
| 1 | HB | Haemoglobin | g/dL | M: 13–17, F: 12–15 |
| 2 | RBC | Red Blood Cells | million/µL | M: 4.5–5.5, F: 4.0–5.0 |
| 3 | WBC | White Blood Cells | /µL | 4000–11000 |
| 4 | PLT | Platelet Count | /µL | 150000–400000 |
| 5 | PCV | Packed Cell Volume | % | M: 40–50, F: 36–46 |
| 6 | MCV | Mean Corpuscular Volume | fL | 80–100 |
| 7 | MCH | Mean Corpuscular Hb | pg | 27–32 |
| 8 | MCHC | Mean Corpuscular Hb Conc | g/dL | 32–36 |
| 9 | ESR | Erythrocyte Sedimentation Rate | mm/hr | M: 0–15, F: 0–20 |
| + Neutrophils, Lymphocytes, Eosinophils, Monocytes, Basophils (%), etc. |

### 8.2 Biochemistry — Blood Sugar — category: Biochemistry

| Code | Test Name | Unit | Normal Range |
|------|-----------|------|--------------|
| FBS | Fasting Blood Sugar | mg/dL | 70–100 |
| PPBS | Post Prandial Blood Sugar | mg/dL | <140 |
| RBS | Random Blood Sugar | mg/dL | 70–140 |
| HbA1c | Glycated Haemoglobin | % | 4–5.6 |

### 8.3 Liver Function (LFT)

| Code | Test Name | Unit | Normal Range |
|------|-----------|------|--------------|
| SGPT | ALT | U/L | 7–56 |
| SGOT | AST | U/L | 10–40 |
| ALP | Alkaline Phosphatase | U/L | 44–147 |
| Bilirubin Total | Total Bilirubin | mg/dL | 0.1–1.2 |
| Bilirubin Direct | Direct Bilirubin | mg/dL | 0–0.3 |
| Albumin | Serum Albumin | g/dL | 3.4–5.4 |
| Total Protein | Total Protein | g/dL | 6.0–8.3 |

### 8.4 Kidney Function (KFT/RFT)

| Code | Test Name | Unit | Normal Range |
|------|-----------|------|--------------|
| Urea | Blood Urea | mg/dL | 15–40 |
| Creatinine | Serum Creatinine | mg/dL | M: 0.7–1.3, F: 0.6–1.1 |
| Uric Acid | Serum Uric Acid | mg/dL | M: 3.4–7.0, F: 2.4–6.0 |
| Sodium | Serum Sodium | mEq/L | 136–145 |
| Potassium | Serum Potassium | mEq/L | 3.5–5.0 |
| Chloride | Serum Chloride | mEq/L | 98–106 |

### 8.5 Lipid Profile

| Code | Test Name | Unit | Normal Range |
|------|-----------|------|--------------|
| Cholesterol | Total Cholesterol | mg/dL | <200 |
| TG | Triglycerides | mg/dL | <150 |
| HDL | HDL Cholesterol | mg/dL | M: >40, F: >50 |
| LDL | LDL Cholesterol | mg/dL | <100 |
| VLDL | VLDL Cholesterol | mg/dL | 5–40 |

### 8.6 Thyroid

| Code | Test Name | Unit | Normal Range |
|------|-----------|------|--------------|
| T3 | Total T3 | ng/dL | 80–200 |
| T4 | Total T4 | µg/dL | 5–12 |
| TSH | Thyroid Stimulating Hormone | µIU/mL | 0.4–4.0 |

### 8.7 Urine — category: Urine

| Code | Test Name | Unit | Notes |
|------|-----------|------|-------|
| Urine Routine | Colour, pH, Protein, Sugar, etc. | — | Text/qualitative |
| Urine Microscopy | Pus cells, RBC, casts, etc. | /HPF | Text |
| Urine Culture | Organism, sensitivity | — | Text |

### 8.8 Stool

| Code | Test Name | Notes |
|------|-----------|-------|
| Stool Routine | Ova, cysts, occult blood | Text |
| Stool Occult Blood | Positive/Negative | Qualitative |

### 8.9 Serology & Special — category: Serology

| Code | Test Name | Notes |
|------|-----------|-------|
| CRP | C-Reactive Protein | mg/L |
| RA Factor | Rheumatoid Factor | IU/mL |
| ASO | Anti-Streptolysin O | IU/mL |
| HBsAg | Hepatitis B Surface Antigen | Reactive/Non-reactive |
| Anti HCV | Anti Hepatitis C | Reactive/Non-reactive |
| HIV | HIV 1 & 2 | Reactive/Non-reactive |
| Dengue NS1 / IgG / IgM | Dengue markers | As per kit |
| Malaria Parasite | MP | Positive/Negative |
| Widal | Typhoid | Titre |
| Pregnancy Test | UPT | Positive/Negative |
| PSA | Prostate Specific Antigen | ng/mL |
| Vitamin D | 25-OH Vitamin D | ng/mL |
| Vitamin B12 | Serum B12 | pg/mL |
| Iron / TIBC / Ferritin | Iron studies | — |

### 8.10 Panels (Bundled)

- **CBC:** HB, RBC, WBC, PLT, PCV, MCV, MCH, MCHC, ESR, differential
- **LFT:** SGPT, SGOT, ALP, Bilirubin T/D, Albumin, Total Protein
- **KFT:** Urea, Creatinine, Uric Acid, Sodium, Potassium
- **Lipid Profile:** Cholesterol, TG, HDL, LDL, VLDL
- **Thyroid Profile:** T3, T4, TSH
- **Diabetes Panel:** FBS, PPBS, HbA1c
- **Fever Panel:** MP, Dengue, Typhoid, CRP
- **Pre-employment:** CBC, LFT, KFT, Blood Sugar, Urine Routine, etc.

---

## 9. Database Schema (Core Entities)

### 9.0 Core Database Structure

| Table | Purpose |
|-------|---------|
| **Lab** | Lab config: name, address, printer, margins, watermark text |
| **Patients** | Patient registration: name, age, sex, address, referring_doctor |
| **Orders** | Order: links to patient, date, status, pathologist |
| **OrderTests** | Tests requested for a order (order ↔ parameter mapping) |
| **OrderResults** | Result values entered per test per order |
| **Parameters** | Investigation catalogue (code, name, section, type, unit, decimal) |
| **ParameterRanges** | Reference ranges per parameter (sex, age, low, high) |
| **TestProfiles** | Panels (e.g. CBC, Lipid Profile) |
| **ProfileParameters** | Profile ↔ parameter mapping (which tests in which panel) |
| **FormulaDefinitions** | Derived test formulas (formula, depends_on) |
| **ReportPrintLog** | Print history: order, printed_at, printed_by |
| **AuditLog** | Audit trail for data changes |

### 9.1 Lab Configuration

Stores lab setup information.

```sql
CREATE TABLE lab (
    id INTEGER PRIMARY KEY,
    name TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    registration_no TEXT,
    logo_path TEXT,
    margin_top INTEGER,
    margin_left INTEGER,
    margin_right INTEGER,
    margin_bottom INTEGER,
    clinical_correlation_text TEXT DEFAULT 'Please correlate clinically',
    report_watermark_text TEXT DEFAULT 'DRAFT REPORT',
    printer_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

*Note: `margin_*` in mm or points; `margin_top` default ~38 (1.5 inch) for pad top gap.*

### 9.2 Patients

```sql
CREATE TABLE patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT UNIQUE,
    name TEXT NOT NULL,
    age INTEGER,
    sex TEXT,
    phone TEXT,
    address TEXT,
    referred_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patient_name ON patients(name);
CREATE INDEX idx_patient_phone ON patients(phone);
```

*Note: `patient_id` format PT{seq}-{MON}-{YEAR} (e.g. PT01-MAR-2026); sequence resets monthly per lab.*

### 9.3 Parameters (Master Test List)

Loads from JSON catalog (`pathology_parameters.json`).

```sql
CREATE TABLE parameters (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE,
    name TEXT,
    section TEXT,
    display_order INTEGER,
    unit TEXT,
    decimal_places INTEGER,
    type TEXT
);
```

**Types:** `numeric` | `text` | `derived`

### 9.4 Parameter Ranges (Age + Gender)

```sql
CREATE TABLE parameter_ranges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parameter_id INTEGER,
    sex TEXT,
    min_age INTEGER,
    max_age INTEGER,
    low_value REAL,
    high_value REAL,
    critical_low REAL,
    critical_high REAL,
    FOREIGN KEY(parameter_id) REFERENCES parameters(id)
);
```

Supports: **male** ranges, **female** ranges, **pediatric** ranges (age-based). Match patient age + sex to first matching row; use `low_value`/`high_value` for Normal/Low/High; `critical_low`/`critical_high` for critical alerts.

### 9.5 Test Profiles (Panels)

Examples: CBC, LFT, KFT, Lipid Profile, Thyroid Profile.

```sql
CREATE TABLE test_profiles (
    id INTEGER PRIMARY KEY,
    name TEXT,
    section TEXT,
    display_order INTEGER
);
```

*Profile ↔ parameter mapping in `profile_parameters` table.*

### 9.6 Profile Parameters

Links tests to profiles.

```sql
CREATE TABLE profile_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER,
    parameter_id INTEGER,
    display_order INTEGER,
    FOREIGN KEY(profile_id) REFERENCES test_profiles(id),
    FOREIGN KEY(parameter_id) REFERENCES parameters(id)
);
```

**Example (CBC):**
```
CBC
 ├ HB
 ├ RBC
 ├ WBC
 ├ Platelets
```

### 9.7 Derived Formula Engine

```sql
CREATE TABLE formulas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parameter_id INTEGER,
    formula_expression TEXT,
    dependencies TEXT,
    FOREIGN KEY(parameter_id) REFERENCES parameters(id)
);
```

**Example row (LDL):**
| parameter_id | formula_expression | dependencies |
|--------------|--------------------|--------------|
| (id of LDL param) | TC - HDL - (TG/5) | TC,HDL,TG |

*Evaluation: substitute each dependency with its result; compute expression. If any dependency missing → show "—" or "Calc. not possible".*

### 9.8 Report Print Log

Tracks every print.

```sql
CREATE TABLE report_print_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    printed_by TEXT,
    printed_at DATETIME,
    copy_number INTEGER,
    FOREIGN KEY(order_id) REFERENCES orders(id)
);
```

### 9.9 Monthly Patient ID Generator

```sql
CREATE TABLE patient_sequence (
    month INTEGER,
    year INTEGER,
    last_number INTEGER,
    PRIMARY KEY(month, year)
);
```

**Example generated ID:** PT01-MAR-2026

*Increment `last_number` for each new patient in that month; format: PT{seq}-{MON}-{YEAR}.*

### 9.10 Orders

```sql
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    referring_doctor TEXT,
    order_date DATE,
    report_date DATE,
    status TEXT DEFAULT 'pending',
    total_amount REAL,
    payment_status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(id)
);

CREATE INDEX idx_order_patient ON orders(patient_id);
CREATE INDEX idx_order_date ON orders(order_date);
```

*Status: pending | partial | complete | printed*

### 9.11 Order Tests

Tests requested for a order.

```sql
CREATE TABLE order_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    parameter_id INTEGER NOT NULL,
    display_order INTEGER,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(parameter_id) REFERENCES parameters(id)
);

CREATE INDEX idx_order_tests_order ON order_tests(order_id);
```

### 9.12 Order Results

Result values entered per test per order.

```sql
CREATE TABLE order_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    parameter_id INTEGER NOT NULL,
    result_value REAL,
    result_text TEXT,
    flag TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(parameter_id) REFERENCES parameters(id),
    UNIQUE(order_id, parameter_id)
);

CREATE INDEX idx_order_results_order ON order_results(order_id);
```

*For numeric: `result_value`; for text: `result_text`. `flag` = N|L|H|C (Normal/Low/High/Critical), auto-calculated.*

### 9.13 Audit Log

Tracks data changes for compliance.

```sql
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT,
    record_id INTEGER,
    action TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    changed_by TEXT
);

CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON audit_log(changed_at);
```

*Action: INSERT | UPDATE | DELETE*

### 9.14 Example Query: Get Patient Report

```sql
SELECT
    p.name,
    p.age,
    p.sex,
    pr.name AS test,
    sr.result_value,
    pr.unit
FROM order_results sr
JOIN parameters pr ON sr.parameter_id = pr.id
JOIN orders s ON sr.order_id = s.id
JOIN patients p ON s.patient_id = p.id
WHERE s.id = ?
ORDER BY pr.section, pr.display_order;
```

### 9.15 Detailed Schema (Entity Overview)

```
Lab
├── id, name, address, phone, email, registration_no, logo_path
├── margin_top, margin_left, margin_right, margin_bottom
├── clinical_correlation_text, report_watermark_text, printer_name (optional)
└── created_at

Pathologist
├── id, lab_id, name, qualification
└── is_default

Staff (for "Printed by")
├── id, lab_id, name
└── is_default (optional: default print operator)

PatientIdSequence (for monthly reset)
├── lab_id, month, year
└── last_sequence (e.g. 1, 2, 3… resets each month)

Patient
├── id, lab_id, patient_id (format: PT{seq}-{MON}-{YEAR}, e.g. PT01-MAR-2026)
├── registration_month, registration_year (for month-wise storage & filtering)
├── name, age, sex, contact, address, referring_doctor
├── created_at, notes
└── (patient_id unique per lab per month; seq resets each month)

Investigation (Catalogue) — maps to JSON schema in Section 7
├── id, code, name, section (e.g. Hematology, Biochemistry, Lipid, Thyroid, Serology)
├── unit, decimal_places
├── min_allowed_value, max_allowed_value (result validation; reject out-of-range entry)
├── decimal_precision (number of decimal places allowed for result entry)
├── range_male_min, range_male_max, range_female_min, range_female_max
├── range_child_min, range_child_max (optional age-based)
├── critical_low, critical_high
├── is_panel (boolean), parent_panel_id
└── display_order (order on report; e.g. CBC: 1 Haemoglobin, 2 RBC, 3 WBC, 4 Platelet, 5 PCV)

Order
├── id, lab_id, patient_id
├── referring_doctor, order_date, report_date
├── pathologist_id, status (pending/partial/complete/printed)
├── total_amount, payment_status
└── created_at

OrderInvestigation (Order ↔ Investigations)
├── id, order_id, investigation_id
├── result_value (text/number), result_text
├── is_abnormal, flag (auto-calculated: normal/low/high/critical)
└── notes

ReportPrintLog
├── id, order_id, printed_at, printed_by
└── copy_number

(Referral report: aggregate Order by referring_doctor, filter by order_date — last month, last week, date-to-date, year, all; counted internally)

(Referred by autocomplete: referrer names derived from distinct referring_doctor in Patient/Order; suggestions shown as user types; new names auto-saved for future use)

MachineImportProfile
├── id, lab_id, profile_name (e.g. "CBC Analyzer XYZ")
└── created_at

MachineImportMapping (machine_parameter → system investigation)
├── id, machine_import_profile_id
├── machine_parameter (e.g. HB, PLT)
├── investigation_id (system parameter; e.g. Hemoglobin, Platelet Count)
└── (one mapping per machine param per profile)
```

---

## 10. Printer Integration

### 10.1 Pad-Based Printing

- **Pad:** A4 paper with pre-printed header (lab logo, name, address)
- Software leaves **1.5 inch top gap**; prints only patient details, department, results, minimal footer
- Default margin_top = 1.5 inch (38 mm) for pad top gap; configurable for alignment
- Support for multiple pad designs (template selection)

### 10.2 Supported Printers

- Windows default printer (any)
- Thermal receipt printers (58mm, 80mm)
- Dot matrix / impact printers
- Laser/inkjet for A4 reports

### 10.3 Print Flow

- **Print option:** Always available in the app (e.g. Print button on report preview, order list, or report view)
1. User selects order(s) → Preview report (shows live date/time)
2. User selects **Printed by** (staff name from list)
3. Ensure correct pad is loaded
4. Print → **Date & time captured at this moment** (DD-MM-YYYY HH:MM:SS); Printed by name and date/time appear on report
5. Pad already contains doctor's signature; no signature printing by software
6. Optional: Print duplicate for patient copy

### 10.4 Print Calibration

Align software output with pre-printed pad:

- **Print calibration grid:** Print a calibration grid (ruled lines, corner markers) to check alignment with pad
- **Adjust margins visually:** Visual editor to adjust top, left, right, bottom margins; live preview of printable area
- **Save alignment:** Save margin settings to lab config; reuse for future prints

---

## 11. Indian Lab Context

### 10.1 Compliance Awareness (Future)

- **CLIA/NABL:** Structure data for future accreditation
- **Drugs & Cosmetics Act:** Lab registration where applicable
- **Data privacy:** Local storage; no cloud by default; **database encryption (AES)** — SQLite files easily copied, encryption protects patient data at rest

### 10.2 Localisation

- **Currency:** INR (₹)
- **Date format:** Always DD-MM-YYYY (everywhere in app, reports, exports)
- **Age format:** YY (years), e.g. 45 Y
- **Date & Time format:** DD-MM-YYYY HH:MM:SS (for printed reports, captured at print moment)
- **Language:** English (primary); optional Hindi/regional later
- **Naming:** Support for Indian names (no strict format)

### 10.3 Common Workflows

- Walk-in patients
- Referrals from doctors/clinics (commission-based; lab tracks referrer-wise patient count)
- Referral summary: last month, last week, date-to-date, year, or all — patient counts per referrer (all counted internally)
- Business performance tracking: week, month, year, date-to-date — total patients, orders, revenue (all counted internally)
- Home visit (optional module)
- Bulk discount / package pricing
- Credit/commission to referring doctors (optional)

---

## 12. Development Phases

### Phase 1 — MVP (8–10 weeks)

- [x] Lab setup, patient registration
- [x] Referred by autocomplete (type few letters → select from saved referrers)
- [x] User-friendly UI with dashboard navigation
- [x] Core investigation catalogue (50 tests)
- [x] Order creation, result entry
- [x] Critical alert popup (on blur when critical value; confirm before save)
- [x] Basic report layout with bold values, ranges; clean, easy-to-read printout
- [x] Pad-based printing (pad pre-signed by doctor)
- [x] Date & time auto-captured at print; real-time clock in app UI
- [x] SQLite database, local backup (AES encryption at rest deferred)

### Phase 2 — Enhancement (4–6 weeks)

- [x] Offline installer (NSIS .exe, ZIP, portable; no internet required)
- [ ] Full 100-investigation catalogue
- [x] Age/sex-specific ranges
- [ ] Investigation editor (removed in v1.7; reload catalogue from Settings)
- [ ] Billing, receipts
- [x] Referral/commission tracking report (last month, last week, date-to-date, year, all — counted internally)
- [ ] Business performance tracking (week, month, year, date-to-date — counted internally)
- [ ] PDF export
- [x] Search, filters, reports list

### Phase 3 — Polish (4–6 weeks)

- [ ] Barcode support
- [ ] Print calibration (grid, visual margin adjustment, save alignment) — *standalone UI removed; margin columns exist in lab table*
- [ ] Report watermark option (DRAFT REPORT, diagonally; for draft prints)
- [ ] Multiple printers, templates
- [ ] Machine import profiles (machine_parameter → system_parameter mapping)
- [x] Data export (Excel)
- [x] User roles (reception, technician, pathologist)
- [ ] Audit log

### Implemented (v1.5)

- **Simplified workflow:** New Registration (patient + ref. by + tests in one form); Enter Results & Print (select patient → enter values → print)
- **Tech stack:** Electron + React + Vite; sql.js (pure JS SQLite — no native build tools required)
- **User management:** Users table, hashed passwords (PBKDF2), default admin/admin123
- **Lab config:** Pathologist name (Read by), default Printed by, staff list — configurable in Settings
- **Report print log:** Print history UI on Reports page (who printed what, when)
- **Data validation:** min_allowed_value, max_allowed_value on result entry (parameters table)
- **Excel export:** Export orders to Excel with date range filter; Export referrals to Excel (Referrer, PatientCount)
- **Search & filters:** Patients (date, referrer), Orders (date range, status), Reports (date range, quick presets)
- **Keyboard shortcuts:** Ctrl+N (New Registration), Ctrl+E (Enter Results & Print), Ctrl+P (Print/Reports); hint shown on Dashboard
- **Print Preview:** PDF preview window before printing (Electron printToPDF); avoids Windows "print preview not supported"
- **Print copies:** 1–5 copies selectable on Reports page
- **Encrypted backup:** AES-256 encrypted backup with password (backupEncrypted)
- **App icon:** Windows .ico from assets/icon.png; magnifying glass + blood drop design
- **Dashboard (v1.5):** Period selector (Today/Week/Month), today's patients, pending reports count, orders awaiting results list, Reports quick action, time-based greeting, refresh button
- **Referrals (v1.5):** Period filters (Last Week, This/Last Month, Year, All Time, Custom), percentage share, click-through to patient list, Export to Excel, refresh button
- **Login:** Logo in white card; gradient background (no logo watermark)

### Implemented (v1.6)

- **Lab profile:** Name, address, phone, email, registration number — configurable in Settings; used on report header and footer
- **Login:** Loading state to avoid double-submit; no admin fallback when DB throws (shows error message); improved design (gradient, card, focus states)
- **Dashboard:** Skeleton loading placeholders instead of "..." during load
- **Result Entry:** Search/filter for tests when many tests (>6); debounced patient search (300ms)
- **New Registration:** Debounced referrer suggestions (300ms)
- **Lazy loading:** Reports, Referrals, Settings loaded with React.lazy()
- **Batch DB saves:** Seed uses batch mode; single save at end of bulk operations
- **Print system:** Lab config (name, clinical_correlation_text) merged correctly for reports; auto-print fires once; main window used for print (not focused window)
- **Code cleanup:** Removed unused pages (Orders.jsx, Patients.jsx, ResultEntry.jsx)

### Implemented (v1.7)

- **Investigation Editor removed:** Reload catalogue from Settings; editor UI deferred
- **Tests to be done:** LFT (Liver Function Test) and KFT (Kidney Function Test) as separate sections with full test sets (SGOT, SGPT, ALP, Bilirubin, TP, ALB, GLOB, AGRATIO; UREA, CREAT, URIC, Sodium, Potassium, Chloride)
- **Immunology/Serology section:** RA Factor, ASO, Anti HCV, TSH, Total IgE
- **Blood Group Tests section:** Blood Group, Rh Factor
- **Referrals — card view:** Referrers displayed as clickable cards; each card shows performance (Today, This Week, This Month, Last Month); click → patient list; double-click → performance report modal
- **Reports — period cards:** Today, Yesterday, This Week, Last Month as clickable cards (replacing button row)
- **Bug fixes:** Order date uses local time (not UTC); form.referred_by null handling; Referrals load error banner with Retry; AGRATIO derived-from-derived (GLOB) resolution; Dashboard reqId/loadDataRequestRef; Referrals modal overlap; draft restore validates parameter IDs

### Phase 4 — Optional

- [ ] Home visit module
- [ ] SMS/WhatsApp report sharing (when online)
- [ ] Multi-branch support
- [ ] NABL-oriented reporting

---

## 13. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Date format** | Always DD-MM-YYYY (app, reports, exports) |
| **Offline** | 100% functionality without internet |
| **Installer** | Offline installer (no internet required) |
| **OS** | Windows 10 minimum |
| **RAM** | 4 GB (minimum) |
| **Disk** | 500 MB free space (minimum) |
| **Startup** | < 5 seconds on typical PC |
| **Report print** | < 10 seconds per report |
| **UI** | User-friendly; dashboard navigation |
| **Database** | SQLite with AES encryption; support 10,000+ patients, 100,000+ orders |
| **Backup** | One-click backup/restore; default in app folder; user can choose local PC folder |

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Printer driver issues | Test with common printers; document supported models |
| Pad misalignment | Print calibration grid; adjust margins visually; save alignment |
| Data loss | Auto-backup, export, simple restore flow |
| SQLite file copied | AES database encryption at rest; copied file unreadable without key |
| Low technical skill | User-friendly UI, dashboard navigation, tooltips, short manual |

---

## 15. Success Criteria

1. Lab can run fully offline with no internet
2. Offline installer works on Windows 10 minimum (4 GB RAM, 500 MB disk)
3. Reports print correctly on pad — clean, easy-to-read layout with bold values and ranges (pad pre-signed by doctor)
4. 100 investigations pre-loaded and usable
5. New lab can be configured in < 30 minutes
6. Backup and restore work reliably
7. User-friendly UI with dashboard navigation for easy access to all features

---

## 16. Appendix

### A. Example Report Output (Mock)

```
Patient Name: Rajesh Kumar          Age: 45 Y   Sex: M
Patient ID: PT01-MAR-2026           Referred By: Dr. Sharma
Address: 123, MG Road, Bangalore - 560001
Date & Time: 17-03-2026 14:35:42

HAEMATOLOGY
-----------------------------------------
Haemoglobin           12.5 g/dL    (13.0 - 17.0)  [L]
RBC Count             4.8 million/µL (4.5 - 5.5)  [N]
WBC Count             8500 /µL    (4000 - 11000)  [N]
Platelet Count        2,20,000 /µL (150000-400000)[N]
ESR                   12 mm/hr    (0 - 15)       [N]

BIOCHEMISTRY
-----------------------------------------
Fasting Blood Sugar   95 mg/dL    (70 - 100)     [N]
Creatinine            1.0 mg/dL   (0.7 - 1.3)    [N]

[N]=Normal [L]=Low [H]=High [C]=Critical — all auto-calculated; ranges in brackets for patient understanding

Read By: Dr. Anita Pathak, MD (Pathology)
Printed By: Ramesh Kumar
Date & Time: 17-03-2026 14:35:42
[Signature pre-printed on pad — already signed by doctor]

Please correlate clinically.
```

### B. Glossary

- **Age format:** YY (years), e.g. 45 Y
- **Date format:** DD-MM-YYYY (day-month-year); used consistently throughout the system
- **CBC:** Complete Blood Count
- **LFT:** Liver Function Test
- **KFT/RFT:** Kidney Function Test
- **Pad:** A4 pre-printed stationery with lab branding; software leaves 1.5 inch top gap, then prints patient details, department, results
- **Print calibration:** Grid print, visual margin adjustment, save alignment — align software output with pad
- **Machine import profiles:** Map machine_parameter (e.g. HB, PLT) → system_parameter (e.g. Haemoglobin, Platelet Count) for result import
- **Report watermark:** Optional "DRAFT REPORT" (or custom text) printed diagonally for draft reports
- **Database encryption:** AES encryption at rest; SQLite files easily copied — encryption protects patient data
- **Investigation editor:** (Removed in v1.7) UI tool to edit ranges, add parameters, modify panels — labs reload catalogue from Settings
- **Patient ID:** Format PT{seq}-{MON}-{YEAR} (e.g. PT01-MAR-2026); sequence resets monthly; printed on report
- **Printed by:** Staff/operator name who prints the report; selected at print time; appears on report
- **Clinical correlation:** Standard disclaimer at bottom of report (e.g. "Please correlate clinically"); lab can customize
- **Range in brackets:** Reference range shown in brackets (e.g. (13.0 - 17.0)); Normal/Low/High auto-calculated; patient-friendly
- **Result validation:** min_allowed_value, max_allowed_value, decimal_precision — validate result entry per test
- **Critical alert popup:** Popup on blur when critical value entered; "CRITICAL VALUE DETECTED" with Confirm/Edit; user must acknowledge (does not fire while typing)
- **display_order:** Order tests appear on report (e.g. CBC: 1 Haemoglobin, 2 RBC, 3 WBC, 4 Platelet, 5 PCV)
- **section:** Report section for grouping (e.g. Hematology, Biochemistry, Lipid, Thyroid, Serology); ranges array with sex, min_age, max_age, low, high
- **Referred by autocomplete:** Type first few letters → matching referrer names appear from previously saved entries; select with Enter; new names auto-saved for next time
- **Referral tracking:** Commission-based; summary shows which referrer gave how many patients; filter: last month, last week, date-to-date, year, or all; all counted internally
- **Business performance:** Track lab performance (week, month, year, date-to-date); total patients, orders, revenue; all counted internally
- **Dashboard:** Main home screen with quick access to key features; sidebar/top menu for navigation

---

*End of Project Specification*
