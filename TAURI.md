# Tauri 五平台打包说明

本仓库在原有 Electron/Capacitor 流水线之外，平行维护一条 Tauri v2 的打包流水线：`.github/workflows/build-tauri.yml`。两条流水线互不依赖、互不触发，产物各自独立。

## 1. 触发方式

| 方式 | 用法 | 结果 |
| --- | --- | --- |
| 打 tag | `v1.12.0-tauri` | 五平台全量构建，并自动把资产上传到该 tag 的 Release |
| 手动运行 | Actions → `Tauri Build` → `Run workflow` | 可按 `platform` 只跑单平台；`publish=true` + 填 `tag` 时把产物补传到指定 Release |

触发规则是**按 tag 后缀互斥**，不是二选一开关：

- `build-tauri.yml` 只吃 `v*-tauri`（`tags: ['v*', '!*-tauri']` 的否定模式在 Electron 那条里）
- `build.yml` 只吃不带后缀的 `v*`
- 所以 `v1.12.0` 只跑 Electron，`v1.12.0-tauri` 只跑 Tauri；Release 标题默认就是 tag 名

## 2. 产物清单

资产统一前缀 `AoiRouxTrainers-tauri-<版本>-`：

| 平台 | 文件 |
| --- | --- |
| Windows x64 | `windows-x64-setup.exe`（NSIS）、`windows-x64.msi`、`windows-x64.exe`、`windows-x64-portable.zip` |
| Linux x64 | `linux-x64.AppImage`、`linux-x64.deb`、`linux-x64.rpm`、`linux-x64-portable.tar.gz` |
| macOS | `macos-arm64.dmg` / `macos-x64.dmg` + 对应 `.app.zip` |
| Android | `android-arm64.apk`（release，固定 keystore 签名，可覆盖升级） |
| iOS | `ios-unsigned.ipa`（未签名）、`ios-simulator.app.zip`（模拟器包） |

macOS 无开发者证书，走 ad-hoc 签名（`APPLE_SIGNING_IDENTITY: "-"`）。首次打开若提示“已损坏”，右键 → 打开，或 `xattr -dr com.apple.quarantine <App>.app`。iOS 的 ipa 需自行用证书与描述文件重签后才能装真机。

## 3. 流水线结构

六个 job：`windows` / `linux` / `macos` / `android` / `ios` + `publish`。构建 job 的 `if` 都写成「push 事件 or dispatch 指定平台」，因此 tag 推送跑全量、dispatch 可只跑单个平台。`publish` job 不 checkout 仓库，靠 `GH_REPO` + `GH_TOKEN` 直接用 `gh release upload --clobber` 覆盖同名资产。

几个固定约定：

- `beforeBuildCommand` / `beforeDevCommand` 置空，前端构建由 workflow 单独跑（`CI=false npm run build`），`frontendDist` 指向 `../build`
- 每个 job 检出后只改 runner 内的副本：`npm pkg set scripts.tauri=tauri`（iOS 的 Xcode “Build Rust Code” 脚本依赖 `npm run tauri`），再 `npm install -g @tauri-apps/cli@^2`
- identifier 是 `com.aoirouxtrainers.app`（Tauri 不允许 `-`）
- `src-tauri/icons`、`src-tauri/gen`、`src-tauri/target` 全部 gitignore，由 CI 生成

## 4. 图标

- **必须在 `android init` / `ios init` 之后再生成**：init 会把模板默认的 Tauri 图标写进 `gen/android/.../res/mipmap-*` 与 `gen/apple/Assets.xcassets/AppIcon.appiconset`，且之后不再读 `src-tauri/icons`，先 icon 后 init 等于白做（症状就是装到手机上显示 Tauri 默认图标）。CI 在 init 之后会再跑一次 `tauri icon` 并打印 md5 前后对照。
- **Android 自适应图标要留安全区**：108dp 画布里只有中心 72dp 会被显示，直接把整张 logo 铺满会被遮罩裁掉、字显得特别大。CI 里用 `tauri icon <manifest.json>` 的 `android_fg` + `bg_color` 能力，把 logo 用 ImageMagick 缩到 70% 居中放进透明 512 画布（`-resize 70% -background none -gravity center -extent 512x512`）再生成，白底 `#ffffff`。62% 偏小、76% 会顶边，取 70% 是折中值。
- 注意 `android_fg_scale` 参数实测**无效**，只有 `android_fg`（指定前景图）与 `bg_color` 生效。
- iOS 无自适应图标安全区机制，AppIcon 为全幅方形，圆角由系统施加，不需要缩放处理；但源图需 ≥1024px 才能避免 `AppIcon-512@2x` 被 2 倍插值。

