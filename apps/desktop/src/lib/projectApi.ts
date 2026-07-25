import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ProjectSnapshot, SystemSettings } from "../model/types";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function chooseProjectDirectory() {
  if (!isTauri()) {
    throw new Error("浏览器预览模式不能访问本地目录，请使用 Tauri dev 模式。");
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择司命项目目录",
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

export async function readSystemSettings(): Promise<SystemSettings> {
  if (!isTauri()) {
    const theme = localStorage.getItem("siming.theme");
    return {
      schemaVersion: 1,
      theme: theme === "light" ? "light" : "dark",
      defaultProjectDirectory: null,
      interfaceLocale: "zh-CN",
      editorFontSize: 13,
      keymap: "system",
      autoSaveDelaySeconds: 30,
      recoverySnapshotIntervalSeconds: 60,
      restoreLastProject: true,
    };
  }
  return invoke<SystemSettings>("read_system_settings");
}

export async function writeSystemSettings(settings: SystemSettings) {
  if (!isTauri()) {
    localStorage.setItem("siming.theme", settings.theme);
    return;
  }
  await invoke("write_system_settings", { settings });
}
