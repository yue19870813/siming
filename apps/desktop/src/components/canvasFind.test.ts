import { expect, test } from "vitest";
import { createNode } from "../model/demo";
import { findMatchingNodeIds } from "./canvasFind";

test("text find matches normalized substrings across localized rich text", () => {
  const first = createNode("dialogue", { x: 0, y: 0 });
  first.data.text = {
    "zh-CN": "门口原有的守卫继续守着",
    en: { version: 1, runs: [{ text: "The guard remains at the gate." }] },
  };
  const second = createNode("dialogue", { x: 0, y: 0 });
  second.data.text = { "zh-CN": "离开庭院" };

  expect(
    findMatchingNodeIds([first, second], "text", "  GUARD remains ", null),
  ).toEqual(new Set([first.id]));
  expect(
    findMatchingNodeIds([first, second], "text", "原有的守卫", null),
  ).toEqual(new Set([first.id]));
});

test("speaker find matches character keys and narrator dialogue nodes", () => {
  const first = createNode("dialogue", { x: 0, y: 0 });
  first.data.speakerId = "actor-duer";
  const second = createNode("dialogue", { x: 0, y: 0 });
  const condition = createNode("condition", { x: 0, y: 0 });
  condition.data.speakerId = "actor-duer";

  expect(
    findMatchingNodeIds(
      [first, second, condition],
      "speaker",
      "",
      "actor-duer",
    ),
  ).toEqual(new Set([first.id]));
  expect(
    findMatchingNodeIds([first, second, condition], "speaker", "", ""),
  ).toEqual(new Set([second.id]));
});
