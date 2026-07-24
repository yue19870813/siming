import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";
import { Braces, Check, ListTree, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { DialogueDocument } from "../model/types";
import { useEditorStore } from "../store/editorStore";

export function DataView() {
  const project = useEditorStore((state) => state.project);
  const dialogueId = useEditorStore((state) => state.selectedDialogueId);
  const commit = useEditorStore((state) => state.commit);
  const setNotice = useEditorStore((state) => state.setNotice);
  const sourceDraftDialogueId = useEditorStore(
    (state) => state.sourceDraftDialogueId,
  );
  const sourceDraft = useEditorStore((state) => state.sourceDraft);
  const setSourceDraft = useEditorStore((state) => state.setSourceDraft);
  const clearSourceDraft = useEditorStore((state) => state.clearSourceDraft);
  const dialogue = project.dialogues.find((item) => item.id === dialogueId);
  const serialized = JSON.stringify(dialogue, null, 2);
  const [draft, setDraft] = useState(
    sourceDraftDialogueId === dialogueId ? sourceDraft : serialized,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(serialized);
    setError("");
  }, [dialogueId, serialized]);

  if (!dialogue) return null;
  const changed = draft !== serialized;

  const apply = () => {
    try {
      const parsed = JSON.parse(draft) as DialogueDocument;
      if (
        parsed.id !== dialogue.id ||
        !Array.isArray(parsed.nodes) ||
        !Array.isArray(parsed.edges)
      ) {
        throw new Error("对话 UUID 不可修改，且 nodes/edges 必须是数组。");
      }
      const ids = new Set(parsed.nodes.map((node) => node.id));
      if (ids.size !== parsed.nodes.length || !ids.has(parsed.entryNodeId)) {
        throw new Error("节点 UUID 重复或入口节点不存在。");
      }
      const keys = new Set(parsed.nodes.map((node) => node.key));
      if (keys.size !== parsed.nodes.length) {
        throw new Error("同一对话内的节点 Key 不能重复。");
      }
      if (
        parsed.edges.some(
          (edge) => !ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId),
        )
      ) {
        throw new Error("连线引用了不存在的节点。");
      }
      commit("应用源数据修改", (projectDraft) => {
        const index = projectDraft.dialogues.findIndex(
          (item) => item.id === dialogueId,
        );
        projectDraft.dialogues[index] = parsed;
        const entry = projectDraft.manifest.dialogues.find(
          (item) => item.id === dialogueId,
        );
        if (entry) entry.key = parsed.key;
      });
      setError("");
      clearSourceDraft();
      setNotice("源数据已作为一条历史记录应用。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "JSON 无效");
    }
  };

  return (
    <div className="data-view">
      <div className="data-toolbar">
        <div>
          <Braces size={15} />
          <strong>编辑源 JSON</strong>
          <span>{changed ? "存在未应用草稿" : "已与画布同步"}</span>
        </div>
        <div className="toolbar-actions">
          <button
            className="button button--ghost"
            onClick={() => {
              try {
                const formatted = JSON.stringify(JSON.parse(draft), null, 2);
                setDraft(formatted);
                setSourceDraft(
                  dialogue.id,
                  formatted,
                  formatted !== serialized,
                );
                setError("");
              } catch (reason) {
                setError(
                  reason instanceof Error ? reason.message : "JSON 无效",
                );
              }
            }}
          >
            <ListTree size={14} /> 格式化
          </button>
          <button
            className="button button--ghost"
            disabled={!changed}
            onClick={() => {
              setDraft(serialized);
              clearSourceDraft();
              setError("");
            }}
          >
            <RotateCcw size={14} /> 放弃
          </button>
          <button
            className="button button--primary"
            disabled={!changed}
            onClick={apply}
          >
            <Check size={14} /> 应用修改
          </button>
        </div>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <CodeMirror
        value={draft}
        height="100%"
        theme={
          document.documentElement.dataset.theme === "light" ? "light" : "dark"
        }
        extensions={[json()]}
        onChange={(value) => {
          setDraft(value);
          setSourceDraft(dialogue.id, value, value !== serialized);
          setError("");
        }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          bracketMatching: true,
          autocompletion: true,
          highlightActiveLine: true,
        }}
      />
    </div>
  );
}
