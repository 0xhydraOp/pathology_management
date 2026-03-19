# Release checklist

1. Bump `version` in `package.json` (semver).
2. `npm test`
3. `npm run electron:build`
4. Confirm **`release/`** contains:
   - `MONDAL DIAGNOSTIC CENTRE Setup <version>.exe`
   - `MONDAL DIAGNOSTIC CENTRE-<version>-win.zip`
5. **`gh auth login`** (one-time per machine)
6. **`node scripts/create-release.js`** — uploads both files to **GitHub → Releases** for tag `v<version>`.

Dummy bulk seeding was removed; production DB is created empty on first run under `%APPDATA%`.
