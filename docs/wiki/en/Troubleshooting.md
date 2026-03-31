English | [中文](EN-Troubleshooting)

# 🔧 Troubleshooting

If you encounter issues while using Ting, please refer to the following common solutions.

## 1. Common Runtime Issues
- **Black or White Screen**: Ting is built using WebView2 technology. Ensure your Windows system has the latest **WebView2 Runtime** installed.
- **URL Import Failure**:
  - Check your internet connection.
  - Ensure the `yt-dlp` tool exists in the `src-tauri/bin` directory.

## 2. Data and Resets
If you need to clear all settings or reset the database:
- **Manual Reset**: Delete the local database folder, usually located at:
  `AppData/Roaming/org.ting.app/db`

## 3. Get More Help
- **GitHub Issues**: If you find a bug, please submit an issue on GitHub.
- **Feedback Email**: `thinkinsap@gmail.com`

---
[<< Previous: Practice Features](EN-Practice-Features) | [Back to Home](EN-Home)



