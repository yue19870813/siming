import { useEffect, useRef, useState } from "react";
import { CanvasView } from "./components/CanvasView";
import { DataView } from "./components/DataView";
import { Inspector } from "./components/Inspector";
import { ResourceView } from "./components/ResourceView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { TableView } from "./components/TableView";
import { TopBar } from "./components/TopBar";
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
import type { SystemSettings } from "./model/types";
import { useEditorStore } from "./store/editorStore";

const defaultSettings: SystemSettings = {
  schemaVersion: 1,
  theme: "dark",
  defaultProjectDirectory: null,
  interfaceLocale: "zh-CN",
  editorFontSize: 13,
  keymap: "system",
  autoSaveDelaySeconds: 30,
  recoverySnapshotIntervalSeconds: 60,
  restoreLastProject: true,
};

export default function App() {
  const project = useEditorStore((state) => state.project);
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
  const setBusy = useEditorStore((state) => state.setBusy);
  const setNotice = useEditorStore((state) => state.setNotice);
  const markSaved = useEditorStore((state) => state.markSaved);
  const setSourceDraft = useEditorStore((state) => state.setSourceDraft);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const [settings, setSettings] = useState(defaultSettings);
  const [workbenchPanel, setWorkbenchPanel] =
    useState<WorkbenchPanelMode | null>(null);
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
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${settings.editorFontSize}px`,
    );
  }, [settings.editorFontSize, settings.theme]);

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
    if (!isTauri() || !project.rootPath) return;
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
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if (
        (event.key.toLowerCase() === "z" && event.shiftKey) ||
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        redo();
      }
      if (event.key.toLowerCase() === "v" && event.shiftKey) {
        event.preventDefault();
        setWorkbenchPanel("problems");
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
      (dirty || sourceDraftDirty) &&
      !window.confirm("当前项目有未保存修改或源数据草稿，仍要新建项目吗？")
    )
      return;
    try {
      const rootPath = await chooseProjectDirectory();
      if (!rootPath) return;
      const name = window.prompt("项目名称", "新的司命项目")?.trim();
      if (!name) return;
      setBusy(true);
      const snapshot = await createProject(rootPath, name, "zh-CN");
      setProject(snapshot);
      setNotice(`已创建项目：${snapshot.rootPath}`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen() {
    if (
      (dirty || sourceDraftDirty) &&
      !window.confirm("当前项目有未保存修改或源数据草稿，仍要打开其他项目吗？")
    )
      return;
    try {
      const rootPath = await chooseProjectDirectory();
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
    if (sourceDraftDirty) {
      setNotice("请先应用或放弃源 JSON 草稿，再保存项目。");
      return;
    }
    if (!project.rootPath) {
      setNotice("演示项目不能直接保存，请先新建真实项目。");
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
    if (sourceDraftDirty) {
      setNotice("请先应用或放弃源 JSON 草稿，再导出运行时数据。");
      return;
    }
    if (!project.rootPath) {
      setNotice("演示项目不能导出，请先新建或打开真实项目。");
      return;
    }
    if (
      dirty &&
      !window.confirm("项目有未保存修改，是否导出当前内存中的版本？")
    )
      return;
    try {
      setBusy(true);
      const result = await exportProject(project);
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
    if (!project.rootPath) {
      setNotice("演示项目不需要迁移。");
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

  async function handleSettingsChange(next: SystemSettings) {
    setSettings(next);
    try {
      await writeSystemSettings(next);
      setNotice("系统设置已保存在本机。");
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

  return (
    <main className="app-shell">
      <TopBar
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onExport={handleExport}
        onMigration={handleMigration}
        onPanelOpen={setWorkbenchPanel}
      />
      <div className="app-body">
        <Sidebar />
        <section
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
          {workbenchPanel && (
            <WorkbenchPanel
              mode={workbenchPanel}
              onModeChange={setWorkbenchPanel}
              onClose={() => setWorkbenchPanel(null)}
            />
          )}
        </section>
        {editorActivity && <Inspector />}
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
