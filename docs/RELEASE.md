# Release checklist

## Automatic (recommended)

GitHub Actions builds and publishes when you push a version tag:

```powershell
git tag -a v1.0.2 -m "Release v1.0.2"
git push origin v1.0.2
```

Match `v…` to `version` in `package.json`. Watch **Actions** → *Release Windows build*, then open **Releases**.

You can also run the workflow manually: **Actions** → *Release Windows build* → **Run workflow**.

## Manual (local + GitHub CLI)

1. Bump `version` in `package.json` (semver).
2. `npm test`
3. `npm run electron:build`
4. Confirm **`release/`** contains the `.exe` and `-win.zip`.
5. `gh auth login` then `node scripts/create-release.js`.

Dummy bulk seeding was removed; production DB is created empty on first run under `%APPDATA%`.
