# 🔧 故障排除 (Troubleshooting)

如果您在使用听多多时遇到问题，请先参考以下常见解决方案。

## 1. 常见运行问题
- **黑屏或白屏**：听多多基于 WebView2 技术。请确保您的 Windows 已安装最新的 **WebView2 Runtime**。
- **URL 导入失败**：
  - 请检查您的网络连接是否顺畅。
  - 检查项目 `src-tauri/bin` 下是否存在 `yt-dlp` 工具。

## 2. 数据与重置
如果您需要清空所有设置或重置数据库：
- **手动重置**：您可以删除本地的数据库文件夹，路径通常为：
  `AppData/Roaming/org.ting.app/db`

## 3. 获取更多帮助
- **GitHub Issues**：如果您发现了漏洞，欢迎在 GitHub 提交 Issue。
- **反馈邮箱**：`thinkinsap@gmail.com`

---
[<< 上一页：专项练习](Practice-Features.md) | [返回首页](Home.md)
