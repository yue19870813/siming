import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { createDemoProject } from "../model/demo";
import { useEditorStore } from "../store/editorStore";
import { CreationDialog } from "./CreationDialog";
import { collectDialogueDirectories } from "../lib/dialogueCreation";

beforeEach(() => useEditorStore.getState().setProject(createDemoProject()));

test("stages a subdirectory and creates a named dialogue as one undoable operation", () => {
  const before = structuredClone(useEditorStore.getState().project);
  const created = vi.fn();
  render(
    <CreationDialog
      type="dialogue"
      initialDirectory="dialogues"
      onClose={() => {}}
      onCreated={created}
    />,
  );
  fireEvent.click(screen.getByText("新建子目录"));
  fireEvent.change(screen.getByLabelText("子目录名称"), {
    target: { value: "chapter" },
  });
  fireEvent.click(screen.getByText("添加目录"));
  expect(useEditorStore.getState().project).toEqual(before);
  fireEvent.change(screen.getByLabelText("对话名称"), {
    target: { value: " 雨夜 " },
  });
  fireEvent.click(screen.getByText("创建"));
  expect(created).toHaveBeenCalledWith("dialogues/chapter");
  expect(useEditorStore.getState().project.dialogues.at(-1)?.name).toBe("雨夜");
  expect(
    useEditorStore.getState().project.manifest.dialogues.at(-1)?.path,
  ).toBe("dialogues/chapter/dialogue-2.json");
  act(() => useEditorStore.getState().undo());
  expect(useEditorStore.getState().project).toEqual(before);
});

test("cancel does not create staged directories and focus stays within the modal", () => {
  const close = vi.fn();
  const before = useEditorStore.getState().project;
  render(
    <CreationDialog
      type="dialogue"
      initialDirectory="dialogues"
      onClose={close}
      onCreated={() => {}}
    />,
  );
  fireEvent.click(screen.getByText("新建子目录"));
  fireEvent.change(screen.getByLabelText("子目录名称"), {
    target: { value: "unused" },
  });
  fireEvent.click(screen.getByText("添加目录"));
  const last = screen.getByText("创建");
  last.focus();
  fireEvent.keyDown(last, { key: "Tab" });
  expect(screen.getByLabelText("搜索目录")).toHaveFocus();
  fireEvent.keyDown(screen.getByLabelText("搜索目录"), { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
  expect(useEditorStore.getState().project).toBe(before);
});

test("search retains ancestors and directory creation rejects conflicts and traversal", () => {
  act(() =>
    useEditorStore.getState().addDialogueDirectory("dialogues/one/two"),
  );
  render(
    <CreationDialog
      type="directory"
      initialDirectory="dialogues"
      onClose={() => {}}
      onCreated={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("搜索目录"), {
    target: { value: "two" },
  });
  expect(
    screen.getByRole("treeitem", { name: "dialogues" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: "one" })).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: "two" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("目录名称"), {
    target: { value: "one" },
  });
  fireEvent.click(screen.getByText("创建"));
  expect(screen.getByRole("alert")).toHaveTextContent("冲突");
  fireEvent.change(screen.getByLabelText("目录名称"), {
    target: { value: "../outside" },
  });
  fireEvent.click(screen.getByText("创建"));
  expect(screen.getByRole("alert")).toHaveTextContent("有效");
});

test("custom roots, implicit ancestors, unique keys and file conflicts are handled in the store", () => {
  const project = createDemoProject();
  project.manifest.paths.dialogues = "stories/";
  project.manifest.dialogueDirectories = [];
  project.manifest.dialogues[0].path = "stories/one/two/intro.json";
  useEditorStore.getState().setProject(project);
  expect(collectDialogueDirectories(project)).toEqual([
    "stories",
    "stories/one",
    "stories/one/two",
  ]);
  const first = useEditorStore.getState().addDialogue();
  const second = useEditorStore.getState().addDialogue();
  if (!first.ok || !second.ok) throw new Error("creation failed");
  useEditorStore.getState().deleteDialogue(first.id!);
  const next = useEditorStore.getState().addDialogue();
  expect(next.ok).toBe(true);
  const keys = useEditorStore
    .getState()
    .project.dialogues.map((item) => item.key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const path of [
    "/stories/absolute",
    "stories/../outside",
    "stories/one/two/intro.json/child",
    "stories/one",
    "stories/bad:name",
  ]) {
    expect(useEditorStore.getState().addDialogueDirectory(path).ok).toBe(false);
  }
});
