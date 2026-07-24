//! Shared, UI-independent domain contracts for Siming.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

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
    pub data: BTreeMap<String, serde_json::Value>,
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
}
