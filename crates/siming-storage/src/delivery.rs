use super::{
    PROJECT_FILE, ProjectSnapshot, StorageError, absolute_path, read_json, resolve_project_path,
    write_json_atomic,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use siming_core::{CompileError, RUNTIME_SCHEMA_VERSION, compile_runtime};
use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum DeliveryError {
    #[error(transparent)]
    Storage(#[from] StorageError),
    #[error(transparent)]
    Compile(#[from] CompileError),
    #[error("output path is unsafe: {0}")]
    UnsafeOutput(String),
    #[error("unsupported source schema version {found}; supported version is {supported}")]
    UnsupportedSchema { found: u64, supported: u32 },
    #[error("delivery filesystem operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("delivery JSON is invalid: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_directory: String,
    pub files: Vec<ExportedFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedFile {
    pub path: String,
    pub sha256: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportManifest {
    schema_version: u32,
    runtime_schema_version: u32,
    generator_version: String,
    default_locale: String,
    locales: Vec<String>,
    files: Vec<ExportedFile>,
}

pub fn export_project(
    snapshot: &ProjectSnapshot,
    output_override: Option<&Path>,
    pretty: bool,
) -> Result<ExportResult, DeliveryError> {
    let bundle = compile_runtime(&snapshot.manifest, &snapshot.dialogues, &snapshot.resources)?;
    let project_root = absolute_path(Path::new(&snapshot.root_path))?;
    let output = match output_override {
        Some(path) => absolute_path(path)?,
        None => resolve_project_path(&project_root, &snapshot.manifest.paths.exports)?,
    };
    ensure_safe_output(&project_root, &output)?;

    let parent = output
        .parent()
        .ok_or_else(|| DeliveryError::UnsafeOutput(output.display().to_string()))?;
    fs::create_dir_all(parent)?;
    let temp = parent.join(format!(".siming-export-{}", Uuid::new_v4()));
    fs::create_dir_all(temp.join("locales"))?;

    let mut files = Vec::new();
    let project_bytes = serialize_json(&bundle.project, pretty)?;
    write_export_file(&temp, "dialogues.runtime.json", &project_bytes, &mut files)?;
    for (locale, resource) in &bundle.locales {
        let relative = format!("locales/{locale}.json");
        let bytes = serialize_json(resource, pretty)?;
        write_export_file(&temp, &relative, &bytes, &mut files)?;
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    let manifest = ExportManifest {
        schema_version: 1,
        runtime_schema_version: RUNTIME_SCHEMA_VERSION,
        generator_version: siming_core::version().to_owned(),
        default_locale: snapshot.manifest.default_locale.clone(),
        locales: snapshot.manifest.locales.clone(),
        files: files.clone(),
    };
    let manifest_bytes = serialize_json(&manifest, pretty)?;
    let manifest_file = exported_file("manifest.json", &manifest_bytes);
    write_bytes_sync(&temp.join("manifest.json"), &manifest_bytes)?;
    files.push(manifest_file);
    files.sort_by(|left, right| left.path.cmp(&right.path));

    replace_directory(&temp, &output)?;
    Ok(ExportResult {
        output_directory: output.display().to_string(),
        files,
    })
}

pub fn serialize_json<T: Serialize>(value: &T, pretty: bool) -> Result<Vec<u8>, DeliveryError> {
    let mut bytes = if pretty {
        serde_json::to_vec_pretty(value)?
    } else {
        serde_json::to_vec(value)?
    };
    bytes.push(b'\n');
    Ok(bytes)
}

fn ensure_safe_output(project_root: &Path, output: &Path) -> Result<(), DeliveryError> {
    if output.parent().is_none() || output == project_root {
        return Err(DeliveryError::UnsafeOutput(output.display().to_string()));
    }
    if output.as_os_str().is_empty() {
        return Err(DeliveryError::UnsafeOutput(output.display().to_string()));
    }
    Ok(())
}

fn write_export_file(
    root: &Path,
    relative: &str,
    bytes: &[u8],
    files: &mut Vec<ExportedFile>,
) -> Result<(), DeliveryError> {
    write_bytes_sync(&root.join(relative), bytes)?;
    files.push(exported_file(relative, bytes));
    Ok(())
}

fn write_bytes_sync(path: &Path, bytes: &[u8]) -> Result<(), DeliveryError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = File::create(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn exported_file(path: &str, bytes: &[u8]) -> ExportedFile {
    ExportedFile {
        path: path.to_owned(),
        sha256: hex_hash(bytes),
        bytes: bytes.len() as u64,
    }
}

fn hex_hash(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn replace_directory(temp: &Path, output: &Path) -> Result<(), DeliveryError> {
    if !output.exists() {
        fs::rename(temp, output)?;
        return Ok(());
    }
    let parent = output
        .parent()
        .ok_or_else(|| DeliveryError::UnsafeOutput(output.display().to_string()))?;
    let backup = parent.join(format!(".siming-export-backup-{}", Uuid::new_v4()));
    fs::rename(output, &backup)?;
    if let Err(error) = fs::rename(temp, output) {
        let _ = fs::rename(&backup, output);
        return Err(DeliveryError::Io(error));
    }
    fs::remove_dir_all(backup)?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub current_schema_version: u32,
    pub target_schema_version: u32,
    pub required: bool,
    pub changes: Vec<MigrationChange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_directory: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationChange {
    pub file: String,
    pub description: String,
}

pub fn check_migration(root: &Path) -> Result<MigrationReport, DeliveryError> {
    let root = absolute_path(root)?;
    let project_path = root.join(PROJECT_FILE);
    let manifest: Value = read_json(&project_path)?;
    let version = schema_version(&manifest)?;
    let dialogue_paths = dialogue_paths(&manifest);
    let mut changes = Vec::new();
    if version < 1 {
        changes.push(MigrationChange {
            file: PROJECT_FILE.to_owned(),
            description: "补充项目 schemaVersion 1".to_owned(),
        });
    }
    for relative in dialogue_paths {
        let path = resolve_project_path(&root, &relative)?;
        let dialogue: Value = read_json(&path)?;
        let dialogue_version = schema_version(&dialogue)?;
        if dialogue_version < 1 {
            changes.push(MigrationChange {
                file: relative.clone(),
                description: "补充对话 schemaVersion 1".to_owned(),
            });
        }
        let legacy_count = legacy_host_event_count(&dialogue);
        if legacy_count > 0 {
            changes.push(MigrationChange {
                file: relative,
                description: format!("将 {legacy_count} 个 hostEvent 转换为 hostEvents[]"),
            });
        }
    }
    Ok(MigrationReport {
        current_schema_version: version as u32,
        target_schema_version: 1,
        required: !changes.is_empty(),
        changes,
        backup_directory: None,
    })
}

pub fn migrate_project(
    root: &Path,
    backup_override: Option<&Path>,
) -> Result<MigrationReport, DeliveryError> {
    let root = absolute_path(root)?;
    let mut report = check_migration(&root)?;
    if !report.required {
        return Ok(report);
    }
    let project_path = root.join(PROJECT_FILE);
    let mut manifest: Value = read_json(&project_path)?;
    let paths = dialogue_paths(&manifest);
    let mut documents = Vec::new();
    for relative in &paths {
        let path = resolve_project_path(&root, relative)?;
        let mut value: Value = read_json(&path)?;
        migrate_value(&mut value);
        documents.push((relative.clone(), path, value));
    }
    migrate_value(&mut manifest);

    let backup = match backup_override {
        Some(path) => absolute_path(path)?,
        None => root
            .join(".siming/migration-backups")
            .join(Uuid::new_v4().to_string()),
    };
    fs::create_dir_all(&backup)?;
    copy_to_backup(&root, &backup, PROJECT_FILE)?;
    for relative in &paths {
        copy_to_backup(&root, &backup, relative)?;
    }

    let write_result = (|| -> Result<(), DeliveryError> {
        write_json_atomic(&project_path, &manifest)?;
        for (_relative, path, value) in &documents {
            write_json_atomic(path, value)?;
        }
        Ok(())
    })();
    if let Err(error) = write_result {
        let _ = restore_backup(&root, &backup, PROJECT_FILE);
        for relative in &paths {
            let _ = restore_backup(&root, &backup, relative);
        }
        return Err(error);
    }
    report.backup_directory = Some(backup.display().to_string());
    Ok(report)
}

fn schema_version(value: &Value) -> Result<u64, DeliveryError> {
    let version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if version > 1 {
        return Err(DeliveryError::UnsupportedSchema {
            found: version,
            supported: 1,
        });
    }
    Ok(version)
}

fn dialogue_paths(manifest: &Value) -> Vec<String> {
    manifest
        .get("dialogues")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.get("path").and_then(Value::as_str))
        .map(str::to_owned)
        .collect()
}

fn legacy_host_event_count(dialogue: &Value) -> usize {
    dialogue
        .get("nodes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|node| {
            node.get("data")
                .and_then(Value::as_object)
                .is_some_and(|data| data.contains_key("hostEvent"))
        })
        .count()
}

fn migrate_value(value: &mut Value) {
    if let Some(object) = value.as_object_mut() {
        object.insert("schemaVersion".to_owned(), Value::from(1));
    }
    if let Some(nodes) = value.get_mut("nodes").and_then(Value::as_array_mut) {
        for node in nodes {
            let Some(data) = node.get_mut("data").and_then(Value::as_object_mut) else {
                continue;
            };
            if !data.contains_key("hostEvents") {
                if let Some(event) = data.remove("hostEvent") {
                    data.insert("hostEvents".to_owned(), Value::Array(vec![event]));
                }
            } else {
                data.remove("hostEvent");
            }
        }
    }
}

fn copy_to_backup(root: &Path, backup: &Path, relative: &str) -> Result<(), DeliveryError> {
    let source = resolve_project_path(root, relative)?;
    let target = backup.join(relative);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source, target)?;
    Ok(())
}

fn restore_backup(root: &Path, backup: &Path, relative: &str) -> Result<(), DeliveryError> {
    let source = backup.join(relative);
    let target = resolve_project_path(root, relative)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source, target)?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySnapshot {
    pub schema_version: u32,
    pub project_id: String,
    pub project_root: String,
    pub saved_fingerprint: String,
    pub project: ProjectSnapshot,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_draft: Option<RecoverySourceDraft>,
    pub created_at_unix_ms: u128,
    pub app_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySourceDraft {
    pub dialogue_id: String,
    pub source: String,
}

pub fn write_recovery_snapshot(
    recovery_root: &Path,
    project: ProjectSnapshot,
    source_draft: Option<RecoverySourceDraft>,
) -> Result<RecoverySnapshot, DeliveryError> {
    let fingerprint = hex_hash(&serde_json::to_vec(&project)?);
    let snapshot = RecoverySnapshot {
        schema_version: 1,
        project_id: project.manifest.project_id.clone(),
        project_root: project.root_path.clone(),
        saved_fingerprint: fingerprint,
        project,
        source_draft,
        created_at_unix_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        app_version: siming_core::version().to_owned(),
    };
    let path = recovery_path(recovery_root, &snapshot.project_id);
    write_json_atomic(&path, &snapshot)?;
    Ok(snapshot)
}

pub fn read_recovery_snapshot(
    recovery_root: &Path,
    project_id: &str,
) -> Result<Option<RecoverySnapshot>, DeliveryError> {
    let path = recovery_path(recovery_root, project_id);
    if !path.exists() {
        return Ok(None);
    }
    let snapshot: RecoverySnapshot = read_json(&path)?;
    if snapshot.schema_version != 1 || snapshot.project_id != project_id {
        return Ok(None);
    }
    Ok(Some(snapshot))
}

pub fn clear_recovery_snapshot(
    recovery_root: &Path,
    project_id: &str,
) -> Result<(), DeliveryError> {
    let path = recovery_path(recovery_root, project_id);
    if path.exists() {
        fs::remove_file(&path)?;
    }
    if let Some(parent) = path.parent() {
        if parent.is_dir() && parent.read_dir()?.next().is_none() {
            fs::remove_dir(parent)?;
        }
    }
    Ok(())
}

fn recovery_path(root: &Path, project_id: &str) -> PathBuf {
    root.join("recovery").join(project_id).join("snapshot.json")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{create_project, open_project};

    #[test]
    fn deterministic_export_is_byte_identical_and_editor_free() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/minimal-project");
        let snapshot = open_project(&fixture).unwrap();
        let root = test_directory("export");
        let first = root.join("first");
        let second = root.join("second");
        export_project(&snapshot, Some(&first), false).unwrap();
        export_project(&snapshot, Some(&second), false).unwrap();

        for relative in [
            "manifest.json",
            "dialogues.runtime.json",
            "locales/zh-CN.json",
            "locales/en-US.json",
        ] {
            assert_eq!(
                fs::read(first.join(relative)).unwrap(),
                fs::read(second.join(relative)).unwrap()
            );
        }
        let runtime = fs::read_to_string(first.join("dialogues.runtime.json")).unwrap();
        assert!(!runtime.contains("position"));
        assert!(!runtime.contains("\"edges\""));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn migration_checks_backs_up_and_converts_legacy_host_event() {
        let root = test_directory("migration-project");
        let snapshot = create_project(&root, "迁移测试", "zh-CN").unwrap();
        let dialogue_path = root.join(&snapshot.manifest.dialogues[0].path);
        let mut dialogue: Value = read_json(&dialogue_path).unwrap();
        let data = dialogue["nodes"][0]["data"].as_object_mut().unwrap();
        data.remove("hostEvents");
        data.insert(
            "hostEvent".to_owned(),
            serde_json::json!({"name": "legacy.event", "payload": {}}),
        );
        write_json_atomic(&dialogue_path, &dialogue).unwrap();

        let report = check_migration(&root).unwrap();
        assert!(report.required);
        assert!(
            report
                .changes
                .iter()
                .any(|item| item.description.contains("hostEvent"))
        );
        let migrated = migrate_project(&root, None).unwrap();
        assert!(migrated.backup_directory.is_some());
        let dialogue: Value = read_json(&dialogue_path).unwrap();
        assert!(dialogue["nodes"][0]["data"].get("hostEvent").is_none());
        assert_eq!(
            dialogue["nodes"][0]["data"]["hostEvents"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn recovery_snapshot_round_trips_and_clears() {
        let project_root = test_directory("recovery-project");
        let recovery_root = test_directory("recovery-data");
        let project = create_project(&project_root, "恢复测试", "zh-CN").unwrap();
        let project_id = project.manifest.project_id.clone();
        write_recovery_snapshot(
            &recovery_root,
            project,
            Some(RecoverySourceDraft {
                dialogue_id: "dialogue".to_owned(),
                source: "{ draft".to_owned(),
            }),
        )
        .unwrap();
        let recovered = read_recovery_snapshot(&recovery_root, &project_id)
            .unwrap()
            .unwrap();
        assert_eq!(recovered.project_id, project_id);
        assert!(recovered.source_draft.is_some());
        clear_recovery_snapshot(&recovery_root, &project_id).unwrap();
        assert!(
            read_recovery_snapshot(&recovery_root, &project_id)
                .unwrap()
                .is_none()
        );
        fs::remove_dir_all(project_root).unwrap();
        fs::remove_dir_all(recovery_root).unwrap();
    }

    fn test_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("siming-{label}-{}", Uuid::new_v4()))
    }
}
