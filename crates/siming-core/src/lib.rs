//! Shared, UI-independent domain contracts for Siming.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use thiserror::Error;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub type LocalizedText = BTreeMap<String, String>;

pub fn version() -> &'static str {
    VERSION
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub project_id: String,
    pub name: String,
    pub paths: ProjectPaths,
    pub default_export_format: ExportFormat,
    pub default_locale: String,
    pub locales: Vec<String>,
    pub dialogues: Vec<DialogueIndexEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectPaths {
    pub dialogues: String,
    pub exports: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Json,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DialogueIndexEntry {
    pub id: String,
    pub key: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogueDocument {
    pub schema_version: u32,
    pub id: String,
    pub key: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub entry_node_id: String,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub key: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub position: Position,
    #[serde(default)]
    pub data: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    Start,
    Dialogue,
    Choice,
    Condition,
    Event,
    End,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub id: String,
    pub source_node_id: String,
    pub source_port: String,
    pub target_node_id: String,
    pub target_port: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectResources {
    pub characters: Vec<CharacterDefinition>,
    pub variables: Vec<VariableDefinition>,
    pub events: Vec<EventDefinition>,
    pub tags: Vec<TagDefinition>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterDefinition {
    pub id: String,
    pub key: String,
    pub name: LocalizedText,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariableDefinition {
    pub id: String,
    pub key: String,
    #[serde(rename = "type")]
    pub variable_type: VariableType,
    pub default_value: Value,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VariableType {
    Boolean,
    Number,
    String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDefinition {
    pub id: String,
    pub key: String,
    pub name: LocalizedText,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub params: Vec<EventParameter>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventParameter {
    pub key: String,
    #[serde(rename = "type")]
    pub parameter_type: VariableType,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default_value: Option<Value>,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagDefinition {
    pub id: String,
    pub key: String,
    pub name: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default)]
    pub scopes: Vec<TagScope>,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TagScope {
    Dialogue,
    Node,
    Resource,
}

fn default_color() -> String {
    "#8b7cf6".to_owned()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub code: String,
    pub severity: DiagnosticSeverity,
    pub message: String,
    #[serde(default)]
    pub file: String,
    #[serde(default)]
    pub entity_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

#[derive(Debug, Error)]
pub enum ContractError {
    #[error("failed to parse project contract: {0}")]
    InvalidJson(#[from] serde_json::Error),
}

pub fn parse_project_manifest(source: &str) -> Result<ProjectManifest, ContractError> {
    Ok(serde_json::from_str(source)?)
}

pub fn parse_dialogue_document(source: &str) -> Result<DialogueDocument, ContractError> {
    Ok(serde_json::from_str(source)?)
}

/// Stage 1 validation protects the editable model from structural corruption.
/// Full semantic validation belongs to Stage 2.
pub fn validate_editable_project(
    manifest: &ProjectManifest,
    dialogues: &[DialogueDocument],
) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    let mut dialogue_ids = BTreeSet::new();
    let mut dialogue_keys = BTreeSet::new();
    let mut dialogue_paths = BTreeSet::new();

    if !manifest.locales.contains(&manifest.default_locale) {
        diagnostics.push(error(
            "PROJECT_DEFAULT_LOCALE_MISSING",
            "项目默认语言必须包含在支持语言列表中",
            ".siming/project.json",
            None,
        ));
    }

    for entry in &manifest.dialogues {
        if !dialogue_paths.insert(&entry.path) {
            diagnostics.push(error(
                "DIALOGUE_DUPLICATE_PATH",
                "对话文件路径重复",
                ".siming/project.json",
                Some(entry.id.clone()),
            ));
        }
    }

    for dialogue in dialogues {
        if !dialogue_ids.insert(&dialogue.id) {
            diagnostics.push(error(
                "DIALOGUE_DUPLICATE_ID",
                "对话 UUID 重复",
                "",
                Some(dialogue.id.clone()),
            ));
        }
        if !dialogue_keys.insert(&dialogue.key) {
            diagnostics.push(error(
                "DIALOGUE_DUPLICATE_KEY",
                "对话 Key 重复",
                "",
                Some(dialogue.id.clone()),
            ));
        }

        let node_ids: BTreeSet<_> = dialogue.nodes.iter().map(|node| &node.id).collect();
        let node_keys: BTreeSet<_> = dialogue.nodes.iter().map(|node| &node.key).collect();
        if node_ids.len() != dialogue.nodes.len() {
            diagnostics.push(error(
                "NODE_DUPLICATE_ID",
                "节点 UUID 重复",
                "",
                Some(dialogue.id.clone()),
            ));
        }
        if node_keys.len() != dialogue.nodes.len() {
            diagnostics.push(error(
                "NODE_DUPLICATE_KEY",
                "同一对话内的节点 Key 重复",
                "",
                Some(dialogue.id.clone()),
            ));
        }
        if !node_ids.contains(&dialogue.entry_node_id) {
            diagnostics.push(error(
                "DIALOGUE_ENTRY_MISSING",
                "入口节点不存在",
                "",
                Some(dialogue.id.clone()),
            ));
        }
        let edge_ids: BTreeSet<_> = dialogue.edges.iter().map(|edge| &edge.id).collect();
        if edge_ids.len() != dialogue.edges.len() {
            diagnostics.push(error(
                "EDGE_DUPLICATE_ID",
                "连线 UUID 重复",
                "",
                Some(dialogue.id.clone()),
            ));
        }
        for edge in &dialogue.edges {
            if !node_ids.contains(&edge.source_node_id) || !node_ids.contains(&edge.target_node_id)
            {
                diagnostics.push(error(
                    "EDGE_DANGLING_REFERENCE",
                    "连线引用了不存在的节点",
                    "",
                    Some(edge.id.clone()),
                ));
            }
        }
    }

    diagnostics
}

fn error(code: &str, message: &str, file: &str, entity_id: Option<String>) -> Diagnostic {
    Diagnostic {
        code: code.to_owned(),
        severity: DiagnosticSeverity::Error,
        message: message.to_owned(),
        file: file.to_owned(),
        entity_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_shared_project_fixture() {
        let source = include_str!("../../../fixtures/minimal-project/.siming/project.json");
        let manifest = parse_project_manifest(source).expect("fixture should satisfy the contract");

        assert_eq!(manifest.schema_version, 1);
        assert_eq!(manifest.default_export_format, ExportFormat::Json);
        assert_eq!(manifest.dialogues.len(), 1);
    }

    #[test]
    fn parses_shared_dialogue_fixture() {
        let source = include_str!("../../../fixtures/minimal-project/dialogues/intro.json");
        let dialogue =
            parse_dialogue_document(source).expect("fixture should satisfy the contract");

        assert_eq!(dialogue.nodes.len(), 2);
        assert_eq!(dialogue.edges.len(), 1);
        assert_eq!(dialogue.entry_node_id, dialogue.nodes[0].id);
    }

    #[test]
    fn detects_missing_entry_node() {
        let manifest = parse_project_manifest(include_str!(
            "../../../fixtures/minimal-project/.siming/project.json"
        ))
        .unwrap();
        let mut dialogue = parse_dialogue_document(include_str!(
            "../../../fixtures/minimal-project/dialogues/intro.json"
        ))
        .unwrap();
        dialogue.entry_node_id = "missing".to_owned();

        let diagnostics = validate_editable_project(&manifest, &[dialogue]);
        assert_eq!(diagnostics[0].code, "DIALOGUE_ENTRY_MISSING");
    }

    #[test]
    fn detects_duplicate_node_keys_and_paths() {
        let mut manifest = parse_project_manifest(include_str!(
            "../../../fixtures/minimal-project/.siming/project.json"
        ))
        .unwrap();
        let mut dialogue = parse_dialogue_document(include_str!(
            "../../../fixtures/minimal-project/dialogues/intro.json"
        ))
        .unwrap();
        dialogue.nodes[1].key = dialogue.nodes[0].key.clone();
        let mut duplicate_path = manifest.dialogues[0].clone();
        duplicate_path.id = "another-dialogue".to_owned();
        manifest.dialogues.push(duplicate_path);

        let diagnostics = validate_editable_project(&manifest, &[dialogue]);
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "NODE_DUPLICATE_KEY")
        );
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "DIALOGUE_DUPLICATE_PATH")
        );
    }
}
