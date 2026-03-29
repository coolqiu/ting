# 📦 二进制文件打包指南 (Binaries Guide)

为了让用户获得“零安装”的体验（无需自行安装 Python 或 FFmpeg），开发者需要将这些工具作为 **Sidecar** 打包。

## 1. 准备二进制文件

Tauri 要求的侧边栏二进制文件命名规则为：`{name}-{target_triple}{.exe}`。

> [!IMPORTANT]
> **必须使用静态编译 (Static/Standalone) 的版本**。
> - **FFmpeg**：请下载 "Essential" 或 "Static" 版本（只有一个 `.exe` 文件，不需要额外的 `.dll`）。
> - **yt-dlp**：请下载最新的 `yt-dlp.exe`。

### 获取目标三元组 (Target Triple)
在终端运行以下命令查看您的系统标识：
```powershell
rustc -vV
```
通常 Windows 64位为：`x86_64-pc-windows-msvc`。

## 2. 放置文件路径

请将下载好的二进制文件放置在 `src-tauri/bin/` 目录下，并严格按以下示例重命名（假设目标为 Windows x64）：

- `src-tauri/bin/ffmpeg-x86_64-pc-windows-msvc.exe`
- `src-tauri/bin/yt-dlp-x86_64-pc-windows-msvc.exe`

## 3. 修改 tauri.conf.json

为了让打包系统识别并包含这些文件，您需要修改 `src-tauri/tauri.conf.json`，在 `bundle` -> `externalBin` 中添加它们：

```json
"externalBin": [
  "bin/yt-dlp",
  "bin/ffmpeg"
]
```

## 4. 为什么需要这样做？

当您运行 `npm run tauri build` 时，Tauri 会自动检测这些文件并将其压缩进最终的安装包。程序在运行时会优先检测这些内置工具，从而实现开箱即用。

---
[返回首页](Home.md) | [返回依赖说明](Dependencies.md)
