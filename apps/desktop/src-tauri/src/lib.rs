use serde::{Deserialize, Serialize};
use siming_storage::ProjectSnapshot;
use std::{fs, path::Path};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandError {
    code: String,
    message: String,
    recoverable: bool,
}

impl CommandError {
    fn new(code: &str, message: impl ToString, recoverable: bool) -> Self {
        Self {
            code: code.to_owned(),
            message: message.to_string(),
            recoverable,
        }
    }
}

impl From<siming_storage::StorageError> for CommandError {
    fn from(error: siming_storage::StorageError) -> Self {
        Self::new("PROJECT_STORAGE_ERROR", error, true)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SystemSettings {
    schema_version: u32,
    theme: Theme,
    #[serde(default)]
    default_project_directory: Option<String>,
    #[serde(default = "default_interface_locale")]
    interface_locale: String,
    editor_font_size: u8,
    #[serde(default = "default_keymap")]
    keymap: String,
    #[serde(default = "default_auto_save_delay")]
    auto_save_delay_seconds: u32,
    recovery_snapshot_interval_seconds: u32,
    restore_last_project: bool,
}

impl Default for SystemSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme: Theme::Dark,
            default_project_directory: None,
            interface_locale: default_interface_locale(),
            editor_font_size: 13,
            keymap: default_keymap(),
            auto_save_delay_seconds: default_auto_save_delay(),
            recovery_snapshot_interval_seconds: 60,
            restore_last_project: true,
        }
    }
}

fn default_interface_locale() -> String {
    "zh-CN".to_owned()
}

fn default_keymap() -> String {
    "system".to_owned()
}

fn default_auto_save_delay() -> u32 {
    30
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Theme {
    Dark,
    Light,
}

#[tauri::command]
fn core_version() -> &'static str {
    siming_core::version()
}

#[tauri::command]
fn create_project(
    root_path: String,
    name: String,
    default_locale: String,
) -> Result<ProjectSnapshot, CommandError> {
    Ok(siming_storage::create_project(
        Path::new(&root_path),
        &name,
        &default_locale,
    )?)
}

#[tauri::command]
fn open_project(root_path: String) -> Result<ProjectSnapshot, CommandError> {
    Ok(siming_storage::open_project(Path::new(&root_path))?)
}

#[tauri::command]
fn save_project(snapshot: ProjectSnapshot) -> Result<(), CommandError> {
    Ok(siming_storage::save_project(&snapshot)?)
}

#[tauri::command]
fn read_system_settings(app: tauri::AppHandle) -> Result<SystemSettings, CommandError> {
    let path = system_settings_path(&app)?;
    if !path.exists() {
        let legacy_path = legacy_user_settings_path(&app)?;
        if !legacy_path.exists() {
            return Ok(SystemSettings::default());
        }
        return read_system_settings_file(&legacy_path);
    }
    read_system_settings_file(&path)
}

fn read_system_settings_file(path: &Path) -> Result<SystemSettings, CommandError> {
    let source = fs::read(path)
        .map_err(|error| CommandError::new("SYSTEM_SETTINGS_READ_FAILED", error, true))?;
    serde_json::from_slice(&source)
        .map_err(|error| CommandError::new("SYSTEM_SETTINGS_INVALID", error, true))
}

#[tauri::command]
fn write_system_settings(
    app: tauri::AppHandle,
    settings: SystemSettings,
) -> Result<(), CommandError> {
    let path = system_settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| CommandError::new("SYSTEM_SETTINGS_WRITE_FAILED", error, true))?;
    }
    let mut bytes = serde_json::to_vec_pretty(&settings)
        .map_err(|error| CommandError::new("SYSTEM_SETTINGS_INVALID", error, true))?;
    bytes.push(b'\n');
    fs::write(path, bytes)
        .map_err(|error| CommandError::new("SYSTEM_SETTINGS_WRITE_FAILED", error, true))
}

fn system_settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, CommandError> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("system-settings.json"))
        .map_err(|error| CommandError::new("SYSTEM_SETTINGS_PATH_FAILED", error, false))
}

fn legacy_user_settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, CommandError> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("user-settings.json"))
        .map_err(|error| CommandError::new("SYSTEM_SETTINGS_PATH_FAILED", error, false))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            core_version,
            create_project,
            open_project,
            save_project,
            read_system_settings,
            write_system_settings
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Siming desktop application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn ipc_version_comes_from_shared_core() {
        assert_eq!(super::core_version(), siming_core::VERSION);
    }

    #[test]
    fn default_theme_is_dark() {
        assert!(matches!(
            super::SystemSettings::default().theme,
            super::Theme::Dark
        ));
    }
}
