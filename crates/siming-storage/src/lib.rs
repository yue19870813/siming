//! Filesystem boundary helpers shared by the desktop application and CLI.

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use siming_core::{
    DialogueDocument, DialogueIndexEntry, Edge, ExportFormat, Node, NodeType, Position,
    ProjectManifest, ProjectPaths, ProjectResources, validate_editable_project,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::Write,
    path::{Component, Path, PathBuf},
};
use thiserror::Error;
use uuid::Uuid;

mod delivery;
pub use delivery::*;

const PROJECT_FILE: &str = ".siming/project.json";
const PROJECT_MARKER_EXTENSION: &str = "siming";
const DEFAULT_SUPPORTED_LOCALES: [&str; 5] = ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMarker {
    schema_version: u32,
    project_id: String,
    name: String,
    manifest: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub root_path: String,
    pub manifest: ProjectManifest,
    pub dialogues: Vec<DialogueDocument>,
    pub resources: ProjectResources,
}

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("project path must be relative")]
    Absolute,
    #[error("project path cannot escape the project root")]
    EscapesProject,
    #[error("project path cannot be empty")]
    Empty,
    #[error("project already exists at {0}")]
    ProjectExists(String),
    #[error("project manifest not found at {0}")]
    ProjectNotFound(String),
    #[error("project contains invalid editable data: {0}")]
    InvalidProject(String),
    #[error("filesystem operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("project JSON is invalid: {0}")]
    Json(#[from] serde_json::Error),
}

pub type StorageResult<T> = Result<T, StorageError>;

/// Normalizes a project-relative path without touching the filesystem.
pub fn normalize_project_relative_path(path: &Path) -> StorageResult<PathBuf> {
    if path.as_os_str().is_empty() {
        return Err(StorageError::Empty);
    }
    if path.is_absolute() {
        return Err(StorageError::Absolute);
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(segment) => normalized.push(segment),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(StorageError::EscapesProject);
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(StorageError::Empty);
    }
    Ok(normalized)
}

pub fn create_project(
    root: &Path,
    name: &str,
    default_locale: &str,
) -> StorageResult<ProjectSnapshot> {
    let root = absolute_path(root)?;
    let project_file = root.join(PROJECT_FILE);
    if project_file.exists() {
        return Err(StorageError::ProjectExists(root.display().to_string()));
    }

    fs::create_dir_all(&root)?;
    fs::create_dir_all(root.join(".siming"))?;
    fs::create_dir_all(root.join("dialogues"))?;
    fs::create_dir_all(root.join("definitions"))?;
    fs::create_dir_all(root.join("exports/runtime"))?;

    let dialogue_id = Uuid::new_v4().to_string();
    let start_id = Uuid::new_v4().to_string();
    let end_id = Uuid::new_v4().to_string();
    let dialogue_path = "dialogues/intro.json".to_owned();
    let mut start_data = BTreeMap::new();
    start_data.insert("hostEvents".to_owned(), serde_json::json!([]));
    let mut end_data = BTreeMap::new();
    end_data.insert("hostEvents".to_owned(), serde_json::json!([]));

    let dialogue = DialogueDocument {
        schema_version: 1,
        id: dialogue_id.clone(),
        key: "intro".to_owned(),
        name: "第一段对话".to_owned(),
        description: String::new(),
        tags: Vec::new(),
        entry_node_id: start_id.clone(),
        nodes: vec![
            Node {
                id: start_id.clone(),
                key: "start".to_owned(),
                node_type: NodeType::Start,
                position: Position { x: 100.0, y: 180.0 },
                data: start_data,
            },
            Node {
                id: end_id.clone(),
                key: "end".to_owned(),
                node_type: NodeType::End,
                position: Position { x: 520.0, y: 180.0 },
                data: end_data,
            },
        ],
        edges: vec![Edge {
            id: Uuid::new_v4().to_string(),
            source_node_id: start_id,
            source_port: "next".to_owned(),
            target_node_id: end_id,
            target_port: "in".to_owned(),
        }],
    };

    let mut locales = vec![default_locale.to_owned()];
    locales.extend(
        DEFAULT_SUPPORTED_LOCALES
            .iter()
            .filter(|locale| **locale != default_locale)
            .map(|locale| (*locale).to_owned()),
    );

    let manifest = ProjectManifest {
        schema_version: 1,
        project_id: Uuid::new_v4().to_string(),
        name: if name.trim().is_empty() {
            "未命名项目".to_owned()
        } else {
            name.trim().to_owned()
        },
        paths: ProjectPaths {
            dialogues: "dialogues/".to_owned(),
            exports: "exports/runtime/".to_owned(),
        },
        default_export_format: ExportFormat::Json,
        default_locale: default_locale.to_owned(),
        locales,
        dialogue_directories: vec!["dialogues".to_owned()],
        dialogues: vec![DialogueIndexEntry {
            id: dialogue_id,
            key: "intro".to_owned(),
            path: dialogue_path,
        }],
    };

    let snapshot = ProjectSnapshot {
        root_path: root.display().to_string(),
        manifest,
        dialogues: vec![dialogue],
        resources: ProjectResources::default(),
    };
    save_project(&snapshot)?;
    Ok(snapshot)
}

