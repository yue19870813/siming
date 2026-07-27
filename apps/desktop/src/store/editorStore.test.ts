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

test("a new node uses the current canvas center and is selected", () => {
  const insertionPosition = { x: 640, y: 360 };
  useEditorStore.getState().setCanvasInsertionPosition(insertionPosition);
  useEditorStore.getState().addNode("dialogue");

  const state = useEditorStore.getState();
  const dialogue = state.project.dialogues.find(
    (item) => item.id === state.selectedDialogueId,
  );
  const node = dialogue?.nodes.find((item) => item.id === state.selectedNodeId);

  expect(node?.position).toEqual(insertionPosition);
  expect(state.selectedNodeId).toBe(node?.id);
});

test("copy and paste duplicates a selected node with new identities", () => {
  const originalState = useEditorStore.getState();
  const dialogue = originalState.project.dialogues[0];
  const original = dialogue.nodes.find((node) => node.type === "choice");
  expect(original).toBeDefined();
  originalState.setSelectedNode(original!.id);

  useEditorStore.getState().copySelectedNode();
  useEditorStore.getState().pasteCopiedNode();

  const state = useEditorStore.getState();
  const updatedDialogue = state.project.dialogues[0];
  const pasted = updatedDialogue.nodes.find(
    (node) => node.id === state.selectedNodeId,
  );

  expect(pasted).toBeDefined();
  expect(pasted?.id).not.toBe(original?.id);
  expect(pasted?.key).toBe(`${original?.key}-copy`);
  expect(pasted?.position).toEqual({
    x: original!.position.x + 32,
    y: original!.position.y + 32,
  });
  expect(pasted?.data.choices?.map((choice) => choice.id)).not.toEqual(
    original?.data.choices?.map((choice) => choice.id),
  );
  expect(state.notice).toBe(`已粘贴节点：${pasted?.key}`);
});

test("deleting a node persists when another node is moved", () => {
  const initialState = useEditorStore.getState();
  const dialogue = initialState.project.dialogues[0];
  const deleted = dialogue.nodes.find(
    (node) => node.id !== dialogue.entryNodeId,
  );
  const moved = dialogue.nodes.find(
    (node) => node.id !== dialogue.entryNodeId && node.id !== deleted?.id,
  );
  expect(deleted).toBeDefined();
  expect(moved).toBeDefined();
  initialState.setSelectedNode(deleted!.id);

  useEditorStore.getState().deleteNodes([deleted!.id]);
  useEditorStore.getState().commit("移动节点", (draft) => {
    const node = draft.dialogues[0].nodes.find((item) => item.id === moved!.id);
    if (node) node.position = { x: 777, y: 555 };
  });

  const state = useEditorStore.getState();
  const updatedDialogue = state.project.dialogues[0];
  expect(updatedDialogue.nodes.some((node) => node.id === deleted!.id)).toBe(
    false,
  );
  expect(
    updatedDialogue.edges.some(
      (edge) =>
        edge.sourceNodeId === deleted!.id || edge.targetNodeId === deleted!.id,
    ),
  ).toBe(false);
  expect(state.selectedNodeId).toBeNull();
  expect(
    updatedDialogue.nodes.find((node) => node.id === moved!.id)?.position,
  ).toEqual({ x: 777, y: 555 });
});

test("the dialogue entry node cannot be deleted", () => {
  const dialogue = useEditorStore.getState().project.dialogues[0];

  useEditorStore.getState().deleteNodes([dialogue.entryNodeId]);

  const state = useEditorStore.getState();
  expect(
    state.project.dialogues[0].nodes.some(
      (node) => node.id === dialogue.entryNodeId,
    ),
  ).toBe(true);
  expect(state.notice).toBe("入口节点不能直接删除，请先修改对话入口。");
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
