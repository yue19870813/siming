import {
  Check,
  ChevronDown,
  FilePlus2,
  FolderOpen,
  Play,
  Redo2,
  Save,
  Terminal,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { translationCompletion } from "../model/i18n";
import type { ViewMode } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import type { WorkbenchPanelMode } from "./WorkbenchPanel";

export function TopBar({
  onNew,
  onOpen,
  onSave,
  onPanelOpen,
}: {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onPanelOpen: (mode: WorkbenchPanelMode) => void;
}) {
  const project = useEditorStore((state) => state.project);
  const dialogueId = useEditorStore((state) => state.selectedDialogueId);
  const dirty = useEditorStore((state) => state.dirty);
  const busy = useEditorStore((state) => state.busy);
  const viewMode = useEditorStore((state) => state.viewMode);
  const setViewMode = useEditorStore((state) => state.setViewMode);
  const locale = useEditorStore((state) => state.previewLocale);
  const setLocale = useEditorStore((state) => state.setPreviewLocale);
  const setNotice = useEditorStore((state) => state.setNotice);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const past = useEditorStore((state) => state.past);
  const future = useEditorStore((state) => state.future);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const dialogue = project.dialogues.find((item) => item.id === dialogueId);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest(".topbar-project")) setProjectMenuOpen(false);
      if (!event.target.closest(".export-control")) setExportMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setProjectMenuOpen(false);
      setExportMenuOpen(false);
    };
    document.addEventListener("click", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const exportNotice = (format: "json" | "xml" | "binary") => {
    setExportMenuOpen(false);
    setNotice(
      format === "json"
        ? "运行时 JSON 导出将在阶段 3 接入；当前项目源数据可正常保存。"
        : `${format === "xml" ? "XML" : "二进制"}导出属于后续格式扩展。`,
    );
  };

  return (
    <header className="topbar">
      <div className="topbar-project">
        <button
          className="project-menu-trigger"
          aria-expanded={projectMenuOpen}
          onClick={() => {
            setExportMenuOpen(false);
            setProjectMenuOpen((open) => !open);
          }}
        >
          <strong>{project.manifest.name}</strong>
          <span>/</span>
          <span>{dialogue?.name ?? "未选择对话"}</span>
          {dirty && <i title="存在未保存修改" />}
          <ChevronDown size={12} />
        </button>
        {projectMenuOpen && (
          <div className="project-menu">
            <button
              onClick={() => {
                setProjectMenuOpen(false);
                onNew();
              }}
            >
              <FilePlus2 size={14} /> 新建项目
            </button>
            <button
              onClick={() => {
                setProjectMenuOpen(false);
                onOpen();
              }}
            >
              <FolderOpen size={14} /> 打开项目
            </button>
            <button
              disabled={busy || !dirty || !project.rootPath}
              onClick={() => {
                setProjectMenuOpen(false);
                onSave();
              }}
            >
              <Save size={14} /> {busy ? "保存中…" : "保存项目"}
              <kbd>⌘S</kbd>
            </button>
          </div>
        )}
      </div>
      <div className="topbar-center">
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
        <span className="toolbar-divider" />
        <button onClick={undo} disabled={!past.length} title="撤销">
          <Undo2 size={15} />
        </button>
        <button onClick={redo} disabled={!future.length} title="重做">
          <Redo2 size={15} />
        </button>
      </div>
      <div className="topbar-actions">
        <select
          className="language-select"
          aria-label="预览语言"
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
        >
          {project.manifest.locales.map((item) => (
            <option key={item} value={item}>
              {localeLabel(project, item)}
            </option>
          ))}
        </select>
        <button
          className="button button--ghost"
          onClick={() => {
            setProjectMenuOpen(false);
            setExportMenuOpen(false);
            onPanelOpen("terminal");
          }}
        >
          <Terminal size={14} /> 命令行
        </button>
        <button
          className="button button--ghost"
          onClick={() => {
            setProjectMenuOpen(false);
            setExportMenuOpen(false);
            onPanelOpen("problems");
          }}
        >
          <Check size={14} /> 校验 <span className="kbd">⌘⇧V</span>
        </button>
        <button
          className="button button--success"
          onClick={() => {
            setProjectMenuOpen(false);
            setExportMenuOpen(false);
            onPanelOpen("simulator");
          }}
        >
          <Play size={13} /> 模拟运行
        </button>
        <div className="export-control">
          <button
            className="button button--primary export-main"
            onClick={() => exportNotice("json")}
          >
            导出 JSON
          </button>
          <button
            className="button button--primary export-toggle"
            aria-label="选择导出格式"
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
            onClick={() => {
              setProjectMenuOpen(false);
              setExportMenuOpen((open) => !open);
            }}
          >
            <ChevronDown size={12} />
          </button>
          {exportMenuOpen && (
            <div className="export-menu" role="menu" aria-label="导出格式">
              <button role="menuitem" onClick={() => exportNotice("json")}>
                <span>{"{ }"}</span>
                <span>
                  <strong>运行时 JSON</strong>
                  <small>结构数据与多语言资源</small>
                </span>
              </button>
              <button role="menuitem" onClick={() => exportNotice("xml")}>
                <span>{"</>"}</span>
                <span>
                  <strong>XML</strong>
                  <small>后续格式扩展</small>
                </span>
              </button>
              <button role="menuitem" onClick={() => exportNotice("binary")}>
                <span>BIN</span>
                <span>
                  <strong>二进制包</strong>
                  <small>后续格式扩展</small>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function localeLabel(
  project: ReturnType<typeof useEditorStore.getState>["project"],
  locale: string,
) {
  const name =
    locale === "zh-CN" ? "简体中文" : locale === "en-US" ? "English" : locale;
  if (locale === project.manifest.defaultLocale) return `${name} · 默认`;
  const percent = translationCompletion(project, locale);
  return `${name} · ${percent}%`;
}
