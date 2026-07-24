import { create } from "zustand";
import { createDemoProject, createId, createNode } from "../model/demo";
import type {
  Activity,
  DialogueDocument,
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
  selectedDialogueId: string;
  selectedNodeId: string | null;
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
  addNode: (type: NodeType) => void;
  addDialogue: (folder?: string) => void;
  deleteDialogue: (id: string) => void;
};

const demo = createDemoProject();
const fingerprint = (project: ProjectSnapshot) => JSON.stringify(project);

export const useEditorStore = create<EditorState>((set, get) => ({
  project: demo,
  selectedDialogueId: demo.dialogues[0].id,
  selectedNodeId: null,
  viewMode: "canvas",
  activity: "project",
  previewLocale: demo.manifest.defaultLocale,
  dirty: false,
  savedProjectFingerprint: fingerprint(demo),
  sourceDraftDialogueId: null,
  sourceDraft: "",
  sourceDraftDirty: false,
  busy: false,
  notice: "演示项目尚未写入磁盘，可新建或打开真实项目。",
  past: [],
  future: [],

  setProject: (project, dirty = false) =>
    set({
      project,
      selectedDialogueId: project.dialogues[0]?.id ?? "",
      selectedNodeId: null,
      previewLocale: project.manifest.defaultLocale,
      dirty,
      savedProjectFingerprint: dirty ? "" : fingerprint(project),
      sourceDraftDialogueId: null,
      sourceDraft: "",
      sourceDraftDirty: false,
      past: [],
      future: [],
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
  addNode: (type) => {
    const { selectedDialogueId, previewLocale, commit } = get();
    const dialogue = get().project.dialogues.find(
      (item) => item.id === selectedDialogueId,
    );
    const offset = dialogue?.nodes.length ?? 0;
    const node = createNode(
      type,
      { x: 180 + (offset % 4) * 250, y: 120 + Math.floor(offset / 4) * 180 },
      previewLocale,
    );
    commit(`新增${type}节点`, (draft) => {
      draft.dialogues
        .find((item) => item.id === selectedDialogueId)
        ?.nodes.push(node);
    });
    set({ selectedNodeId: node.id });
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
}));

export function currentDialogue(state: EditorState) {
  return state.project.dialogues.find(
    (dialogue) => dialogue.id === state.selectedDialogueId,
  );
}
