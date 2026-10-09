# Inno Setup offline installer

The current candidate uses Inno Setup rather than the historical NSIS installer. Display name is Pathology Management System. The existing Electron application ID and clinical data-directory identity are retained. Inno uses its own `com.mondal.diagnostic_is1` uninstall registration; it does not silently replace the old NSIS registration.

## Building

Prepare Electron's unpacked x64 application from the exact reviewed commit with local assets and bundled recovery. Build the icon. Use an explicitly selected verified ISCC.exe compiler:

```powershell
powershell -NoProfile -File scripts/build-inno.ps1 -CompilerPath "<verified Inno compiler>\ISCC.exe" -PackagedDirectory "<candidate>\win-unpacked" -OutputDirectory "<candidate>"
```

The script reads the three-part version from package.json, requires the expected executable, LICENSE, recovery launcher/guidance and app.asar, invokes the compiler without secrets and outputs SHA-256. No signing is configured. Final release evidence must identify the exact application commit, compiler version, installer hash and verification outcomes. The compiler download must be authenticated separately; the build script does not download tools or enable paid services.

## Installation and compatibility

Default is a per-user installation under LocalAppData\Programs, without requesting elevation. Windows 10/11 x64 targets are declared; verify unavailable Windows versions separately. Start-menu shortcuts and an optional desktop shortcut open the normal offline app. Installation does not start the app automatically.

Before copying files, the installer checks HKLM/HKCU in both registry views for the known historical NSIS uninstall identifier. If found, it stops with instructions: create/verify an external encrypted backup, close the app and manually uninstall the old program without removing lab data, then retry. It never launches the old uninstaller automatically. Data preservation of a historical uninstaller must be independently checked; configuration is not proof.

Read-only Windows process inventory checks both Patholy and Pathology executable names, including recovery windows using the same executable. If any is running or process inspection fails, install/uninstall stops. No process is terminated or force-closed. The installer has no app-data deletion or uninstall-delete action; clinical databases/backups are not installation files. Choose an application installation directory separate from lab data.

In-place Inno updates require the app closed. The application owns migration, verified pre-migration snapshots and database authorization; installer success does not establish database migration success. Refer to MANUAL_UPDATE.md and RECOVERY.md. Older executables must not be launched against a newer database schema.

## Verification limitations

Configuration tests enforce identity, no autorun/deletion, non-elevated default and fail-closed guards. Compilation verifies installer syntax and packaged inputs. Neither establishes actual elevated upgrades, historical NSIS uninstall preservation, physical printing or power-loss safety. Native installation/cancellation/reinstall/uninstall must be recorded separately using isolated synthetic profiles/VMs; otherwise mark NOT TESTED. No installer operation may touch an operational lab installation in this review.

`scripts/test-inno-installed.cjs <installer.exe> <win-unpacked-directory>` performs an actual per-user install/reinstall/uninstall only if no current Inno or historical NSIS registration and no app/recovery process exists. It uses a fresh temporary install directory, a different synthetic-marked data directory and a unique shortcut group, then verifies candidate bytes, local login and preservation of database bytes across reinstall/uninstall. It checks registry/shortcut cleanup. Failed or partial installation is left for explicit inspection rather than automatically running an uninstaller. Do not run it on a machine with an operational installation; refusal is a NOT TESTED result, not permission to remove existing registrations. Elevated operations, cancellation and Windows 10 still require separate evidence.

Windows binaries remain unsigned. A checksum identifies bytes but does not authenticate publisher identity. Signing was explicitly skipped; apply local security policy instead of claiming Windows reputation or certification.
