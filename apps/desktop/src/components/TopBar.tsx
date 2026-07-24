import {
  ChevronDown,
  FolderOpen,
  Languages,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";
import type { ViewMode } from "../model/types";
import { useEditorStore } from "../store/editorStore";

export function TopBar({
  onNew,
  onOpen,
  onSave,
}: {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
}) {
  const project = useEditorStore((state) => state.project);
  const dialogueId = useEditorStore((state) => state.selectedDialogueId);
  const dirty = useEditorStore((state) => state.dirty);
  const busy = useEditorStore((state) => state.busy);
  const viewMode = useEditorStore((state) => state.viewMode);
  const setViewMode = useEditorStore((state) => state.setViewMode);
  const locale = useEditorStore((state) => state.previewLocale);
  const setLocale = useEditorStore((state) => state.setPreviewLocale);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const past = useEditorStore((state) => state.past);
  const future = useEditorStore((state) => state.future);
  const dialogue = project.dialogues.find((item) => item.id === dialogueId);

  return (
    <header className="topbar">
      <div className="topbar-project">
        <strong>{project.manifest.name}</strong>
        <span>/</span>
        <span>{dialogue?.name ?? "未选择对话"}</span>
        {dirty && <i title="存在未保存修改" />}
      </div>
      <div className="view-switch" aria-label="编辑模式">
        {(["canvas", "table", "data"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            className={viewMode === mode ? "is-active" : undefined}
            onClick={() => setViewMode(mode)}
          >
            {mode === "canvas" ? "画布" : mode === "table" ? "表格" : "数据"}
          </button>
        ))}
      </div>
      <div className="topbar-actions">
        <button onClick={undo} disabled={!past.length} title="撤销">
          <Undo2 size={15} />
        </button>
        <button onClick={redo} disabled={!future.length} title="重做">
          <Redo2 size={15} />
        </button>
        <label className="locale-select">
          <Languages size={14} />
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            {project.manifest.locales.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button className="button button--ghost" onClick={onOpen}>
          <FolderOpen size={14} /> 打开
        </button>
        <button className="button button--ghost" onClick={onNew}>
          新建
        </button>
        <button
          className="button button--primary"
          disabled={busy || !dirty || !project.rootPath}
          onClick={onSave}
        >
          <Save size={14} /> {busy ? "保存中…" : "保存"}
        </button>
        <button className="split-arrow" title="导出将在阶段 3 实现" disabled>
          <ChevronDown size={13} />
        </button>
      </div>
    </header>
  );
}
