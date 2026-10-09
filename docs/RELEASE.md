# Reviewed unsigned release process

Target version 1.1.0: Pathology Management System, fully offline, unsigned. The user authorized commit, feature-branch push, a new final GitHub release and the Inno installer. Signing was explicitly skipped. No Cloudflare/domain changes or old artifact replacement are authorized.

1. Review source, staged files, history/exposure and all current application/security/data paths; fix demonstrated critical/high risks.
2. Run source, browser, PDF and synthetic failure/recovery tests. Commit reviewed source on the feature branch; never reset unrelated work or force-push.
3. Build the Windows application and Inno installer from that clean exact commit with `npm run electron:build`. Set INNO_COMPILER to an authenticated ISCC.exe if needed. Verify bundled metadata/source commit, production local assets, no sensitive files, actual packaged behavior and NotSigned status.
4. Test isolated per-user installation/reinstall/uninstall where safe. Mark unavailable installer/Windows/printer/power-loss scenarios NOT TESTED; never touch a working lab installation.
5. Create a new immutable v1.1.0 tag on the verified commit, rebuild from that tag and verify final checksums. Push feature branch and new tag normally; do not merge a protected/default branch or move existing tags.
6. Prepare only reviewed installer/archive, README, notes, sanitized verification summary and SHA256SUMS. Explicit manifest includes `{commit,version,prerelease:false,verificationPassed:true,assets:[{path,sha256}]}`.
7. Publish using `node scripts/create-release.js reviewed-manifest.json release-notes.md`. It requires clean exact source, matching tag/version/type/hashes and rejects an existing release. Attach no lab databases, backups, secrets, private keys or transient QA logs. Verify remote checksums after publication.

Unsigned binaries do not establish publisher trust. MIT grants project-code reuse rights, not dependency relicensing or clinical certification. Each laboratory must validate its intervals, formulas, units, rounding and critical thresholds; printing and recovery need local acceptance. Existing historical prereleases retain their original names and limitations.
