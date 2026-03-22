# Windows build (Git LFS)

The **`-win.zip`** here is stored with **[Git LFS](https://git-lfs.github.com/)** so it can live in the repo despite GitHub’s ~100 MB limit for normal Git blobs.

## Clone with binaries

```bash
git lfs install
git clone https://github.com/0xhydraOp/pathology_management.git
cd pathology_management
git lfs pull
```

Without `git lfs pull`, you only get tiny pointer files for the ZIP.

## Prefer installer

The **`-win.zip` in this folder does not contain `setup.exe`.** It is a portable extract-and-run package (no Start Menu / Desktop shortcuts).

For a normal install on another PC, use the **separate NSIS installer** from **GitHub Releases** (the `.exe` asset, not only the zip):  
https://github.com/0xhydraOp/pathology_management/releases/latest
