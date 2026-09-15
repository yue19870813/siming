import { expect, test } from "vitest";
import { normalizeText, plainText, type TextContent } from "./richText";
import { documentFromText, textFromDocument } from "./richTextDocument";

test("normalization collapses plain runs and merges adjacent identical styles", () => {
  expect(
    normalizeText([
      { text: "" },
      { text: "a", style: { bold: false } },
      { text: "b" },
    ]),
  ).toBe("ab");
  expect(
    normalizeText([
      { text: "中", style: { color: "#abcdef", bold: true } },
      { text: "文", style: { bold: true, color: "#ABCDEF" } },
    ]),
  ).toEqual({
    version: 1,
    runs: [{ text: "中文", style: { bold: true, color: "#ABCDEF" } }],
  });
});
test("editor document round trips mixed styles, literal tags and styled newlines", () => {
  const value: TextContent = {
    version: 1,
    runs: [
      { text: "<b>literal</b>\n" },
      {
        text: "中文\n粗斜",
        style: { bold: true, italic: true, color: "#123ABC" },
      },
      { text: "\nend" },
    ],
  };
  expect(textFromDocument(documentFromText(value))).toEqual(value);
  expect(plainText(value)).toBe("<b>literal</b>\n中文\n粗斜\nend");
});
test("paragraph boundaries retain blank lines", () => {
  expect(
    textFromDocument({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    }),
  ).toBe("a\n\nb");
});
