import { beforeEach, expect, test, vi } from "vitest";
import { createDemoProject } from "../model/demo";
import { useEditorStore } from "./editorStore";

beforeEach(() => {
  useEditorStore.getState().setProject(createDemoProject());
});

test("undoing to the saved snapshot clears dirty state", () => {
  const store = useEditorStore.getState();
  store.addNode("dialogue");
  expect(useEditorStore.getState().dirty).toBe(true);

  useEditorStore.getState().undo();
  expect(useEditorStore.getState().dirty).toBe(false);
});

test("markSaved establishes a new clean history point", () => {
  useEditorStore.getState().commit("rename", (draft) => {
    draft.manifest.name = "已保存名称";
  });
  useEditorStore.getState().markSaved();
  useEditorStore.getState().commit("rename again", (draft) => {
    draft.manifest.name = "未保存名称";
  });

  useEditorStore.getState().undo();
  expect(useEditorStore.getState().dirty).toBe(false);
  expect(useEditorStore.getState().project.manifest.name).toBe("已保存名称");
});

test("unapplied source draft blocks view switching until discarded", () => {
  useEditorStore.getState().setViewMode("data");
  useEditorStore
    .getState()
    .setSourceDraft(
      useEditorStore.getState().selectedDialogueId,
      "{ invalid",
      true,
    );
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

  useEditorStore.getState().setViewMode("table");
  expect(useEditorStore.getState().viewMode).toBe("data");
  expect(useEditorStore.getState().sourceDraftDirty).toBe(true);

  confirm.mockReturnValue(true);
  useEditorStore.getState().setViewMode("table");
  expect(useEditorStore.getState().viewMode).toBe("table");
  expect(useEditorStore.getState().sourceDraftDirty).toBe(false);
  confirm.mockRestore();
});
