use serde::{Deserialize, Serialize};
use siming_storage::ProjectSnapshot;
use std::{collections::BTreeMap, fs, path::Path};
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

impl From<siming_core::SimulationError> for CommandError {
    fn from(error: siming_core::SimulationError) -> Self {
        Self::new("SIMULATION_ERROR", error, true)
    }
}

impl From<siming_storage::DeliveryError> for CommandError {
    fn from(error: siming_storage::DeliveryError) -> Self {
        Self::new("PROJECT_DELIVERY_ERROR", error, true)
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
    #[serde(default = "default_ui_font_size")]
    ui_font_size: String,
    editor_font_size: u8,
    #[serde(default = "default_keymap")]
    keymap: String,
    #[serde(default = "default_auto_save_delay")]
    auto_save_delay_seconds: u32,
    recovery_snapshot_interval_seconds: u32,
    restore_last_project: bool,
    #[serde(default)]
    last_project_path: Option<String>,
    #[serde(default)]
    project_export_directories: BTreeMap<String, String>,
}

impl Default for SystemSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme: Theme::Dark,
            default_project_directory: None,
            interface_locale: default_interface_locale(),
            ui_font_size: default_ui_font_size(),
            editor_font_size: 13,
            keymap: default_keymap(),
            auto_save_delay_seconds: default_auto_save_delay(),
            recovery_snapshot_interval_seconds: 60,
            restore_last_project: true,
            last_project_path: None,
            project_export_directories: BTreeMap::new(),
        }
    }
}

fn default_interface_locale() -> String {
    "zh-CN".to_owned()
}

fn default_ui_font_size() -> String {
    "medium".to_owned()
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
fn validate_project(snapshot: ProjectSnapshot) -> Vec<siming_core::Diagnostic> {
    siming_core::validate_project(&snapshot.manifest, &snapshot.dialogues, &snapshot.resources)
}

#[tauri::command]
fn simulate_step(
    request: siming_core::SimulationRequest,
) -> Result<siming_core::SimulationSession, CommandError> {
    Ok(siming_core::simulate_step(request)?)
}

#[tauri::command]
fn export_project(
    snapshot: ProjectSnapshot,
    format: siming_core::ExportFormat,
    output_path: Option<String>,
    pretty: bool,
) -> Result<siming_storage::ExportResult, CommandError> {
    Ok(siming_storage::export_project(
        &snapshot,
        output_path.as_deref().map(Path::new),
        format,
        None,
        pretty,
    )?)
}

#[tauri::command]
fn check_migration(root_path: String) -> Result<siming_storage::MigrationReport, CommandError> {
    Ok(siming_storage::check_migration(Path::new(&root_path))?)
}

#[tauri::command]
fn migrate_project(
    root_path: String,
    backup_directory: Option<String>,
) -> Result<siming_storage::MigrationReport, CommandError> {
    Ok(siming_storage::migrate_project(
        Path::new(&root_path),
        backup_directory.as_deref().map(Path::new),
    )?)
}

#[tauri::command]
fn write_recovery_snapshot(
    app: tauri::AppHandle,
    project: ProjectSnapshot,
    source_draft: Option<siming_storage::RecoverySourceDraft>,
) -> Result<siming_storage::RecoverySnapshot, CommandError> {
    Ok(siming_storage::write_recovery_snapshot(
        &recovery_root(&app)?,
        project,
        source_draft,
    )?)
}

#[tauri::command]
fn read_recovery_snapshot(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<Option<siming_storage::RecoverySnapshot>, CommandError> {
    Ok(siming_storage::read_recovery_snapshot(
        &recovery_root(&app)?,
        &project_id,
    )?)
}

#[tauri::command]
fn clear_recovery_snapshot(app: tauri::AppHandle, project_id: String) -> Result<(), CommandError> {
    Ok(siming_storage::clear_recovery_snapshot(
        &recovery_root(&app)?,
        &project_id,
    )?)
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

fn recovery_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, CommandError> {
    app.path()
        .app_config_dir()
        .map_err(|error| CommandError::new("RECOVERY_PATH_FAILED", error, false))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            core_version,
            create_project,
            open_project,
            save_project,
            validate_project,
            simulate_step,
            export_project,
            check_migration,
            migrate_project,
            write_recovery_snapshot,
            read_recovery_snapshot,
            clear_recovery_snapshot,
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

    #[test]
    fn validation_command_uses_shared_core() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../fixtures/minimal-project");
        let snapshot = siming_storage::open_project(&root).expect("fixture should open");
        let expected = siming_core::validate_project(
            &snapshot.manifest,
            &snapshot.dialogues,
            &snapshot.resources,
        );
        assert_eq!(super::validate_project(snapshot), expected);
    }
}
