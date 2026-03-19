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

For a normal install, use **GitHub Releases** (NSIS `.exe`):  
https://github.com/0xhydraOp/pathology_management/releases/latest
