# Local administrator setup and login

Patholy setup and login are fully offline. No activation key, remote account or internet connection is required.

On a new installation, choose this lab's administrator username and password. Usernames use 1–100 letters, numbers, dots, underscores or hyphens, without spaces. New passwords must be unique and 12–1024 characters; known defaults are rejected. Password spaces are preserved. Paste and password-manager autocomplete are permitted. There is no remember-password option or default account.

Use Show/Hide beside each password field if needed. Requirements and errors are linked to their fields. Submit with Enter or the primary button. While saving, controls are disabled; duplicate submission is guarded again in the backend. Username remains in the current form after errors. Passwords are never saved as drafts or written to browser storage/logs. Successful setup clears password fields and follows the normal login flow.

Closing before setup is submitted resumes setup on restart. A completed account persists, and later launches show login. Existing-user or historical-record safeguards prevent first-run setup from replacing an established installation.

Incorrect credentials always show the same message. After five failed attempts, the main process applies a shared 30-second cooldown across usernames/application windows. Wait, then try again. This bounded local throttle is in memory and resets when the application restarts; it is not a tamper-proof lockout. Successful login clears the failed-attempt budget. Logout revokes the session and clears sensitive form state. Caps Lock feedback appears when the keyboard/platform supplies its modifier state.

## Recovery

Ask the lab administrator for help. If you are the administrator, close Patholy and open **Recover Administrator.cmd** in the installation folder. Follow [RECOVERY.md](RECOVERY.md). The packaged tool requires OS access to the data directory, records an audit and has no hidden account or online reset. If no administrator account remains, preserve the database and follow the verified-backup guidance; the password recovery tool does not create an account. Never delete lab.db or create an empty database over existing records.

## Section 1 verification — 10 October 2026

- Clean offline baseline: commit 331347ea7ce238a1dcba1f0fac9b471f931e59dd. No activation/provider runtime remains; website and historical release artifacts are unchanged.
- Full suite: **15 system + 95 targeted = 110 passed**, including production build. New backend test covers changing usernames/window IDs, cooldown boundary, success and session clearing.
- Focused browser suite passed mismatch/backend policy rejection, field focus, duplicate submissions, safe errors, interrupted setup, login failure consistency, virtual-clock cooldown, keyboard/Caps Lock, recovery guidance and secret-storage checks. Existing legacy replacement/restore UI regression passed.
- Actual packaged test passed three isolated launches, interrupted setup/restart, duplicate guards, existing-user login, real 30-second cooldown, logout and local recovery with Chromium offline mode and denied HTTP(S). No outbound application requests were observed during exercised flows; this is not an OS packet capture.
- Before/after synthetic screenshots were inspected at logical 1366×768 and 1920×1080; actual Electron 200% zoom and scrolled controls were checked without horizontal clipping. Windows DPR 1.5 produces larger PNG pixel dimensions. Before 200% images use the equivalent reduced viewport. Screenshots are local QA outputs under ignored release/section1-verification/{before,after}; no passwords are displayed.
- Independent usability/security review found no demonstrated blocker. Contrast: white/teal primary 4.75:1, secondary text/white 6.32:1, input border/white 3.40:1. Error text, labels and focus supplement colour.

Screen-reader semantics and keyboard behavior were checked; actual screen-reader products, third-party password managers and modest-hardware performance are not certified by these tests. No dependencies, password policy, clinical workflows, printing, DNS/Cloudflare or published releases were changed.
