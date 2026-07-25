import { useEffect, useState } from "react";
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
  createProject,
  openProject,
  readSystemSettings,
  saveProject,
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
  const notice = useEditorStore((state) => state.notice);
  const setProject = useEditorStore((state) => state.setProject);
  const setBusy = useEditorStore((state) => state.setBusy);
  const setNotice = useEditorStore((state) => state.setNotice);
  const markSaved = useEditorStore((state) => state.markSaved);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const [settings, setSettings] = useState(defaultSettings);
  const [workbenchPanel, setWorkbenchPanel] =
    useState<WorkbenchPanelMode | null>(null);

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
      setProject(snapshot);
      setNotice(`已打开：${snapshot.rootPath}`);
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
    } catch (error) {
      setNotice(`保存失败：${errorMessage(error)}`);
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
