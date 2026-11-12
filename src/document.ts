import MarkdownIt from "markdown-it";
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});
export interface Heading {
  text: string;
  level: number;
  line: number;
  from: number;
  to: number;
  end: number;
}
export function headings(source: string): Heading[] {
  const tokens = md.parse(source, {});
  const offsets = [0];
  for (let i = 0; i < source.length; i++)
    if (source[i] === "\n") offsets.push(i + 1);
  const result: Heading[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "heading_open" || !token.map) continue;
    const line = token.map[0];
    const next = source.indexOf("\n", offsets[line]);
    result.push({
      text:
        tokens[i + 1].children?.map((child) => child.content).join("") ||
        tokens[i + 1].content,
      level: Number(token.tag.slice(1)),
      line: line + 1,
      from: offsets[line],
      to: next < 0 ? source.length : next,
      end: source.length,
    });
  }
  result.forEach((h, i) => {
    const next = result.slice(i + 1).find((n) => n.level <= h.level);
    h.end = next ? Math.max(h.to, next.from - 1) : source.length;
  });
  return result;
}
export function render(source: string, breaks = false): string {
  md.set({ breaks });
  const env = {};
  const tokens = md.parse(source, env);
  let count = 0;
  for (const token of tokens)
    if (token.type === "heading_open")
      token.attrSet("id", `section-${count++}`);
  return md.renderer.render(tokens, md.options, env);
}
export function wordCount(source: string): number {
  const cjk =
    source.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ||
    [];
  return (
    cjk.length +
    (
      source
        .replace(
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,
          " ",
        )
        .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []
    ).length
  );
}
export const welcome = `# 少一点干扰，多一点思考。

欢迎使用 **Mk.1 Lite · 轻型马克1**。一个轻量、直接的 Markdown 工作空间。

在左侧写下想法，在右侧看见结果。一切从文字开始。

## 为专注而生

好的工具应该安静一点。没有复杂的菜单，也没有多余的装饰，只有你和正在写的内容。

- **即时预览** — 让排版跟上你的思路
- **标题折叠** — 收起细节，看清文档结构
- **本地优先** — 无需登录，草稿自动保存在本机
- **自由排版** — 按照你的习惯调整阅读体验

> 轻量不是少做一点，而是把重要的事做好。

## 从一个想法开始

Markdown 让你用简单的符号表达结构。试着修改左侧的内容，看看这里的变化。

### 一点代码

\`\`\`javascript
const idea = "Keep it light.";

function makeSomething() {
  return idea;
}
\`\`\`

### 一个清晰的计划

| 阶段 | 目标 | 状态 |
| :--- | :--- | :--- |
| 01 / 记录 | 捕捉零散的想法 | 已完成 |
| 02 / 整理 | 让内容有条理 | 进行中 |
| 03 / 分享 | 导出你的 Markdown | 待开始 |

## 按你的方式写作

点击右上角的设置，可以调整字体、字号、行高和内容宽度，也可以切换界面语言。

使用 **⌘ / Ctrl + S** 保存文件，**⌘ / Ctrl + F** 查找内容。

---

*Stay focused. Keep it light.*
`;
