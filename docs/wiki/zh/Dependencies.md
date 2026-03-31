[English](EN-Dependencies) | 中文

# 🛠 依赖说明 (Dependencies)

**听多多 (Ting)** 依赖一些外部开源工具来实现核心功能。如果您是开发者或从源码构建，请参考以下说明。

## 核心依赖

### 1. FFmpeg
- **作用**：音频提取、格式转换、变速播放等。
- **安装建议**：
  - **Windows**: `winget install ffmpeg` 或 `choco install ffmpeg`
  - **macOS**: `brew install ffmpeg`
  - **Linux**: `sudo apt install ffmpeg`

### 2. yt-dlp
- **作用**：解析并下载网页视频/音频链接。
- **安装建议**：
  - 需要 Python 3.7+ 环境。
  - 命令：`pip install yt-dlp`

---

## 零安装运行 (Sidecar 模式)

在发布版本中，听多多支持 **Sidecar (边车)** 模式。这意味着我们会将这些工具的二进制文件直接打包进安装包。

如果您正在准备发布自己的打包版本，请参考 [二进制文件打包指南](Binaries-Guide)。

---
[返回首页](Home)



