# 🛠 Dependencies

**Ting** relies on several external open-source tools to deliver its core features. If you are a developer or building from source, please refer to the guide below.

## Core Dependencies

### 1. FFmpeg
- **Role**: Audio extraction, format conversion, and variable speed playback.
- **Recommended Installation**:
  - **Windows**: `winget install ffmpeg` or `choco install ffmpeg`
  - **macOS**: `brew install ffmpeg`
  - **Linux**: `sudo apt install ffmpeg`

### 2. yt-dlp
- **Role**: Parsing and downloading audio from web URLs.
- **Recommended Installation**:
  - Requires Python 3.7+.
  - Command: `pip install yt-dlp`

---

## Zero-Install Experience (Sidecar Mode)

For release versions, Ting supports **Sidecar** mode. This allows us to bundle the pre-compiled binaries of these tools directly into the application installer.

If you are preparing a distribution, please refer to our [Binaries Packaging Guide](Binaries-Guide.md).

---
[Back to Home](Home.md)
