import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { CanvasView } from "./components/CanvasView";
import { DataView } from "./components/DataView";
import { Inspector } from "./components/Inspector";
import { ResourceView } from "./components/ResourceView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { TableView } from "./components/TableView";
import { TopBar } from "./components/TopBar";
import { WelcomeView } from "./components/WelcomeView";
import {
  WorkbenchPanel,
  type WorkbenchPanelMode,
} from "./components/WorkbenchPanel";
import {
  chooseProjectDirectory,
  checkMigration,
  clearRecoverySnapshot,
  createProject,
  exportProject,
  isTauri,
  migrateProject,
  openProject,
  readRecoverySnapshot,
  readSystemSettings,
  saveProject,
  writeRecoverySnapshot,
  writeSystemSettings,
} from "./lib/projectApi";
import { InterfaceLocaleEffect } from "./lib/interfaceLocale";
import { beginPanelResize, clampPanelSize } from "./lib/panelResize";
import type { SystemSettings } from "./model/types";
import { useEditorStore } from "./store/editorStore";

const defaultSettings: SystemSettings = {
  schemaVersion: 1,
  theme: "dark",
  defaultProjectDirectory: null,
  interfaceLocale: "zh-CN",
  uiFontSize: "medium",
  editorFontSize: 13,
  keymap: "system",
  autoSaveDelaySeconds: 30,
  recoverySnapshotIntervalSeconds: 60,
  restoreLastProject: true,
  projectExportDirectories: {},
};

type PanelLayoutStyle = CSSProperties & {
  "--sidebar-width": string;
  "--inspector-width": string;
};

