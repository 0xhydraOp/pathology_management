# Windows build (Git LFS)

If a **`*-Windows-Install-Package.zip`** is stored here, it uses **[Git LFS](https://git-lfs.github.com/)** so it can live in the repo despite GitHub’s ~100 MB limit for normal Git blobs.

## Clone with binaries

```bash
git lfs install
git clone https://github.com/0xhydraOp/pathology_management.git
cd pathology_management
git lfs pull
```

Without `git lfs pull`, you only get tiny pointer files for the ZIP.

## What’s in the ZIP

The **Windows-Install-Package** ZIP contains the **NSIS Setup `.exe`** plus `READ_ME_FIRST_Windows_Install.txt`. Extract, then **run Setup** — it is **not** a portable app folder.

Releases: https://github.com/0xhydraOp/pathology_management/releases/latest
