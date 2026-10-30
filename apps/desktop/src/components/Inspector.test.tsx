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
  expect(input).toHaveTextContent("");
  expect(input).toHaveAttribute("data-placeholder", "输入对话内容…");
  fireEvent.focus(input);
  fireEvent.blur(input);
  expect(input).toHaveTextContent("");
  expect(useEditorStore.getState().dirty).toBe(false);
});

test("legacy default text clears on focus and becomes a placeholder", () => {
  const input = renderDialogue("输入对话内容…");
  fireEvent.focus(input);
  expect(input).toHaveTextContent("");
  fireEvent.blur(input);
  expect(input).toHaveAttribute("data-placeholder", "输入对话内容…");
});

test("focusing existing dialogue text never removes it", () => {
  const input = renderDialogue("已有的正文");
  fireEvent.focus(input);
  expect(input).toHaveTextContent("已有的正文");
  expect(useEditorStore.getState().dirty).toBe(false);
});

test.each(["dialogue", "condition"] as const)(
  "%s node alias can be set and cleared in the inspector",
  (type) => {
    const project = createDemoProject();
    const node = createNode(type, { x: 0, y: 0 });
    project.dialogues[0].nodes.push(node);
    useEditorStore.getState().setProject(project);
    useEditorStore.getState().setSelectedNode(node.id);
    render(
      <Inspector width={320} onResizeStart={() => {}} onResizeBy={() => {}} />,
    );

    const alias = screen.getByLabelText("别名");
    fireEvent.change(alias, { target: { value: "关键转折" } });
    expect(
      useEditorStore
        .getState()
        .project.dialogues[0].nodes.find((item) => item.id === node.id)?.alias,
    ).toBe("关键转折");
    expect(screen.getByText("关键转折")).toBeInTheDocument();
    fireEvent.change(alias, { target: { value: "" } });
    expect(
      useEditorStore
        .getState()
        .project.dialogues[0].nodes.find((item) => item.id === node.id)?.alias,
    ).toBeUndefined();
    expect(screen.getByText(node.key)).toBeInTheDocument();
  },
);
