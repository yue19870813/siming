import {
  Braces,
  ChevronDown,
  FileText,
  Folder,
  FolderPlus,
  FolderTree,
  Plus,
  Search,
  Settings,
  Tags,
  Trash2,
  UserRound,
  Variable,
  Zap,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useMemo, useState } from "react";
import {
  beginNodePointerDrag,
  consumeSuppressedPaletteClick,
} from "../lib/nodeDrag";
import { dialogueHasMissingTranslation } from "../model/i18n";
import type { Activity, NodeType } from "../model/types";
import { useEditorStore } from "../store/editorStore";

const appIconUrl = new URL("../../assets/app-icon.svg", import.meta.url).href;

const activities: Array<{
  id: Activity;
  label: string;
  icon: typeof FolderTree;
}> = [
  { id: "project", label: "项目内容", icon: FolderTree },
  { id: "search", label: "项目搜索", icon: Search },
  { id: "characters", label: "角色", icon: UserRound },
  { id: "variables", label: "变量", icon: Variable },
  { id: "events", label: "业务事件", icon: Zap },
  { id: "tags", label: "标签", icon: Tags },
  { id: "settings", label: "设置", icon: Settings },
];

const nodePalette: Array<{
  type: NodeType;
  label: string;
  hint: string;
  color: string;
}> = [
  { type: "dialogue", label: "对话", hint: "角色或旁白", color: "#8b7cf6" },
  { type: "choice", label: "选项", hint: "玩家分支", color: "#55c9ba" },
  { type: "condition", label: "条件", hint: "变量判断", color: "#e6a15f" },
  { type: "event", label: "事件", hint: "通知游戏侧", color: "#d783ad" },
  { type: "start", label: "开始", hint: "入口节点", color: "#8b7cf6" },
  { type: "end", label: "结束", hint: "流程终点", color: "#858b9d" },
];

export function Sidebar({
  width,
  onResizeStart,
  onResizeBy,
}: {
  width: number;
  onResizeStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizeBy: (delta: number) => void;
}) {
  const activity = useEditorStore((state) => state.activity);
  const setActivity = useEditorStore((state) => state.setActivity);
  return (
    <aside
      className={`sidebar-shell ${
        activity === "welcome" ? "sidebar-shell--rail-only" : ""
      }`}
    >
      <nav className="activity-rail" aria-label="主导航">
        <button
          className={`activity-brand ${
            activity === "welcome" ? "is-active" : ""
          }`}
          title="欢迎页"
          aria-label="欢迎页"
          onClick={() => setActivity("welcome")}
        >
          <img src={appIconUrl} alt="" />
        </button>
        {activities.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={activity === item.id ? "is-active" : undefined}
              title={item.label}
              aria-label={item.label}
              onClick={() => setActivity(item.id)}
            >
              <Icon size={17} />
            </button>
          );
        })}
      </nav>
      {activity !== "welcome" && (
        <div className="sidebar-panel">
          {activity === "project" && <ProjectExplorer />}
          {activity === "search" && <SearchPanel />}
          {activity !== "project" && activity !== "search" && (
            <ActivitySummary activity={activity} />
          )}
        </div>
      )}
      {activity !== "welcome" && (
        <div
          className="panel-resize-handle panel-resize-handle--left"
          role="separator"
          aria-label="调整左侧面板宽度"
          aria-orientation="vertical"
          aria-valuemin={220}
          aria-valuemax={480}
          aria-valuenow={Math.round(width)}
          tabIndex={0}
          onPointerDown={onResizeStart}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") onResizeBy(-12);
            if (event.key === "ArrowRight") onResizeBy(12);
          }}
        />
      )}
    </aside>
  );
}

