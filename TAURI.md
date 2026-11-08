
# Tauri 构建（五平台）

本仓库同时存在两套互相独立的打包流水线，互不影响：

| 工作流 | 技术栈 | 产物 |
|---|---|---|
| `.github/workflows/build.yml`（原有） | Electron + Capacitor | Windows / Linux / macOS / Android / iOS |
| `.github/workflows/build-tauri.yml`（新增） | Tauri v2 | Windows / Linux / macOS / Android / iOS |

新增部分只追加文件，**没有改动** `build.yml`、`package.json`、`electron/` 中的任何内容。

## 触发方式

- 推送 `v*` tag：五平台全部构建，并自动把 `AoiRouxTrainers-tauri-*` 产物挂到该 Release。
- 手动触发（Actions → **Tauri Build** → Run workflow）：
  - `platform`：`all` / `win` / `linux` / `mac` / `android` / `ios`
  - `publish`：仅 tag 构建有效，勾选后把产物上传到对应 Release

## 产物命名

对照官方 `tauri-action` 的默认产物清单（Windows = nsis + msi，Linux = appimage + deb + rpm，macOS = arm64 + x64），一个都不少：

- `AoiRouxTrainers-tauri-<版本>-windows-x64-setup.exe`（NSIS 安装包）
- `AoiRouxTrainers-tauri-<版本>-windows-x64.msi`（WiX MSI 安装包）
- `AoiRouxTrainers-tauri-<版本>-windows-x64-portable.zip` / `...-windows-x64.exe`（免安装）
- `AoiRouxTrainers-tauri-<版本>-linux-x64.AppImage`
- `AoiRouxTrainers-tauri-<版本>-linux-x64.deb`
- `AoiRouxTrainers-tauri-<版本>-linux-x64.rpm`
- `AoiRouxTrainers-tauri-<版本>-linux-x64-portable.tar.gz`
- `AoiRouxTrainers-tauri-<版本>-macos-arm64.dmg` / `...-macos-arm64.app.zip`
- `AoiRouxTrainers-tauri-<版本>-macos-x64.dmg` / `...-macos-x64.app.zip`（Intel Mac）
- `AoiRouxTrainers-tauri-<版本>-android-arm64.apk`
- `AoiRouxTrainers-tauri-<版本>-ios-unsigned.ipa` / `...-ios-simulator.app.zip`

Linux arm64 需要 `ubuntu-22.04-arm` runner，仅公开仓库可用；本仓库为 private，故暂不出 arm64 包。

## 本地开发

```bash
npm install
npm install -g @tauri-apps/cli@^2   # 与 CI 一致，用全局 CLI

# 首次需要生成图标（CI 里由流水线自动完成）
npm run tauri -- icon public/favicon/web-app-manifest-512x512.png

npm run build                       # 先出 CRA 产物到 build/
npm run tauri dev                   # 需要另开 npm start（devUrl 指向 3000 端口）
```

> `package.json` 里没有 `tauri` script，是为了完全不改动 Electron 流水线的依赖与脚本。
> CI 会在检出后临时执行 `npm pkg set scripts.tauri=tauri`（只作用于 runner 内的副本），
> 因为 iOS 的 Xcode 构建阶段要用 `npm run tauri ios xcode-script ...` 调用 CLI。

## 关键配置说明

- `src-tauri/Cargo.toml` 的 `[lib] crate-type = ["staticlib", "cdylib", "rlib"]` 是移动端必需项，缺了会在 Android 报 `Library artifact not found`。
- `src-tauri/tauri.conf.json`
  - `frontendDist: ../build`：直接复用 CRA 的 `build/` 目录（`homepage: "."` 已保证资源为相对路径）。
  - `beforeBuildCommand` / `beforeDevCommand` 置空：CRA 构建必须在 `CI=false` 下运行（否则警告即报错），由工作流单独执行。
  - `identifier: com.aoirouxtrainers.app` 与原有 Capacitor 配置保持一致；Tauri 的 identifier 不能含 `-`，所以没有沿用 electron 的 `com.aoi.roux-trainers`。
