//! Shared, UI-independent domain contracts for Siming.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use thiserror::Error;
use uuid::Uuid;

mod runtime;
pub use runtime::*;

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
    #[serde(default)]
    pub export_layout: ExportLayout,
    pub default_locale: String,
    pub locales: Vec<String>,
    #[serde(default)]
    pub dialogue_directories: Vec<String>,
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
    Xml,
    Binary,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExportLayout {
    #[default]
    Bundled,
    DirectoryChunks,
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
    pub entity_type: Option<DiagnosticEntityType>,
    #[serde(default)]
    pub entity_id: Option<String>,
    #[serde(default)]
    pub field_path: Option<String>,
    #[serde(default)]
    pub range: Option<DiagnosticRange>,
    #[serde(default)]
    pub related: Vec<DiagnosticRelated>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticEntityType {
    Dialogue,
    Node,
    Edge,
    Resource,
    Locale,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRange {
    pub line: u32,
    pub column: u32,
    #[serde(default)]
    pub end_line: Option<u32>,
    #[serde(default)]
    pub end_column: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRelated {
    pub file: String,
    #[serde(default)]
    pub entity_id: Option<String>,
    #[serde(default)]
    pub field_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ConditionExpression {
    Compare {
        variable: String,
        operator: ComparisonOperator,
        value: Value,
    },
    All {
        all: Vec<ConditionExpression>,
    },
    Any {
        any: Vec<ConditionExpression>,
    },
    Not {
        not: Box<ConditionExpression>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ComparisonOperator {
    #[serde(rename = "==")]
    Equal,
    #[serde(rename = "!=")]
    NotEqual,
    #[serde(rename = ">")]
    Greater,
    #[serde(rename = ">=")]
    GreaterOrEqual,
    #[serde(rename = "<")]
    Less,
    #[serde(rename = "<=")]
    LessOrEqual,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationRequest {
    pub manifest: ProjectManifest,
    pub dialogue: DialogueDocument,
    pub resources: ProjectResources,
    #[serde(default)]
    pub session: Option<SimulationSession>,
    pub action: SimulationAction,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SimulationAction {
    Start {
        #[serde(default)]
        start_node_id: Option<String>,
        locale: String,
    },
    Continue,
    Choose {
        option_id: String,
    },
    SetVariable {
        key: String,
        value: Value,
    },
    SetLocale {
        locale: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSession {
    pub current_node_id: Option<String>,
    pub status: SimulationStatus,
    pub locale: String,
    pub variables: BTreeMap<String, Value>,
    pub consecutive_steps: u32,
    pub visit_sequence: u64,
    pub trace: Vec<SimulationLogEntry>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SimulationStatus {
    Running,
    WaitingContinue,
    WaitingChoice,
    Completed,
    LoopGuard,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationLogEntry {
    pub sequence: u64,
    pub kind: SimulationLogKind,
    #[serde(default)]
    pub node_id: Option<String>,
    #[serde(default)]
    pub node_key: Option<String>,
    pub message: String,
    #[serde(default)]
    pub details: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SimulationLogKind {
    Node,
    Condition,
    Choice,
    BusinessEvent,
    HostEvent,
    LocaleFallback,
    Variable,
    System,
}

#[derive(Debug, Error)]
pub enum SimulationError {
    #[error("simulation session is required for this action")]
    SessionRequired,
    #[error("simulation node not found: {0}")]
    NodeMissing(String),
    #[error("simulation action is invalid in the current state")]
    InvalidAction,
    #[error("condition expression is invalid: {0}")]
    InvalidCondition(String),
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
    let mut dialogue_directories = BTreeSet::new();
    for directory in &manifest.dialogue_directories {
        if !valid_project_relative_path(directory)
            || !dialogue_directories.insert(directory.as_str())
        {
            diagnostics.push(error(
                "DIALOGUE_DIRECTORY_INVALID",
                "对话目录必须是唯一且不能逃逸项目根目录的相对路径",
                ".siming/project.json",
                None,
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

pub fn validate_project(
    manifest: &ProjectManifest,
    dialogues: &[DialogueDocument],
    resources: &ProjectResources,
) -> Vec<Diagnostic> {
    let mut diagnostics = validate_editable_project(manifest, dialogues);
    let character_keys: BTreeSet<_> = resources
        .characters
        .iter()
        .map(|item| item.key.as_str())
        .collect();
    let variable_by_key: BTreeMap<_, _> = resources
        .variables
        .iter()
        .map(|item| (item.key.as_str(), item))
        .collect();
    let event_by_key: BTreeMap<_, _> = resources
        .events
        .iter()
        .map(|item| (item.key.as_str(), item))
        .collect();
    let tag_keys: BTreeSet<_> = resources
        .tags
        .iter()
        .map(|item| item.key.as_str())
        .collect();
    let mut used_characters = BTreeSet::new();
    let mut used_variables = BTreeSet::new();
    let mut used_events = BTreeSet::new();
    let mut used_tags = BTreeSet::new();

    if Uuid::parse_str(&manifest.project_id).is_err() {
        diagnostics.push(diagnostic(
            "PROJECT_INVALID_ID",
            DiagnosticSeverity::Error,
            "项目 ID 不是有效 UUID",
            ".siming/project.json",
            None,
            Some(manifest.project_id.clone()),
            Some("/projectId".to_owned()),
        ));
    }
    for (field, path) in [
        ("/paths/dialogues", manifest.paths.dialogues.as_str()),
        ("/paths/exports", manifest.paths.exports.as_str()),
    ] {
        if !valid_project_relative_path(path) {
            diagnostics.push(diagnostic(
                "PROJECT_PATH_INVALID",
                DiagnosticSeverity::Error,
                "项目路径必须是不能逃逸项目根目录的非空相对路径",
                ".siming/project.json",
                None,
                None,
                Some(field.to_owned()),
            ));
        }
    }
    for entry in &manifest.dialogues {
        if Uuid::parse_str(&entry.id).is_err() {
            diagnostics.push(diagnostic(
                "DIALOGUE_INDEX_INVALID_ID",
                DiagnosticSeverity::Error,
                "对话索引 ID 不是有效 UUID",
                ".siming/project.json",
                Some(DiagnosticEntityType::Dialogue),
                Some(entry.id.clone()),
                Some("/dialogues".to_owned()),
            ));
        }
        if !valid_key(&entry.key) || !valid_project_relative_path(&entry.path) {
            diagnostics.push(diagnostic(
                "DIALOGUE_INDEX_INVALID",
                DiagnosticSeverity::Error,
                "对话索引 Key 或路径无效",
                ".siming/project.json",
                Some(DiagnosticEntityType::Dialogue),
                Some(entry.id.clone()),
                Some("/dialogues".to_owned()),
            ));
        }
    }
    validate_resource_collections(manifest, resources, &mut diagnostics);
    for dialogue in dialogues {
        let file = dialogue_file(manifest, dialogue);
        if Uuid::parse_str(&dialogue.id).is_err() {
            diagnostics.push(diagnostic(
                "DIALOGUE_INVALID_ID",
                DiagnosticSeverity::Error,
                "对话 ID 不是有效 UUID",
                &file,
                Some(DiagnosticEntityType::Dialogue),
                Some(dialogue.id.clone()),
                Some("/id".to_owned()),
            ));
        }
        if let Some(entry) = manifest
            .dialogues
            .iter()
            .find(|entry| entry.id == dialogue.id)
        {
            if entry.key != dialogue.key {
                diagnostics.push(diagnostic(
                    "DIALOGUE_INDEX_KEY_MISMATCH",
                    DiagnosticSeverity::Error,
                    "对话索引 Key 与文件内容不一致",
                    &file,
                    Some(DiagnosticEntityType::Dialogue),
                    Some(dialogue.id.clone()),
                    Some("/key".to_owned()),
                ));
            }
        } else {
            diagnostics.push(diagnostic(
                "DIALOGUE_INDEX_MISSING",
                DiagnosticSeverity::Error,
                "对话文件未出现在项目索引中",
                &file,
                Some(DiagnosticEntityType::Dialogue),
                Some(dialogue.id.clone()),
                None,
            ));
        }
        for tag in &dialogue.tags {
            if tag_keys.contains(tag.as_str()) {
                used_tags.insert(tag.clone());
            } else {
                diagnostics.push(diagnostic(
                    "TAG_REFERENCE_MISSING",
                    DiagnosticSeverity::Error,
                    "对话引用了未定义标签",
                    &file,
                    Some(DiagnosticEntityType::Dialogue),
                    Some(dialogue.id.clone()),
                    Some("/tags".to_owned()),
                ));
            }
        }

        let node_by_id: BTreeMap<_, _> = dialogue
            .nodes
            .iter()
            .map(|node| (node.id.as_str(), node))
            .collect();
        let mut outgoing: BTreeMap<&str, Vec<&Edge>> = BTreeMap::new();
        let mut incoming: BTreeMap<&str, Vec<&Edge>> = BTreeMap::new();
        for edge in &dialogue.edges {
            outgoing
                .entry(edge.source_node_id.as_str())
                .or_default()
                .push(edge);
            incoming
                .entry(edge.target_node_id.as_str())
                .or_default()
                .push(edge);
            if edge.target_port != "in" {
                diagnostics.push(diagnostic(
                    "EDGE_INVALID_TARGET_PORT",
                    DiagnosticSeverity::Error,
                    "连线目标端口必须是 in",
                    &file,
                    Some(DiagnosticEntityType::Edge),
                    Some(edge.id.clone()),
                    Some("/targetPort".to_owned()),
                ));
            }
        }

        let starts: Vec<_> = dialogue
            .nodes
            .iter()
            .filter(|node| node.node_type == NodeType::Start)
            .collect();
        if starts.len() != 1 {
            diagnostics.push(diagnostic(
                "DIALOGUE_START_COUNT",
                DiagnosticSeverity::Error,
                "每个对话必须且只能有一个开始节点",
                &file,
                Some(DiagnosticEntityType::Dialogue),
                Some(dialogue.id.clone()),
                Some("/nodes".to_owned()),
            ));
        }
        if node_by_id
            .get(dialogue.entry_node_id.as_str())
            .is_some_and(|node| node.node_type != NodeType::Start)
        {
            diagnostics.push(diagnostic(
                "DIALOGUE_ENTRY_NOT_START",
                DiagnosticSeverity::Error,
                "入口节点必须是开始节点",
                &file,
                Some(DiagnosticEntityType::Dialogue),
                Some(dialogue.id.clone()),
                Some("/entryNodeId".to_owned()),
            ));
        }

        for node in &dialogue.nodes {
            let field_base = format!(
                "/nodes/{}",
                dialogue
                    .nodes
                    .iter()
                    .position(|item| item.id == node.id)
                    .unwrap_or_default()
            );
            if Uuid::parse_str(&node.id).is_err() {
                diagnostics.push(diagnostic(
                    "NODE_INVALID_ID",
                    DiagnosticSeverity::Error,
                    "节点 ID 不是有效 UUID",
                    &file,
                    Some(DiagnosticEntityType::Node),
                    Some(node.id.clone()),
                    Some(format!("{field_base}/id")),
                ));
            }
            if !valid_key(&node.key) {
                diagnostics.push(diagnostic(
                    "NODE_INVALID_KEY",
                    DiagnosticSeverity::Error,
                    "节点 Key 必须以字母开头且只包含字母、数字、点、下划线或连字符",
                    &file,
                    Some(DiagnosticEntityType::Node),
                    Some(node.id.clone()),
                    Some(format!("{field_base}/key")),
                ));
            }
            validate_node_ports(
                node,
                outgoing
                    .get(node.id.as_str())
                    .map(Vec::as_slice)
                    .unwrap_or(&[]),
                &file,
                &field_base,
                &mut diagnostics,
            );
            validate_node_data(
                node,
                manifest,
                &file,
                &field_base,
                &character_keys,
                &variable_by_key,
                &event_by_key,
                &tag_keys,
                &mut used_characters,
                &mut used_variables,
                &mut used_events,
                &mut used_tags,
                &mut diagnostics,
            );
        }

        let reachable = reachable_nodes(dialogue);
        for node in &dialogue.nodes {
            if !reachable.contains(&node.id) {
                diagnostics.push(diagnostic(
                    "NODE_UNREACHABLE",
                    DiagnosticSeverity::Warning,
                    "节点无法从对话入口到达",
                    &file,
                    Some(DiagnosticEntityType::Node),
                    Some(node.id.clone()),
                    None,
                ));
            }
        }
        let can_reach_end = nodes_reaching_end(dialogue, &incoming);
        if reachable
            .iter()
            .any(|id| !can_reach_end.contains(id) && node_by_id.contains_key(id.as_str()))
        {
            diagnostics.push(diagnostic(
                "DIALOGUE_NO_EXIT_PATH",
                DiagnosticSeverity::Warning,
                "对话存在无法到达结束节点的路径或循环",
                &file,
                Some(DiagnosticEntityType::Dialogue),
                Some(dialogue.id.clone()),
                None,
            ));
        }
    }

    for item in &resources.characters {
        if !used_characters.contains(&item.key) {
            diagnostics.push(unused_resource(
                "CHARACTER_UNUSED",
                "角色未被任何节点引用",
                &item.id,
            ));
        }
    }
    for item in &resources.variables {
        if !used_variables.contains(&item.key) {
            diagnostics.push(unused_resource(
                "VARIABLE_UNUSED",
                "变量未被任何条件或事件引用",
                &item.id,
            ));
        }
    }
    for item in &resources.events {
        if !used_events.contains(&item.key) {
            diagnostics.push(unused_resource(
                "EVENT_UNUSED",
                "业务事件未被任何节点引用",
                &item.id,
            ));
        }
    }
    for item in &resources.tags {
        if !used_tags.contains(&item.key) {
            diagnostics.push(unused_resource(
                "TAG_UNUSED",
                "标签未被任何内容引用",
                &item.id,
            ));
        }
    }
    diagnostics.sort_by(|left, right| {
        severity_order(left.severity)
            .cmp(&severity_order(right.severity))
            .then_with(|| left.file.cmp(&right.file))
            .then_with(|| left.entity_id.cmp(&right.entity_id))
            .then_with(|| left.code.cmp(&right.code))
    });
    diagnostics
}

pub fn evaluate_condition(
    expression: &ConditionExpression,
    variables: &BTreeMap<String, Value>,
) -> Result<bool, SimulationError> {
    match expression {
        ConditionExpression::Compare {
            variable,
            operator,
            value,
        } => {
            let actual = variables.get(variable).ok_or_else(|| {
                SimulationError::InvalidCondition(format!("未定义变量 {variable}"))
            })?;
            compare_values(actual, *operator, value)
        }
        ConditionExpression::All { all } => {
            if all.is_empty() {
                return Err(SimulationError::InvalidCondition(
                    "all 至少需要一个子条件".to_owned(),
                ));
            }
            for item in all {
                if !evaluate_condition(item, variables)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        ConditionExpression::Any { any } => {
            if any.is_empty() {
                return Err(SimulationError::InvalidCondition(
                    "any 至少需要一个子条件".to_owned(),
                ));
            }
            for item in any {
                if evaluate_condition(item, variables)? {
                    return Ok(true);
                }
            }
            Ok(false)
        }
        ConditionExpression::Not { not } => Ok(!evaluate_condition(not, variables)?),
    }
}

pub fn resolve_localized_text<'a>(
    text: &'a LocalizedText,
    requested_locale: &str,
    default_locale: &str,
) -> Result<(&'a str, bool), &'static str> {
    if let Some(value) = text
        .get(requested_locale)
        .filter(|value| !value.trim().is_empty())
    {
        return Ok((value, false));
    }
    if let Some(value) = text
        .get(default_locale)
        .filter(|value| !value.trim().is_empty())
    {
        return Ok((value, true));
    }
    Err("请求语言和默认语言文本均缺失")
}

pub fn simulate_step(request: SimulationRequest) -> Result<SimulationSession, SimulationError> {
    let SimulationRequest {
        manifest,
        dialogue,
        resources,
        session,
        action,
    } = request;
    match action {
        SimulationAction::Start {
            start_node_id,
            locale,
        } => {
            let mut variables = BTreeMap::new();
            for variable in &resources.variables {
                variables.insert(variable.key.clone(), variable.default_value.clone());
            }
            let mut session = SimulationSession {
                current_node_id: start_node_id.or_else(|| Some(dialogue.entry_node_id.clone())),
                status: SimulationStatus::Running,
                locale,
                variables,
                consecutive_steps: 0,
                visit_sequence: 0,
                trace: Vec::new(),
                error: None,
            };
            advance_simulation(&manifest, &dialogue, &mut session)?;
            Ok(session)
        }
        SimulationAction::SetVariable { key, value } => {
            let mut session = session.ok_or(SimulationError::SessionRequired)?;
            let definition = resources
                .variables
                .iter()
                .find(|item| item.key == key)
                .ok_or_else(|| SimulationError::InvalidCondition(format!("未定义变量 {key}")))?;
            if !value_matches_type(&value, definition.variable_type) {
                return Err(SimulationError::InvalidCondition(format!(
                    "变量 {key} 的值类型不匹配"
                )));
            }
            session.variables.insert(key.clone(), value.clone());
            push_log(
                &mut session,
                SimulationLogKind::Variable,
                None,
                None,
                format!("临时变量 {key} 已更新"),
                serde_json::json!({ "key": key, "value": value }),
            );
            Ok(session)
        }
        SimulationAction::SetLocale { locale } => {
            let mut session = session.ok_or(SimulationError::SessionRequired)?;
            session.locale = locale.clone();
            push_log(
                &mut session,
                SimulationLogKind::System,
                None,
                None,
                format!("预览语言切换为 {locale}"),
                Value::Null,
            );
            Ok(session)
        }
        SimulationAction::Continue => {
            let mut session = session.ok_or(SimulationError::SessionRequired)?;
            if session.status != SimulationStatus::WaitingContinue {
                return Err(SimulationError::InvalidAction);
            }
            let node_id = session
                .current_node_id
                .as_deref()
                .ok_or(SimulationError::InvalidAction)?;
            session.current_node_id = outgoing_target(&dialogue, node_id, "next");
            session.status = SimulationStatus::Running;
            session.consecutive_steps = 0;
            advance_simulation(&manifest, &dialogue, &mut session)?;
            Ok(session)
        }
        SimulationAction::Choose { option_id } => {
            let mut session = session.ok_or(SimulationError::SessionRequired)?;
            if session.status != SimulationStatus::WaitingChoice {
                return Err(SimulationError::InvalidAction);
            }
            let node_id = session
                .current_node_id
                .as_deref()
                .ok_or(SimulationError::InvalidAction)?
                .to_owned();
            let node = dialogue
                .nodes
                .iter()
                .find(|node| node.id == node_id)
                .ok_or_else(|| SimulationError::NodeMissing(node_id.clone()))?;
            push_log(
                &mut session,
                SimulationLogKind::Choice,
                Some(&node.id),
                Some(&node.key),
                format!("玩家选择 {option_id}"),
                serde_json::json!({ "optionId": option_id }),
            );
            session.current_node_id = outgoing_target(&dialogue, &node_id, &option_id);
            session.status = SimulationStatus::Running;
            session.consecutive_steps = 0;
            advance_simulation(&manifest, &dialogue, &mut session)?;
            Ok(session)
        }
    }
}

fn advance_simulation(
    manifest: &ProjectManifest,
    dialogue: &DialogueDocument,
    session: &mut SimulationSession,
) -> Result<(), SimulationError> {
    const MAX_CONTINUOUS_STEPS: u32 = 1_000;
    while session.status == SimulationStatus::Running {
        if session.consecutive_steps >= MAX_CONTINUOUS_STEPS {
            session.status = SimulationStatus::LoopGuard;
            session.error = Some("连续自动推进超过 1000 步，模拟已暂停".to_owned());
            push_log(
                session,
                SimulationLogKind::System,
                None,
                None,
                "检测到可能的无限循环".to_owned(),
                serde_json::json!({ "limit": MAX_CONTINUOUS_STEPS }),
            );
            break;
        }
        let node_id = session
            .current_node_id
            .clone()
            .ok_or(SimulationError::InvalidAction)?;
        let node = dialogue
            .nodes
            .iter()
            .find(|node| node.id == node_id)
            .ok_or_else(|| SimulationError::NodeMissing(node_id.clone()))?;
        session.consecutive_steps += 1;
        push_log(
            session,
            SimulationLogKind::Node,
            Some(&node.id),
            Some(&node.key),
            format!("进入节点 {}", node.key),
            serde_json::json!({ "type": node.node_type }),
        );
        if let Some(host_events) = node.data.get("hostEvents").and_then(Value::as_array) {
            for (index, event) in host_events.iter().enumerate() {
                push_log(
                    session,
                    SimulationLogKind::HostEvent,
                    Some(&node.id),
                    Some(&node.key),
                    format!(
                        "宿主消息 {}/{}：{}",
                        index + 1,
                        host_events.len(),
                        event
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or("<missing>")
                    ),
                    serde_json::json!({ "index": index, "event": event }),
                );
            }
        }
        log_text_fallback(manifest, node, session);
        match node.node_type {
            NodeType::Start => {
                session.current_node_id = outgoing_target(dialogue, &node.id, "next");
            }
            NodeType::Dialogue => {
                session.status = SimulationStatus::WaitingContinue;
            }
            NodeType::Choice => {
                session.status = SimulationStatus::WaitingChoice;
            }
            NodeType::Condition => {
                let expression: ConditionExpression =
                    serde_json::from_value(node.data.get("condition").cloned().ok_or_else(
                        || SimulationError::InvalidCondition("条件节点未配置表达式".to_owned()),
                    )?)
                    .map_err(|error| SimulationError::InvalidCondition(error.to_string()))?;
                let result = evaluate_condition(&expression, &session.variables)?;
                push_log(
                    session,
                    SimulationLogKind::Condition,
                    Some(&node.id),
                    Some(&node.key),
                    format!("条件结果：{result}"),
                    serde_json::json!({ "result": result, "condition": expression }),
                );
                session.current_node_id =
                    outgoing_target(dialogue, &node.id, if result { "true" } else { "false" });
            }
            NodeType::Event => {
                execute_business_event(node, session)?;
                session.current_node_id = outgoing_target(dialogue, &node.id, "next");
            }
            NodeType::End => {
                session.status = SimulationStatus::Completed;
            }
        }
        if session.status == SimulationStatus::Running && session.current_node_id.is_none() {
            session.status = SimulationStatus::Error;
            session.error = Some("节点缺少可用的下一目标".to_owned());
        }
    }
    Ok(())
}

fn execute_business_event(
    node: &Node,
    session: &mut SimulationSession,
) -> Result<(), SimulationError> {
    let event = node.data.get("event").and_then(Value::as_str).unwrap_or("");
    let params = node
        .data
        .get("params")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    if matches!(event, "variable.set" | "variable.add") {
        let key = params
            .get("key")
            .and_then(Value::as_str)
            .ok_or_else(|| SimulationError::InvalidCondition("变量事件缺少 key".to_owned()))?;
        let value = params
            .get("value")
            .cloned()
            .ok_or_else(|| SimulationError::InvalidCondition("变量事件缺少 value".to_owned()))?;
        if event == "variable.set" {
            let current = session
                .variables
                .get(key)
                .ok_or_else(|| SimulationError::InvalidCondition(format!("未定义变量 {key}")))?;
            if !same_value_kind(current, &value) {
                return Err(SimulationError::InvalidCondition(
                    "variable.set 的 value 类型不匹配".to_owned(),
                ));
            }
            session.variables.insert(key.to_owned(), value);
        } else {
            let current = session
                .variables
                .get(key)
                .and_then(Value::as_f64)
                .ok_or_else(|| {
                    SimulationError::InvalidCondition("variable.add 只支持数字变量".to_owned())
                })?;
            let delta = value.as_f64().ok_or_else(|| {
                SimulationError::InvalidCondition("variable.add 的 value 必须是数字".to_owned())
            })?;
            session
                .variables
                .insert(key.to_owned(), serde_json::json!(current + delta));
        }
    }
    push_log(
        session,
        SimulationLogKind::BusinessEvent,
        Some(&node.id),
        Some(&node.key),
        if matches!(event, "variable.set" | "variable.add") {
            format!("执行内置业务事件 {event}")
        } else {
            format!("业务事件 {event} 已模拟")
        },
        serde_json::json!({ "event": event, "params": params }),
    );
    Ok(())
}

fn outgoing_target(dialogue: &DialogueDocument, node_id: &str, port: &str) -> Option<String> {
    dialogue
        .edges
        .iter()
        .find(|edge| edge.source_node_id == node_id && edge.source_port == port)
        .map(|edge| edge.target_node_id.clone())
}

fn push_log(
    session: &mut SimulationSession,
    kind: SimulationLogKind,
    node_id: Option<&str>,
    node_key: Option<&str>,
    message: String,
    details: Value,
) {
    session.visit_sequence += 1;
    session.trace.push(SimulationLogEntry {
        sequence: session.visit_sequence,
        kind,
        node_id: node_id.map(str::to_owned),
        node_key: node_key.map(str::to_owned),
        message,
        details,
    });
}

fn log_text_fallback(manifest: &ProjectManifest, node: &Node, session: &mut SimulationSession) {
    let Some(text) = node
        .data
        .get("text")
        .and_then(|value| serde_json::from_value::<LocalizedText>(value.clone()).ok())
    else {
        return;
    };
    if let Ok((_value, true)) =
        resolve_localized_text(&text, &session.locale, &manifest.default_locale)
    {
        push_log(
            session,
            SimulationLogKind::LocaleFallback,
            Some(&node.id),
            Some(&node.key),
            format!(
                "{} 缺失，已回退到 {}",
                session.locale, manifest.default_locale
            ),
            serde_json::json!({
                "requestedLocale": session.locale,
                "defaultLocale": manifest.default_locale
            }),
        );
    }
}

fn compare_values(
    actual: &Value,
    operator: ComparisonOperator,
    expected: &Value,
) -> Result<bool, SimulationError> {
    if actual.is_number() && expected.is_number() {
        let left = actual.as_f64().unwrap_or_default();
        let right = expected.as_f64().unwrap_or_default();
        return Ok(match operator {
            ComparisonOperator::Equal => left == right,
            ComparisonOperator::NotEqual => left != right,
            ComparisonOperator::Greater => left > right,
            ComparisonOperator::GreaterOrEqual => left >= right,
            ComparisonOperator::Less => left < right,
            ComparisonOperator::LessOrEqual => left <= right,
        });
    }
    if std::mem::discriminant(actual) != std::mem::discriminant(expected) {
        return Err(SimulationError::InvalidCondition(
            "比较值类型不匹配".to_owned(),
        ));
    }
    match operator {
        ComparisonOperator::Equal => Ok(actual == expected),
        ComparisonOperator::NotEqual => Ok(actual != expected),
        _ => Err(SimulationError::InvalidCondition(
            "字符串和布尔值只支持 == 与 !=".to_owned(),
        )),
    }
}

#[allow(clippy::too_many_arguments)]
fn validate_node_data(
    node: &Node,
    manifest: &ProjectManifest,
    file: &str,
    field_base: &str,
    character_keys: &BTreeSet<&str>,
    variable_by_key: &BTreeMap<&str, &VariableDefinition>,
    event_by_key: &BTreeMap<&str, &EventDefinition>,
    tag_keys: &BTreeSet<&str>,
    used_characters: &mut BTreeSet<String>,
    used_variables: &mut BTreeSet<String>,
    used_events: &mut BTreeSet<String>,
    used_tags: &mut BTreeSet<String>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if let Some(speaker) = node.data.get("speakerId").and_then(Value::as_str) {
        if character_keys.contains(speaker) {
            used_characters.insert(speaker.to_owned());
        } else {
            diagnostics.push(node_error(
                "CHARACTER_REFERENCE_MISSING",
                "节点引用了未定义角色",
                file,
                node,
                format!("{field_base}/data/speakerId"),
            ));
        }
    }
    if let Some(tags) = node.data.get("tags").and_then(Value::as_array) {
        for tag in tags.iter().filter_map(Value::as_str) {
            if tag_keys.contains(tag) {
                used_tags.insert(tag.to_owned());
            } else {
                diagnostics.push(node_error(
                    "TAG_REFERENCE_MISSING",
                    "节点引用了未定义标签",
                    file,
                    node,
                    format!("{field_base}/data/tags"),
                ));
            }
        }
    }
    validate_localized_node_text(node, manifest, file, field_base, diagnostics);
    validate_host_events(node, file, field_base, diagnostics);

    if node.node_type == NodeType::Condition {
        match node
            .data
            .get("condition")
            .cloned()
            .map(serde_json::from_value::<ConditionExpression>)
        {
            Some(Ok(expression)) => validate_condition_expression(
                &expression,
                variable_by_key,
                used_variables,
                file,
                node,
                &format!("{field_base}/data/condition"),
                diagnostics,
            ),
            _ => diagnostics.push(node_error(
                "CONDITION_INVALID",
                "条件表达式缺失或结构无效",
                file,
                node,
                format!("{field_base}/data/condition"),
            )),
        }
    }
    if node.node_type == NodeType::Event {
        let Some(event_key) = node.data.get("event").and_then(Value::as_str) else {
            diagnostics.push(node_error(
                "EVENT_REFERENCE_MISSING",
                "业务事件节点未选择事件",
                file,
                node,
                format!("{field_base}/data/event"),
            ));
            return;
        };
        if matches!(event_key, "variable.set" | "variable.add") {
            let key = node
                .data
                .get("params")
                .and_then(|value| value.get("key"))
                .and_then(Value::as_str);
            let value = node
                .data
                .get("params")
                .and_then(|params| params.get("value"));
            match key.and_then(|key| variable_by_key.get(key).map(|definition| (key, definition))) {
                Some((key, definition)) => {
                    used_variables.insert(key.to_owned());
                    let valid = value.is_some_and(|value| {
                        value_matches_type(value, definition.variable_type)
                            && (event_key != "variable.add"
                                || definition.variable_type == VariableType::Number)
                    });
                    if !valid {
                        diagnostics.push(node_error(
                            "BUILTIN_EVENT_VALUE_INVALID",
                            "内置变量事件的 value 与目标变量类型不匹配",
                            file,
                            node,
                            format!("{field_base}/data/params/value"),
                        ));
                    }
                }
                None => diagnostics.push(node_error(
                    "BUILTIN_EVENT_VARIABLE_MISSING",
                    "内置变量事件引用了未定义变量",
                    file,
                    node,
                    format!("{field_base}/data/params/key"),
                )),
            }
        } else if let Some(definition) = event_by_key.get(event_key) {
            used_events.insert(event_key.to_owned());
            validate_event_params(node, definition, file, field_base, diagnostics);
        } else {
            diagnostics.push(node_error(
                "EVENT_REFERENCE_MISSING",
                "节点引用了未定义业务事件",
                file,
                node,
                format!("{field_base}/data/event"),
            ));
        }
    }
}

fn validate_node_ports(
    node: &Node,
    edges: &[&Edge],
    file: &str,
    field_base: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let ports: Vec<_> = edges.iter().map(|edge| edge.source_port.as_str()).collect();
    let valid = match node.node_type {
        NodeType::Start | NodeType::Dialogue | NodeType::Event => {
            ports.len() == 1 && ports[0] == "next"
        }
        NodeType::End => ports.is_empty(),
        NodeType::Condition => {
            ports.len() == 2
                && ports.iter().filter(|port| **port == "true").count() == 1
                && ports.iter().filter(|port| **port == "false").count() == 1
        }
        NodeType::Choice => {
            let choices: BTreeSet<_> = node
                .data
                .get("choices")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|choice| choice.get("id").and_then(Value::as_str))
                .collect();
            ports.len() == choices.len()
                && choices
                    .iter()
                    .all(|choice| ports.iter().filter(|port| *port == choice).count() == 1)
        }
    };
    if !valid {
        diagnostics.push(node_error(
            "NODE_INVALID_PORTS",
            "节点出口数量或端口名称不符合节点类型规则",
            file,
            node,
            format!("{field_base}/data"),
        ));
    }
    if edges
        .iter()
        .any(|edge| edge.source_node_id == edge.target_node_id)
    {
        diagnostics.push(node_error(
            "EDGE_SELF_CONNECTION",
            "不允许节点直接连接到自身",
            file,
            node,
            format!("{field_base}/data"),
        ));
    }
}

fn validate_condition_expression(
    expression: &ConditionExpression,
    variables: &BTreeMap<&str, &VariableDefinition>,
    used: &mut BTreeSet<String>,
    file: &str,
    node: &Node,
    field_path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    match expression {
        ConditionExpression::Compare {
            variable,
            operator,
            value,
        } => {
            let Some(definition) = variables.get(variable.as_str()) else {
                diagnostics.push(node_error(
                    "CONDITION_VARIABLE_MISSING",
                    "条件引用了未定义变量",
                    file,
                    node,
                    field_path.to_owned(),
                ));
                return;
            };
            used.insert(variable.clone());
            if !value_matches_type(value, definition.variable_type) {
                diagnostics.push(node_error(
                    "CONDITION_VALUE_TYPE_MISMATCH",
                    "条件比较值与变量类型不匹配",
                    file,
                    node,
                    field_path.to_owned(),
                ));
            }
            if definition.variable_type != VariableType::Number
                && !matches!(
                    operator,
                    ComparisonOperator::Equal | ComparisonOperator::NotEqual
                )
            {
                diagnostics.push(node_error(
                    "CONDITION_OPERATOR_TYPE_MISMATCH",
                    "字符串和布尔变量只允许 == 与 !=",
                    file,
                    node,
                    field_path.to_owned(),
                ));
            }
        }
        ConditionExpression::All { all } => {
            validate_condition_children(all, variables, used, file, node, field_path, diagnostics)
        }
        ConditionExpression::Any { any } => {
            validate_condition_children(any, variables, used, file, node, field_path, diagnostics)
        }
        ConditionExpression::Not { not } => validate_condition_expression(
            not,
            variables,
            used,
            file,
            node,
            &format!("{field_path}/not"),
            diagnostics,
        ),
    }
}

fn validate_condition_children(
    children: &[ConditionExpression],
    variables: &BTreeMap<&str, &VariableDefinition>,
    used: &mut BTreeSet<String>,
    file: &str,
    node: &Node,
    field_path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if children.is_empty() {
        diagnostics.push(node_error(
            "CONDITION_GROUP_EMPTY",
            "条件组合至少需要一个子条件",
            file,
            node,
            field_path.to_owned(),
        ));
    }
    for (index, child) in children.iter().enumerate() {
        validate_condition_expression(
            child,
            variables,
            used,
            file,
            node,
            &format!("{field_path}/{index}"),
            diagnostics,
        );
    }
}

fn validate_localized_node_text(
    node: &Node,
    manifest: &ProjectManifest,
    file: &str,
    field_base: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let mut fields = Vec::new();
    if node.node_type == NodeType::Dialogue && !node.data.contains_key("text") {
        diagnostics.push(node_error(
            "NODE_TEXT_REQUIRED",
            "对话节点必须配置正文",
            file,
            node,
            format!("{field_base}/data/text"),
        ));
    }
    if let Some(text) = node.data.get("text") {
        fields.push((format!("{field_base}/data/text"), text));
    }
    if let Some(choices) = node.data.get("choices").and_then(Value::as_array) {
        if node.node_type == NodeType::Choice && choices.is_empty() {
            diagnostics.push(node_error(
                "CHOICE_EMPTY",
                "选项节点至少需要一个选项",
                file,
                node,
                format!("{field_base}/data/choices"),
            ));
        }
        for (index, choice) in choices.iter().enumerate() {
            if !choice
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| !id.trim().is_empty())
            {
                diagnostics.push(node_error(
                    "CHOICE_INVALID_ID",
                    "选项 ID 不能为空",
                    file,
                    node,
                    format!("{field_base}/data/choices/{index}/id"),
                ));
            }
            if let Some(text) = choice.get("text") {
                fields.push((format!("{field_base}/data/choices/{index}/text"), text));
            } else {
                diagnostics.push(node_error(
                    "CHOICE_TEXT_REQUIRED",
                    "选项必须配置多语言文本",
                    file,
                    node,
                    format!("{field_base}/data/choices/{index}/text"),
                ));
            }
        }
    } else if node.node_type == NodeType::Choice {
        diagnostics.push(node_error(
            "CHOICE_EMPTY",
            "选项节点至少需要一个选项",
            file,
            node,
            format!("{field_base}/data/choices"),
        ));
    }
    for (field_path, value) in fields {
        let text: LocalizedText = serde_json::from_value(value.clone()).unwrap_or_default();
        if !text
            .get(&manifest.default_locale)
            .is_some_and(|value| !value.trim().is_empty())
        {
            diagnostics.push(node_error(
                "LOCALE_DEFAULT_TEXT_MISSING",
                "默认语言的必填文本缺失",
                file,
                node,
                field_path.clone(),
            ));
        }
        for locale in &manifest.locales {
            if locale != &manifest.default_locale
                && !text
                    .get(locale)
                    .is_some_and(|value| !value.trim().is_empty())
            {
                diagnostics.push(diagnostic(
                    "LOCALE_TRANSLATION_MISSING",
                    DiagnosticSeverity::Warning,
                    "非默认语言文本缺失，运行时将回退",
                    file,
                    Some(DiagnosticEntityType::Locale),
                    Some(node.id.clone()),
                    Some(format!("{field_path}/{locale}")),
                ));
            }
        }
    }
}

fn validate_host_events(
    node: &Node,
    file: &str,
    field_base: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let Some(events) = node.data.get("hostEvents").and_then(Value::as_array) else {
        return;
    };
    for (index, event) in events.iter().enumerate() {
        let valid_name = event
            .get("name")
            .and_then(Value::as_str)
            .is_some_and(valid_key);
        let valid_payload = event.get("payload").is_some_and(Value::is_object);
        if !valid_name || !valid_payload {
            diagnostics.push(node_error(
                "HOST_EVENT_INVALID",
                "宿主消息必须包含非空名称和 JSON 对象参数",
                file,
                node,
                format!("{field_base}/data/hostEvents/{index}"),
            ));
        }
    }
}

fn validate_event_params(
    node: &Node,
    definition: &EventDefinition,
    file: &str,
    field_base: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let params = node
        .data
        .get("params")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    for param in &definition.params {
        match params.get(&param.key) {
            None if param.required && param.default_value.is_none() => {
                diagnostics.push(node_error(
                    "EVENT_PARAM_REQUIRED",
                    "业务事件缺少必填参数",
                    file,
                    node,
                    format!("{field_base}/data/params/{}", param.key),
                ))
            }
            Some(value) if !value_matches_type(value, param.parameter_type) => {
                diagnostics.push(node_error(
                    "EVENT_PARAM_TYPE_MISMATCH",
                    "业务事件参数类型不匹配",
                    file,
                    node,
                    format!("{field_base}/data/params/{}", param.key),
                ))
            }
            _ => {}
        }
    }
}

fn validate_resource_collections(
    manifest: &ProjectManifest,
    resources: &ProjectResources,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let mut ids = BTreeSet::new();
    let all = resources
        .characters
        .iter()
        .map(|item| (&item.id, &item.key))
        .chain(resources.variables.iter().map(|item| (&item.id, &item.key)))
        .chain(resources.events.iter().map(|item| (&item.id, &item.key)))
        .chain(resources.tags.iter().map(|item| (&item.id, &item.key)));
    for (id, key) in all {
        if !ids.insert(id.as_str()) {
            diagnostics.push(resource_error(
                "RESOURCE_DUPLICATE_ID",
                "项目资源 UUID 重复",
                id,
            ));
        }
        if Uuid::parse_str(id).is_err() {
            diagnostics.push(resource_error(
                "RESOURCE_INVALID_ID",
                "项目资源 ID 不是有效 UUID",
                id,
            ));
        }
        if !valid_key(key) {
            diagnostics.push(resource_error(
                "RESOURCE_INVALID_KEY",
                "项目资源 Key 格式无效",
                id,
            ));
        }
    }
    for group in [
        resources
            .characters
            .iter()
            .map(|item| (&item.id, &item.key))
            .collect::<Vec<_>>(),
        resources
            .variables
            .iter()
            .map(|item| (&item.id, &item.key))
            .collect(),
        resources
            .events
            .iter()
            .map(|item| (&item.id, &item.key))
            .collect(),
        resources
            .tags
            .iter()
            .map(|item| (&item.id, &item.key))
            .collect(),
    ] {
        let mut keys = BTreeSet::new();
        for (id, key) in group {
            if !keys.insert(key.as_str()) {
                diagnostics.push(resource_error(
                    "RESOURCE_DUPLICATE_KEY",
                    "同类项目资源 Key 重复",
                    id,
                ));
            }
        }
    }
    for variable in &resources.variables {
        if !value_matches_type(&variable.default_value, variable.variable_type) {
            diagnostics.push(resource_error(
                "VARIABLE_DEFAULT_TYPE_MISMATCH",
                "变量默认值与变量类型不匹配",
                &variable.id,
            ));
        }
    }
    for character in &resources.characters {
        validate_resource_localized_text(
            manifest,
            &character.name,
            &character.id,
            "角色显示名",
            diagnostics,
        );
    }
    for event in &resources.events {
        validate_resource_localized_text(manifest, &event.name, &event.id, "事件名称", diagnostics);
        let mut param_keys = BTreeSet::new();
        for param in &event.params {
            if !param_keys.insert(param.key.as_str()) || !valid_key(&param.key) {
                diagnostics.push(resource_error(
                    "EVENT_PARAM_INVALID_KEY",
                    "事件参数 Key 重复或格式无效",
                    &event.id,
                ));
            }
            if let Some(default) = &param.default_value {
                if !value_matches_type(default, param.parameter_type) {
                    diagnostics.push(resource_error(
                        "EVENT_PARAM_DEFAULT_TYPE_MISMATCH",
                        "事件参数默认值类型不匹配",
                        &event.id,
                    ));
                }
            }
        }
    }
}

fn validate_resource_localized_text(
    manifest: &ProjectManifest,
    text: &LocalizedText,
    id: &str,
    label: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if !text
        .get(&manifest.default_locale)
        .is_some_and(|value| !value.trim().is_empty())
    {
        diagnostics.push(resource_error(
            "LOCALE_DEFAULT_TEXT_MISSING",
            &format!("{label}缺少默认语言文本"),
            id,
        ));
    }
    for locale in &manifest.locales {
        if locale != &manifest.default_locale
            && !text
                .get(locale)
                .is_some_and(|value| !value.trim().is_empty())
        {
            diagnostics.push(diagnostic(
                "LOCALE_TRANSLATION_MISSING",
                DiagnosticSeverity::Warning,
                &format!("{label}缺少 {locale} 翻译"),
                "definitions/",
                Some(DiagnosticEntityType::Locale),
                Some(id.to_owned()),
                Some(format!("/name/{locale}")),
            ));
        }
    }
}

fn reachable_nodes(dialogue: &DialogueDocument) -> BTreeSet<String> {
    let mut reached = BTreeSet::new();
    let mut queue = VecDeque::from([dialogue.entry_node_id.clone()]);
    while let Some(id) = queue.pop_front() {
        if !reached.insert(id.clone()) {
            continue;
        }
        for edge in dialogue
            .edges
            .iter()
            .filter(|edge| edge.source_node_id == id)
        {
            queue.push_back(edge.target_node_id.clone());
        }
    }
    reached
}

fn nodes_reaching_end(
    dialogue: &DialogueDocument,
    incoming: &BTreeMap<&str, Vec<&Edge>>,
) -> BTreeSet<String> {
    let mut reached = BTreeSet::new();
    let mut queue: VecDeque<_> = dialogue
        .nodes
        .iter()
        .filter(|node| node.node_type == NodeType::End)
        .map(|node| node.id.clone())
        .collect();
    while let Some(id) = queue.pop_front() {
        if !reached.insert(id.clone()) {
            continue;
        }
        for edge in incoming.get(id.as_str()).into_iter().flatten() {
            queue.push_back(edge.source_node_id.clone());
        }
    }
    reached
}

fn value_matches_type(value: &Value, variable_type: VariableType) -> bool {
    match variable_type {
        VariableType::Boolean => value.is_boolean(),
        VariableType::Number => value.is_number(),
        VariableType::String => value.is_string(),
    }
}

fn same_value_kind(left: &Value, right: &Value) -> bool {
    (left.is_boolean() && right.is_boolean())
        || (left.is_number() && right.is_number())
        || (left.is_string() && right.is_string())
}

fn valid_key(value: &str) -> bool {
    let mut chars = value.chars();
    chars
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && chars.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
}

fn valid_project_relative_path(value: &str) -> bool {
    let normalized = value.replace('\\', "/");
    !normalized.trim().is_empty()
        && !normalized.starts_with('/')
        && !(normalized.len() >= 3
            && normalized.as_bytes()[0].is_ascii_alphabetic()
            && normalized.as_bytes()[1] == b':'
            && normalized.as_bytes()[2] == b'/')
        && !normalized.split('/').any(|part| part == "..")
}

fn dialogue_file(manifest: &ProjectManifest, dialogue: &DialogueDocument) -> String {
    manifest
        .dialogues
        .iter()
        .find(|entry| entry.id == dialogue.id)
        .map(|entry| entry.path.clone())
        .unwrap_or_default()
}

fn severity_order(severity: DiagnosticSeverity) -> u8 {
    match severity {
        DiagnosticSeverity::Error => 0,
        DiagnosticSeverity::Warning => 1,
    }
}

fn diagnostic(
    code: &str,
    severity: DiagnosticSeverity,
    message: &str,
    file: &str,
    entity_type: Option<DiagnosticEntityType>,
    entity_id: Option<String>,
    field_path: Option<String>,
) -> Diagnostic {
    Diagnostic {
        code: code.to_owned(),
        severity,
        message: message.to_owned(),
        file: file.to_owned(),
        entity_type,
        entity_id,
        field_path,
        range: None,
        related: Vec::new(),
    }
}

fn node_error(
    code: &str,
    message: &str,
    file: &str,
    node: &Node,
    field_path: String,
) -> Diagnostic {
    diagnostic(
        code,
        DiagnosticSeverity::Error,
        message,
        file,
        Some(DiagnosticEntityType::Node),
        Some(node.id.clone()),
        Some(field_path),
    )
}

fn resource_error(code: &str, message: &str, id: &str) -> Diagnostic {
    diagnostic(
        code,
        DiagnosticSeverity::Error,
        message,
        "definitions/",
        Some(DiagnosticEntityType::Resource),
        Some(id.to_owned()),
        None,
    )
}

fn unused_resource(code: &str, message: &str, id: &str) -> Diagnostic {
    diagnostic(
        code,
        DiagnosticSeverity::Warning,
        message,
        "definitions/",
        Some(DiagnosticEntityType::Resource),
        Some(id.to_owned()),
        None,
    )
}

fn error(code: &str, message: &str, file: &str, entity_id: Option<String>) -> Diagnostic {
    Diagnostic {
        code: code.to_owned(),
        severity: DiagnosticSeverity::Error,
        message: message.to_owned(),
        file: file.to_owned(),
        entity_type: None,
        entity_id,
        field_path: None,
        range: None,
        related: Vec::new(),
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
        assert_eq!(manifest.export_layout, ExportLayout::Bundled);
        assert_eq!(manifest.dialogues.len(), 1);
    }

    #[test]
    fn parses_shared_dialogue_fixture() {
        let source = include_str!("../../../fixtures/minimal-project/dialogues/intro.json");
        let dialogue =
            parse_dialogue_document(source).expect("fixture should satisfy the contract");

        assert_eq!(dialogue.nodes.len(), 3);
        assert_eq!(dialogue.edges.len(), 2);
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

    #[test]
    fn evaluates_nested_conditions_with_strict_types() {
        let expression: ConditionExpression = serde_json::from_value(serde_json::json!({
            "all": [
                { "variable": "favor", "operator": ">=", "value": 10 },
                { "not": { "variable": "blocked", "operator": "==", "value": true } }
            ]
        }))
        .unwrap();
        let variables = BTreeMap::from([
            ("favor".to_owned(), serde_json::json!(12)),
            ("blocked".to_owned(), serde_json::json!(false)),
        ]);
        assert!(evaluate_condition(&expression, &variables).unwrap());

        let invalid: ConditionExpression = serde_json::from_value(serde_json::json!({
            "variable": "blocked", "operator": ">", "value": true
        }))
        .unwrap();
        assert!(evaluate_condition(&invalid, &variables).is_err());
    }

    #[test]
    fn simulation_actions_use_camel_case_wire_fields() {
        let action: SimulationAction = serde_json::from_value(serde_json::json!({
            "type": "choose",
            "optionId": "option-a"
        }))
        .unwrap();
        assert_eq!(
            action,
            SimulationAction::Choose {
                option_id: "option-a".to_owned()
            }
        );
        assert_eq!(
            serde_json::to_value(SimulationAction::Start {
                start_node_id: Some("node-a".to_owned()),
                locale: "zh-CN".to_owned()
            })
            .unwrap()["startNodeId"],
            "node-a"
        );
    }

    #[test]
    fn resolves_requested_locale_then_default_locale() {
        let text = BTreeMap::from([
            ("zh-CN".to_owned(), "默认文本".to_owned()),
            ("en-US".to_owned(), "English".to_owned()),
        ]);
        assert_eq!(
            resolve_localized_text(&text, "en-US", "zh-CN"),
            Ok(("English", false))
        );
        assert_eq!(
            resolve_localized_text(&text, "ja-JP", "zh-CN"),
            Ok(("默认文本", true))
        );
    }

    #[test]
    fn full_validation_reports_unreachable_and_missing_translation() {
        let (manifest, mut dialogue, resources) = simulation_fixture();
        dialogue.nodes.push(Node {
            id: Uuid::new_v4().to_string(),
            key: "unreachable".to_owned(),
            node_type: NodeType::End,
            position: Position { x: 0.0, y: 0.0 },
            data: BTreeMap::new(),
        });
        let diagnostics = validate_project(&manifest, &[dialogue], &resources);
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "NODE_UNREACHABLE")
        );
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "LOCALE_TRANSLATION_MISSING")
        );
        assert!(
            diagnostics
                .windows(2)
                .all(|pair| severity_order(pair[0].severity) <= severity_order(pair[1].severity))
        );
    }

    #[test]
    fn simulation_uses_variables_choices_events_and_ordered_host_messages() {
        let (manifest, dialogue, resources) = simulation_fixture();
        let mut session = simulate_step(SimulationRequest {
            manifest: manifest.clone(),
            dialogue: dialogue.clone(),
            resources: resources.clone(),
            session: None,
            action: SimulationAction::Start {
                start_node_id: None,
                locale: "en-US".to_owned(),
            },
        })
        .unwrap();
        assert_eq!(session.status, SimulationStatus::WaitingContinue);
        let host_messages: Vec<_> = session
            .trace
            .iter()
            .filter(|item| item.kind == SimulationLogKind::HostEvent)
            .map(|item| item.message.clone())
            .collect();
        assert_eq!(host_messages.len(), 2);
        assert!(host_messages[0].contains("portrait.show"));
        assert!(host_messages[1].contains("camera.focus"));
        assert!(
            session
                .trace
                .iter()
                .any(|item| item.kind == SimulationLogKind::LocaleFallback)
        );

        session = simulate_step(SimulationRequest {
            manifest: manifest.clone(),
            dialogue: dialogue.clone(),
            resources: resources.clone(),
            session: Some(session),
            action: SimulationAction::SetVariable {
                key: "favor".to_owned(),
                value: serde_json::json!(10),
            },
        })
        .unwrap();
        session = simulate_step(SimulationRequest {
            manifest: manifest.clone(),
            dialogue: dialogue.clone(),
            resources: resources.clone(),
            session: Some(session),
            action: SimulationAction::Continue,
        })
        .unwrap();
        assert_eq!(session.status, SimulationStatus::WaitingChoice);
        assert_eq!(session.variables["favor"], serde_json::json!(12.0));
        assert!(
            session
                .trace
                .iter()
                .any(|item| item.kind == SimulationLogKind::BusinessEvent)
        );

        session = simulate_step(SimulationRequest {
            manifest,
            dialogue,
            resources,
            session: Some(session),
            action: SimulationAction::Choose {
                option_id: "leave".to_owned(),
            },
        })
        .unwrap();
        assert_eq!(session.status, SimulationStatus::Completed);
    }

    #[test]
    fn simulation_stops_automatic_loops() {
        let (manifest, mut dialogue, resources) = simulation_fixture();
        dialogue
            .nodes
            .retain(|node| matches!(node.key.as_str(), "start" | "line" | "condition" | "event"));
        let condition_id = dialogue
            .nodes
            .iter()
            .find(|node| node.key == "condition")
            .unwrap()
            .id
            .clone();
        let event_id = dialogue
            .nodes
            .iter()
            .find(|node| node.key == "event")
            .unwrap()
            .id
            .clone();
        dialogue.edges.retain(|edge| {
            dialogue
                .nodes
                .iter()
                .any(|node| node.id == edge.source_node_id)
                && dialogue
                    .nodes
                    .iter()
                    .any(|node| node.id == edge.target_node_id)
        });
        dialogue.edges.push(Edge {
            id: Uuid::new_v4().to_string(),
            source_node_id: event_id,
            source_port: "next".to_owned(),
            target_node_id: condition_id,
            target_port: "in".to_owned(),
        });
        let mut session = simulate_step(SimulationRequest {
            manifest: manifest.clone(),
            dialogue: dialogue.clone(),
            resources: resources.clone(),
            session: None,
            action: SimulationAction::Start {
                start_node_id: None,
                locale: "zh-CN".to_owned(),
            },
        })
        .unwrap();
        session = simulate_step(SimulationRequest {
            manifest: manifest.clone(),
            dialogue: dialogue.clone(),
            resources: resources.clone(),
            session: Some(session),
            action: SimulationAction::SetVariable {
                key: "favor".to_owned(),
                value: serde_json::json!(10),
            },
        })
        .unwrap();
        session = simulate_step(SimulationRequest {
            manifest,
            dialogue,
            resources,
            session: Some(session),
            action: SimulationAction::Continue,
        })
        .unwrap();
        assert_eq!(session.status, SimulationStatus::LoopGuard);
        assert!(session.trace.len() >= 1_000);
    }

    fn simulation_fixture() -> (ProjectManifest, DialogueDocument, ProjectResources) {
        let ids: Vec<_> = (0..6).map(|_| Uuid::new_v4().to_string()).collect();
        let dialogue: DialogueDocument = serde_json::from_value(serde_json::json!({
            "schemaVersion": 1,
            "id": ids[0],
            "key": "simulation",
            "name": "模拟测试",
            "description": "",
            "tags": [],
            "entryNodeId": ids[1],
            "nodes": [
                { "id": ids[1], "key": "start", "type": "start", "position": {"x": 0, "y": 0}, "data": {"hostEvents": []} },
                { "id": ids[2], "key": "line", "type": "dialogue", "position": {"x": 1, "y": 0}, "data": {
                    "text": {"zh-CN": "继续前进"},
                    "hostEvents": [
                        {"name": "portrait.show", "payload": {"side": "left"}},
                        {"name": "camera.focus", "payload": {"target": "hero"}}
                    ]
                }},
                { "id": ids[3], "key": "condition", "type": "condition", "position": {"x": 2, "y": 0}, "data": {
                    "condition": {"variable": "favor", "operator": ">=", "value": 10},
                    "hostEvents": []
                }},
                { "id": ids[4], "key": "event", "type": "event", "position": {"x": 3, "y": 0}, "data": {
                    "event": "variable.add",
                    "params": {"key": "favor", "value": 2},
                    "hostEvents": []
                }},
                { "id": ids[5], "key": "choice", "type": "choice", "position": {"x": 4, "y": 0}, "data": {
                    "choices": [{"id": "leave", "text": {"zh-CN": "出发", "en-US": "Leave"}}],
                    "hostEvents": []
                }},
                { "id": Uuid::new_v4().to_string(), "key": "end", "type": "end", "position": {"x": 5, "y": 0}, "data": {"hostEvents": []} }
            ],
            "edges": []
        }))
        .unwrap();
        let mut dialogue = dialogue;
        let id = |key: &str| {
            dialogue
                .nodes
                .iter()
                .find(|node| node.key == key)
                .unwrap()
                .id
                .clone()
        };
        dialogue.edges = vec![
            edge(&id("start"), "next", &id("line")),
            edge(&id("line"), "next", &id("condition")),
            edge(&id("condition"), "true", &id("event")),
            edge(&id("condition"), "false", &id("end")),
            edge(&id("event"), "next", &id("choice")),
            edge(&id("choice"), "leave", &id("end")),
        ];
        let manifest: ProjectManifest = serde_json::from_value(serde_json::json!({
            "schemaVersion": 1,
            "projectId": Uuid::new_v4().to_string(),
            "name": "模拟项目",
            "paths": {"dialogues": "dialogues/", "exports": "exports/"},
            "defaultExportFormat": "json",
            "defaultLocale": "zh-CN",
            "locales": ["zh-CN", "en-US"],
            "dialogues": [{"id": dialogue.id, "key": dialogue.key, "path": "dialogues/simulation.json"}]
        }))
        .unwrap();
        let resources: ProjectResources = serde_json::from_value(serde_json::json!({
            "characters": [],
            "variables": [{
                "id": Uuid::new_v4().to_string(),
                "key": "favor",
                "type": "number",
                "defaultValue": 0,
                "description": ""
            }],
            "events": [],
            "tags": []
        }))
        .unwrap();
        (manifest, dialogue, resources)
    }

    fn edge(source: &str, port: &str, target: &str) -> Edge {
        Edge {
            id: Uuid::new_v4().to_string(),
            source_node_id: source.to_owned(),
            source_port: port.to_owned(),
            target_node_id: target.to_owned(),
            target_port: "in".to_owned(),
        }
    }
}
