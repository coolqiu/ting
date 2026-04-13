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
> *Listen to me, embrace a new world.*

Ting is a powerful, cross-platform language learning application designed to help users master listening and speaking through AI-powered transcription, shadowing practice, and repetition.

## ✨ Features

- **AI Transcription**: Automatic high-accuracy speech-to-text using OpenAI Whisper.
- **Shadowing Practice**: Real-time evaluation of your pronunciation with AI feedback.
- **Audio Management**: Import local files or download directly from platforms like YouTube/Bilibili.
- **Smart Repetition**: Segment audio and repeat specific parts (AB repeat) to internalize the target language.
- **Vocabulary & Dictation**: Focus on specific segments for intensive dictation training.
- **Cross-Platform**: Built with Tauri for a lightweight, native experience on Windows, macOS, and Linux.
- **Multilingual Support**: Interface and translation available in over 10 languages.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/learn/get-started) (v1.75+)
- [FFmpeg](https://ffmpeg.org/download.html) (Installed in system PATH)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) (Optional, for URL imports)
- WebView2 (for Windows users)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/coolqiu/ting.git
   cd ting
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

### 📱 Android Build

The Android build requires additional prerequisites due to the Whisper AI and ONNX components.

#### Prerequisites
- [Android Studio](https://developer.android.com/studio) & SDK (API 21+)
- [Android NDK](https://developer.android.com/ndk) (Version **26.3.11579264** is recommended)
- Java JDK 17+

#### Building with the Helper Script (Windows)
A dedicated script `build-android.bat` is provided to automate the complex environment setup.

1. Open `build-android.bat` and verify the `ANDROID_SDK_ROOT` and `ANDROID_NDK_HOME` paths at the top of the file.
2. Run the script:
   ```bash
   .\build-android.bat
   ```
3. After compilation, the APK will be located at:
   `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk`

> **Note**: Release APKs are **unsigned** by default. To install them, you must sign them (e.g., using `apksigner`) or use the `--debug` flag in the build script for testing.

## 🛠 Tech Stack

- **Frontend**: React, Vite, TypeScript, TailwindCSS (optional components).
- **Backend**: Rust, Tauri 2.0.
- **AI Engine**: Whisper (Transcription), ONNX (Evaluation).
- **Database**: SQLite.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

Built with ❤️ for language learners everywhere.
