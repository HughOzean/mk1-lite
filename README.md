# Mk.1 Lite · 轻型马克1

免费的本地 Markdown 编辑与预览工具。多文档标签、文件树与大纲、自定义快捷键，灰色界面配绿色高光。无需账户、订阅或后端。

[下载安装包](https://github.com/HughOzean/mk1-lite/releases) · [反馈问题](https://github.com/HughOzean/mk1-lite/issues)

## 功能

- 中文、英文、葡语、法语、德语、俄语界面。
- 多标签编辑，各自保留内容、撤销、光标、折叠与滚动状态；右侧加号新建文档，支持关闭全部或右侧标签。
- 文件栏底部可打开文件夹，展开子目录并直接打开 Markdown；标题大纲支持分支及全部折叠/展开。
- 实时预览；工具栏支持 H1–H5、表格、引用、无序/有序列表、代码块、行内代码、删除线和分割线。
- 工具栏右侧可独立缩放编辑字号（10–28px），不影响预览字号。
- 桌面自动检查更新，确认后下载、保存文档、安装并重启；设置内可手动检查更新。
- 独立搜索替换浮窗：正则、大小写、全字匹配与结果高亮。
- 编辑/预览切换、字体/字号/行高/宽度、主题、行号和换行设置。
- 可自定义模式切换和前后标签快捷键；内置 Markdown语法表。
- 本地多文档草稿恢复；未保存关闭确认和另存为路径冲突保护。
- macOS 顶部原生菜单、Markdown 文件关联和 Finder 文件打开。
- Android 触控布局、系统文档打开/保存、`.md` 筛选、异形屏安全区与顶部留白、Markdown 打开方式入口。

## 下载与平台状态

当前桌面源码版本：**0.3.0**；已公开的各平台版本以 [下载页](https://hughozean.github.io/mk1-lite/#download) 为准，Android 保持 0.2.8 测试版。

| 平台 | 分发方式 | 验证边界 |
| --- | --- | --- |
| macOS Apple Silicon | Releases 中的 `.dmg` | macOS 11+，本地构建、ARM64、签名及镜像检查通过；临时签名，未做 Apple 公证 |
| macOS Intel | Releases 中的 `.dmg` | macOS 11+，x86_64 交叉构建、签名及镜像检查；尚需 Intel 真机验收 |
| Windows x64 | GitHub Actions 生成 NSIS `.exe` | 构建和 PE 结构检查；交互安装及功能仍需 Windows 实机验收，无代码签名证书 |
| Android | Releases 中的 `.apk` 调试测试版 | Android 8.0+；编译、签名、资源及浏览器交互检查通过，系统文件提供器、异形屏与输入法仍需真机验收 |
| Web | `npm run dev` | 文件保存通过下载导出；父目录访问需支持目录选择并手动授权 |

安装前保存文档并退出旧版。macOS 将 **Mk.1 Lite.app** 拖入 Applications，然后从该位置启动；设置中的文件关联只涉及 `.md`、`.markdown`、`.mdown`。

## 本地开发

需要 Node.js 22+。桌面原生构建还需要对应系统构建依赖和 Rust；Android 使用 JDK 17 与 Android SDK 35，不需要 Rust/NDK。

```sh
npm ci
npm run dev
npm test
npm run build
```

浏览器开发服务启动后，可用本机 Chrome 运行交互回归：

```sh
npm run test:browser
npm run test:native-bridge
npm run test:search
npm run test:tree
npm run test:cheatsheet
npm run test:menu
npm run test:shortcuts
npm run test:tabs
npm run test:desktop
npm run test:updater
npm run test:android
npm run test:android:layout
npm run test:android:open
```

测试脚本支持 `MARK1LIGHT_TEST_URL` 指向其他本地端口。`artifacts/`、工具链和安装包均不会提交到源码仓库。

## 原生打包

macOS ARM64：

```sh
npm run build:mac:arm
```

macOS Intel（x86_64，最低 macOS 11.0）：

```sh
npm run build:mac:intel
```

Intel 脚本会安装 `x86_64-apple-darwin` Rust 目标，可在 Apple Silicon Mac 上交叉编译。输出为 `release/Mk.1-Lite_<版本>_macos-x64.dmg`，打包前检查可执行文件架构及应用签名。Intel 真机兼容性需要另行验证。

构建脚本优先使用项目内 `.build-tools/` 的隔离 Rust，也支持 PATH 中的工具链。用独立目录创建只包含当前应用和 Applications 链接的只读 DMG。该命令使用临时签名；正式签名、公证需要另外配置。

Windows：在 GitHub Actions 手动运行 **Build Windows installer**，选择与源码版本一致的标签。工作流构建 x64 程序、检查 PE 架构、生成 SHA-256，并可上传到已存在的草稿 Release。不会自动发布草稿。

Android：配置 JDK 17、Android SDK Platform 35 与 Build Tools 35.0.0，执行 `npm run android:build`。脚本可使用本地 `.build-tools/` 工具链或系统环境，Gradle wrapper 已锁定版本；输出位于 `release/android/`，同时验证签名并生成校验值。详见 [Android 开发与验证说明](docs/ANDROID.md)。

图标源在 `public/app-icon.svg`，`npm run icons` 重新生成平台资源。macOS ICNS 使用1024透明画布和824主体，Windows 使用全幅图标。安卓独立矢量源在 `android/artwork/launcher-foreground.svg`，`npm run icons:android` 生成文字缩小并预留安全区的图标。

自动更新密钥、签名产物和三端发布步骤见 [自动更新说明](docs/AUTO-UPDATES.md)。已发布的旧版需要先手动安装一次 0.3.0 或更新版本。

## GitHub Pages 下载页

静态页面位于 `docs/`，版本和下载状态由 `docs/releases.json` 管理。只有真实公开的 Release 资产才启用下载按钮，校验值与安装包对应。各平台可独立设置版本与标签，安卓测试版使用 `android-v0.2.8`，Intel macOS 测试版使用 `v0.2.9`，ARM64 与 Windows 下载继续指向 `v0.2.6`。

本地预览下载页：`npm run site:dev`，打开 `http://127.0.0.1:5180/`。启动后可用 `npm run site:check` 验证下载状态、语言和响应式布局。

页面本地验证后可手动运行 **Publish download page**。该工作流不因普通推送自动发布。

## 数据与安全边界

编辑与渲染在本机完成，无云同步。草稿使用当前应用/浏览器的 localStorage，受容量限制，不能替代文件备份。恢复文本不会恢复文件系统权限，需重新打开原文件或另存为。

文件树限制在已授权文件的父目录，阻止目录越界与符号链接逃逸。原生树/Finder 读取 UTF-8（含 BOM）Markdown，最大20 MiB；仅授予具体打开文件的写入权限。原始 HTML 默认禁用，危险链接协议被阻止；外链图片可能向图片来源发送网络请求。

应用内部标识沿用旧名称，以兼容已有草稿、偏好和文件关联。原生冷启动和超大文档性能尚未做基准测试。
