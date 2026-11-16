import { plainText } from "../model/richText";
import type { DialogueNode } from "../model/types";

export type CanvasFindMode = "project" | "text" | "speaker";

export function normalizeFindText(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function nodeSearchText(node: DialogueNode) {
  return Object.values(node.data.text ?? {})
    .map(plainText)
    .filter(Boolean)
    .join(" ");
}

export function findMatchingNodeIds(
  nodes: DialogueNode[],
  mode: CanvasFindMode,
  query: string,
  speakerKey: string | null,
) {
  if (mode === "text") {
    const needle = normalizeFindText(query);
    if (!needle) return new Set<string>();
    return new Set(
      nodes
        .filter((node) =>
          normalizeFindText(nodeSearchText(node)).includes(needle),
        )
        .map((node) => node.id),
    );
  }

  if (mode === "speaker" && speakerKey !== null) {
    return new Set(
      nodes
        .filter(
          (node) =>
            node.type === "dialogue" &&
            (speakerKey === ""
              ? !node.data.speakerId
              : node.data.speakerId === speakerKey),
        )
        .map((node) => node.id),
    );
  }

  return new Set<string>();
}
