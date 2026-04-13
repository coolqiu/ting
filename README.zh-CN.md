<p align="center">
  <a href="./README.md">
    <img src="https://img.shields.io/badge/Language-English-blue?style=for-the-badge" alt="English">
  </a>
  <a href="./README.zh-CN.md">
    <img src="https://img.shields.io/badge/语言-简体中文-green?style=for-the-badge" alt="简体中文">
  </a>
</p>

# Ting / 听多多

> **听我的，拥抱新世界。**

Ting 是一款功能强大、跨平台的语言学习应用程序，旨在通过 AI 语音识别转录、影子练习和循环播放，帮助用户掌握听力和口语。

## ✨ 核心特性

- **AI 语音转录**：使用 OpenAI Whisper 实现高精度的自动语音转文字。
- **影子练习 (Shadowing)**：实时评估你的发音并提供 AI 反馈。
- **音频管理**：支持导入本地文件或直接从 YouTube/Bilibili 等平台下载。
- **智能循环**：支持音频切片和特定部分循环（AB 循环），帮助内化目标语言。
- **词汇与听写**：针对特定片段进行强化听写训练。
- **跨平台支持**：使用 Tauri 构建，在 Windows、macOS 和 Linux 上提供轻量级原生体验。
- **多语言适配**：界面和翻译支持超过 10 种语言。

## 🚀 快速上手

### 环境准备

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/learn/get-started) (v1.75+)
- [FFmpeg](https://ffmpeg.org/download.html) (已安装至系统 PATH)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) (可选，用于 URL 导入)
- WebView2 (Windows 用户必选)

### 安装步骤

1. 克隆仓库：
   ```bash
   git clone https://github.com/coolqiu/ting.git
   cd ting
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 启动开发模式：
   ```bash
   npm run tauri dev
   ```

### 📱 Android 构建

由于包含 Whisper AI 和 ONNX 组件，Android 构建需要额外配置。

#### 前置条件
- [Android Studio](https://developer.android.com/studio) 及 SDK (API 21+)
- [Android NDK](https://developer.android.com/ndk) (推荐版本 **26.3.11579264**)
- Java JDK 17+

#### 使用脚本构建 (Windows)
提供了一个专门的脚本 `build-android.bat` 来自动化复杂的环境设置。

1. 打开 `build-android.bat` 并检查文件顶部的 `ANDROID_SDK_ROOT` 和 `ANDROID_NDK_HOME` 路径是否正确。
2. 运行脚本：
   ```bash
   .\build-android.bat
   ```
3. 编译完成后，APK 将位于：
   `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk`

> **注意**：Release APK 默认是**未签名**的。要进行安装，你必须手动签名（例如使用 `apksigner`）或者在构建脚本中使用 `--debug` 标志进行测试。

## 🛠 技术栈

- **前端**: React, Vite, TypeScript, TailwindCSS (可选组件)。
- **后端**: Rust, Tauri 2.0。
- **AI 引擎**: Whisper (转录), ONNX (评分评估)。
- **数据库**: SQLite。

## 📄 许可证

本项目采用 MIT 许可证。详见 `LICENSE` 文件。

---

Built with ❤️ for language learners everywhere.
