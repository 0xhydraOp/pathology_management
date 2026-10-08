# Historical LFS inspection — 8 October 2026

The previous release's statement that the historical payload was unavailable describes its review at publication time. A subsequent read-only fetch retrieved the object successfully. The released tag, installer, notes and other assets are unchanged.

## Scope and evidence

- Fetched remote refs/tags and used `git lfs fetch --all origin`; enumerated all reachable historical LFS pointers. One unique object was found.
- Object SHA-256: `091cf841c4c440314ba3b7067a25585d40cf505a4fccd063891b9468115732a5`; size **122,146,314 bytes**. Cached bytes match the pointer digest.
- Static inspection: **73 ZIP files**, **521 ASAR files**, **459 ASAR text files**. No archived application was launched, and no lab database was opened or migrated. Archived source was placed outside the workspace in an OS-restricted inspection directory, never in release assets.
- No database/backup/report-file candidates, SQLite headers or literal patient-insert candidates were found in the inspected scope. No private-key/API-token pattern candidates, unsafe archive paths, unreadable or oversized entries were found.
- **Unavailable objects: none** among the reachable pointers after fetch. This does not cover deleted/unreachable refs, external mirrors or files not represented by those pointers.

## Exposure and remediation

The archived application's bootstrap source includes a **usable legacy default credential**. Its value is deliberately not printed in this report. This was already published; it must be treated as compromised, not made secret by removing current files. Upgrade before further lab use and replace affected default/reused credentials. The current application enforces legacy-default replacement and safe administrator setup; this cannot protect an unupgraded legacy executable.

No unique production API token or private key was found requiring a new service-key rotation. This particular archive did not match the shared-backup-secret code detector. Later published source history separately includes the already documented weak shared-key backup format; treat those backups as weak, recover only through the documented specialist path, and create a fresh passphrase-protected backup after recovery. Do not assume changing current code retroactively protects historical backups.

No published history, LFS object, release artifact or tag was deleted or rewritten. Revocation/removal of old downloads or GitHub-assisted LFS/history cleanup would require a separate reviewed action, and would not erase third-party copies. If any real deployment reused the historical password for another service, rotate that service credential too.

## Reproduction and limits

`REFERENCE_TEST_PYTHON=<trusted-python> node scripts/inspect-lfs-history.cjs <local-report.json>` reads cached LFS objects. The command emits only counts, categories, object hashes and hashed candidate paths; it never prints matched values. It does not fetch by itself or execute archived code. Inspection directories have restricted Windows ACLs; inherited permissions on Git's ordinary object cache remain an OS-access consideration.

This is static file/source pattern inspection, not proof of absence of hidden/obfuscated secrets or data in arbitrary executable/image bytes. A lack of recognizable record files is not clinical-data certification. The usable historical default is a confirmed exposure despite other negative scan findings. Synthetic fixtures are used for new implementation tests; historical inspection was limited to existing archive bytes, without operating the old application or accessing live patient records.
