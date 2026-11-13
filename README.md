# Aoi Roux Trainers (桥式进阶训练器) 🧊

一个旨在辅助魔方桥式（Roux Method）日常训练的极简风辅助工具。基于 Onionhoney 的优秀开源项目进行了本土化适配与体验微调。

## 👨‍💻 关于本项目

本项目是 [Onionhoney's Roux Trainers](https://github.com/onionhoney/roux-trainers) 的优化版本。作为一名接触魔方不久的桥式爱好者（polo-aoi），为了在日常练习中获得更顺手、更沉浸的体验，我对原版进行了一点轻量级的“软装”与功能扩充。

## ✨ 核心优化与特性

* **🌊 连贯训练流 (Seamless Flow)**
    打通了 `FS` ➡️ `FBLP` ➡️ `SS` 的跳转逻辑，旨在为建立肌肉记忆和 Lookahead（预判衔接）的实战练习提供连贯的体验。
* **🎨 极简 UI 与本土化 (UI & Localization)**
    * 重新梳理底层的网格排版，追求更干净、克制的视觉体验。
    * 修复了中英文切换的细节问题。
    * 将打乱朝向适配为更直观的中文字样：“顶面/前面（底色/桥色）”。
* **⌨️ 交互微调 (Shortcut Tweaks)**
    * 修复了鼠标点击后，空格键（Spacebar）容易被 DOM 焦点劫持的 Bug。
    * 去除了实战盲练中容易误触的 `Enter` 键重置功能，专注计时与步骤流。

## 🚀 线上体验 (Live Demo)

🎉 **Vercel 部署地址：** [在这里填入你等下生成的 Vercel 网址]

## 🛠️ 本地运行 (Local Development)

如果你想在本地运行或二次修改本项目：

```bash
# 1. 克隆仓库
git clone [https://github.com/你的用户名/aoi-roux-trainer.git](https://github.com/你的用户名/aoi-roux-trainer.git)

# 2. 进入目录
cd aoi-roux-trainer

# 3. 安装依赖 (绝对不要上传 node_modules)
npm install

# 4. 启动本地预览
npm start

```

## 📦 桌面与移动端打包 (Desktop & Mobile Builds)

除了网页版，仓库里还有两条**互不干扰**的打包流水线：

| 工作流 | 技术栈 | 产物 |
| --- | --- | --- |
| `build.yml`（`Build & Release`） | Electron 31 + electron-builder + Capacitor | 原有桌面/移动端打包 |
| `build-tauri.yml`（`Tauri Build`） | Tauri v2 | Windows / Linux / macOS / Android / iOS 五平台 |

### 发布 tag 约定

两个工作流靠 tag 后缀区分，互不触发：

| Tag 形式 | 触发 | 说明 |
| --- | --- | --- |
| `v1.12.0` | 仅 Electron 流水线 | 普通版本 |
| `v1.12.0-tauri` | 仅 Tauri 流水线 | 五平台安装包，Release 标题即 tag 名 |

手工补发（不改 tag、直接覆盖已有 Release 资产）：在 Actions 里手动运行 `Tauri Build`，`platform=all`、`publish=true`，并在 `tag` 里填目标 tag。

### Tauri 版产物清单

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows x64 | `-windows-x64-setup.exe` | NSIS 安装包 |
| | `-windows-x64.msi` | MSI 安装包 |
| | `-windows-x64.exe` / `-windows-x64-portable.zip` | 免安装单文件 / 便携包 |
| Linux x64 | `-linux-x64.AppImage` | 通用免安装包 |
| | `-linux-x64.deb` / `-linux-x64.rpm` | Debian / Fedora 安装包 |
| | `-linux-x64-portable.tar.gz` | 便携包 |
| macOS | `-macos-arm64.dmg` / `-macos-x64.dmg` | Apple Silicon / Intel 各一份 |
| | `-macos-*.app.zip` | 直接解压得到 `.app` |
| Android | `-android-arm64.apk` | release 包，固定 keystore 签名，可直接覆盖升级 |
| iOS | `-ios-unsigned.ipa` | 未签名，需自行用证书/描述文件重签 |
| | `-ios-simulator.app.zip` | 模拟器包，方便无证书验收 |

> macOS 产物为 ad-hoc 签名（无开发者证书）。首次打开若提示“已损坏/无法验证”，右键 → 打开，或 `xattr -dr com.apple.quarantine <App>.app`。

### 打包相关的几个细节

* **图标**：`android init` / `ios init` 会用模板默认图标铺满生成目录且不再读 `src-tauri/icons`，所以流水线在 init 之后会再执行一次 `tauri icon`。
* **Android 图标比例**：自适应图标 108dp 画布只显示中间 72dp，整张 logo 铺满会显得字特别大，因此前景层先缩到 70% 再居中放到透明画布上（`FG_SCALE`）。
* **Android 状态栏**：Tauri 模板生成的 `MainActivity.kt` 会无条件 `enableEdgeToEdge()`，内容会画到状态栏下面。流水线用 `src-tauri/mobile/android/patch-main-activity.py` 给根视图补 `WindowInsets` padding（状态栏 / 刘海 / 输入法都让位），保留 edge-to-edge 但不与状态栏重叠。
* **下载通道**：NSIS / AppImage 的辅助二进制从 github.com 下载在 CI 里经常 504，流水线会探测 `ghfast.top` 等镜像并写入 `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR`，同时缓存工具目录。

### 本地构建 Tauri 版

```bash
npm install
npm install -g @tauri-apps/cli@^2
npm run build           # 先出前端产物（frontendDist 指向 build/）
npm run tauri build     # 想做开发调试则用 npm run tauri dev
```

移动端需要额外 SDK（Android SDK/NDK、Xcode）：`npm run tauri android init` / `npm run tauri ios init` 之后用 Android Studio 或 Xcode 构建，具体步骤与 CI 里的做法见 [TAURI.md](./TAURI.md)。

## ⚠️ 交流与指教

由于个人的魔方与代码资历尚浅，原版训练器中许多高阶、硬核的功能至今也还在努力摸索中。在微调代码的过程中难免会有新 Bug。
非常欢迎各位魔友多多指教！如果遇到体验不顺畅的地方，或有更好的创意，随时欢迎提 Issue 或直接联系我。

## ❤️ 致谢 (Credits)

* 本项目最核心的底层算法与框架均出自 **[Onionhoney](https://github.com/onionhoney)** 的开源心血。
* 原版开源 GitHub 仓库: [roux-trainers](https://github.com/onionhoney/roux-trainers)
* 最初灵感来源于 cubegrass.appspot.com

---

*Designed and optimized with ❤️ by polo-aoi.*
