use crate::{
    ConditionExpression, Diagnostic, DiagnosticSeverity, DialogueDocument, EventParameter,
    LocalizedText, Node, NodeType, ProjectManifest, ProjectResources, VariableType,
    resolve_localized_text, validate_project,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::{Component, Path},
};
use thiserror::Error;

pub const RUNTIME_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HostEventCompat {
    pub name: String,
    pub payload: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum AdvancePolicyCompat {
    Manual,
    Auto {
        #[serde(rename = "delayMs")]
        delay_ms: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBundle {
    pub project: RuntimeProject,
    pub locales: BTreeMap<String, RuntimeLocaleResource>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeChunkedBundle {
    pub schema_version: u32,
    pub default_locale: String,
    pub locales: Vec<String>,
    pub resources: RuntimeResources,
    pub dialogues: BTreeMap<String, RuntimeDialogueChunkIndex>,
    pub dialogue_chunks: BTreeMap<String, RuntimeDialogueChunk>,
    pub locale_global: BTreeMap<String, RuntimeLocaleChunk>,
    pub locale_chunks: BTreeMap<String, BTreeMap<String, RuntimeLocaleChunk>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDialogueChunkIndex {
    pub key: String,
    /// Empty for dialogues stored directly below the configured dialogue root.
    pub chunk: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDialogueChunk {
    pub schema_version: u32,
    pub dialogues: BTreeMap<String, RuntimeDialogue>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLocaleChunk {
    pub schema_version: u32,
    pub locale: String,
    pub texts: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProject {
    pub schema_version: u32,
    pub default_locale: String,
    pub locales: Vec<String>,
    pub resources: RuntimeResources,
    pub dialogues: BTreeMap<String, RuntimeDialogue>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeResources {
    pub characters: BTreeMap<String, RuntimeCharacter>,
    pub variables: BTreeMap<String, RuntimeVariable>,
    pub events: BTreeMap<String, RuntimeEventDefinition>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCharacter {
    pub key: String,
    pub name_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeVariable {
    pub key: String,
    #[serde(rename = "type")]
    pub variable_type: VariableType,
    pub default_value: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEventDefinition {
    pub key: String,
    pub params: Vec<EventParameter>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDialogue {
    pub key: String,
    pub entry_node_id: String,
    pub nodes: BTreeMap<String, RuntimeNode>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RuntimeNode {
    Start(RuntimeStartNode),
    Dialogue(RuntimeDialogueNode),
    Choice(RuntimeChoiceNode),
    Condition(RuntimeConditionNode),
    Event(RuntimeEventNode),
    End(RuntimeEndNode),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeStartNode {
    pub key: String,
    #[serde(rename = "type")]
    pub node_type: RuntimeNodeType,
    #[serde(rename = "hostEvents", skip_serializing_if = "Vec::is_empty")]
    pub host_events: Vec<HostEventCompat>,
    pub next: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDialogueNode {
    pub key: String,
    #[serde(rename = "type")]
    pub node_type: RuntimeNodeType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker_id: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub host_events: Vec<HostEventCompat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub advance_policy: Option<AdvancePolicyCompat>,
    pub text_key: String,
    pub next: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeChoiceNode {
    pub key: String,
    #[serde(rename = "type")]
    pub node_type: RuntimeNodeType,
    #[serde(rename = "hostEvents", skip_serializing_if = "Vec::is_empty")]
    pub host_events: Vec<HostEventCompat>,
    pub choices: Vec<RuntimeChoice>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeChoice {
    pub id: String,
    pub text_key: String,
    pub next: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeConditionNode {
    pub key: String,
    #[serde(rename = "type")]
    pub node_type: RuntimeNodeType,
    #[serde(rename = "hostEvents", skip_serializing_if = "Vec::is_empty")]
    pub host_events: Vec<HostEventCompat>,
    pub condition: ConditionExpression,
    pub branches: RuntimeBranches,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeBranches {
    #[serde(rename = "true")]
    pub true_branch: String,
    #[serde(rename = "false")]
    pub false_branch: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEventNode {
    pub key: String,
    #[serde(rename = "type")]
    pub node_type: RuntimeNodeType,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub host_events: Vec<HostEventCompat>,
    pub event: String,
    pub params: BTreeMap<String, Value>,
    pub next: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeEndNode {
    pub key: String,
    #[serde(rename = "type")]
    pub node_type: RuntimeNodeType,
    #[serde(rename = "hostEvents", skip_serializing_if = "Vec::is_empty")]
    pub host_events: Vec<HostEventCompat>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeNodeType {
    Start,
    Dialogue,
    Choice,
    Condition,
    Event,
    End,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLocaleResource {
    pub schema_version: u32,
    pub locale: String,
    pub texts: BTreeMap<String, String>,
}

#[derive(Debug, Error)]
pub enum CompileError {
    #[error("project has {0} validation error(s)")]
    Validation(usize, Vec<Diagnostic>),
    #[error("runtime node {node_id} is invalid: {message}")]
    InvalidNode { node_id: String, message: String },
}

impl CompileError {
    pub fn diagnostics(&self) -> Option<&[Diagnostic]> {
        match self {
            Self::Validation(_, diagnostics) => Some(diagnostics),
            Self::InvalidNode { .. } => None,
        }
    }
}

pub fn compile_runtime(
    manifest: &ProjectManifest,
    dialogues: &[DialogueDocument],
    resources: &ProjectResources,
) -> Result<RuntimeBundle, CompileError> {
    let diagnostics = validate_project(manifest, dialogues, resources);
    let error_count = diagnostics
        .iter()
        .filter(|item| item.severity == DiagnosticSeverity::Error)
        .count();
    if error_count > 0 {
        return Err(CompileError::Validation(error_count, diagnostics));
    }

    let mut locales = manifest
        .locales
        .iter()
        .map(|locale| {
            (
                locale.clone(),
                RuntimeLocaleResource {
                    schema_version: RUNTIME_SCHEMA_VERSION,
                    locale: locale.clone(),
                    texts: BTreeMap::new(),
                },
            )
        })
        .collect::<BTreeMap<_, _>>();
    let runtime_resources = compile_resources(manifest, resources, &mut locales)?;
    let mut runtime_dialogues = BTreeMap::new();
    for dialogue in dialogues {
        runtime_dialogues.insert(
            dialogue.id.clone(),
            compile_dialogue(manifest, dialogue, &mut locales)?,
        );
    }

    Ok(RuntimeBundle {
        project: RuntimeProject {
            schema_version: RUNTIME_SCHEMA_VERSION,
            default_locale: manifest.default_locale.clone(),
            locales: manifest.locales.clone(),
            resources: runtime_resources,
            dialogues: runtime_dialogues,
        },
        locales,
    })
}

pub fn partition_runtime(
    manifest: &ProjectManifest,
    bundle: &RuntimeBundle,
) -> Result<RuntimeChunkedBundle, CompileError> {
    let mut dialogues = BTreeMap::new();
    let mut dialogue_chunks = BTreeMap::<String, RuntimeDialogueChunk>::new();

    for entry in &manifest.dialogues {
        let dialogue =
            bundle
                .project
                .dialogues
                .get(&entry.id)
                .ok_or_else(|| CompileError::InvalidNode {
                    node_id: entry.id.clone(),
                    message: "compiled dialogue is missing".to_owned(),
                })?;
        let chunk = dialogue_chunk_key(&manifest.paths.dialogues, &entry.path);
        dialogues.insert(
            entry.id.clone(),
            RuntimeDialogueChunkIndex {
                key: dialogue.key.clone(),
                chunk: chunk.clone(),
            },
        );
        dialogue_chunks
            .entry(chunk)
            .or_insert_with(|| RuntimeDialogueChunk {
                schema_version: RUNTIME_SCHEMA_VERSION,
                dialogues: BTreeMap::new(),
            })
            .dialogues
            .insert(entry.id.clone(), dialogue.clone());
    }

    let mut locale_global = BTreeMap::new();
    let mut locale_chunks = BTreeMap::new();
    for (locale, resource) in &bundle.locales {
        let global_texts = resource
            .texts
            .iter()
            .filter(|(key, _)| !key.starts_with("dialogue."))
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();
        locale_global.insert(
            locale.clone(),
            RuntimeLocaleChunk {
                schema_version: RUNTIME_SCHEMA_VERSION,
                locale: locale.clone(),
                texts: global_texts,
            },
        );

        let mut chunks = BTreeMap::new();
        for (chunk_key, chunk) in &dialogue_chunks {
            let dialogue_prefixes = chunk
                .dialogues
                .keys()
                .map(|id| format!("dialogue.{id}."))
                .collect::<Vec<_>>();
            let texts = resource
                .texts
                .iter()
                .filter(|(key, _)| {
                    dialogue_prefixes
                        .iter()
                        .any(|prefix| key.starts_with(prefix))
                })
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect::<BTreeMap<_, _>>();
            if !texts.is_empty() {
                chunks.insert(
                    chunk_key.clone(),
                    RuntimeLocaleChunk {
                        schema_version: RUNTIME_SCHEMA_VERSION,
                        locale: locale.clone(),
                        texts,
                    },
                );
            }
        }
        locale_chunks.insert(locale.clone(), chunks);
    }

    Ok(RuntimeChunkedBundle {
        schema_version: RUNTIME_SCHEMA_VERSION,
        default_locale: bundle.project.default_locale.clone(),
        locales: bundle.project.locales.clone(),
        resources: bundle.project.resources.clone(),
        dialogues,
        dialogue_chunks,
        locale_global,
        locale_chunks,
    })
}

fn dialogue_chunk_key(dialogue_root: &str, dialogue_path: &str) -> String {
    let normalized_root = dialogue_root.replace('\\', "/");
    let normalized_path = dialogue_path.replace('\\', "/");
    let root = Path::new(&normalized_root);
    let path = Path::new(&normalized_path);
    let relative = path.strip_prefix(root).unwrap_or(path);
    let parent = relative.parent().unwrap_or_else(|| Path::new(""));
    parent
        .components()
        .find_map(|component| match component {
            Component::Normal(value) => value.to_str(),
            _ => None,
        })
        .unwrap_or_default()
        .to_owned()
}

fn compile_resources(
    manifest: &ProjectManifest,
    resources: &ProjectResources,
    locales: &mut BTreeMap<String, RuntimeLocaleResource>,
) -> Result<RuntimeResources, CompileError> {
    let mut characters = BTreeMap::new();
    for character in &resources.characters {
        let name_key = format!("character.{}.name", character.id);
        insert_localized_text(manifest, locales, &name_key, &character.name, &character.id)?;
        characters.insert(
            character.id.clone(),
            RuntimeCharacter {
                key: character.key.clone(),
                name_key,
            },
        );
    }
    let variables = resources
        .variables
        .iter()
        .map(|variable| {
            (
                variable.id.clone(),
                RuntimeVariable {
                    key: variable.key.clone(),
                    variable_type: variable.variable_type,
                    default_value: variable.default_value.clone(),
                },
            )
        })
        .collect();
    let events = resources
        .events
        .iter()
        .map(|event| {
            (
                event.id.clone(),
                RuntimeEventDefinition {
                    key: event.key.clone(),
                    params: event.params.clone(),
                },
            )
        })
        .collect();
    Ok(RuntimeResources {
        characters,
        variables,
        events,
    })
}

fn compile_dialogue(
    manifest: &ProjectManifest,
    dialogue: &DialogueDocument,
    locales: &mut BTreeMap<String, RuntimeLocaleResource>,
) -> Result<RuntimeDialogue, CompileError> {
    let mut nodes = BTreeMap::new();
    for node in &dialogue.nodes {
        nodes.insert(
            node.id.clone(),
            compile_node(manifest, dialogue, node, locales)?,
        );
    }
    Ok(RuntimeDialogue {
        key: dialogue.key.clone(),
        entry_node_id: dialogue.entry_node_id.clone(),
        nodes,
    })
}

fn compile_node(
    manifest: &ProjectManifest,
    dialogue: &DialogueDocument,
    node: &Node,
    locales: &mut BTreeMap<String, RuntimeLocaleResource>,
) -> Result<RuntimeNode, CompileError> {
    let host_events = node
        .data
        .get("hostEvents")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| invalid_node(node, error))?
        .unwrap_or_default();
    let next = |port: &str| {
        dialogue
            .edges
            .iter()
            .find(|edge| edge.source_node_id == node.id && edge.source_port == port)
            .map(|edge| edge.target_node_id.clone())
            .ok_or_else(|| invalid_node(node, format!("missing {port} edge")))
    };
    match node.node_type {
        NodeType::Start => Ok(RuntimeNode::Start(RuntimeStartNode {
            key: node.key.clone(),
            node_type: RuntimeNodeType::Start,
            host_events,
            next: next("next")?,
        })),
        NodeType::Dialogue => {
            let text: LocalizedText = value(node, "text")?;
            let text_key = format!("dialogue.{}.{}.text", dialogue.id, node.id);
            insert_localized_text(manifest, locales, &text_key, &text, &node.id)?;
            Ok(RuntimeNode::Dialogue(RuntimeDialogueNode {
                key: node.key.clone(),
                node_type: RuntimeNodeType::Dialogue,
                speaker_id: node
                    .data
                    .get("speakerId")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                host_events,
                advance_policy: node
                    .data
                    .get("advancePolicy")
                    .cloned()
                    .map(serde_json::from_value)
                    .transpose()
                    .map_err(|error| invalid_node(node, error))?,
                text_key,
                next: next("next")?,
            }))
        }
        NodeType::Choice => {
            let source: Vec<SourceChoice> = value(node, "choices")?;
            let mut choices = Vec::with_capacity(source.len());
            for choice in source {
                let text_key = format!(
                    "dialogue.{}.{}.choice.{}.text",
                    dialogue.id, node.id, choice.id
                );
                insert_localized_text(manifest, locales, &text_key, &choice.text, &node.id)?;
                choices.push(RuntimeChoice {
                    next: next(&choice.id)?,
                    id: choice.id,
                    text_key,
                });
            }
            Ok(RuntimeNode::Choice(RuntimeChoiceNode {
                key: node.key.clone(),
                node_type: RuntimeNodeType::Choice,
                host_events,
                choices,
            }))
        }
        NodeType::Condition => Ok(RuntimeNode::Condition(RuntimeConditionNode {
            key: node.key.clone(),
            node_type: RuntimeNodeType::Condition,
            host_events,
            condition: value(node, "condition")?,
            branches: RuntimeBranches {
                true_branch: next("true")?,
                false_branch: next("false")?,
            },
        })),
        NodeType::Event => Ok(RuntimeNode::Event(RuntimeEventNode {
            key: node.key.clone(),
            node_type: RuntimeNodeType::Event,
            host_events,
            event: node
                .data
                .get("event")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            params: node
                .data
                .get("params")
                .cloned()
                .map(serde_json::from_value)
                .transpose()
                .map_err(|error| invalid_node(node, error))?
                .unwrap_or_default(),
            next: next("next")?,
        })),
        NodeType::End => Ok(RuntimeNode::End(RuntimeEndNode {
            key: node.key.clone(),
            node_type: RuntimeNodeType::End,
            host_events,
        })),
    }
}

fn insert_localized_text(
    manifest: &ProjectManifest,
    locales: &mut BTreeMap<String, RuntimeLocaleResource>,
    text_key: &str,
    text: &LocalizedText,
    entity_id: &str,
) -> Result<(), CompileError> {
    for locale in &manifest.locales {
        let (value, _fallback) = resolve_localized_text(text, locale, &manifest.default_locale)
            .map_err(|message| CompileError::InvalidNode {
                node_id: entity_id.to_owned(),
                message: message.to_owned(),
            })?;
        if let Some(resource) = locales.get_mut(locale) {
            resource.texts.insert(text_key.to_owned(), value.to_owned());
        }
    }
    Ok(())
}

fn value<T: for<'de> Deserialize<'de>>(node: &Node, key: &str) -> Result<T, CompileError> {
    node.data
        .get(key)
        .cloned()
        .ok_or_else(|| invalid_node(node, format!("missing {key}")))
        .and_then(|value| serde_json::from_value(value).map_err(|error| invalid_node(node, error)))
}

fn invalid_node(node: &Node, message: impl ToString) -> CompileError {
    CompileError::InvalidNode {
        node_id: node.id.clone(),
        message: message.to_string(),
    }
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct SourceChoice {
    id: String,
    text: LocalizedText,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        CharacterDefinition, EventDefinition, TagDefinition, VariableDefinition,
        parse_dialogue_document, parse_project_manifest,
    };

    #[test]
    fn compiles_editor_source_into_runtime_and_locale_resources() {
        let manifest = parse_project_manifest(include_str!(
            "../../../fixtures/minimal-project/.siming/project.json"
        ))
        .unwrap();
        let dialogue = parse_dialogue_document(include_str!(
            "../../../fixtures/minimal-project/dialogues/intro.json"
        ))
        .unwrap();
        let resources = fixture_resources();

        let bundle =
            compile_runtime(&manifest, std::slice::from_ref(&dialogue), &resources).unwrap();
        let runtime_dialogue = &bundle.project.dialogues[&dialogue.id];
        let start = runtime_dialogue
            .nodes
            .values()
            .find(|node| {
                matches!(
                    node,
                    RuntimeNode::Start(RuntimeStartNode { key, .. }) if key == "start"
                )
            })
            .unwrap();
        let RuntimeNode::Start(start) = start else {
            unreachable!()
        };
        assert_eq!(start.node_type, RuntimeNodeType::Start);
        let narrator = bundle
            .project
            .resources
            .characters
            .values()
            .find(|character| character.key == "narrator")
            .unwrap();
        assert_eq!(
            bundle.locales["en-US"].texts[&narrator.name_key],
            "Narrator"
        );
        let serialized = serde_json::to_string(&bundle.project).unwrap();
        assert!(!serialized.contains("position"));
        assert!(!serialized.contains("\"edges\""));
    }

    #[test]
    fn partitions_dialogues_and_texts_by_first_directory() {
        let mut manifest = parse_project_manifest(include_str!(
            "../../../fixtures/minimal-project/.siming/project.json"
        ))
        .unwrap();
        let dialogue = parse_dialogue_document(include_str!(
            "../../../fixtures/minimal-project/dialogues/intro.json"
        ))
        .unwrap();
        let resources = fixture_resources();
        let mut bundle =
            compile_runtime(&manifest, std::slice::from_ref(&dialogue), &resources).unwrap();

        manifest.dialogues[0].path = "dialogues/intro.json".to_owned();
        let nested_id = "22222222-2222-4222-8222-222222222222".to_owned();
        let mut nested_entry = manifest.dialogues[0].clone();
        nested_entry.id = nested_id.clone();
        nested_entry.key = "nested".to_owned();
        nested_entry.path = "dialogues/episode-1/deep/nested.json".to_owned();
        manifest.dialogues.push(nested_entry);

        let mut nested_dialogue = bundle.project.dialogues[&dialogue.id].clone();
        nested_dialogue.key = "nested".to_owned();
        bundle
            .project
            .dialogues
            .insert(nested_id.clone(), nested_dialogue);
        for resource in bundle.locales.values_mut() {
            let copied = resource
                .texts
                .iter()
                .filter(|(key, _)| key.starts_with(&format!("dialogue.{}.", dialogue.id)))
                .map(|(key, value)| {
                    (
                        key.replacen(
                            &format!("dialogue.{}.", dialogue.id),
                            &format!("dialogue.{nested_id}."),
                            1,
                        ),
                        value.clone(),
                    )
                })
                .collect::<Vec<_>>();
            resource.texts.extend(copied);
        }

        let chunks = partition_runtime(&manifest, &bundle).unwrap();
        assert_eq!(
            chunks
                .dialogue_chunks
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            ["", "episode-1"]
        );
        assert_eq!(chunks.dialogues[&nested_id].chunk, "episode-1");
        assert!(
            chunks.locale_global["zh-CN"]
                .texts
                .keys()
                .all(|key| !key.starts_with("dialogue."))
        );
        assert!(
            chunks.locale_chunks["zh-CN"]["episode-1"]
                .texts
                .keys()
                .all(|key| key.starts_with(&format!("dialogue.{nested_id}.")))
        );
    }

    fn fixture_resources() -> ProjectResources {
        fn items<T: for<'de> Deserialize<'de>>(source: &str, key: &str) -> Vec<T> {
            let value: Value = serde_json::from_str(source).unwrap();
            serde_json::from_value(value[key].clone()).unwrap()
        }
        ProjectResources {
            characters: items::<CharacterDefinition>(
                include_str!("../../../fixtures/minimal-project/definitions/characters.json"),
                "characters",
            ),
            variables: items::<VariableDefinition>(
                include_str!("../../../fixtures/minimal-project/definitions/variables.json"),
                "variables",
            ),
            events: items::<EventDefinition>(
                include_str!("../../../fixtures/minimal-project/definitions/events.json"),
                "events",
            ),
            tags: items::<TagDefinition>(
                include_str!("../../../fixtures/minimal-project/definitions/tags.json"),
                "tags",
            ),
        }
    }
}
