# Mk.1 Lite · 轻型马克1

免费的本地 Markdown 编辑与预览工具。多文档标签、文件树与大纲、自定义快捷键，灰色界面配绿色高光。无需账户、订阅或后端。

[下载安装包](https://github.com/HughOzean/mk1-lite/releases) · [反馈问题](https://github.com/HughOzean/mk1-lite/issues)

## 功能

- 中文、英文、葡语、法语、德语、俄语界面。
- 多标签编辑，各自保留内容、撤销、光标、折叠与滚动状态；支持关闭全部或右侧标签。
- 当前 Markdown 所在目录的文件树与标题大纲切换；子目录懒加载。
- 实时预览，支持 H1–H5、表格、引用、列表、代码和删除线。
- 独立搜索替换浮窗：正则、大小写、全字匹配与结果高亮。
- 编辑/预览切换、字体/字号/行高/宽度、主题、行号和换行设置。
- 可自定义模式切换和前后标签快捷键；内置 Markdown语法表。
- 本地多文档草稿恢复；未保存关闭确认和另存为路径冲突保护。
- macOS 顶部原生菜单、Markdown 文件关联和 Finder 文件打开。

## 下载与平台状态

当前版本：**0.2.4**。

| 平台 | 分发方式 | 验证边界 |
| --- | --- | --- |
| macOS Apple Silicon | Releases 中的 `.dmg` | macOS 11+，本地构建、ARM64、签名及镜像检查通过；临时签名，未做 Apple 公证 |
| Windows x64 | GitHub Actions 生成 NSIS `.exe` | 构建和 PE 结构检查；交互安装及功能仍需 Windows 实机验收，无代码签名证书 |
| Android | 尚未发布 | 提供 Tauri 源码，需要 SDK/NDK 与真机验证 |
| Web | `npm run dev` | 文件保存通过下载导出；父目录访问需支持目录选择并手动授权 |

安装前保存文档并退出旧版。macOS 将 **Mk.1 Lite.app** 拖入 Applications，然后从该位置启动；设置中的文件关联只涉及 `.md`、`.markdown`、`.mdown`。

## 本地开发

需要 Node.js 22+。原生构建还需要对应系统构建依赖和 Rust。

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
```

测试脚本支持 `MARK1LIGHT_TEST_URL` 指向其他本地端口。`artifacts/`、工具链和安装包均不会提交到源码仓库。

## 原生打包

macOS ARM64：

```sh
npm run build:mac:arm
```

构建脚本优先使用项目内 `.build-tools/` 的隔离 Rust，也支持 PATH 中的工具链。用独立目录创建只包含当前应用和 Applications 链接的只读 DMG。该命令使用临时签名；正式签名、公证需要另外配置。

Windows：在 GitHub Actions 手动运行 **Build Windows installer**，选择与源码版本一致的标签。工作流构建 x64 程序、检查 PE 架构、生成 SHA-256，并可上传到已存在的草稿 Release。不会自动发布草稿。

图标源在 `public/app-icon.svg`，`npm run icons` 重新生成平台资源。macOS ICNS 使用1024透明画布和824主体，其他平台使用全幅图标。

## GitHub Pages 下载页

静态页面位于 `docs/`，版本和下载状态由 `docs/releases.json` 管理。只有真实公开的 Release 资产才启用下载按钮，校验值与安装包对应。

本地预览下载页：`npm run site:dev`，打开 `http://127.0.0.1:5180/`。启动后可用 `npm run site:check` 验证下载状态、语言和响应式布局。

页面先本地预览，审核后可手动运行 **Publish download page**。该工作流不因普通推送自动发布。

## 数据与安全边界

编辑与渲染在本机完成，无云同步。草稿使用当前应用/浏览器的 localStorage，受容量限制，不能替代文件备份。恢复文本不会恢复文件系统权限，需重新打开原文件或另存为。

文件树限制在已授权文件的父目录，阻止目录越界与符号链接逃逸。原生树/Finder 读取 UTF-8（含 BOM）Markdown，最大20 MiB；仅授予具体打开文件的写入权限。原始 HTML 默认禁用，危险链接协议被阻止；外链图片可能向图片来源发送网络请求。

应用内部标识沿用旧名称，以兼容已有草稿、偏好和文件关联。原生冷启动和超大文档性能尚未做基准测试。
