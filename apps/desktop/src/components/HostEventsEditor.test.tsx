import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createDemoProject } from "../model/demo";
import { hasInvalidHostDraft } from "../lib/hostDraftGuard";
import { useEditorStore } from "../store/editorStore";
import { Inspector } from "./Inspector";

beforeEach(() => {
  const project = createDemoProject();
  project.dialogues[0].nodes[0].data.hostEvents = [
    { name: "ui.first", payload: {} },
    { name: "ui.second", payload: { keep: true } },
  ];
  useEditorStore.getState().setProject(project);
  useEditorStore.getState().setSelectedNode(project.dialogues[0].nodes[0].id);
  render(
    <Inspector width={320} onResizeBy={() => {}} onResizeStart={() => {}} />,
  );
});
afterEach(() => vi.restoreAllMocks());
const events = () =>
  useEditorStore.getState().project.dialogues[0].nodes[0].data.hostEvents!;

test("keeps input mounted during continuous and composition name edits", () => {
  const input = screen.getByLabelText("消息名称 1");
  input.focus();
  for (const value of ["u", "ui", "ui.", "ui.open"]) {
    fireEvent.change(input, { target: { value } });
    expect(screen.getByLabelText("消息名称 1")).toBe(input);
    expect(input).toHaveFocus();
  }
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "ui.打开" } });
  fireEvent.compositionEnd(input);
  expect(events()[0].name).toBe("ui.打开");
  expect(input).toHaveFocus();
});

test("keeps incomplete text and whitespace, commits only JSON objects", () => {
  const input = screen.getByLabelText("消息体 1");
  input.focus();
  for (const text of ['{\n "name":', "[]", "null", "42", '"text"']) {
    fireEvent.change(input, { target: { value: text } });
    expect(input).toHaveValue(text);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(events()[0].payload).toEqual({});
    expect(hasInvalidHostDraft()).toBe(true);
  }
  const text = '{\n  "name": "中文",\n  "nested": {"items": [1, true]}\n}\n';
  fireEvent.change(input, { target: { value: text } });
  expect(input).toHaveValue(text);
  expect(input).toHaveFocus();
  expect(events()[0].payload).toEqual(JSON.parse(text));
  expect(hasInvalidHostDraft()).toBe(false);
});

test("draft identity survives reordering and removal of another message", () => {
  const input = screen.getByLabelText("消息体 1");
  fireEvent.change(input, { target: { value: '{"draft":' } });
  fireEvent.click(screen.getAllByLabelText("下移消息")[0]);
  expect(screen.getByLabelText("消息体 2")).toBe(input);
  expect(input).toHaveValue('{"draft":');
  expect(events().map((event) => event.name)).toEqual([
    "ui.second",
    "ui.first",
  ]);
  fireEvent.click(screen.getAllByLabelText("删除消息")[0]);
  expect(screen.getByLabelText("消息体 1")).toBe(input);
  fireEvent.click(screen.getByText("还原"));
  expect(input).toHaveValue("{}");
  expect(hasInvalidHostDraft()).toBe(false);
});

test("blocks navigation and history until invalid drafts are explicitly discarded", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.change(screen.getByLabelText("消息体 1"), {
    target: { value: "{" },
  });
  const original = useEditorStore.getState();
  act(() => {
    original.setSelectedNode(null);
    original.setViewMode("table");
    original.setActivity("characters");
    original.undo();
    original.addNode("end");
  });
  expect(useEditorStore.getState().selectedNodeId).toBe(
    original.selectedNodeId,
  );
  expect(useEditorStore.getState().viewMode).toBe("canvas");
  expect(useEditorStore.getState().activity).toBe("project");
  expect(useEditorStore.getState().project).toBe(original.project);
  confirm.mockReturnValue(true);
  act(() => original.setSelectedNode(null));
  expect(useEditorStore.getState().selectedNodeId).toBeNull();
  expect(hasInvalidHostDraft()).toBe(false);
});

test("unrelated node position changes preserve invalid drafts without prompting", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.change(screen.getByLabelText("消息体 1"), {
    target: { value: "{" },
  });
  act(() =>
    useEditorStore.getState().commit("移动节点", (draft) => {
      draft.dialogues[0].nodes[0].position.x += 10;
    }),
  );
  expect(confirm).not.toHaveBeenCalled();
  expect(screen.getByLabelText("消息体 1")).toHaveValue("{");
  act(() =>
    useEditorStore.getState().commit("替换消息", (draft) => {
      draft.dialogues[0].nodes[0].data.hostEvents = [];
    }),
  );
  expect(confirm).toHaveBeenCalledOnce();
  expect(events()).toHaveLength(2);
});
