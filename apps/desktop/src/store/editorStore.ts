import { create } from "zustand";
import { createId, createNode } from "../model/demo";
import type {
  Activity,
  DialogueDocument,
  DialogueNode,
  NodeType,
  ProjectSnapshot,
  ViewMode,
} from "../model/types";

type HistoryEntry = {
  label: string;
  project: ProjectSnapshot;
};

type EditorState = {
  project: ProjectSnapshot;
  projectLoaded: boolean;
  selectedDialogueId: string;
  selectedNodeId: string | null;
  copiedNode: DialogueNode | null;
  clipboardPasteCount: number;
  canvasInsertionPosition: { x: number; y: number };
  viewMode: ViewMode;
  activity: Activity;
  previewLocale: string;
  dirty: boolean;
  savedProjectFingerprint: string;
  sourceDraftDialogueId: string | null;
  sourceDraft: string;
  sourceDraftDirty: boolean;
  busy: boolean;
  notice: string;
  past: HistoryEntry[];
  future: HistoryEntry[];
  setProject: (project: ProjectSnapshot, dirty?: boolean) => void;
  setSelectedDialogue: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setCanvasInsertionPosition: (position: { x: number; y: number }) => void;
  setViewMode: (mode: ViewMode) => void;
  setActivity: (activity: Activity) => void;
  setPreviewLocale: (locale: string) => void;
  setSourceDraft: (
    dialogueId: string,
    sourceDraft: string,
    dirty: boolean,
  ) => void;
  clearSourceDraft: () => void;
  setBusy: (busy: boolean) => void;
  setNotice: (notice: string) => void;
  markSaved: () => void;
  commit: (label: string, recipe: (draft: ProjectSnapshot) => void) => void;
  undo: () => void;
  redo: () => void;
  copySelectedNode: () => void;
  pasteCopiedNode: () => void;
  addNode: (type: NodeType, position?: { x: number; y: number }) => void;
  deleteNodes: (ids: string[]) => void;
  addDialogue: (folder?: string) => void;
  deleteDialogue: (id: string) => void;
  closeProject: () => void;
};

const emptyProject = (): ProjectSnapshot => ({
  rootPath: "",
  manifest: {
    schemaVersion: 1,
    projectId: "",
    name: "",
    paths: {
      dialogues: "dialogues/",
      exports: "exports/runtime/",
    },
    defaultExportFormat: "json",
    defaultLocale: "zh-CN",
    locales: ["zh-CN"],
    dialogues: [],
  },
  dialogues: [],
  resources: {
    characters: [],
    variables: [],
    events: [],
    tags: [],
  },
});

const initialProject = emptyProject();
const fingerprint = (project: ProjectSnapshot) => JSON.stringify(project);

