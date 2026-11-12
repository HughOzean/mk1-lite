import MarkdownIt from "markdown-it";
import "./cheatsheet.css";

interface CheatsheetOptions {
  t: (key: string) => string;
  getLocale?: () => string;
}
const messages = {
  en: [
    "Syntax",
    "Result",
    "Close",
    "Headings",
    "Bold",
    "Italic",
    "Strikethrough",
    "Link",
    "Image",
    "Blockquote",
    "Unordered list",
    "Ordered list",
    "Inline code",
    "Code block",
    "Table",
    "Horizontal rule",
    "Line break",
    "Text",
    "Item",
    "Column",
    "Value",
    "A newline normally stays in the same paragraph. Use two trailing spaces for a hard break, or enable soft line breaks in Settings.",
    "Examples only. Nothing here changes your document.",
  ],
  zh: [
    "语法",
    "显示效果",
    "关闭",
    "标题",
    "加粗",
    "斜体",
    "删除线",
    "链接",
    "图片",
    "引用",
    "无序列表",
    "有序列表",
    "行内代码",
    "代码块",
    "表格",
    "分隔线",
    "换行",
    "文字",
    "项目",
    "列",
    "内容",
    "普通换行默认仍属于同一段落。行尾添加两个空格可强制换行，也可在设置中开启软换行渲染。",
    "仅供查阅，不会修改当前文档。",
  ],
  pt: [
    "Sintaxe",
    "Resultado",
    "Fechar",
    "Títulos",
    "Negrito",
    "Itálico",
    "Tachado",
    "Link",
    "Imagem",
    "Citação",
    "Lista não ordenada",
    "Lista ordenada",
    "Código em linha",
    "Bloco de código",
    "Tabela",
    "Separador",
    "Quebra de linha",
    "Texto",
    "Item",
    "Coluna",
    "Valor",
    "Uma nova linha normalmente continua no mesmo parágrafo. Use dois espaços finais para uma quebra ou ative quebras suaves nas configurações.",
    "Apenas exemplos. Seu documento não será alterado.",
  ],
  fr: [
    "Syntaxe",
    "Résultat",
    "Fermer",
    "Titres",
    "Gras",
    "Italique",
    "Barré",
    "Lien",
    "Image",
    "Citation",
    "Liste à puces",
    "Liste numérotée",
    "Code en ligne",
    "Bloc de code",
    "Tableau",
    "Séparateur",
    "Saut de ligne",
    "Texte",
    "Élément",
    "Colonne",
    "Valeur",
    "Un retour à la ligne reste normalement dans le même paragraphe. Ajoutez deux espaces en fin de ligne ou activez les sauts de ligne souples dans les réglages.",
    "Exemples uniquement. Votre document ne sera pas modifié.",
  ],
  de: [
    "Syntax",
    "Ergebnis",
    "Schließen",
    "Überschriften",
    "Fett",
    "Kursiv",
    "Durchgestrichen",
    "Link",
    "Bild",
    "Zitat",
    "Ungeordnete Liste",
    "Nummerierte Liste",
    "Inline-Code",
    "Codeblock",
    "Tabelle",
    "Trennlinie",
    "Zeilenumbruch",
    "Text",
    "Eintrag",
    "Spalte",
    "Wert",
    "Ein einfacher Zeilenumbruch bleibt normalerweise im selben Absatz. Zwei Leerzeichen am Zeilenende erzeugen einen Umbruch; alternativ weiche Umbrüche in den Einstellungen aktivieren.",
    "Nur Beispiele. Ihr Dokument wird nicht verändert.",
  ],
  ru: [
    "Синтаксис",
    "Результат",
    "Закрыть",
    "Заголовки",
    "Жирный",
    "Курсив",
    "Зачёркнутый",
    "Ссылка",
    "Изображение",
    "Цитата",
    "Маркированный список",
    "Нумерованный список",
    "Код в строке",
    "Блок кода",
    "Таблица",
    "Разделитель",
    "Перенос строки",
    "Текст",
    "Пункт",
    "Столбец",
    "Значение",
    "Обычный перенос строки остаётся в том же абзаце. Добавьте два пробела в конце строки или включите мягкие переносы в настройках.",
    "Только примеры. Текущий документ не изменится.",
  ],
} as const;
type Locale = keyof typeof messages;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