## 5. Android 状态栏安全区 (edge-to-edge)

Tauri 模板生成的 `MainActivity.kt` 在 `onCreate` 里**无条件**调用 `enableEdgeToEdge()`，导致页面从屏幕最顶端开始画、状态栏图标压住应用自己的标题栏（Android 13 等旧版本同样复现）。

处理办法：保留 edge-to-edge，但给根视图补 insets padding。流水线里由 `src-tauri/mobile/android/patch-main-activity.py` 在 `tauri android init` 之后、Gradle 构建之前自动改写：

- 按 `tauri.conf.json` 的 identifier 定位 `src-tauri/gen/android/app/src/main/java/<包路径>/MainActivity.kt`
- 补 `View` / `ViewCompat` / `WindowInsetsCompat` / `updatePadding` 等 import
- 在 `super.onCreate(...)` 之后注入监听：取 `systemBars() or displayCutout()` 的四边，底部再与 `ime()` 取 `max`，`updatePadding` 后 `requestApplyInsets`
- 脚本幂等，二次运行输出 `already patched` 直接返回

验证方法：解开 APK 读 `classes.dex`，应能 `strings classes.dex | grep requestApplyInsets` 命中。

## 6. 打包工具下载与镜像

NSIS、WiX、AppImage 等的辅助二进制要从 github.com 下载，CI 里经常 504。流水线会先探测镜像（`ghfast.top` → `ghproxy.net` → `gh-proxy.com`），命中后写入 Tauri 官方环境变量 `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR`，并用 `actions/cache` 缓存工具目录。Windows 缓存 `%LOCALAPPDATA%\tauri`，Linux 缓存 `~/.cache/tauri`。

Android 侧另有两处规避：Gradle wrapper 先用 curl 预下载（优先腾讯云镜像）再改 `distributionUrl` 指向本地文件；Maven 依赖用阿里云镜像兜底（`~/.gradle/init.gradle`）。

## 7. 产物核对

每次构建后在 job 日志的 `Package artifacts` / `ls -lh dist` 段落核对文件是否真的产出，而不是只看 job 绿。历史上出现过“全绿但 NSIS / AppImage 没有”的情况，根因就是没配下载通道只做了重试与降级。补齐 MSI / RPM 时同理：显式指定 `--bundles nsis,msi` 与 `appimage,deb,rpm`。

## 8. 本地构建

```bash
npm install
npm install -g @tauri-apps/cli@^2
npm pkg set scripts.tauri=tauri
npm run build            # 前端产物到 build/
npm run tauri build      # 桌面端安装包
npm run tauri dev        # 开发调试
```

移动端需额外 SDK：`npm run tauri android init` / `npm run tauri ios init`，随后 `npm run tauri android build --apk` 或 `npm run tauri ios build --no-sign`；用 Android Studio / Xcode 打开 `src-tauri/gen/android` / `src-tauri/gen/apple` 亦可。

## 9. 签名

- Android：仓库内置 `src-tauri/mobile/android/aoi-roux-trainers.keystore.b64`（PKCS12，alias `aoiroux`），CI 解码后 `zipalign` + `apksigner` 签名，跨构建签名一致、可覆盖升级。若配置了 Secrets `TAURI_ANDROID_KEYSTORE_B64` / `_KEYSTORE_PASSWORD` / `_KEY_ALIAS` / `_KEY_PASSWORD`，会优先使用 Secrets。
- macOS：无证书时用 ad-hoc（`-`）；有正式证书时在 `macos` job 的 env 里替换 `APPLE_SIGNING_IDENTITY` 并补 notarize 步骤。
- iOS：当前只出未签名 ipa 与模拟器包。
