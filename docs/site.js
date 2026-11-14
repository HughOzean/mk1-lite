const strings = {
  zh: {
    skip: "跳转到下载",
    download: "下载",
    features: "功能",
    faq: "常见问题",
    free: "免费使用",
    local: "本地优先",
    heroSubtitle: "轻量的 Markdown 编辑器。",
    description:
      "打开文件，写下内容，即时预览。多文档标签、清晰的大纲和可自定义的快捷键，放在一个简单的工作空间里。",
    getApp: "下载应用",
    source: "查看源码",
    noAccount: "无需账户。无需把文档上传到云端。",
    illustration: "界面示意",
    files: "文件",
    outline: "大纲",
    preview: "预览",
    editor: "编辑",
    downloadEyebrow: "选择你的平台",
    downloadTitle: "下载 Mk.1 Lite",
    allReleases: "全部版本",
    macMinimum: "macOS 11 或更新版本",
    windowsArch: "64 位安装程序",
    macSigning: "本地测试签名，尚未进行 Apple 公证。",
    windowsSigning: "未使用代码签名证书；Windows 可能显示安全提示。",
    copyHash: "复制校验值",
    copied: "已复制",
    copyFailed: "请选择并复制上方校验值",
    releaseLoading: "正在读取版本信息。",
    releaseError: "暂时无法读取版本信息，请访问 GitHub Releases。",
    releaseReady: "安装包托管在 GitHub Releases。下载前请确认你的设备架构。",
    releasePending: "Windows 安装包正在构建，完成后会显示下载入口。",
    downloadMac: "下载 macOS ARM64",
    downloadWindows: "下载 Windows x64",
    pendingMac: "安装包待发布",
    pendingWindows: "构建中",
    loading: "正在读取版本信息…",
    featuresEyebrow: "把常用功能做好",
    featuresTitle: "从打开文件，到写完一篇。",
    featureTabsTitle: "多文档，各自保留状态",
    featureTabsBody:
      "在标签间切换，保留每份文档的编辑内容、撤销记录、光标和折叠状态。右键可关闭全部或右侧标签。",
    featureViewTitle: "编辑与预览，随时切换",
    featureViewBody:
      "支持标题、表格、代码块、列表与引用。调整预览字体、字号、行高和宽度，让阅读符合你的习惯。",
    featureNavigateTitle: "文件树与大纲，找到当前内容",
    featureNavigateBody:
      "浏览当前文档所在文件夹，或切换到标题大纲。独立搜索替换窗口提供正则、全字与大小写选项。",
    featureKeysTitle: "快捷键，按你的方式设置",
    featureKeysBody:
      "自定义模式切换与前后标签快捷键。需要查语法时，点开 Markdown 语法表即可。",
    installEyebrow: "开始使用",
    installTitle: "几步安装，就可以开始写。",
    macStep1: "保存文档并退出旧版，打开下载的 DMG。",
    macStep2: "将 Mk.1 Lite 拖入 Applications，从该位置启动。",
    macStep3: "如需默认打开 Markdown，在设置的“文件关联”中启用。",
    winStep1: "下载 x64 安装程序，确认来源和校验值。",
    winStep2: "运行安装程序，按提示完成安装。",
    winStep3: "首次发布的安装包仍需要在 Windows 实机上验证。",
    faqFreeTitle: "需要账户或订阅吗？",
    faqFreeBody: "不需要。Mk.1 Lite 是免费、非盈利项目，打开后即可使用。",
    faqFilesTitle: "文档会上传到云端吗？",
    faqFilesBody:
      "编辑和预览在本机完成，没有云同步功能。Markdown 中引用的外链图片可能向图片来源发送请求。",
    faqDraftTitle: "自动恢复草稿等于保存文件吗？",
    faqDraftBody:
      "不等于。草稿保存在当前应用或浏览器的本地存储中，不能替代文件备份。重要内容请保存到文件。",
    faqPlatformsTitle: "支持哪些设备？",
    faqPlatformsBody:
      "当前提供 macOS Apple Silicon 版本，Windows x64 构建状态见上方下载区。Android 尚未发布。Mac 安装包使用临时签名，未做 Apple 公证。",
    faqIssueTitle: "遇到问题如何反馈？",
    faqIssueBody:
      "请到 GitHub Issues 提交系统版本、应用版本和复现步骤。提交示例时注意去掉私人文档内容。",
    openIssues: "打开 Issues ↗",
    footer: "一个简单的 Markdown 工具。",
  },
  en: {
    skip: "Skip to downloads",
    download: "Download",
    features: "Features",
    faq: "FAQ",
    free: "Free to use",
    local: "Local first",
    heroSubtitle: "A lightweight Markdown editor.",
    description:
      "Open a file, start writing, and preview as you go. Multiple document tabs, a clear outline, and customizable shortcuts in a straightforward workspace.",
    getApp: "Get the app",
    source: "View source",
    noAccount: "No account. No need to upload your documents.",
    illustration: "Interface illustration",
    files: "Files",
    outline: "Outline",
    preview: "Preview",
    editor: "Edit",
    downloadEyebrow: "CHOOSE YOUR PLATFORM",
    downloadTitle: "Download Mk.1 Lite",
    allReleases: "All releases",
    macMinimum: "macOS 11 or later",
    windowsArch: "64-bit installer",
    macSigning: "Ad-hoc signed test build. Not notarized by Apple.",
    windowsSigning:
      "No code-signing certificate. Windows may show a security prompt.",
    copyHash: "Copy checksum",
    copied: "Copied",
    copyFailed: "Select and copy the checksum above",
    releaseLoading: "Loading release information.",
    releaseError:
      "Release information is unavailable. Please visit GitHub Releases.",
    releaseReady:
      "Installers are hosted on GitHub Releases. Check your device architecture before downloading.",
    releasePending:
      "The Windows installer is being built. Its download will appear when available.",
    downloadMac: "Download macOS ARM64",
    downloadWindows: "Download Windows x64",
    pendingMac: "Release pending",
    pendingWindows: "Build in progress",
    loading: "Loading release information…",
    featuresEyebrow: "THE TOOLS YOU USE",
    featuresTitle: "From opening a file to finishing a document.",
    featureTabsTitle: "Multiple documents. Independent state.",
    featureTabsBody:
      "Switch tabs while keeping each document’s edits, undo history, cursor, and folds. Close all tabs or tabs to the right from the context menu.",
    featureViewTitle: "Edit and preview, on demand.",
    featureViewBody:
      "Headings, tables, code, lists, and quotes. Adjust preview fonts, text size, line height, and width to fit your reading preferences.",
    featureNavigateTitle: "Find your way with files and headings.",
    featureNavigateBody:
      "Browse the current document’s folder or switch to its heading outline. Search and replace in a separate window with regex, case, and whole-word options.",
    featureKeysTitle: "Shortcuts that work your way.",
    featureKeysBody:
      "Customize edit/preview and tab-switching shortcuts. Open the Markdown cheatsheet whenever you need a syntax reference.",
    installEyebrow: "GET STARTED",
    installTitle: "Install it. Open a file. Start writing.",
    macStep1: "Save your documents and quit the old version. Open the DMG.",
    macStep2: "Drag Mk.1 Lite into Applications and launch that copy.",
    macStep3:
      "To open Markdown files by default, use File Associations in Settings.",
    winStep1: "Download the x64 installer and check its source and checksum.",
    winStep2: "Run the installer and follow the installation steps.",
    winStep3:
      "The initial installer still needs testing on a real Windows device.",
    faqFreeTitle: "Do I need an account or subscription?",
    faqFreeBody:
      "No. Mk.1 Lite is a free, nonprofit project. Open the app and start using it.",
    faqFilesTitle: "Are my documents uploaded?",
    faqFilesBody:
      "Editing and previewing happen locally. There is no cloud sync. External images referenced in Markdown may send requests to their image hosts.",
    faqDraftTitle: "Is draft recovery the same as saving a file?",
    faqDraftBody:
      "No. Drafts live in this app’s or browser’s local storage and are not a file backup. Save important content to a file.",
    faqPlatformsTitle: "Which devices are supported?",
    faqPlatformsBody:
      "A macOS Apple Silicon build is available. Check the Windows x64 build status above. Android is not released. The Mac installer is ad-hoc signed and not notarized.",
    faqIssueTitle: "How can I report a problem?",
    faqIssueBody:
      "Use GitHub Issues with your OS version, app version, and reproduction steps. Remove private document contents from any examples.",
    openIssues: "Open Issues ↗",
    footer: "A straightforward tool for Markdown.",
  },
};
Object.assign(strings.zh, {
  macArchitecture: "芯片架构",
  downloadMacIntel: "下载 macOS Intel",
  macIntelSigning: "临时签名测试版，尚未进行 Apple 公证和 Intel 真机验收。",
  androidMinimum: "Android 8.0 或更新版本",
  androidBuild: "通用 APK · 调试测试版",
  androidSigning:
    "调试签名测试版，尚未完成真机全面验收；安装时需允许当前来源安装应用。",
  downloadAndroid: "下载 Android APK",
  pendingAndroid: "Android 安装包待发布",
  androidStep1: "下载 APK 并核对校验值，按系统提示允许当前来源安装应用。",
  androidStep2: "升级前将重要草稿保存为文件；草稿仅保存在本机，不能替代备份。",
  androidStep3:
    "如需默认打开 .md，在文件管理器选择“打开方式 → Mk.1 Lite → 始终”。不同文件管理器入口可能不同。",
  faqAndroidTitle: "安卓版如何打开文件和适配屏幕？",
  faqAndroidBody:
    "通过系统选择器打开文件，或授权文件夹后仅显示 .md。自动避开异形屏和系统栏，设置可增加顶部留白。部分文件提供器隐藏文件名或标错类型时，请使用应用内“打开”。当前为调试测试版，仍需真机验收。",
});
Object.assign(strings.en, {
  macArchitecture: "Chip architecture",
  downloadMacIntel: "Download macOS Intel",
  macIntelSigning:
    "Ad-hoc signed test build. Not notarized by Apple; Intel device testing is pending.",
  androidMinimum: "Android 8.0 or later",
  androidBuild: "Universal APK · Debug test build",
  androidSigning:
    "Debug-signed test build; full device acceptance testing is pending. Allow installation from the current source when prompted.",
  downloadAndroid: "Download Android APK",
  pendingAndroid: "Android release pending",
  androidStep1:
    "Download the APK, verify its checksum, and allow installation from the current source when prompted.",
  androidStep2:
    "Save important drafts to files before upgrading. Drafts are stored locally and are not a backup.",
  androidStep3:
    "To make .md files open by default, choose Open with → Mk.1 Lite → Always in your file manager. Menus vary by file manager.",
  faqAndroidTitle: "How does Android handle files and screen cutouts?",
  faqAndroidBody:
    "Open files with the system picker or authorize a folder and filter for .md files. Screen cutouts and system bars are avoided automatically; add extra top spacing in Settings. If a provider hides the filename or reports the wrong type, use Open inside the app. This debug test build still needs real-device acceptance testing.",
});
strings.zh.faqPlatformsBody =
  "提供 macOS Apple Silicon 和 Intel、Windows x64 与 Android 8.0+ 版本，各平台版本和验证状态见下载区。Mac 尚未进行 Apple 公证；安卓版为调试签名测试版。";