export default function App() {
  const project = useEditorStore((state) => state.project);
  const projectLoaded = useEditorStore((state) => state.projectLoaded);
  const activity = useEditorStore((state) => state.activity);
  const viewMode = useEditorStore((state) => state.viewMode);
  const dirty = useEditorStore((state) => state.dirty);
  const sourceDraftDirty = useEditorStore((state) => state.sourceDraftDirty);
  const sourceDraftDialogueId = useEditorStore(
    (state) => state.sourceDraftDialogueId,
  );
  const sourceDraft = useEditorStore((state) => state.sourceDraft);
  const notice = useEditorStore((state) => state.notice);
  const setProject = useEditorStore((state) => state.setProject);
  const setActivity = useEditorStore((state) => state.setActivity);
  const busy = useEditorStore((state) => state.busy);
  const setBusy = useEditorStore((state) => state.setBusy);
  const setNotice = useEditorStore((state) => state.setNotice);
  const markSaved = useEditorStore((state) => state.markSaved);
  const setSourceDraft = useEditorStore((state) => state.setSourceDraft);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const copySelectedNode = useEditorStore((state) => state.copySelectedNode);
  const pasteCopiedNode = useEditorStore((state) => state.pasteCopiedNode);
  const [settings, setSettings] = useState(defaultSettings);
  const [newProjectRootPath, setNewProjectRootPath] = useState<string | null>(
    null,
  );
  const [sidebarWidth, setSidebarWidth] = useState(306);
  const [inspectorWidth, setInspectorWidth] = useState(314);
  const [workbenchHeight, setWorkbenchHeight] = useState(430);
  const [workbenchPanel, setWorkbenchPanel] =
    useState<WorkbenchPanelMode | null>(null);
  const appBodyRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const recoveryState = useRef({
    project,
    dirty,
    sourceDraftDirty,
    sourceDraftDialogueId,
    sourceDraft,
  });

  useEffect(() => {
    readSystemSettings()
      .then(setSettings)
      .catch(() => setSettings(defaultSettings));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.uiFontSize = settings.uiFontSize;
    document.documentElement.lang = settings.interfaceLocale;
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${settings.editorFontSize}px`,
    );
  }, [
    settings.editorFontSize,
    settings.interfaceLocale,
    settings.theme,
    settings.uiFontSize,
  ]);

  useEffect(() => {
    recoveryState.current = {
      project,
      dirty,
      sourceDraftDirty,
      sourceDraftDialogueId,
      sourceDraft,
    };
  }, [dirty, project, sourceDraft, sourceDraftDialogueId, sourceDraftDirty]);

  useEffect(() => {
    if (!projectLoaded || !isTauri() || !project.rootPath) return;
    const interval = window.setInterval(
      () => {
        const state = recoveryState.current;
        if (!state.dirty && !state.sourceDraftDirty) return;
        void writeRecoverySnapshot(
          state.project,
          state.sourceDraftDirty && state.sourceDraftDialogueId
            ? {
                dialogueId: state.sourceDraftDialogueId,
                source: state.sourceDraft,
              }
            : undefined,
        ).catch(() => undefined);
      },
      Math.max(settings.recoverySnapshotIntervalSeconds, 10) * 1_000,
    );
    return () => window.clearInterval(interval);
  }, [
    project.manifest.projectId,
    project.rootPath,
    projectLoaded,
    settings.recoverySnapshotIntervalSeconds,
  ]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !sourceDraftDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const keydown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (!command) return;
      const target = event.target;
      const editingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (!editingText && event.key.toLowerCase() === "c" && projectLoaded) {
        event.preventDefault();
        copySelectedNode();
      }
      if (
        !editingText &&
        event.key.toLowerCase() === "v" &&
        !event.shiftKey &&
        projectLoaded
      ) {
        event.preventDefault();
        pasteCopiedNode();
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (projectLoaded) void handleSave();
      }
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        if (projectLoaded) undo();
      }
      if (
        (event.key.toLowerCase() === "z" && event.shiftKey) ||
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        if (projectLoaded) redo();
      }
      if (!editingText && event.key.toLowerCase() === "v" && event.shiftKey) {
        event.preventDefault();
        if (projectLoaded) setWorkbenchPanel("problems");
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", keydown);
    };
  });

  async function handleNew() {
    if (
      projectLoaded &&
      (dirty || sourceDraftDirty) &&
      !window.confirm("当前项目有未保存修改或源数据草稿，仍要新建项目吗？")
    )
      return;
    try {
      const rootPath = await chooseProjectDirectory();
      if (!rootPath) return;
      setNewProjectRootPath(rootPath);
      setNotice("请填写项目名称。");
    } catch (error) {
      setNotice(`选择项目目录失败：${errorMessage(error)}`);
    }
  }

  async function handleCreateNew(name: string) {
    if (!newProjectRootPath) return;
    try {
      setBusy(true);
      const snapshot = await createProject(newProjectRootPath, name, "zh-CN");
      setNewProjectRootPath(null);
      setProject(snapshot);
      setNotice(`已创建项目：${snapshot.rootPath}`);
    } catch (error) {
      setNotice(`新建项目失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen() {
    if (
      projectLoaded &&
      (dirty || sourceDraftDirty) &&
      !window.confirm("当前项目有未保存修改或源数据草稿，仍要打开其他项目吗？")
    )
      return;
    try {
      const rootPath = await chooseProjectDirectory(
        "选择包含 .siming 文件的司命项目目录",
      );
      if (!rootPath) return;
      setBusy(true);
      const snapshot = await openProject(rootPath);
      const recovery = await readRecoverySnapshot(snapshot.manifest.projectId);
      if (
        recovery &&
        recovery.projectRoot === snapshot.rootPath &&
        window.confirm(
          `检测到 ${new Date(recovery.createdAtUnixMs).toLocaleString()} 的未保存恢复快照${
            recovery.sourceDraft ? "（包含源 JSON 草稿）" : ""
          }，是否恢复？`,
        )
      ) {
        setProject(recovery.project, true);
        if (recovery.sourceDraft) {
          setSourceDraft(
            recovery.sourceDraft.dialogueId,
            recovery.sourceDraft.source,
            true,
          );
        }
        setNotice("已恢复上次未保存的编辑状态。");
      } else {
        setProject(snapshot);
        setNotice(`已打开：${snapshot.rootPath}`);
      }
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!projectLoaded) {
      setNotice("请先新建或打开项目。");
      return;
    }
    if (sourceDraftDirty) {
      setNotice("请先应用或放弃源 JSON 草稿，再保存项目。");
      return;
    }
    if (!project.rootPath) {
      setNotice("当前项目缺少有效的项目目录。");
      return;
    }
    try {
      setBusy(true);
      await saveProject(project);
      markSaved();
      try {
        await clearRecoverySnapshot(project.manifest.projectId);
      } catch (error) {
        setNotice(`项目已保存，但恢复快照清理失败：${errorMessage(error)}`);
      }
    } catch (error) {
      setNotice(`保存失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    if (!projectLoaded) {
      setNotice("请先新建或打开项目，再导出运行时数据。");
      return;
    }
    if (sourceDraftDirty) {
      setNotice("请先应用或放弃源 JSON 草稿，再导出运行时数据。");
      return;
    }
    if (!project.rootPath) {
      setNotice("当前项目缺少有效的项目目录，无法导出。");
      return;
    }
    if (
      dirty &&
      !window.confirm("项目有未保存修改，是否导出当前内存中的版本？")
    )
      return;
    try {
      let configuredPath =
        settings.projectExportDirectories[project.manifest.projectId]?.trim() ??
        "";
      let nextSettings = settings;
      if (!configuredPath) {
        const selected = await chooseProjectDirectory("选择导出文件位置");
        if (!selected) return;
        configuredPath = selected;
        nextSettings = {
          ...settings,
          projectExportDirectories: {
            ...settings.projectExportDirectories,
            [project.manifest.projectId]: selected,
          },
        };
        await handleSettingsChange(nextSettings, false);
      }
      setBusy(true);
      const result = await exportProject(
        project,
        isAbsolutePath(configuredPath) ? configuredPath : undefined,
      );
      setNotice(
        `已导出 ${result.files.length} 个文件：${result.outputDirectory}`,
      );
    } catch (error) {
      setNotice(`导出失败：${errorMessage(error)}`);
      setWorkbenchPanel("problems");
    } finally {
      setBusy(false);
    }
  }

  async function handleMigration() {
    if (!projectLoaded) {
      setNotice("请先打开需要检查的项目。");
      return;
    }
    if (!project.rootPath) {
      setNotice("当前项目缺少有效的项目目录。");
      return;
    }
    if (
      (dirty || sourceDraftDirty) &&
      !window.confirm("迁移将重新读取磁盘项目并放弃未保存修改，是否继续？")
    )
      return;
    try {
      setBusy(true);
      const report = await checkMigration(project.rootPath);
      if (!report.required) {
        setNotice("项目已是最新 Schema，无需迁移。");
        return;
      }
      const details = report.changes
        .map((change) => `${change.file}：${change.description}`)
        .join("\n");
      if (
        !window.confirm(
          `检测到 ${report.changes.length} 项迁移：\n${details}\n\n执行前会自动备份，是否继续？`,
        )
      )
        return;
      const migrated = await migrateProject(project.rootPath);
      const reopened = await openProject(project.rootPath);
      await clearRecoverySnapshot(project.manifest.projectId);
      setProject(reopened);
      setNotice(`迁移完成，备份：${migrated.backupDirectory ?? "已生成"}`);
    } catch (error) {
      setNotice(`迁移失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSettingsChange(next: SystemSettings, showNotice = true) {
    setSettings(next);
    try {
      await writeSystemSettings(next);
      if (showNotice) setNotice("系统设置已保存在本机。");
    } catch (error) {
      setNotice(`系统设置保存失败：${errorMessage(error)}`);
    }
  }

  const editorActivity = activity === "project" || activity === "search";
  const resourceActivity = [
    "characters",
    "variables",
    "events",
    "tags",
  ].includes(activity);

  if (!projectLoaded) {
    return (
      <main className="welcome-shell">
        <InterfaceLocaleEffect locale={settings.interfaceLocale} />
        <WelcomeView
          notice={notice}
          busy={busy}
          onNew={handleNew}
          onOpen={handleOpen}
          newProjectRootPath={newProjectRootPath}
          onCreateNew={handleCreateNew}
          onCancelNew={() => {
            setNewProjectRootPath(null);
            setNotice("欢迎使用司命。");
          }}
        />
      </main>
    );
  }

  return (
    <main
      className={`app-shell ${
        activity === "welcome" ? "app-shell--welcome" : ""
      }`}
    >
      <InterfaceLocaleEffect locale={settings.interfaceLocale} />
      {activity !== "welcome" && (
        <TopBar
          onNew={handleNew}
          onOpen={handleOpen}
          onSave={handleSave}
          onExport={handleExport}
          onMigration={handleMigration}
          onPanelOpen={setWorkbenchPanel}
        />
      )}
      <div
        ref={appBodyRef}
        className={`app-body ${
          activity === "welcome" ? "app-body--welcome" : ""
        }`}
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
            "--inspector-width": editorActivity ? `${inspectorWidth}px` : "0px",
          } as PanelLayoutStyle
        }
      >
        <Sidebar
          width={sidebarWidth}
          onResizeStart={(event) => {
            const bodyWidth =
              appBodyRef.current?.clientWidth ?? window.innerWidth;
            beginPanelResize(event, {
              axis: "x",
              initialSize: sidebarWidth,
              direction: 1,
              min: 220,
              max: bodyWidth - inspectorWidth - 420,
              onResize: setSidebarWidth,
            });
          }}
          onResizeBy={(delta) =>
            setSidebarWidth((width) => clampPanelSize(width + delta, 220, 480))
          }
        />
        <section
          ref={workspaceRef}
          className={`workspace ${editorActivity ? "workspace--editor" : ""}`}
        >
          {editorActivity &&
            (viewMode === "canvas" ? (
              <CanvasView />
            ) : viewMode === "table" ? (
              <TableView />
            ) : (
              <DataView />
            ))}
          {resourceActivity && <ResourceView activity={activity} />}
          {activity === "settings" && (
            <SettingsView
              settings={settings}
              onSettingsChange={handleSettingsChange}
            />
          )}
          {activity === "welcome" && (
            <WelcomeView
              projectName={project.manifest.name}
              notice={notice}
              busy={busy}
              onNew={handleNew}
              onOpen={handleOpen}
              newProjectRootPath={newProjectRootPath}
              onCreateNew={handleCreateNew}
              onCancelNew={() => {
                setNewProjectRootPath(null);
                setNotice("欢迎使用司命。");
              }}
              onReturn={() => setActivity("project")}
            />
          )}
          {activity !== "welcome" && workbenchPanel && (
            <WorkbenchPanel
              mode={workbenchPanel}
              height={workbenchHeight}
              onModeChange={setWorkbenchPanel}
              onClose={() => setWorkbenchPanel(null)}
              onResizeStart={(event) => {
                const workspaceHeight =
                  workspaceRef.current?.clientHeight ?? window.innerHeight;
                beginPanelResize(event, {
                  axis: "y",
                  initialSize: workbenchHeight,
                  direction: -1,
                  min: 120,
                  max: workspaceHeight - 120,
                  onResize: setWorkbenchHeight,
                });
              }}
              onResizeBy={(delta) => {
                const workspaceHeight =
                  workspaceRef.current?.clientHeight ?? window.innerHeight;
                setWorkbenchHeight((height) =>
                  clampPanelSize(height + delta, 120, workspaceHeight - 120),
                );
              }}
            />
          )}
        </section>
        {editorActivity && (
          <Inspector
            width={inspectorWidth}
            onResizeStart={(event: ReactPointerEvent<HTMLElement>) => {
              const bodyWidth =
                appBodyRef.current?.clientWidth ?? window.innerWidth;
              beginPanelResize(event, {
                axis: "x",
                initialSize: inspectorWidth,
                direction: -1,
                min: 260,
                max: bodyWidth - sidebarWidth - 420,
                onResize: setInspectorWidth,
              });
            }}
            onResizeBy={(delta) =>
              setInspectorWidth((width) =>
                clampPanelSize(width + delta, 260, 520),
              )
            }
          />
        )}
      </div>
      <footer className="statusbar">
        <span>{notice}</span>
        <span>
          {project.rootPath || "IN-MEMORY"} · Schema v
          {project.manifest.schemaVersion}
        </span>
      </footer>
    </main>
  );
}

function errorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "发生未知错误";
}

function isAbsolutePath(value: string) {
  const normalized = value.trim().replaceAll("\\", "/");
  return (
    normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    /^[A-Za-z]:\//.test(normalized)
  );
}