- `src-tauri/icons/`、`src-tauri/gen/`、`src-tauri/target/` 均在 `.gitignore` 中，由 CI 生成。

## Android 签名

`src-tauri/mobile/android/aoi-roux-trainers.keystore.b64` 是仓库内置的固定签名库（PKCS12，alias `aoiroux`，口令 `aoiroux2024`），
保证每次构建签名一致、可以直接覆盖升级。想换成自己的发布证书时，在仓库 Secrets 里配置：

| Secret | 说明 |
|---|---|
| `TAURI_ANDROID_KEYSTORE_B64` | keystore 的 base64 文本 |
| `TAURI_ANDROID_KEYSTORE_PASSWORD` | store 口令 |
| `TAURI_ANDROID_KEY_ALIAS` | key alias |
| `TAURI_ANDROID_KEY_PASSWORD` | key 口令（可省略，默认同 store 口令） |

配置后 CI 优先使用 Secrets，不再使用仓库内置签名库。

## iOS

无签名构建（`tauri ios build --target aarch64 --no-sign`），产出未签名 `.ipa`，需要用自己的开发者证书重签后才能装到真机。
模拟器包（`aarch64-sim`）另外产出 `...-ios-simulator.app.zip`，方便在 Xcode 模拟器里直接验收。

## CI 环境适配（实跑后补的几处）

### 1. 打包辅助二进制走镜像（NSIS / AppRun）

Tauri 打包时会从 `github.com/tauri-apps/binary-releases/releases/download/...` 下载
NSIS 工具链、`AppRun`、`linuxdeploy` 等辅助二进制。这条链路在 CI 里容易返回 504，
一旦下载失败，NSIS 安装包和 AppImage 就都出不来（只剩免安装包）。

工作流在 Windows / Linux job 里加了一步 **Probe bundler tools mirror**：逐个探测可用的
GitHub 加速镜像（`ghfast.top` / `ghproxy.net` / `gh-proxy.com`），命中就写入
`TAURI_BUNDLER_TOOLS_GITHUB_MIRROR`（Tauri 官方支持的环境变量，会替换下载 URL 里的
`https://github.com` 前缀），同时用 `actions/cache` 缓存 `~/AppData/Local/tauri` 与
`~/.cache/tauri` 里的工具目录，后续构建直接命中缓存。

效果：Windows 真出 NSIS `-setup.exe` 与 `.msi`，Linux 真出 `AppImage` 与 `.rpm`（不再走降级）。

### 2. macOS 无证书 = ad-hoc 签名

macOS job 设置 `APPLE_SIGNING_IDENTITY: "-"`（ad-hoc signing）。不加这一条时，
Apple Silicon 机器上从 Release 下载的 dmg/app 会被 Gatekeeper 直接判为"已损坏"，
用户必须先 `xattr -dr com.apple.quarantine` 才能打开。加完后系统仍会提示"未认证开发者"，
但不会再报损坏。要彻底加白仍需 Developer ID 证书 + notarization。

### 3. 其余兜底

| 平台 | 处理 |
|---|---|
| Windows | `--bundles nsis,msi`，重试 3 次；仍失败退到 `nsis`，再失败则 `--no-bundle` 出免安装 exe + zip |
| Linux | `--bundles appimage,deb,rpm`，重试 3 次；仍失败退到 `appimage,deb`，再失败只出 `.deb` + 免安装 `tar.gz` |
| macOS | 两个架构各用 `--bundles app,dmg` 构建，任一架构失败即判红；找不到 `.app` 时只出 dmg |
| Android | 不用 `android-actions/setup-android@v3`（其内部 `sdkmanager tools` 已被上游移除）；Gradle 发行包先用 curl 预下载到本地再改 `distributionUrl`；Maven 走阿里云镜像 |

Android 的 APK 构建、Linux/Windows 的打包步骤都带重试，编译产物有 cargo 缓存，重试成本很低。