strings.en.faqPlatformsBody =
  "Builds are available for macOS Apple Silicon and Intel, Windows x64, and Android 8.0+. See each download card for its version and verification status. The Mac build is not notarized; Android is a debug-signed test build.";
let macPlatform = "macos";
let locale = "zh";
try {
  if (localStorage.getItem("mk1lite-site-language") === "en") locale = "en";
} catch {}
let release = null,
  loadFailed = false,
  previewOnly = false;
const t = (key) => strings[locale][key] || strings.en[key] || key;
function render() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  document.title =
    locale === "zh"
      ? "Mk.1 Lite — 轻量 Markdown 编辑器"
      : "Mk.1 Lite — Lightweight Markdown editor";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  const language = document.getElementById("language");
  language.textContent = locale === "zh" ? "EN" : "中文";
  language.setAttribute(
    "aria-label",
    locale === "zh" ? "Switch to English" : "切换到中文",
  );
  document
    .querySelector(".site-header nav")
    .setAttribute("aria-label", locale === "zh" ? "主导航" : "Main navigation");
  document
    .querySelector(".app-preview")
    .setAttribute(
      "aria-label",
      locale === "zh"
        ? "编辑与预览界面示意"
        : "Editing and preview interface illustration",
    );
  document.getElementById("preview-mode").textContent = t(
    previewOnly ? "editor" : "preview",
  );

  const macCard = document.querySelector('[data-platform="macos"]');
  macCard.querySelector("[data-mac-architecture]").textContent =
    macPlatform === "macos-intel" ? "Intel · x86_64" : "Apple Silicon · ARM64";
  macCard.querySelector(".signing-note").textContent = t(
    macPlatform === "macos-intel" ? "macIntelSigning" : "macSigning",
  );
  for (const cardPlatform of ["macos", "windows", "android"]) {
    const platform = cardPlatform === "macos" ? macPlatform : cardPlatform;
    const data = release?.platforms?.[platform] || {};
    const card = document.querySelector(`[data-platform="${cardPlatform}"]`);
    const tag = data.tag || release?.tag,
      version = data.version || release?.version;
    const validTag = typeof tag === "string" && /^[\w.-]+$/.test(tag);
    const available =
      !!release &&
      data.available === true &&
      validTag &&
      typeof data.asset === "string" &&
      /^[\w. -]+$/.test(data.asset) &&
      typeof data.sha256 === "string" &&
      /^[a-f0-9]{64}$/i.test(data.sha256);
    const anchor = card.querySelector(".download-button"),
      pending = card.querySelector(".pending-button");
    anchor.hidden = !available;
    pending.hidden = available;
    card.querySelector("[data-platform-version]").textContent =
      typeof version === "string" ? `v${version}` : "—";
    if (available) {
      anchor.href = `${release.repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(data.asset)}`;
      anchor.querySelector("[data-download-text]").textContent = t(
        {
          macos: "downloadMac",
          "macos-intel": "downloadMacIntel",
          windows: "downloadWindows",
          android: "downloadAndroid",
        }[platform],
      );
    } else {
      anchor.removeAttribute("href");
      pending.textContent = t(
        !release && !loadFailed
          ? "loading"
          : {
              macos: "pendingMac",
              "macos-intel": "pendingMac",
              windows: "pendingWindows",
              android: "pendingAndroid",
            }[platform],
      );
    }
    card.querySelector("[data-file-size]").textContent =
      Number.isFinite(data.bytes) && data.bytes > 0
        ? `${(data.bytes / 1048576).toFixed(1)} MiB`
        : "—";
    const checksum = card.querySelector(".checksum");
    checksum.hidden = !available;
    if (available) checksum.querySelector("code").textContent = data.sha256;
  }
  const status = document.getElementById("release-status");
  status.textContent = t(
    loadFailed
      ? "releaseError"
      : !release
        ? "releaseLoading"
        : !release.platforms.windows?.available
          ? "releasePending"
          : "releaseReady",
  );
}
const architectureTrigger = document.getElementById("mac-architecture");
const architectureMenu = document.getElementById("mac-architecture-options");
const architectureOptions = [
  ...architectureMenu.querySelectorAll("[data-architecture]"),
];
function closeArchitectureMenu(restoreFocus = false) {
  architectureMenu.hidden = true;
  architectureTrigger.setAttribute("aria-expanded", "false");
  if (restoreFocus) architectureTrigger.focus();
}
function openArchitectureMenu() {
  architectureMenu.hidden = false;
  architectureTrigger.setAttribute("aria-expanded", "true");
  architectureOptions
    .find((option) => option.dataset.architecture === macPlatform)
    .focus();
}
architectureTrigger.addEventListener("click", () => {
  if (architectureMenu.hidden) openArchitectureMenu();
  else closeArchitectureMenu();
});
architectureTrigger.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    openArchitectureMenu();
  }
});
architectureOptions.forEach((option) =>
  option.addEventListener("click", () => {
    macPlatform = option.dataset.architecture;
    document
      .getElementById("mac-architecture-value")
      .replaceChildren(option.firstElementChild.cloneNode(true));
    architectureOptions.forEach((item) =>
      item.setAttribute("aria-selected", String(item === option)),
    );
    closeArchitectureMenu(true);
    render();
  }),
);
architectureMenu.addEventListener("keydown", (event) => {
  const index = architectureOptions.indexOf(document.activeElement);
  const destinations = {
    ArrowDown: (index + 1) % architectureOptions.length,
    ArrowUp:
      (index - 1 + architectureOptions.length) % architectureOptions.length,
    Home: 0,
    End: architectureOptions.length - 1,
  };
  if (Object.hasOwn(destinations, event.key)) {
    event.preventDefault();
    architectureOptions[destinations[event.key]].focus();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeArchitectureMenu(true);
  }
});
const architecturePicker = architectureTrigger.closest(".architecture-picker");
document.addEventListener("pointerdown", (event) => {
  if (!architecturePicker.contains(event.target)) closeArchitectureMenu();
});
architecturePicker.addEventListener("focusout", (event) => {
  if (!architecturePicker.contains(event.relatedTarget))
    closeArchitectureMenu();
});
document.getElementById("language").addEventListener("click", () => {
  locale = locale === "zh" ? "en" : "zh";
  try {
    localStorage.setItem("mk1lite-site-language", locale);
  } catch {}
  render();
});
document.getElementById("preview-mode").addEventListener("click", () => {
  previewOnly = !previewOnly;
  document.querySelector(".app-preview").dataset.mode = previewOnly
    ? "preview"
    : "split";
  render();
});
document.querySelectorAll("[data-copy-hash]").forEach((button) =>
  button.addEventListener("click", async () => {
    const value = button.closest(".checksum").querySelector("code").textContent;
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = t("copied");
    } catch {
      button.textContent = t("copyFailed");
    }
  }),
);
render();
fetch(new URL("./releases.json", document.baseURI), { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error("Unavailable");
    return response.json();
  })
  .then((data) => {
    if (
      typeof data.version !== "string" ||
      typeof data.tag !== "string" ||
      !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(data.repository) ||
      !data.platforms?.macos ||
      !data.platforms?.windows
    )
      throw new Error("Invalid manifest");
    data.repository = data.repository.replace(/\/$/, "");
    release = data;
    document
      .querySelectorAll("[data-version]")
      .forEach((el) => (el.textContent = `v${data.version}`));
    document
      .querySelectorAll("[data-repository]")
      .forEach((el) => (el.href = data.repository));
    document.getElementById("releases-link").href =
      `${data.repository}/releases`;
    document.getElementById("issues-link").href = `${data.repository}/issues`;
    render();
  })
  .catch(() => {
    loadFailed = true;
    render();
  });