/** An offline reference card; opening it never edits or sends document content. */
export function createCheatsheet({ t, getLocale }: CheatsheetOptions) {
  const dialog = document.createElement("dialog");
  dialog.id = "markdown-cheatsheet";
  dialog.className = "markdown-cheatsheet";
  dialog.setAttribute("aria-labelledby", "cheatsheet-title");
  dialog.innerHTML = `<header class="cheatsheet-header"><h2 id="cheatsheet-title">Markdown cheatsheet</h2><button type="button" class="cheatsheet-close">×</button></header><div class="cheatsheet-content"></div>`;
  document.body.append(dialog);
  const closeButton =
    dialog.querySelector<HTMLButtonElement>(".cheatsheet-close")!;
  let previousFocus: HTMLElement | null = null;
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
    breaks: false,
  });
  let imageLabel = "Image";
  md.renderer.rules.image = () =>
    `<span class="cheatsheet-image" role="img" aria-label="${escape(imageLabel)}"><svg viewBox="0 0 64 38" fill="none" aria-hidden="true"><rect x="1" y="1" width="62" height="36" rx="4" stroke="currentColor"/><circle cx="46" cy="12" r="4" fill="currentColor"/><path d="m5 32 17-19 13 14 8-9 16 14" stroke="currentColor" stroke-width="2"/></svg><span>${escape(imageLabel)}</span></span>`;

  function refresh() {
    const selected = getLocale?.() || document.documentElement.lang || "en";
    const locale: Locale = Object.hasOwn(messages, selected)
      ? (selected as Locale)
      : "en";
    dialog.querySelector("#cheatsheet-title")!.textContent =
      locale === "zh" ? "Markdown语法表" : "Markdown cheatsheet";
    const m = messages[locale];
    const [
      syntax,
      result,
      close,
      heading,
      bold,
      italic,
      strike,
      link,
      image,
      quote,
      unordered,
      ordered,
      inline,
      block,
      table,
      rule,
      linebreak,
      text,
      item,
      column,
      value,
      breakNote,
      note,
    ] = m;
    imageLabel = image;
    closeButton.title = close || t("close");
    closeButton.setAttribute("aria-label", closeButton.title);
    const rows: { label: string; source: string }[] = [
      ...[1, 2, 3, 4, 5].map((level) => ({
        label: `${heading} H${level}`,
        source: `${"#".repeat(level)} ${heading} ${level}`,
      })),
      { label: bold, source: `**${text}**` },
      { label: italic, source: `*${text}*` },
      { label: strike, source: `~~${text}~~` },
      { label: link, source: `[${link}](#section)` },
      { label: image, source: `![${image}](image.png)` },
      { label: quote, source: `> ${text}` },
      { label: unordered, source: `- ${item} 1\n- ${item} 2` },
      { label: ordered, source: `1. ${item} 1\n2. ${item} 2` },
      { label: inline, source: "`const x = 1`" },
      { label: block, source: "```js\nconst x = 1;\n```" },
      {
        label: table,
        source: `| ${column} 1 | ${column} 2 |\n| --- | --- |\n| ${value} A | ${value} B |`,
      },
      { label: rule, source: "---" },
      { label: linebreak, source: `${text} 1  \n${text} 2` },
    ];
    dialog.querySelector(".cheatsheet-content")!.innerHTML =
      `<p class="cheatsheet-note">${escape(note)}</p><table class="cheatsheet-reference"><thead><tr><th scope="col">${escape(syntax)}</th><th scope="col">${escape(result)}</th></tr></thead><tbody>${rows.map((row) => `<tr><td><span class="cheatsheet-label">${escape(row.label)}</span><pre class="cheatsheet-source"><code>${escape(row.source)}</code></pre></td><td class="cheatsheet-result">${md.render(row.source)}</td></tr>`).join("")}</tbody></table><p class="cheatsheet-break-note">${escape(breakNote)}</p>`;
  }
  function close() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener("close", () => {
    if (previousFocus?.isConnected)
      previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  });
  closeButton.addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("a")) event.preventDefault();
  });
  function open() {
    refresh();
    if (dialog.open) {
      closeButton.focus();
      return;
    }
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    dialog.querySelector(".cheatsheet-content")!.scrollTop = 0;
    closeButton.focus({ preventScroll: true });
  }
  return { open, close, refresh };
}
