import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  Diagnostic,
  ExportFormat,
  ExportResult,
  MigrationReport,
  ProjectSnapshot,
  RecoverySnapshot,
  RecoverySourceDraft,
  SimulationRequest,
  SimulationSession,
  SystemSettings,
} from "../model/types";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function chooseProjectDirectory(title = "选择司命项目目录") {
  if (!isTauri()) {
    throw new Error("浏览器预览模式不能访问本地目录，请使用 Tauri dev 模式。");
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  return typeof selected === "string" ? selected : null;
}

export async function createProject(
  rootPath: string,
  name: string,
  defaultLocale: string,
) {
  return invoke<ProjectSnapshot>("create_project", {
    rootPath,
    name,
    defaultLocale,
  });
}

export async function openProject(rootPath: string) {
  return invoke<ProjectSnapshot>("open_project", { rootPath });
}

export async function saveProject(snapshot: ProjectSnapshot) {
  return invoke<void>("save_project", { snapshot });
}

export async function chooseCharacterAvatarFile() {
  if (!isTauri()) {
    throw new Error("角色头像导入需要在 Tauri dev 模式中运行。");
  }
  const selected = await open({
    directory: false,
    multiple: false,
    title: "选择角色头像",
    filters: [
      {
        name: "图片",
        extensions: ["png", "jpg", "jpeg", "webp"],
      },
    ],
  });
  return typeof selected === "string" ? selected : null;
}

export async function importCharacterAvatar(
  rootPath: string,
  characterId: string,
  sourcePath: string,
) {
  requireTauri("角色头像导入");
  return invoke<string>("import_character_avatar", {
    rootPath,
    characterId,
    sourcePath,
  });
}

export async function readProjectAsset(rootPath: string, relativePath: string) {
  requireTauri("项目资源读取");
  return invoke<number[]>("read_project_asset", {
    rootPath,
    relativePath,
  });
}

export async function exportProject(
  snapshot: ProjectSnapshot,
  format: ExportFormat,
  outputPath?: string,
  pretty = false,
) {
  requireTauri("运行时导出");
  return invoke<ExportResult>("export_project", {
    snapshot,
    format,
    outputPath: outputPath ?? null,
    pretty,
  });
}

export async function checkMigration(rootPath: string) {
  requireTauri("迁移检查");
  return invoke<MigrationReport>("check_migration", { rootPath });
}

export async function migrateProject(
  rootPath: string,
  backupDirectory?: string,
) {
  requireTauri("项目迁移");
  return invoke<MigrationReport>("migrate_project", {
    rootPath,
    backupDirectory: backupDirectory ?? null,
  });
}

export async function writeRecoverySnapshot(
  project: ProjectSnapshot,
  sourceDraft?: RecoverySourceDraft,
) {
  requireTauri("恢复快照");
  return invoke<RecoverySnapshot>("write_recovery_snapshot", {
    project,
    sourceDraft: sourceDraft ?? null,
  });
}

export async function readRecoverySnapshot(projectId: string) {
  requireTauri("恢复快照");
  return invoke<RecoverySnapshot | null>("read_recovery_snapshot", {
    projectId,
  });
}

export async function clearRecoverySnapshot(projectId: string) {
  requireTauri("恢复快照");
  return invoke<void>("clear_recovery_snapshot", { projectId });
}

export async function validateProject(snapshot: ProjectSnapshot) {
  if (!isTauri()) {
    throw new Error("完整校验需要在 Tauri dev 模式中运行。");
  }
  return invoke<Diagnostic[]>("validate_project", { snapshot });
}

export async function simulateStep(request: SimulationRequest) {
  if (!isTauri()) {
    throw new Error("模拟运行需要在 Tauri dev 模式中运行。");
  }
  return invoke<SimulationSession>("simulate_step", { request });
}

export async function readSystemSettings(): Promise<SystemSettings> {
  if (!isTauri()) {
    const source = localStorage.getItem("siming.system-settings");
    if (source) {
      try {
        const saved = JSON.parse(source) as Partial<SystemSettings>;
        const defaults = browserSystemSettings(
          saved.theme === "light" ? "light" : "dark",
        );
        return {
          ...defaults,
          ...saved,
          uiFontSize: ["small", "medium", "large"].includes(
            saved.uiFontSize ?? "",
          )
            ? saved.uiFontSize!
            : "medium",
        };
      } catch {
        localStorage.removeItem("siming.system-settings");
      }
    }
    const theme = localStorage.getItem("siming.theme");
    return browserSystemSettings(theme === "light" ? "light" : "dark");
  }
  return invoke<SystemSettings>("read_system_settings");
}

export async function writeSystemSettings(settings: SystemSettings) {
  if (!isTauri()) {
    localStorage.setItem("siming.theme", settings.theme);
    localStorage.setItem("siming.system-settings", JSON.stringify(settings));
    return;
  }
  await invoke("write_system_settings", { settings });
}

function browserSystemSettings(theme: SystemSettings["theme"]): SystemSettings {
  return {
    schemaVersion: 1,
    theme,
    defaultProjectDirectory: null,
    interfaceLocale: "zh-CN",
    uiFontSize: "medium",
    editorFontSize: 13,
    keymap: "system",
    autoSaveDelaySeconds: 30,
    recoverySnapshotIntervalSeconds: 60,
    restoreLastProject: true,
    lastProjectPath: null,
    projectExportDirectories: {},
  };
}

function requireTauri(feature: string) {
  if (!isTauri()) {
    throw new Error(`${feature}需要在 Tauri dev 模式中运行。`);
  }
}
