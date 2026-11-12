import test from "node:test";
import assert from "node:assert/strict";
import { headings, render, wordCount } from "../src/document.ts";
import { languages, translate } from "../src/i18n.ts";
test("headings fold until the next peer or ancestor, excluding fenced code", () => {
  const text =
    "# One\nbody\n## Child\nchild\n```md\n# not a heading\n```\n## Peer\npeer\n# Two\nend";
  const hs = headings(text);
  assert.deepEqual(
    hs.map((h) => h.text),
    ["One", "Child", "Peer", "Two"],
  );
  assert.equal(text.slice(hs[0].end + 1).split("\n")[0], "# Two");
  assert.equal(text.slice(hs[1].end + 1).split("\n")[0], "## Peer");
  assert.equal(hs[3].end, text.length);
});
test("handles setext headings, empty input, and final headings", () => {
  assert.equal(headings("Title\n=====\nbody")[0].text, "Title");
  assert.deepEqual(headings(""), []);
  const h = headings("# Last")[0];
  assert.equal(h.to, h.end);
});
test("rendering escapes raw HTML and refuses unsafe link protocols", () => {
  const html = render("<script>alert(1)</script>\n\n[x](javascript:alert(1))");
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes("&lt;script&gt;"));
});
test("tables, heading anchors, strikethrough and soft line breaks render", () => {
  assert.ok(render("# A").includes('id="section-0"'));
  assert.ok(render("|a|b|\n|-|-|\n|1|2|").includes("<table>"));
  assert.ok(render("~~gone~~").includes("<s>"));
  assert.ok(render("a\nb", true).includes("<br>"));
  assert.ok(!render("a\nb", false).includes("<br>"));
});
test("word count handles Chinese and multilingual words", () => {
  assert.equal(wordCount("你好 world bonjour"), 4);
  assert.equal(wordCount("Привет мир"), 2);
  assert.equal(wordCount(""), 0);
});
test("all six locales have translations for the interface", () => {
  for (const locale of Object.keys(languages) as (keyof typeof languages)[]) {
    for (const key of [
      "save",
      "settings",
      "discard",
      "readTime",
      "table",
    ] as const) {
      assert.ok(translate(locale, key));
      assert.notEqual(translate(locale, key), key);
    }
  }
});

test("outline titles use readable text without inline Markdown delimiters", () => {
  assert.equal(
    headings("# **Hello** `world` [link](https://example.com)")[0].text,
    "Hello world link",
  );
});