function ProjectExplorer() {
  const project = useEditorStore((state) => state.project);
  const selectedId = useEditorStore((state) => state.selectedDialogueId);
  const select = useEditorStore((state) => state.setSelectedDialogue);
  const addDialogue = useEditorStore((state) => state.addDialogue);
  const addDialogueDirectory = useEditorStore(
    (state) => state.addDialogueDirectory,
  );
  const deleteDialogue = useEditorStore((state) => state.deleteDialogue);
  const addNode = useEditorStore((state) => state.addNode);
  const [filter, setFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState<
    "all" | "recent" | "translation"
  >("all");
  const [createDraft, setCreateDraft] = useState<{
    type: "dialogue" | "directory";
    path: string;
    error: string;
  } | null>(null);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(
    () => new Set(),
  );

  const entries = project.manifest.dialogues
    .map((entry) => ({
      entry,
      dialogue: project.dialogues.find((item) => item.id === entry.id),
    }))
    .filter(
      ({ entry, dialogue }) =>
        !filter ||
        `${entry.key} ${entry.path} ${dialogue?.name ?? ""}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
    )
    .filter(({ dialogue }, index) => {
      if (quickFilter === "recent") return index < 2;
      if (quickFilter === "translation") {
        return dialogue
          ? dialogueHasMissingTranslation(dialogue, project.manifest.locales)
          : false;
      }
      return true;
    });

  const translationIncomplete = project.dialogues.filter((dialogue) =>
    dialogueHasMissingTranslation(dialogue, project.manifest.locales),
  ).length;
  const dialogueRoot =
    project.manifest.paths.dialogues.replace(/^\/+|\/+$/g, "") || "dialogues";
  const selectedEntry = project.manifest.dialogues.find(
    (entry) => entry.id === selectedId,
  );
  const selectedDirectory = selectedEntry
    ? selectedEntry.path.split("/").filter(Boolean).slice(0, -1).join("/") ||
      dialogueRoot
    : dialogueRoot;
  const directoryGroups = new Map<string, typeof entries>();
  if (!filter && quickFilter === "all") {
    for (const directory of project.manifest.dialogueDirectories ?? []) {
      directoryGroups.set(directory, []);
    }
  }
  for (const item of entries) {
    const segments = item.entry.path.split("/").filter(Boolean);
    const directory = segments.slice(0, -1).join("/") || dialogueRoot;
    const group = directoryGroups.get(directory) ?? [];
    group.push(item);
    directoryGroups.set(directory, group);
  }
  const groupedEntries = [...directoryGroups.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  );

  return (
    <>
      <header className="panel-heading">
        <strong>项目内容</strong>
        <div className="panel-heading-actions">
          <button
            title="新建对话目录"
            aria-label="新建对话目录"
            onClick={() => {
              setCreateDraft({
                type: "directory",
                path: `${selectedDirectory}/新目录`,
                error: "",
              });
            }}
          >
            <FolderPlus size={15} />
          </button>
          <button
            title="新建对话"
            aria-label="新建对话"
            onClick={() => {
              setCreateDraft({
                type: "dialogue",
                path: selectedDirectory,
                error: "",
              });
            }}
          >
            <Plus size={15} />
          </button>
        </div>
      </header>
      {createDraft && (
        <form
          className="sidebar-create-form"
          aria-label={
            createDraft.type === "directory" ? "新建对话目录" : "新建对话"
          }
          onSubmit={(event) => {
            event.preventDefault();
            const path = normalizeCreationPath(createDraft.path);
            if (
              !path ||
              (path !== dialogueRoot && !path.startsWith(`${dialogueRoot}/`))
            ) {
              setCreateDraft({
                ...createDraft,
                error: `目录必须位于 ${dialogueRoot} 下。`,
              });
              return;
            }
            if (
              createDraft.type === "directory" &&
              (project.manifest.dialogueDirectories ?? []).includes(path)
            ) {
              setCreateDraft({
                ...createDraft,
                error: "该目录已经存在。",
              });
              return;
            }
            if (createDraft.type === "directory") {
              addDialogueDirectory(path);
            } else {
              addDialogue(path);
            }
            setCollapsedDirectories((collapsed) => {
              const next = new Set(collapsed);
              next.delete(path);
              return next;
            });
            setCreateDraft(null);
          }}
        >
          <strong>
            {createDraft.type === "directory" ? "新建对话目录" : "新建对话"}
          </strong>
          <label>
            <span>目录路径</span>
            <input
              autoFocus
              aria-label="目录路径"
              value={createDraft.path}
              onChange={(event) =>
                setCreateDraft({
                  ...createDraft,
                  path: event.target.value,
                  error: "",
                })
              }
            />
          </label>
          {createDraft.error && (
            <small className="sidebar-create-error">{createDraft.error}</small>
          )}
          <div>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setCreateDraft(null)}
            >
              取消
            </button>
            <button type="submit" className="button button--primary">
              创建
            </button>
          </div>
        </form>
      )}
      <label className="search-field">
        <Search size={13} />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="搜索对话、路径…"
        />
      </label>
      <section className="quick-section">
        <small>快速访问</small>
        <button
          className={`quick-item ${quickFilter === "all" ? "is-active" : ""}`}
          onClick={() => setQuickFilter("all")}
        >
          <Braces size={12} /> 全部对话 <span>{project.dialogues.length}</span>
        </button>
        <button
          className={`quick-item ${quickFilter === "recent" ? "is-active" : ""}`}
          onClick={() => setQuickFilter("recent")}
        >
          <span>◷</span> 最近编辑{" "}
          <span>{Math.min(2, project.dialogues.length)}</span>
        </button>
        <button
          className={`quick-item ${quickFilter === "translation" ? "is-active" : ""}`}
          onClick={() => setQuickFilter("translation")}
        >
          <span>文</span> 翻译未完成 <span>{translationIncomplete}</span>
        </button>
      </section>
      <section className="dialogue-tree">
        <div className="section-label">
          <small>对话目录</small>
          <span>{entries.length}</span>
        </div>
        {groupedEntries.map(([directory, groupEntries]) => {
          const isCollapsed =
            collapsedDirectories.has(directory) &&
            !filter &&
            quickFilter === "all";
          return (
            <div
              key={directory}
              className={`tree-file-group ${isCollapsed ? "is-collapsed" : ""}`}
            >
              <button
                type="button"
                className="tree-folder"
                aria-expanded={!isCollapsed}
                onClick={() =>
                  setCollapsedDirectories((collapsed) => {
                    const next = new Set(collapsed);
                    if (next.has(directory)) next.delete(directory);
                    else next.add(directory);
                    return next;
                  })
                }
              >
                <ChevronDown
                  size={12}
                  className={isCollapsed ? "is-collapsed" : undefined}
                />
                <Folder size={13} />
                <span>{directory}</span>
              </button>
              {!isCollapsed &&
                groupEntries.map(({ entry, dialogue }) => (
                  <button
                    key={entry.id}
                    className={`tree-file ${selectedId === entry.id ? "is-active" : ""}`}
                    onClick={() => select(entry.id)}
                  >
                    <FileText size={13} />
                    <span>
                      <strong>{dialogue?.name ?? entry.key}</strong>
                      <small>{dialogue?.nodes.length ?? 0} 个节点</small>
                    </span>
                    {project.dialogues.length > 1 && (
                      <Trash2
                        size={13}
                        className="row-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (window.confirm(`删除“${dialogue?.name}”？`)) {
                            deleteDialogue(entry.id);
                          }
                        }}
                      />
                    )}
                  </button>
                ))}
              {!isCollapsed && groupEntries.length === 0 && (
                <small className="tree-empty-directory">空目录</small>
              )}
            </div>
          );
        })}
        {!groupedEntries.length && (
          <p className="empty-list">暂无对话目录或匹配的对话</p>
        )}
      </section>
      <section className="node-palette">
        <div className="section-label">
          <small>添加节点</small>
          <span>插入画布</span>
        </div>
        <div className="node-palette-grid">
          {nodePalette.map((item) => (
            <button
              key={item.type}
              title="点击添加，或拖拽到画布"
              onClick={() => {
                if (!consumeSuppressedPaletteClick()) addNode(item.type);
              }}
              onPointerDown={(event) =>
                beginNodePointerDrag(event, item.type, item.label)
              }
            >
              <i style={{ background: item.color }} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="resource-links">
        <small>项目资源</small>
        {activities.slice(2, 6).map((item) => {
          const Icon = item.icon;
          const count =
            item.id === "characters"
              ? project.resources.characters.length
              : item.id === "variables"
                ? project.resources.variables.length
                : item.id === "events"
                  ? project.resources.events.length
                  : project.resources.tags.length;
          return (
            <button
              key={item.id}
              onClick={() => useEditorStore.getState().setActivity(item.id)}
            >
              <Icon size={13} />
              {item.label}
              <span>{count} 个定义</span>
            </button>
          );
        })}
      </section>
    </>
  );
}

function normalizeCreationPath(path: string) {
  const normalized = path
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
  if (
    !normalized ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  return normalized;
}

function SearchPanel() {
  const project = useEditorStore((state) => state.project);
  const setSelectedDialogue = useEditorStore(
    (state) => state.setSelectedDialogue,
  );
  const setSelectedNode = useEditorStore((state) => state.setSelectedNode);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const needle = query.toLowerCase();
    return project.dialogues.flatMap((dialogue) => {
      const entry = project.manifest.dialogues.find(
        (item) => item.id === dialogue.id,
      );
      const fileMatch = `${dialogue.name} ${dialogue.key} ${entry?.path}`
        .toLowerCase()
        .includes(needle);
      const nodes = dialogue.nodes
        .filter((node) =>
          `${node.key} ${JSON.stringify(node.data)}`
            .toLowerCase()
            .includes(needle),
        )
        .map((node) => ({ dialogue, node }));
      return [...(fileMatch ? [{ dialogue, node: null }] : []), ...nodes];
    });
  }, [project, query]);

  return (
    <>
      <header className="panel-heading">
        <strong>项目搜索</strong>
      </header>
      <label className="search-field">
        <Search size={13} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文件、节点、正文…"
        />
      </label>
      <div className="search-results">
        {!query && <p>输入关键词搜索整个项目。</p>}
        {query && results.length === 0 && <p>没有匹配结果。</p>}
        {results.map(({ dialogue, node }, index) => (
          <button
            key={`${dialogue.id}-${node?.id ?? "file"}-${index}`}
            onClick={() => {
              setSelectedDialogue(dialogue.id);
              setSelectedNode(node?.id ?? null);
              useEditorStore.getState().setActivity("project");
            }}
          >
            <span>{node ? node.type : "对话文件"}</span>
            <strong>{node?.key ?? dialogue.name}</strong>
            <small>{dialogue.name}</small>
          </button>
        ))}
      </div>
    </>
  );
}

function ActivitySummary({ activity }: { activity: Activity }) {
  const item = activities.find((entry) => entry.id === activity)!;
  const Icon = item.icon;
  return (
    <div className="activity-summary">
      <Icon size={20} />
      <strong>{item.label}</strong>
      <p>
        {activity === "settings"
          ? "项目设置与系统设置使用不同的持久化边界。"
          : "在主工作区维护定义、查看引用并保护稳定 ID。"}
      </p>
    </div>
  );
}
