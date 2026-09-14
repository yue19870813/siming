import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { createDemoProject, createNode } from "../model/demo";
import { useEditorStore } from "../store/editorStore";
import { Inspector } from "./Inspector";

function renderDialogue(text?: string) {
  const project = createDemoProject();
  const node = createNode("dialogue", { x: 0, y: 0 });
  if (text !== undefined) node.data.text = { "zh-CN": text };
  project.dialogues[0].nodes.push(node);
  useEditorStore.getState().setProject(project);
  useEditorStore.getState().setSelectedNode(node.id);
  render(
    <Inspector width={320} onResizeStart={() => {}} onResizeBy={() => {}} />,
  );
  return screen.getByLabelText("正文 · zh-CN");
}

test("new dialogue content is empty with a reusable placeholder", () => {
  const input = renderDialogue();
  expect(input).toHaveValue("");
  expect(input).toHaveAttribute("placeholder", "输入对话内容…");
  fireEvent.focus(input);
  fireEvent.blur(input);
  expect(input).toHaveValue("");
  expect(useEditorStore.getState().dirty).toBe(false);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "自己的正文" } });
  fireEvent.blur(input);
  fireEvent.focus(input);
  expect(input).toHaveValue("自己的正文");
  expect(
    useEditorStore.getState().project.dialogues[0].nodes.at(-1)?.data.text?.[
      "zh-CN"
    ],
  ).toBe("自己的正文");
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.blur(input);
  expect(input).toHaveValue("");
  expect(input).toHaveAttribute("placeholder", "输入对话内容…");
});

test("legacy default text clears on focus and becomes a placeholder", () => {
  const input = renderDialogue("输入对话内容…");
  fireEvent.focus(input);
  expect(input).toHaveValue("");
  fireEvent.blur(input);
  expect(input).toHaveAttribute("placeholder", "输入对话内容…");
});

test("focusing existing dialogue text never removes it", () => {
  const input = renderDialogue("已有的正文");
  fireEvent.focus(input);
  expect(input).toHaveValue("已有的正文");
  expect(useEditorStore.getState().dirty).toBe(false);
});