pub fn open_project(root: &Path) -> StorageResult<ProjectSnapshot> {
    let root = project_root(root)?;
    let manifest_path = root.join(PROJECT_FILE);
    if !manifest_path.exists() {
        return Err(StorageError::ProjectNotFound(
            manifest_path.display().to_string(),
        ));
    }

    let manifest: ProjectManifest = read_json(&manifest_path)?;
    // Backfill a visible marker for legacy projects when the directory is writable.
    let _ = write_project_marker(&root, &manifest);
    let dialogues = manifest
        .dialogues
        .iter()
        .map(|entry| {
            let path = resolve_project_path(&root, &entry.path)?;
            read_json(&path)
        })
        .collect::<StorageResult<Vec<_>>>()?;
    let resources = ProjectResources {
        characters: read_definition(&root.join("definitions/characters.json"), "characters")?,
        variables: read_definition(&root.join("definitions/variables.json"), "variables")?,
        events: read_definition(&root.join("definitions/events.json"), "events")?,
        tags: read_definition(&root.join("definitions/tags.json"), "tags")?,
    };

    Ok(ProjectSnapshot {
        root_path: root.display().to_string(),
        manifest,
        dialogues,
        resources,
    })
}

pub fn save_project(snapshot: &ProjectSnapshot) -> StorageResult<()> {
    let root = absolute_path(Path::new(&snapshot.root_path))?;
    let diagnostics = validate_editable_project(&snapshot.manifest, &snapshot.dialogues);
    if let Some(diagnostic) = diagnostics.first() {
        return Err(StorageError::InvalidProject(format!(
            "{}: {}",
            diagnostic.code, diagnostic.message
        )));
    }

    let dialogue_by_id: BTreeMap<_, _> = snapshot
        .dialogues
        .iter()
        .map(|dialogue| (dialogue.id.as_str(), dialogue))
        .collect();
    let indexed_ids: BTreeSet<_> = snapshot
        .manifest
        .dialogues
        .iter()
        .map(|entry| entry.id.as_str())
        .collect();
    if dialogue_by_id.len() != indexed_ids.len()
        || dialogue_by_id.keys().any(|id| !indexed_ids.contains(id))
    {
        return Err(StorageError::InvalidProject(
            "对话索引与对话文件集合不一致".to_owned(),
        ));
    }

    let old_manifest = if root.join(PROJECT_FILE).exists() {
        Some(read_json::<ProjectManifest>(&root.join(PROJECT_FILE))?)
    } else {
        None
    };
    let old_paths = if let Some(old) = &old_manifest {
        old.dialogues
            .iter()
            .cloned()
            .map(|entry| (entry.id, entry.path))
            .collect::<BTreeMap<_, _>>()
    } else {
        BTreeMap::new()
    };

    for directory in &snapshot.manifest.dialogue_directories {
        let path = resolve_project_path(&root, directory)?;
        fs::create_dir_all(path)?;
    }

    for entry in &snapshot.manifest.dialogues {
        let dialogue = dialogue_by_id
            .get(entry.id.as_str())
            .ok_or_else(|| StorageError::InvalidProject("缺少对话文件".to_owned()))?;
        if dialogue.key != entry.key {
            return Err(StorageError::InvalidProject(format!(
                "对话 {} 的索引 Key 与文件不一致",
                dialogue.id
            )));
        }
        let path = resolve_project_path(&root, &entry.path)?;
        write_json_atomic(&path, dialogue)?;
    }

    write_definition(
        &root.join("definitions/characters.json"),
        "characters",
        &snapshot.resources.characters,
    )?;
    write_definition(
        &root.join("definitions/variables.json"),
        "variables",
        &snapshot.resources.variables,
    )?;
    write_definition(
        &root.join("definitions/events.json"),
        "events",
        &snapshot.resources.events,
    )?;
    write_definition(
        &root.join("definitions/tags.json"),
        "tags",
        &snapshot.resources.tags,
    )?;
    write_json_atomic(&root.join(PROJECT_FILE), &snapshot.manifest)?;
    write_project_marker(&root, &snapshot.manifest)?;

    if let Some(old) = old_manifest {
        let old_marker = root.join(project_marker_file_name(&old));
        let new_marker = root.join(project_marker_file_name(&snapshot.manifest));
        if old_marker != new_marker && old_marker.is_file() {
            fs::remove_file(old_marker)?;
        }
    }

    let new_paths: BTreeSet<_> = snapshot
        .manifest
        .dialogues
        .iter()
        .map(|entry| entry.path.as_str())
        .collect();
    for old_path in old_paths.values() {
        if !new_paths.contains(old_path.as_str()) {
            let path = resolve_project_path(&root, old_path)?;
            if path.is_file() {
                fs::remove_file(path)?;
            }
        }
    }

    Ok(())
}

