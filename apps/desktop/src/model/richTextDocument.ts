import type { JSONContent } from "@tiptap/core";
import {
  normalizeText,
  textRuns,
  type TextContent,
  type TextRun,
} from "./richText";
export function documentFromText(value: TextContent): JSONContent {
  const content: JSONContent[] = [];
  for (const run of textRuns(value)) {
    const marks = [
      ...(run.style?.bold ? [{ type: "bold" }] : []),
      ...(run.style?.italic ? [{ type: "italic" }] : []),
      ...(run.style?.color
        ? [{ type: "textStyle", attrs: { color: run.style.color } }]
        : []),
    ];
    run.text.split("\n").forEach((text, index) => {
      if (index) content.push({ type: "hardBreak", marks });
      if (text) content.push({ type: "text", text, marks });
    });
  }
  return { type: "doc", content: [{ type: "paragraph", content }] };
}
export function textFromDocument(document: JSONContent): TextContent {
  const runs: TextRun[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "text" || node.type === "hardBreak") {
      const style: NonNullable<TextRun["style"]> = {};
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") style.bold = true;
        if (mark.type === "italic") style.italic = true;
        if (mark.type === "textStyle") style.color = mark.attrs?.color;
      }
      runs.push({
        text: node.type === "hardBreak" ? "\n" : (node.text ?? ""),
        style,
      });
    } else node.content?.forEach(walk);
  };
  document.content?.forEach((node, index) => {
    if (index) runs.push({ text: "\n" });
    walk(node);
  });
  return normalizeText(runs);
}
