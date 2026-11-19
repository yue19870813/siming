import { plainText } from "../model/richText";
import { withinDialogueRoot } from "../lib/dialogueDirectoryMigration";
import { collectDialogueDirectories } from "../lib/dialogueCreation";
import { CreationDialog } from "./CreationDialog";
import { confirmDiscardHostDraft } from "../lib/hostDraftGuard";
import { isTauri, showProjectItem } from "../lib/projectApi";
import {
  Braces,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  History,
  Plus,
  Search,
  Settings,
  Tags,
  Trash2,
  UserRound,
  Variable,
  Zap,
  X,
} from "lucide-react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  beginNodePointerDrag,
  consumeSuppressedPaletteClick,
} from "../lib/nodeDrag";
import { dialogueHasMissingTranslation } from "../model/i18n";
import type { Activity, NodeType } from "../model/types";
import { findMatchingNodeIds, nodeSearchText } from "./canvasFind";
import { useEditorStore } from "../store/editorStore";

const appIconUrl = new URL("../../assets/app-icon.svg", import.meta.url).href;
const dialogueNameCollator = new Intl.Collator(undefined, { numeric: true });
const dialogueSortStorageKey = "siming.dialogue-file-sort";
type DialogueSortOrder = "name" | "created";

const activities: Array<{
  id: Activity;
  label: string;
  icon: typeof FolderTree;
}> = [
  { id: "project", label: "项目内容", icon: FolderTree },
  { id: "recovery", label: "快照历史", icon: History },
  { id: "search", label: "项目搜索", icon: Search },
  { id: "characters", label: "角色", icon: UserRound },
  { id: "variables", label: "变量", icon: Variable },
  { id: "events", label: "业务事件", icon: Zap },
  { id: "tags", label: "标签", icon: Tags },
];
const settingsActivity = {
  id: "settings",
  label: "设置",
  icon: Settings,
} as const;

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
        <button
          className={`activity-settings ${
            activity === "settings" ? "is-active" : ""
          }`}
          title="设置"
          aria-label="设置"
          onClick={() => setActivity("settings")}
        >
          <Settings size={17} />
        </button>
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
  const deleteDialogue = useEditorStore((state) => state.deleteDialogue);
  const addNode = useEditorStore((state) => state.addNode);
  const setNotice = useEditorStore((state) => state.setNotice);
  const [itemMenu, setItemMenu] = useState<{
    rootPath: string;
    relativePath: string;
    left: number;
    top: number;
    trigger: HTMLElement;
  } | null>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const [sortOrder, setSortOrder] = useState<DialogueSortOrder>(() => {
    try {
      return localStorage.getItem(dialogueSortStorageKey) === "created"
        ? "created"
        : "name";
    } catch {
      return "name";
    }
  });
  const [filter, setFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState<
    "all" | "recent" | "translation"
  >("all");
  const [createDraft, setCreateDraft] = useState<{
    type: "dialogue" | "directory";
    path: string;
  } | null>(null);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(
    () => new Set(),
  );

  useLayoutEffect(() => {
    const menu = itemMenuRef.current;
    if (!itemMenu || !menu) return;
    menu.style.left = `${Math.max(0, Math.min(itemMenu.left, window.innerWidth - menu.offsetWidth - 4))}px`;
    menu.style.top = `${Math.max(0, Math.min(itemMenu.top, window.innerHeight - menu.offsetHeight - 4))}px`;
    menu.querySelector("button")?.focus({ preventScroll: true });

    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target))
        setItemMenu(null);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [itemMenu]);

  function openItemMenu(
    event: ReactMouseEvent<HTMLElement>,
    relativePath: string,
  ) {
    if (!isTauri() || !project.rootPath) return;
    event.preventDefault();
    const trigger = event.currentTarget;
    const bounds = trigger.getBoundingClientRect();
    const hasPointer = event.clientX !== 0 || event.clientY !== 0;
    setItemMenu({
      rootPath: project.rootPath,
      relativePath,
      left: hasPointer ? event.clientX : bounds.left,
      top: hasPointer ? event.clientY : bounds.bottom,
      trigger,
    });
  }

  async function openMenuItem() {
    if (!itemMenu) return;
    setItemMenu(null);
    itemMenu.trigger.focus({ preventScroll: true });
    try {
      await showProjectItem(itemMenu.rootPath, itemMenu.relativePath);
    } catch (error) {
      const detail =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : String(error);
      setNotice(`无法打开文件位置：${detail}`);
    }
  }

  const rootEntries = project.manifest.dialogues.filter((entry) =>
    withinDialogueRoot(entry.path, project.manifest.paths.dialogues),
  );
  const entries = rootEntries
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

  const translationIncomplete = project.dialogues.filter(
    (dialogue) =>
      rootEntries.some((entry) => entry.id === dialogue.id) &&
      dialogueHasMissingTranslation(dialogue, project.manifest.locales),
  ).length;
  const dialogueRoot =
    project.manifest.paths.dialogues.replace(/^\/+|\/+$/g, "") || "dialogues";
  const selectedEntry = project.manifest.dialogues.find(
    (entry) =>
      entry.id === selectedId &&
      withinDialogueRoot(entry.path, project.manifest.paths.dialogues),
  );
  const [activeDirectory, setActiveDirectory] = useState<string | null>(null);
  const selectedDirectory =
    (activeDirectory &&
    collectDialogueDirectories(project).includes(activeDirectory)
      ? activeDirectory
      : null) ??
    (selectedEntry
      ? selectedEntry.path.split("/").filter(Boolean).slice(0, -1).join("/") ||
        dialogueRoot
      : dialogueRoot);
  const directoryGroups = new Map<string, typeof entries>();
  if (!filter && quickFilter === "all") {
    for (const directory of project.manifest.dialogueDirectories ?? []) {
      if (!withinDialogueRoot(directory, project.manifest.paths.dialogues))
        continue;
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
  const groupedEntries = [...directoryGroups.entries()]
    .filter(
      ([directory, items]) => directory !== dialogueRoot || items.length > 0,
    )
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [, items] of groupedEntries) {
    items.sort((left, right) => {
      const creationOrder =
        (right.entry.createdAtUnixMs ?? -1) -
        (left.entry.createdAtUnixMs ?? -1);
      if (sortOrder === "created" && creationOrder !== 0) return creationOrder;
      return (
        dialogueNameCollator.compare(
          left.dialogue?.name ?? left.entry.key,
          right.dialogue?.name ?? right.entry.key,
        ) || left.entry.path.localeCompare(right.entry.path)
      );
    });
  }

  return (
    <>
      <header className="panel-heading">
        <strong>项目内容</strong>
        <div className="panel-heading-actions">
          <button
            title="新建对话目录"
            aria-label="新建对话目录"
            onClick={() => {
              if (!confirmDiscardHostDraft()) return;
              setCreateDraft({
                type: "directory",
                path: selectedDirectory,
              });
            }}
          >
            <FolderPlus size={15} />
          </button>
          <button
            title="新建对话"
            aria-label="新建对话"
            onClick={() => {
              if (!confirmDiscardHostDraft()) return;
              setCreateDraft({
                type: "dialogue",
                path: selectedDirectory,
              });
            }}
          >
            <Plus size={15} />
          </button>
        </div>
      </header>
      {createDraft && (
        <CreationDialog
          type={createDraft.type}
          initialDirectory={createDraft.path}
          onClose={() => setCreateDraft(null)}
          onCreated={(path) => {
            setActiveDirectory(path);
            setCollapsedDirectories((collapsed) => {
              const next = new Set(collapsed);
              next.delete(path);
              return next;
            });
            setFilter("");
            setQuickFilter("all");
            setCreateDraft(null);
          }}
        />
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
          <Braces size={12} /> 全部对话 <span>{rootEntries.length}</span>
        </button>
        <button
          className={`quick-item ${quickFilter === "recent" ? "is-active" : ""}`}
          onClick={() => setQuickFilter("recent")}
        >
          <span>◷</span> 最近编辑 <span>{Math.min(2, rootEntries.length)}</span>
        </button>
        <button
          className={`quick-item ${quickFilter === "translation" ? "is-active" : ""}`}
          onClick={() => setQuickFilter("translation")}
        >
          <span>文</span> 翻译未完成 <span>{translationIncomplete}</span>
        </button>
      </section>
      <section className="dialogue-tree">
        <div className="section-label dialogue-tree-heading">
          <small onContextMenu={(event) => openItemMenu(event, dialogueRoot)}>
            对话目录
          </small>
          <span>{entries.length}</span>
          <select
            aria-label="对话文件排序"
            title="对话文件排序"
            value={sortOrder}
            onChange={(event) => {
              const order =
                event.target.value === "created" ? "created" : "name";
              setSortOrder(order);
              try {
                localStorage.setItem(dialogueSortStorageKey, order);
              } catch {
                return;
              }
            }}
          >
            <option value="name">名称</option>
            <option value="created">创建时间</option>
          </select>
        </div>
        {groupedEntries.map(([directory, groupEntries]) => {
          const isRoot = directory === dialogueRoot;
          const isCollapsed =
            !isRoot &&
            collapsedDirectories.has(directory) &&
            !filter &&
            quickFilter === "all";
          return (
            <div
              key={directory}
              className={`tree-file-group ${isRoot ? "tree-file-group--root" : ""} ${isCollapsed ? "is-collapsed" : ""}`}
            >
              {!isRoot && (
                <button
                  type="button"
                  className="tree-folder"
                  aria-expanded={!isCollapsed}
                  onContextMenu={(event) => openItemMenu(event, directory)}
                  onClick={() => {
                    setActiveDirectory(directory);
                    setCollapsedDirectories((collapsed) => {
                      const next = new Set(collapsed);
                      if (next.has(directory)) next.delete(directory);
                      else next.add(directory);
                      return next;
                    });
                  }}
                >
                  <ChevronDown
                    size={12}
                    className={isCollapsed ? "is-collapsed" : undefined}
                  />
                  <Folder size={13} />
                  <span>{directory.slice(dialogueRoot.length + 1)}</span>
                </button>
              )}
              {!isCollapsed &&
                groupEntries.map(({ entry, dialogue }) => (
                  <button
                    key={entry.id}
                    className={`tree-file ${selectedId === entry.id ? "is-active" : ""}`}
                    onContextMenu={(event) => openItemMenu(event, entry.path)}
                    onClick={() => {
                      setActiveDirectory(null);
                      select(entry.id);
                    }}
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
      {itemMenu && (
        <div
          ref={itemMenuRef}
          className="project-menu dialogue-item-menu"
          role="menu"
          onBlur={(event) => {
            if (
              event.relatedTarget &&
              !event.currentTarget.contains(event.relatedTarget)
            )
              setItemMenu(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setItemMenu(null);
            itemMenu.trigger.focus({ preventScroll: true });
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void openMenuItem()}
          >
            <FolderOpen size={15} aria-hidden="true" />
            {/(Macintosh|Mac OS X)/i.test(navigator.userAgent)
              ? "在访达里打开"
              : "在文件夹里打开"}
          </button>
        </div>
      )}
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

function SearchPanel() {
  const project = useEditorStore((state) => state.project);
  const locale = useEditorStore((state) => state.previewLocale);
  const mode = useEditorStore((state) => state.canvasFindMode);
  const findQuery = useEditorStore((state) => state.canvasFindQuery);
  const speakerKey = useEditorStore((state) => state.canvasFindSpeakerKey);
  const setCanvasFind = useEditorStore((state) => state.setCanvasFind);
  const setSelectedDialogue = useEditorStore(
    (state) => state.setSelectedDialogue,
  );
  const setSelectedNode = useEditorStore((state) => state.setSelectedNode);
  const setActivity = useEditorStore((state) => state.setActivity);
  const [projectQuery, setProjectQuery] = useState("");
  const projectResults = useMemo(() => {
    if (!projectQuery.trim()) return [];
    const needle = projectQuery.toLocaleLowerCase();
    return project.dialogues.flatMap((dialogue) => {
      const entry = project.manifest.dialogues.find(
        (item) => item.id === dialogue.id,
      );
      const fileMatch = `${dialogue.name} ${dialogue.key} ${entry?.path}`
        .toLowerCase()
        .includes(needle);
      const nodes = dialogue.nodes
        .filter((node) =>
          `${node.key} ${Object.values(node.data.text ?? {})
            .map(plainText)
            .join(" ")} ${JSON.stringify({ ...node.data, text: undefined })}`
            .toLowerCase()
            .includes(needle),
        )
        .map((node) => ({ dialogue, node }));
      return [...(fileMatch ? [{ dialogue, node: null }] : []), ...nodes];
    });
  }, [project, projectQuery]);
  const nodeResults = useMemo(() => {
    if (mode === "text" && !findQuery.trim()) return [];
    if (mode === "speaker" && speakerKey === null) return [];
    return project.dialogues.flatMap((dialogue) => {
      const matchingIds = findMatchingNodeIds(
        dialogue.nodes,
        mode,
        findQuery,
        speakerKey,
      );
      return dialogue.nodes
        .filter((node) => matchingIds.has(node.id))
        .map((node) => ({ dialogue, node }));
    });
  }, [project, mode, findQuery, speakerKey]);
  const characters = project.resources.characters;

  return (
    <>
      <header className="panel-heading">
        <strong>查找</strong>
        {mode !== "project" && (
          <div className="panel-heading-actions">
            <button
              type="button"
              aria-label="退出查找"
              title="退出查找"
              onClick={() => {
                setCanvasFind({ mode: "project", query: "", speakerKey: null });
                setActivity("project");
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </header>
      <div className="segmented search-mode" aria-label="查找类型">
        {(
          [
            ["project", "项目"],
            ["text", "文本"],
            ["speaker", "角色"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={mode === id ? "is-active" : undefined}
            aria-pressed={mode === id}
            onClick={() => {
              setCanvasFind({ mode: id });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "project" && (
        <>
          <label className="search-field">
            <Search size={13} />
            <input
              autoFocus
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
              placeholder="搜索文件、节点、正文…"
            />
          </label>
          <div className="search-results">
            {!projectQuery && <p>输入关键词搜索整个项目。</p>}
            {projectQuery && projectResults.length === 0 && (
              <p>没有匹配结果。</p>
            )}
            {projectResults.map(({ dialogue, node }, index) => (
              <button
                key={`${dialogue.id}-${node?.id ?? "file"}-${index}`}
                onClick={() => {
                  setSelectedDialogue(dialogue.id);
                  setSelectedNode(node?.id ?? null);
                  setActivity("project");
                }}
              >
                <span>{node ? node.type : "对话文件"}</span>
                <strong>{node?.key ?? dialogue.name}</strong>
                <small>{dialogue.name}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {mode === "text" && (
        <>
          <label className="search-field">
            <Search size={13} />
            <input
              autoFocus
              value={findQuery}
              onChange={(event) => setCanvasFind({ query: event.target.value })}
              placeholder="查找对话文本…"
            />
          </label>
          <div className="search-results">
            {!findQuery.trim() && <p>输入文本片段查找匹配节点。</p>}
            {findQuery.trim() && nodeResults.length === 0 && (
              <p>没有匹配结果。</p>
            )}
            {nodeResults.map(({ dialogue, node }) => (
              <button
                key={`${dialogue.id}-${node.id}`}
                onClick={() => {
                  setSelectedDialogue(dialogue.id);
                  setSelectedNode(node.id);
                }}
              >
                <span>{node.type}</span>
                <strong>{node.alias?.trim() || node.key}</strong>
                <small title={nodeSearchText(node)}>
                  {dialogue.name} · {nodeSearchText(node).slice(0, 60)}
                </small>
              </button>
            ))}
          </div>
        </>
      )}
      {mode === "speaker" && (
        <>
          <label className="search-select-field">
            <span>说话人</span>
            <select
              aria-label="按角色查找"
              value={speakerKey ?? "__choose_speaker__"}
              onChange={(event) =>
                setCanvasFind({
                  speakerKey:
                    event.target.value === "__choose_speaker__"
                      ? null
                      : event.target.value,
                })
              }
            >
              <option value="__choose_speaker__">选择角色…</option>
              <option value="">旁白</option>
              {characters.map((character) => (
                <option key={character.id} value={character.key}>
                  {character.name[locale] ||
                    Object.values(character.name).find(Boolean) ||
                    character.key}
                  {character.key ? ` · ${character.key}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="search-results">
            {speakerKey === null && <p>选择角色查找对应的对话节点。</p>}
            {speakerKey !== null && nodeResults.length === 0 && (
              <p>没有匹配结果。</p>
            )}
            {nodeResults.map(({ dialogue, node }) => (
              <button
                key={`${dialogue.id}-${node.id}`}
                onClick={() => {
                  setSelectedDialogue(dialogue.id);
                  setSelectedNode(node.id);
                }}
              >
                <span>对话</span>
                <strong>{node.alias?.trim() || node.key}</strong>
                <small>{dialogue.name}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ActivitySummary({ activity }: { activity: Activity }) {
  const item =
    activity === settingsActivity.id
      ? settingsActivity
      : activities.find((entry) => entry.id === activity)!;
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
