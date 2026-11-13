# Android 版本与布局预览

安卓端复用项目的 CodeMirror 编辑器、Markdown 渲染和草稿存储；原生 Android WebView 壳使用系统 Storage Access Framework 打开和保存文档。支持 Android 8.0（API 26）及以上，目标 API 35。

## 先预览界面

```sh
npm install
npm run dev -- --port 5173
```

打开 http://localhost:5173/android-preview.html。可切换手机宽度，在内嵌应用中编辑、预览、打开文件、查看目录和设置。示例使用独立的 sessionStorage，不覆盖桌面 localStorage。浏览器的文件上传/下载用于布局演示，安卓 APK 使用系统文档选择器。

## 原生工程

`android/` 为独立的 Android Gradle 工程，避免要求桌面开发安装 Rust 安卓目标。桌面 Tauri 工程继续使用原有入口。

本项目已在 `.build-tools/` 配置 Temurin JDK 17.0.21、Android SDK Platform 35 / Build Tools 35.0.0 / Platform Tools 和 Gradle 8.11.1。工具与缓存不提交到 Git。可直接执行：

```sh
npm run android:build
```

此命令自动加载本项目工具链、构建前端、打包 debug APK、验证 APK 签名，并复制到 `release/android/Mk1-Lite-0.2.8-debug.apk`，同时输出 SHA-256 校验文件。Gradle wrapper 已固定 8.11.1 及下载校验值。发布签名尚未配置。

如需手动使用工具：

```sh
source scripts/android-env.sh
java -version
sdkmanager --version
adb devices
```

Android Studio 中可打开 `android/`，将 Gradle JDK 指向 `.build-tools/jdk-17/jdk-17.0.21+9/Contents/Home`。本地 SDK 路径记录在不提交的 `android/local.properties`。若迁移到新机器，请安装 JDK 17、Platform 35 与 Build Tools 35.0.0，并配置 `JAVA_HOME` 和 `ANDROID_HOME`；构建脚本会优先使用本地工具，再使用 wrapper。

原生行为：

- 打开 `.md`、`.markdown`、`.mdown`、`.txt` UTF-8 文本，最大 20 MB。
- 使用系统文档选择器授予的 URI 权限，不申请整个存储空间访问权限。
- 保存已打开文档时写回原 URI；新文件通过系统“创建文档”选择目标。
- 已打开文档和草稿在本机保留。系统撤销 URI 权限后，需要重新打开文件。
- 只加载随 APK 打包的页面，外部网页链接交给系统浏览器；原始 Markdown HTML 被转义。CSP 禁止 iframe 与第三方脚本。
- 原生文件选择器在应用进程被系统终止时不会继续原来的 JS 请求；重开后从自动保留的草稿恢复，再次打开或保存即可。
- 文件列表不自动获得父文件夹读取权限，安卓不会扫描任意相邻文件夹。

## 验证状态

自动化：`npm test`、`npm run build`、`npm run test:android`（先启动开发服务器）。手机检查覆盖 320/360/398/430/768px、编辑渲染、文件导入导出、设置、侧栏、草稿恢复及模拟安卓 URI 打开/保存/去重。界面截图位于 `artifacts/android/`。

已成功执行 `npm run android:build`：原生 Java 编译与 APK 打包通过，APK v2 签名验证通过。包名 `com.mark1light.app`，版本 `0.2.8`（208），minSdk 26 / targetSdk 35。已检查 ZIP 完整性、入口 HTML 资源引用与 APK 对齐。未连接安卓设备，因此尚未安装或进行真机验证。

真机验收还需验证：Android 8/14/15 的系统文件提供器、软键盘弹出/旋转后的光标和底栏、中文输入法、系统返回键、URI 权限重启持久化、读取只读文件时的保存失败提示、后台恢复及大文件。Android 15 系统栏与键盘 insets 已加入处理，但需实机确认。

## Android 0.2.7

- 异形屏、状态栏、导航栏与软键盘的安全区交给原生外层容器处理，WebView 使用安全区域内的实际宽高。
- 设置 → 屏幕适配 → 顶部额外留白：0–96 px，叠加在系统安全区下方，自动保存；恢复默认设为 0。
- 预览中的代码块默认按可用宽度显示为正方形，长代码在内部纵横滚动。设置中的“正方形代码块”可关闭恢复紧凑显示。
- 打开文件 → 浏览文件夹：授权一个目录后，原生浏览器默认仅显示 `.md`（忽略大小写），目录始终可见；取消勾选可显示 `.md/.markdown/.mdown/.txt`。支持子目录、上一级、更换目录并记住已授权根目录。
- 首次打开与文件浏览器中均提供系统文件选择器后备。部分 Android 版本禁止授权存储根目录或 Downloads 根目录，这时可选子目录或使用系统选择器；系统选择器的过滤行为由系统/文件提供器决定。
- 按文件名扩展名过滤，而非 MIME，避免被标记为 `application/octet-stream` 的 `.md` 漏出列表。
- `npm run test:android:layout` 验证多种宽度下代码块正方形尺寸、长代码内部滚动、顶部留白持久化与设置重置。原生安全区与文件夹浏览仍需真机确认。

## Android 0.2.8

- 新增文件管理器 `ACTION_VIEW` / `ACTION_EDIT` Markdown 打开入口，冷启动与应用运行期间均由原生队列交给前端；同一 URI 再次打开会切换已有标签，不覆盖未保存的编辑。
- 应用只能注册可处理的文件类型，默认选择由 Android/文件管理器控制。安装后在文件管理器选 `.md` → 打开方式 → Mk.1 Lite → 始终；如果已有默认应用，可先清除该应用的默认打开设置。具体入口随系统与文件管理器变化。
- 安卓图标文字缩小，前景与背景分层；五种密度均重新生成，并验证文字完整位于 66dp 自适应图标安全圆内。圆形、圆角方形和方形裁切预览位于 `artifacts/android/icon-masks.png`。
- 安卓专用矢量源位于 `android/artwork/launcher-foreground.svg`；执行 `npm run icons:android` 更新，不修改桌面图标。
- `npm run test:android:open` 验证外部打开队列、冷/热启动前端接收、URI去重、编辑保留与无效文件处理。实际系统的打开方式菜单仍需手机验证。

文件关联限制：仅 `text/markdown`、`text/x-markdown` 可在 URI 不包含文件名时匹配。通用 MIME 与无 MIME 的 URI 必须有可见 Markdown 扩展名，以免注册成所有普通文本文件的打开应用。若文件提供器隐藏文件名且把 Markdown 标为 `text/plain` 等其他类型，候选列表可能没有 Mk.1 Lite，可使用应用内“打开文件”。外部只读授权文件保存时会提示选择副本位置。