function copiedNodeKey(sourceKey: string, dialogue: DialogueDocument) {
  const keys = new Set(dialogue.nodes.map((node) => node.key));
  const base = `${sourceKey}-copy`;
  if (!keys.has(base)) return base;
  let sequence = 2;
  while (keys.has(`${base}-${sequence}`)) sequence += 1;
  return `${base}-${sequence}`;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: initialProject,
  projectLoaded: false,
  selectedDialogueId: "",
  selectedNodeId: null,
  copiedNode: null,
  clipboardPasteCount: 0,
  canvasInsertionPosition: { x: 180, y: 120 },
  viewMode: "canvas",
  activity: "welcome",
  previewLocale: initialProject.manifest.defaultLocale,
  dirty: false,
  savedProjectFingerprint: fingerprint(initialProject),
  sourceDraftDialogueId: null,
  sourceDraft: "",
  sourceDraftDirty: false,
  busy: false,
  notice: "欢迎使用司命。",
  past: [],
  future: [],

  setProject: (project, dirty = false) =>
    set({
      project,
      projectLoaded: true,
      selectedDialogueId: project.dialogues[0]?.id ?? "",
      selectedNodeId: null,
      canvasInsertionPosition: { x: 180, y: 120 },
      viewMode: "canvas",
      previewLocale: project.manifest.defaultLocale,
      dirty,
      savedProjectFingerprint: dirty ? "" : fingerprint(project),
      sourceDraftDialogueId: null,
      sourceDraft: "",
      sourceDraftDirty: false,
      past: [],
      future: [],
      activity: "project",
    }),
  setSelectedDialogue: (selectedDialogueId) => {
    const state = get();
    if (
      state.sourceDraftDirty &&
      !window.confirm("当前源 JSON 有未应用草稿，放弃草稿并切换对话吗？")
    )
      return;
    set({
      selectedDialogueId,
      selectedNodeId: null,
      viewMode: "canvas",
      sourceDraftDialogueId: null,
      sourceDraft: "",
      sourceDraftDirty: false,
    });
  },
  setSelectedNode: (selectedNodeId) => set({ selectedNodeId }),
  setCanvasInsertionPosition: (canvasInsertionPosition) =>
    set({ canvasInsertionPosition }),
  setViewMode: (viewMode) => {
    const state = get();
    if (
      state.viewMode === "data" &&
      viewMode !== "data" &&
      state.sourceDraftDirty &&
      !window.confirm("当前源 JSON 有未应用草稿，放弃草稿并切换视图吗？")
    )
      return;
    set({
      viewMode,
      ...(viewMode === "data"
        ? {}
        : {
            sourceDraftDialogueId: null,
            sourceDraft: "",
            sourceDraftDirty: false,
          }),
    });
  },
  setActivity: (activity) => {
    const state = get();
    if (
      activity !== state.activity &&
      state.sourceDraftDirty &&
      !window.confirm("当前源 JSON 有未应用草稿，放弃草稿并离开编辑器吗？")
    )
      return;
    set({
      activity,
      ...(activity === "project" || activity === "search"
        ? {}
        : {
            sourceDraftDialogueId: null,
            sourceDraft: "",
            sourceDraftDirty: false,
          }),
    });
  },
  setPreviewLocale: (previewLocale) => set({ previewLocale }),
  setSourceDraft: (sourceDraftDialogueId, sourceDraft, sourceDraftDirty) =>
    set({ sourceDraftDialogueId, sourceDraft, sourceDraftDirty }),
  clearSourceDraft: () =>
    set({
      sourceDraftDialogueId: null,
      sourceDraft: "",
      sourceDraftDirty: false,
    }),
  setBusy: (busy) => set({ busy }),
  setNotice: (notice) => set({ notice }),
  markSaved: () =>
    set((state) => ({
      dirty: false,
      savedProjectFingerprint: fingerprint(state.project),
      notice: "项目已保存。",
    })),

  commit: (label, recipe) => {
    const state = get();
    const before = structuredClone(state.project);
    const after = structuredClone(state.project);
    recipe(after);
    set({
      project: after,
      dirty: fingerprint(after) !== state.savedProjectFingerprint,
      past: [...state.past.slice(-49), { label, project: before }],
      future: [],
      notice: label,
    });
  },
  undo: () => {
    const state = get();
    const entry = state.past.at(-1);
    if (!entry) return;
    set({
      project: entry.project,
      past: state.past.slice(0, -1),
      future: [
        { label: entry.label, project: structuredClone(state.project) },
        ...state.future,
      ],
      dirty: fingerprint(entry.project) !== state.savedProjectFingerprint,
      selectedNodeId: null,
      notice: `已撤销：${entry.label}`,
    });
  },
  redo: () => {
    const state = get();
    const entry = state.future[0];
    if (!entry) return;
    set({
      project: entry.project,
      past: [
        ...state.past,
        { label: entry.label, project: structuredClone(state.project) },
      ],
      future: state.future.slice(1),
      dirty: fingerprint(entry.project) !== state.savedProjectFingerprint,
      selectedNodeId: null,
      notice: `已重做：${entry.label}`,
    });
  },
  copySelectedNode: () => {
    const state = get();
    const node = state.project.dialogues
      .find((dialogue) => dialogue.id === state.selectedDialogueId)
      ?.nodes.find((item) => item.id === state.selectedNodeId);
    if (!node) return;
    set({
      copiedNode: structuredClone(node),
      clipboardPasteCount: 0,
      notice: `已复制节点：${node.key}`,
    });
  },
  pasteCopiedNode: () => {
    const state = get();
    const dialogue = state.project.dialogues.find(
      (item) => item.id === state.selectedDialogueId,
    );
    if (!state.copiedNode || !dialogue) return;
    const pasteCount = state.clipboardPasteCount + 1;
    const node = structuredClone(state.copiedNode);
    node.id = createId();
    node.key = copiedNodeKey(node.key, dialogue);
    node.position = {
      x: node.position.x + pasteCount * 32,
      y: node.position.y + pasteCount * 32,
    };
    if (node.data.choices) {
      node.data.choices = node.data.choices.map((choice) => ({
        ...choice,
        id: createId(),
      }));
    }
    state.commit(`粘贴${node.type}节点`, (draft) => {
      draft.dialogues
        .find((item) => item.id === state.selectedDialogueId)
        ?.nodes.push(node);
    });
    set({
      selectedNodeId: node.id,
      clipboardPasteCount: pasteCount,
      notice: `已粘贴节点：${node.key}`,
    });
  },
  addNode: (type, position) => {
    const {
      selectedDialogueId,
      previewLocale,
      canvasInsertionPosition,
      commit,
    } = get();
    const node = createNode(
      type,
      position ?? canvasInsertionPosition,
      previewLocale,
    );
    commit(`新增${type}节点`, (draft) => {
      draft.dialogues
        .find((item) => item.id === selectedDialogueId)
        ?.nodes.push(node);
    });
    set({ selectedNodeId: node.id });
  },
  deleteNodes: (ids) => {
    const state = get();
    const dialogue = state.project.dialogues.find(
      (item) => item.id === state.selectedDialogueId,
    );
    if (!dialogue) return;

    const requestedIds = new Set(ids);
    const deletedIds = new Set(
      dialogue.nodes
        .filter(
          (node) =>
            requestedIds.has(node.id) && node.id !== dialogue.entryNodeId,
        )
        .map((node) => node.id),
    );
    if (deletedIds.size === 0) {
      if (requestedIds.has(dialogue.entryNodeId)) {
        set({ notice: "入口节点不能直接删除，请先修改对话入口。" });
      }
      return;
    }

    state.commit(
      deletedIds.size === 1 ? "删除节点" : `删除 ${deletedIds.size} 个节点`,
      (draft) => {
        const target = draft.dialogues.find(
          (item) => item.id === state.selectedDialogueId,
        );
        if (!target) return;
        target.nodes = target.nodes.filter((node) => !deletedIds.has(node.id));
        target.edges = target.edges.filter(
          (edge) =>
            !deletedIds.has(edge.sourceNodeId) &&
            !deletedIds.has(edge.targetNodeId),
        );
      },
    );
    if (state.selectedNodeId !== null && deletedIds.has(state.selectedNodeId)) {
      set({ selectedNodeId: null });
    }
  },
  addDialogue: (folder = "dialogues") => {
    const state = get();
    const id = createId();
    const start = createNode("start", { x: 100, y: 180 }, state.previewLocale);
    const end = createNode("end", { x: 480, y: 180 }, state.previewLocale);
    const sequence = state.project.dialogues.length + 1;
    const dialogue: DialogueDocument = {
      schemaVersion: 1,
      id,
      key: `dialogue-${sequence}`,
      name: `新对话 ${sequence}`,
      description: "",
      tags: [],
      entryNodeId: start.id,
      nodes: [start, end],
      edges: [
        {
          id: createId(),
          sourceNodeId: start.id,
          sourcePort: "next",
          targetNodeId: end.id,
          targetPort: "in",
        },
      ],
    };
    state.commit("新建对话", (draft) => {
      draft.dialogues.push(dialogue);
      draft.manifest.dialogues.push({
        id,
        key: dialogue.key,
        path: `${folder.replace(/\/$/, "")}/${dialogue.key}.json`,
      });
    });
    set({ selectedDialogueId: id, selectedNodeId: null, activity: "project" });
  },
  deleteDialogue: (id) => {
    const state = get();
    if (state.project.dialogues.length <= 1) {
      set({ notice: "项目至少需要保留一个对话。" });
      return;
    }
    state.commit("删除对话", (draft) => {
      draft.dialogues = draft.dialogues.filter((item) => item.id !== id);
      draft.manifest.dialogues = draft.manifest.dialogues.filter(
        (item) => item.id !== id,
      );
    });
    const next = get().project.dialogues[0]?.id ?? "";
    set({ selectedDialogueId: next, selectedNodeId: null });
  },
  closeProject: () => {
    const project = emptyProject();
    set({
      project,
      projectLoaded: false,
      selectedDialogueId: "",
      selectedNodeId: null,
      viewMode: "canvas",
      activity: "welcome",
      previewLocale: project.manifest.defaultLocale,
      dirty: false,
      savedProjectFingerprint: fingerprint(project),
      sourceDraftDialogueId: null,
      sourceDraft: "",
      sourceDraftDirty: false,
      notice: "欢迎使用司命。",
      past: [],
      future: [],
    });
  },
}));

export function currentDialogue(state: EditorState) {
  return state.project.dialogues.find(
    (dialogue) => dialogue.id === state.selectedDialogueId,
  );
}
