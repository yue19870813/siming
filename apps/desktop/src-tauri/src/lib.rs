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
struct UserSettings {
    schema_version: u32,
    theme: Theme,
    default_project_directory: Option<String>,
    editor_font_size: u8,
    recovery_snapshot_interval_seconds: u32,
    restore_last_project: bool,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme: Theme::Dark,
            default_project_directory: None,
            editor_font_size: 13,
            recovery_snapshot_interval_seconds: 60,
            restore_last_project: true,
        }
    }
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
fn read_user_settings(app: tauri::AppHandle) -> Result<UserSettings, CommandError> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(UserSettings::default());
    }
    let source = fs::read(&path)
        .map_err(|error| CommandError::new("USER_SETTINGS_READ_FAILED", error, true))?;
    serde_json::from_slice(&source)
        .map_err(|error| CommandError::new("USER_SETTINGS_INVALID", error, true))
}

#[tauri::command]
fn write_user_settings(app: tauri::AppHandle, settings: UserSettings) -> Result<(), CommandError> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| CommandError::new("USER_SETTINGS_WRITE_FAILED", error, true))?;
    }
    let mut bytes = serde_json::to_vec_pretty(&settings)
        .map_err(|error| CommandError::new("USER_SETTINGS_INVALID", error, true))?;
    bytes.push(b'\n');
    fs::write(path, bytes)
        .map_err(|error| CommandError::new("USER_SETTINGS_WRITE_FAILED", error, true))
}

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, CommandError> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("user-settings.json"))
        .map_err(|error| CommandError::new("USER_SETTINGS_PATH_FAILED", error, false))
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
            read_user_settings,
            write_user_settings
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
            super::UserSettings::default().theme,
            super::Theme::Dark
        ));
    }
}