fn project_root(path: &Path) -> StorageResult<PathBuf> {
    let path = absolute_path(path)?;
    if path.is_file()
        && path.extension().and_then(|value| value.to_str()) == Some(PROJECT_MARKER_EXTENSION)
    {
        return path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| StorageError::ProjectNotFound(path.display().to_string()));
    }
    Ok(path)
}

fn write_project_marker(root: &Path, manifest: &ProjectManifest) -> StorageResult<()> {
    let marker = ProjectMarker {
        schema_version: 1,
        project_id: manifest.project_id.clone(),
        name: manifest.name.clone(),
        manifest: PROJECT_FILE.to_owned(),
    };
    write_json_atomic(&root.join(project_marker_file_name(manifest)), &marker)
}

fn project_marker_file_name(manifest: &ProjectManifest) -> String {
    let sanitized = manifest
        .name
        .trim()
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    let sanitized = sanitized.trim_matches([' ', '.']);
    let stem = if sanitized.is_empty() {
        format!(
            "siming-{}",
            &manifest.project_id[..8.min(manifest.project_id.len())]
        )
    } else {
        sanitized.to_owned()
    };
    format!("{stem}.{PROJECT_MARKER_EXTENSION}")
}

fn absolute_path(path: &Path) -> StorageResult<PathBuf> {
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        Ok(std::env::current_dir()?.join(path))
    }
}

fn resolve_project_path(root: &Path, relative: &str) -> StorageResult<PathBuf> {
    Ok(root.join(normalize_project_relative_path(Path::new(relative))?))
}

fn read_json<T: DeserializeOwned>(path: &Path) -> StorageResult<T> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> StorageResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let mut file = File::create(&temp)?;
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);

    #[cfg(windows)]
    if path.exists() {
        let backup = path.with_extension(format!("{}.bak", Uuid::new_v4()));
        fs::rename(path, &backup)?;
        if let Err(error) = fs::rename(&temp, path) {
            let _ = fs::rename(&backup, path);
            return Err(StorageError::Io(error));
        }
        fs::remove_file(backup)?;
        return Ok(());
    }

    fs::rename(temp, path)?;
    Ok(())
}

fn read_definition<T: DeserializeOwned>(path: &Path, key: &str) -> StorageResult<Vec<T>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let value: serde_json::Value = read_json(path)?;
    Ok(serde_json::from_value(
        value
            .get(key)
            .cloned()
            .unwrap_or_else(|| serde_json::json!([])),
    )?)
}

fn write_definition<T: Serialize>(path: &Path, key: &str, items: &[T]) -> StorageResult<()> {
    let mut definition = serde_json::Map::new();
    definition.insert("schemaVersion".to_owned(), serde_json::json!(1));
    definition.insert(key.to_owned(), serde_json::to_value(items)?);
    write_json_atomic(path, &definition)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_safe_relative_paths() {
        assert_eq!(
            normalize_project_relative_path(Path::new("./dialogues/intro.json")).unwrap(),
            PathBuf::from("dialogues/intro.json")
        );
    }

    #[test]
    fn rejects_parent_traversal() {
        assert!(matches!(
            normalize_project_relative_path(Path::new("../outside.json")),
            Err(StorageError::EscapesProject)
        ));
    }

    #[test]
    fn creates_saves_and_reopens_a_project() {
        let root = std::env::temp_dir().join(format!("siming-storage-{}", Uuid::new_v4()));
        let mut snapshot = create_project(&root, "测试项目", "zh-CN").unwrap();
        assert_eq!(
            snapshot.manifest.locales,
            ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]
        );
        let original_marker = root.join("测试项目.siming");
        assert!(original_marker.is_file());
        snapshot
            .manifest
            .dialogue_directories
            .push("dialogues/空目录".to_owned());
        snapshot.manifest.name = "已修改".to_owned();
        save_project(&snapshot).unwrap();
        assert!(root.join("dialogues/空目录").is_dir());
        let renamed_marker = root.join("已修改.siming");
        assert!(renamed_marker.is_file());
        assert!(!original_marker.exists());

        let marker: ProjectMarker = read_json(&renamed_marker).unwrap();
        assert_eq!(marker.project_id, snapshot.manifest.project_id);
        assert_eq!(marker.manifest, PROJECT_FILE);

        fs::remove_file(&renamed_marker).unwrap();
        let reopened = open_project(&root).unwrap();
        assert!(renamed_marker.is_file());
        assert_eq!(reopened.manifest.name, "已修改");
        assert_eq!(reopened.dialogues.len(), 1);

        let reopened_from_marker = open_project(&renamed_marker).unwrap();
        assert_eq!(reopened_from_marker.manifest.name, "已修改");

        fs::remove_dir_all(root).unwrap();
    }
}
