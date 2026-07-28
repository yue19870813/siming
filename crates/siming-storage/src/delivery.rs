use super::{
    PROJECT_FILE, ProjectSnapshot, StorageError, absolute_path, read_json, resolve_project_path,
    write_json_atomic,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use siming_core::{
    CompileError, ExportFormat, ExportLayout, RUNTIME_SCHEMA_VERSION, RuntimeChunkedBundle,
    RuntimeResources, compile_runtime, partition_runtime,
};
use std::{
    collections::BTreeMap,
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

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeProjectIndex {
    schema_version: u32,
    default_locale: String,
    locales: Vec<String>,
    resources: RuntimeResources,
    locale_paths: BTreeMap<String, String>,
    dialogues: BTreeMap<String, RuntimeDialogueIndex>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeDialogueIndex {
    key: String,
    structure_path: String,
    locale_paths: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BinaryRuntimeIndex {
    project: RuntimeProjectIndex,
    files: Vec<ExportedFile>,
}

pub fn export_project(
    snapshot: &ProjectSnapshot,
    output_override: Option<&Path>,
    format: ExportFormat,
    layout_override: Option<ExportLayout>,
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
    fs::create_dir_all(&temp)?;

    let mut files = Vec::new();
    match layout_override.unwrap_or(snapshot.manifest.export_layout) {
        ExportLayout::Bundled => {
            export_bundled(snapshot, &bundle, format, pretty, &temp, &mut files)?
        }
        ExportLayout::DirectoryChunks => {
            let chunks = partition_runtime(&snapshot.manifest, &bundle)?;
            export_directory_chunks(snapshot, &chunks, format, pretty, &temp, &mut files)?;
        }
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));

    replace_directory(&temp, &output)?;
    Ok(ExportResult {
        output_directory: output.display().to_string(),
        files,
    })
}

fn export_bundled(
    snapshot: &ProjectSnapshot,
    bundle: &siming_core::RuntimeBundle,
    format: ExportFormat,
    pretty: bool,
    temp: &Path,
    files: &mut Vec<ExportedFile>,
) -> Result<(), DeliveryError> {
    match format {
        ExportFormat::Json => {
            fs::create_dir_all(temp.join("locales"))?;
            let project_bytes = serialize_json(&bundle.project, pretty)?;
            write_export_file(temp, "dialogues.runtime.json", &project_bytes, files)?;
            for (locale, resource) in &bundle.locales {
                let relative = format!("locales/{locale}.json");
                let bytes = serialize_json(resource, pretty)?;
                write_export_file(temp, &relative, &bytes, files)?;
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
            write_export_file(temp, "manifest.json", &manifest_bytes, files)?;
        }
        ExportFormat::Xml => {
            fs::create_dir_all(temp.join("locales"))?;
            let project_bytes = serialize_xml("simingRuntime", &bundle.project, pretty)?;
            write_export_file(temp, "dialogues.runtime.xml", &project_bytes, files)?;
            for (locale, resource) in &bundle.locales {
                let relative = format!("locales/{locale}.xml");
                let bytes = serialize_xml("simingLocale", resource, pretty)?;
                write_export_file(temp, &relative, &bytes, files)?;
            }
            files.sort_by(|left, right| left.path.cmp(&right.path));
            let manifest_bytes = serialize_xml_manifest(snapshot, files, pretty);
            write_export_file(temp, "manifest.xml", &manifest_bytes, files)?;
        }
        ExportFormat::Binary => {
            let bytes = serialize_binary_bundle(bundle)?;
            write_export_file(temp, "runtime.simingbin", &bytes, files)?;
        }
    }
    Ok(())
}

fn export_directory_chunks(
    snapshot: &ProjectSnapshot,
    chunks: &RuntimeChunkedBundle,
    format: ExportFormat,
    pretty: bool,
    temp: &Path,
    files: &mut Vec<ExportedFile>,
) -> Result<(), DeliveryError> {
    let index = build_runtime_index(chunks, format);

    for (chunk_key, chunk) in &chunks.dialogue_chunks {
        let relative = structure_chunk_path(format, chunk_key);
        write_chunk_value(
            temp,
            &relative,
            "simingDialogueChunk",
            "dialogues",
            chunk,
            format,
            pretty,
            files,
        )?;
    }
    for (locale, resource) in &chunks.locale_global {
        if resource.texts.is_empty() {
            continue;
        }
        let relative = locale_global_path(format, locale);
        write_chunk_value(
            temp,
            &relative,
            "simingLocaleChunk",
            "locale",
            resource,
            format,
            pretty,
            files,
        )?;
    }
    for (locale, locale_chunks) in &chunks.locale_chunks {
        for (chunk_key, resource) in locale_chunks {
            let relative = locale_chunk_path(format, locale, chunk_key);
            write_chunk_value(
                temp,
                &relative,
                "simingLocaleChunk",
                "locale",
                resource,
                format,
                pretty,
                files,
            )?;
        }
    }

    files.sort_by(|left, right| left.path.cmp(&right.path));
    match format {
        ExportFormat::Json => {
            let bytes = serialize_json(&index, pretty)?;
            write_export_file(temp, "project.runtime.json", &bytes, files)?;
            files.sort_by(|left, right| left.path.cmp(&right.path));
            let manifest = ExportManifest {
                schema_version: 1,
                runtime_schema_version: RUNTIME_SCHEMA_VERSION,
                generator_version: siming_core::version().to_owned(),
                default_locale: snapshot.manifest.default_locale.clone(),
                locales: snapshot.manifest.locales.clone(),
                files: files.clone(),
            };
            let bytes = serialize_json(&manifest, pretty)?;
            write_export_file(temp, "manifest.json", &bytes, files)?;
        }
        ExportFormat::Xml => {
            let bytes = serialize_xml("simingRuntimeIndex", &index, pretty)?;
            write_export_file(temp, "project.runtime.xml", &bytes, files)?;
            files.sort_by(|left, right| left.path.cmp(&right.path));
            let bytes = serialize_xml_manifest(snapshot, files, pretty);
            write_export_file(temp, "manifest.xml", &bytes, files)?;
        }
        ExportFormat::Binary => {
            let binary_index = BinaryRuntimeIndex {
                project: index,
                files: files.clone(),
            };
            let bytes = serialize_binary_section("index", &binary_index)?;
            write_export_file(temp, "runtime.simingbin", &bytes, files)?;
        }
    }
    Ok(())
}

fn build_runtime_index(chunks: &RuntimeChunkedBundle, format: ExportFormat) -> RuntimeProjectIndex {
    let dialogues = chunks
        .dialogues
        .iter()
        .map(|(id, dialogue)| {
            let locale_paths = chunks
                .locales
                .iter()
                .filter_map(|locale| {
                    chunks
                        .locale_chunks
                        .get(locale)
                        .and_then(|items| items.get(&dialogue.chunk))
                        .map(|_| {
                            (
                                locale.clone(),
                                locale_chunk_path(format, locale, &dialogue.chunk),
                            )
                        })
                })
                .collect();
            (
                id.clone(),
                RuntimeDialogueIndex {
                    key: dialogue.key.clone(),
                    structure_path: structure_chunk_path(format, &dialogue.chunk),
                    locale_paths,
                },
            )
        })
        .collect();
    RuntimeProjectIndex {
        schema_version: chunks.schema_version,
        default_locale: chunks.default_locale.clone(),
        locales: chunks.locales.clone(),
        resources: chunks.resources.clone(),
        locale_paths: chunks
            .locale_global
            .iter()
            .filter(|(_, resource)| !resource.texts.is_empty())
            .map(|(locale, _)| (locale.clone(), locale_global_path(format, locale)))
            .collect(),
        dialogues,
    }
}

#[allow(clippy::too_many_arguments)]
fn write_chunk_value<T: Serialize>(
    temp: &Path,
    relative: &str,
    xml_root: &str,
    binary_section: &str,
    value: &T,
    format: ExportFormat,
    pretty: bool,
    files: &mut Vec<ExportedFile>,
) -> Result<(), DeliveryError> {
    let bytes = match format {
        ExportFormat::Json => serialize_json(value, pretty)?,
        ExportFormat::Xml => serialize_xml(xml_root, value, pretty)?,
        ExportFormat::Binary => serialize_binary_section(binary_section, value)?,
    };
    write_export_file(temp, relative, &bytes, files)
}

fn structure_chunk_path(format: ExportFormat, chunk_key: &str) -> String {
    let extension = export_extension(format);
    if chunk_key.is_empty() {
        format!("dialogues.runtime.{extension}")
    } else {
        format!("dialogues/{chunk_key}/runtime.{extension}")
    }
}

fn locale_global_path(format: ExportFormat, locale: &str) -> String {
    format!("locales/{locale}/global.{}", export_extension(format))
}

fn locale_chunk_path(format: ExportFormat, locale: &str, chunk_key: &str) -> String {
    let extension = export_extension(format);
    if chunk_key.is_empty() {
        format!("locales/{locale}/dialogues.runtime.{extension}")
    } else {
        format!("locales/{locale}/dialogues/{chunk_key}/runtime.{extension}")
    }
}

fn export_extension(format: ExportFormat) -> &'static str {
    match format {
        ExportFormat::Json => "json",
        ExportFormat::Xml => "xml",
        ExportFormat::Binary => "simingbin",
    }
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

fn serialize_xml<T: Serialize>(
    root: &str,
    value: &T,
    pretty: bool,
) -> Result<Vec<u8>, DeliveryError> {
    let value = serde_json::to_value(value)?;
    let mut output = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    xml_line_break(&mut output, pretty);
    output.push('<');
    output.push_str(root);
    output.push_str(" formatVersion=\"1\">");
    xml_line_break(&mut output, pretty);
    write_xml_value(&mut output, &value, 1, pretty);
    output.push_str("</");
    output.push_str(root);
    output.push('>');
    output.push('\n');
    Ok(output.into_bytes())
}

fn write_xml_value(output: &mut String, value: &Value, depth: usize, pretty: bool) {
    match value {
        Value::Null => {
            xml_indent(output, depth, pretty);
            output.push_str("<null/>");
            xml_line_break(output, pretty);
        }
        Value::Bool(value) => {
            xml_indent(output, depth, pretty);
            output.push_str("<boolean>");
            output.push_str(if *value { "true" } else { "false" });
            output.push_str("</boolean>");
            xml_line_break(output, pretty);
        }
        Value::Number(value) => {
            xml_indent(output, depth, pretty);
            output.push_str("<number>");
            output.push_str(&value.to_string());
            output.push_str("</number>");
            xml_line_break(output, pretty);
        }
        Value::String(value) => {
            xml_indent(output, depth, pretty);
            output.push_str("<string>");
            output.push_str(&escape_xml_text(value));
            output.push_str("</string>");
            xml_line_break(output, pretty);
        }
        Value::Array(values) => {
            xml_indent(output, depth, pretty);
            output.push_str("<array>");
            xml_line_break(output, pretty);
            for value in values {
                xml_indent(output, depth + 1, pretty);
                output.push_str("<item>");
                xml_line_break(output, pretty);
                write_xml_value(output, value, depth + 2, pretty);
                xml_indent(output, depth + 1, pretty);
                output.push_str("</item>");
                xml_line_break(output, pretty);
            }
            xml_indent(output, depth, pretty);
            output.push_str("</array>");
            xml_line_break(output, pretty);
        }
        Value::Object(values) => {
            xml_indent(output, depth, pretty);
            output.push_str("<object>");
            xml_line_break(output, pretty);
            let mut entries = values.iter().collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(right.0));
            for (key, value) in entries {
                xml_indent(output, depth + 1, pretty);
                output.push_str("<field name=\"");
                output.push_str(&escape_xml_attribute(key));
                output.push_str("\">");
                xml_line_break(output, pretty);
                write_xml_value(output, value, depth + 2, pretty);
                xml_indent(output, depth + 1, pretty);
                output.push_str("</field>");
                xml_line_break(output, pretty);
            }
            xml_indent(output, depth, pretty);
            output.push_str("</object>");
            xml_line_break(output, pretty);
        }
    }
}

fn serialize_xml_manifest(
    snapshot: &ProjectSnapshot,
    files: &[ExportedFile],
    pretty: bool,
) -> Vec<u8> {
    let mut output = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    xml_line_break(&mut output, pretty);
    output.push_str("<simingExportManifest schemaVersion=\"1\" runtimeSchemaVersion=\"");
    output.push_str(&RUNTIME_SCHEMA_VERSION.to_string());
    output.push_str("\" generatorVersion=\"");
    output.push_str(&escape_xml_attribute(siming_core::version()));
    output.push_str("\" defaultLocale=\"");
    output.push_str(&escape_xml_attribute(&snapshot.manifest.default_locale));
    output.push_str("\">");
    xml_line_break(&mut output, pretty);
    xml_indent(&mut output, 1, pretty);
    output.push_str("<locales>");
    xml_line_break(&mut output, pretty);
    for locale in &snapshot.manifest.locales {
        xml_indent(&mut output, 2, pretty);
        output.push_str("<locale code=\"");
        output.push_str(&escape_xml_attribute(locale));
        output.push_str("\"/>");
        xml_line_break(&mut output, pretty);
    }
    xml_indent(&mut output, 1, pretty);
    output.push_str("</locales>");
    xml_line_break(&mut output, pretty);
    xml_indent(&mut output, 1, pretty);
    output.push_str("<files>");
    xml_line_break(&mut output, pretty);
    for file in files {
        xml_indent(&mut output, 2, pretty);
        output.push_str("<file path=\"");
        output.push_str(&escape_xml_attribute(&file.path));
        output.push_str("\" sha256=\"");
        output.push_str(&file.sha256);
        output.push_str("\" bytes=\"");
        output.push_str(&file.bytes.to_string());
        output.push_str("\"/>");
        xml_line_break(&mut output, pretty);
    }
    xml_indent(&mut output, 1, pretty);
    output.push_str("</files>");
    xml_line_break(&mut output, pretty);
    output.push_str("</simingExportManifest>\n");
    output.into_bytes()
}

fn escape_xml_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_xml_attribute(value: &str) -> String {
    escape_xml_text(value)
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn xml_indent(output: &mut String, depth: usize, pretty: bool) {
    if pretty {
        output.push_str(&"  ".repeat(depth));
    }
}

fn xml_line_break(output: &mut String, pretty: bool) {
    if pretty {
        output.push('\n');
    }
}

const BINARY_MAGIC: &[u8; 8] = b"SIMINGB1";
const BINARY_FORMAT_VERSION: u32 = 1;

fn serialize_binary_bundle(bundle: &siming_core::RuntimeBundle) -> Result<Vec<u8>, DeliveryError> {
    let mut sections = Vec::with_capacity(bundle.locales.len() + 1);
    sections.push((
        "project".to_owned(),
        serialize_binary_value(&serde_json::to_value(&bundle.project)?)?,
    ));
    for (locale, resource) in &bundle.locales {
        sections.push((
            format!("locale/{locale}"),
            serialize_binary_value(&serde_json::to_value(resource)?)?,
        ));
    }
    sections.sort_by(|left, right| left.0.cmp(&right.0));

    serialize_binary_sections(sections)
}

fn serialize_binary_section<T: Serialize>(name: &str, value: &T) -> Result<Vec<u8>, DeliveryError> {
    serialize_binary_sections(vec![(
        name.to_owned(),
        serialize_binary_value(&serde_json::to_value(value)?)?,
    )])
}

fn serialize_binary_sections(
    mut sections: Vec<(String, Vec<u8>)>,
) -> Result<Vec<u8>, DeliveryError> {
    sections.sort_by(|left, right| left.0.cmp(&right.0));
    let mut output = Vec::new();
    output.extend_from_slice(BINARY_MAGIC);
    output.extend_from_slice(&BINARY_FORMAT_VERSION.to_be_bytes());
    output.extend_from_slice(&RUNTIME_SCHEMA_VERSION.to_be_bytes());
    output.extend_from_slice(&(sections.len() as u32).to_be_bytes());
    for (name, payload) in sections {
        let name_bytes = name.as_bytes();
        output.extend_from_slice(&(name_bytes.len() as u16).to_be_bytes());
        output.extend_from_slice(name_bytes);
        output.extend_from_slice(&(payload.len() as u64).to_be_bytes());
        output.extend_from_slice(&Sha256::digest(&payload));
        output.extend_from_slice(&payload);
    }
    Ok(output)
}

fn serialize_binary_value(value: &Value) -> Result<Vec<u8>, DeliveryError> {
    let mut output = Vec::new();
    write_binary_value(&mut output, value)?;
    Ok(output)
}

fn write_binary_value(output: &mut Vec<u8>, value: &Value) -> Result<(), DeliveryError> {
    match value {
        Value::Null => output.push(0),
        Value::Bool(false) => output.push(1),
        Value::Bool(true) => output.push(2),
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                output.push(3);
                output.extend_from_slice(&value.to_be_bytes());
            } else if let Some(value) = value.as_u64() {
                output.push(4);
                output.extend_from_slice(&value.to_be_bytes());
            } else {
                output.push(5);
                output
                    .extend_from_slice(&value.as_f64().unwrap_or_default().to_bits().to_be_bytes());
            }
        }
        Value::String(value) => {
            output.push(6);
            write_binary_string(output, value);
        }
        Value::Array(values) => {
            output.push(7);
            output.extend_from_slice(&(values.len() as u32).to_be_bytes());
            for value in values {
                write_binary_value(output, value)?;
            }
        }
        Value::Object(values) => {
            output.push(8);
            output.extend_from_slice(&(values.len() as u32).to_be_bytes());
            let mut entries = values.iter().collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(right.0));
            for (key, value) in entries {
                write_binary_string(output, key);
                write_binary_value(output, value)?;
            }
        }
    }
    Ok(())
}

fn write_binary_string(output: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    output.extend_from_slice(&(bytes.len() as u32).to_be_bytes());
    output.extend_from_slice(bytes);
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
    use quick_xml::{Reader, events::Event};

    #[test]
    fn deterministic_export_is_byte_identical_and_editor_free() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/minimal-project");
        let snapshot = open_project(&fixture).unwrap();
        let root = test_directory("export");
        let first = root.join("first");
        let second = root.join("second");
        export_project(&snapshot, Some(&first), ExportFormat::Json, None, false).unwrap();
        export_project(&snapshot, Some(&second), ExportFormat::Json, None, false).unwrap();

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
    fn directory_chunk_exports_share_the_same_file_layout() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/minimal-project");
        let mut snapshot = open_project(&fixture).unwrap();
        snapshot.manifest.dialogues[0].path = "dialogues/episode-1/deep/intro.json".to_owned();
        let root = test_directory("directory-chunks");

        for (format, extension, index_name) in [
            (ExportFormat::Json, "json", "project.runtime.json"),
            (ExportFormat::Xml, "xml", "project.runtime.xml"),
            (ExportFormat::Binary, "simingbin", "runtime.simingbin"),
        ] {
            let output = root.join(extension);
            let result = export_project(
                &snapshot,
                Some(&output),
                format,
                Some(ExportLayout::DirectoryChunks),
                true,
            )
            .unwrap();
            let paths = result
                .files
                .iter()
                .map(|file| file.path.as_str())
                .collect::<Vec<_>>();
            assert!(paths.contains(&index_name));
            assert!(paths.contains(&format!("dialogues/episode-1/runtime.{extension}").as_str()));
            assert!(paths.contains(
                &format!("locales/zh-CN/dialogues/episode-1/runtime.{extension}").as_str()
            ));
            assert!(paths.contains(&format!("locales/zh-CN/global.{extension}").as_str()));
            assert!(!paths.contains(&format!("dialogues.runtime.{extension}").as_str()));

            for file in &result.files {
                let bytes = fs::read(output.join(&file.path)).unwrap();
                assert_eq!(file.bytes, bytes.len() as u64);
                assert_eq!(file.sha256, hex_hash(&bytes));
                if format == ExportFormat::Binary {
                    assert_eq!(&bytes[..8], BINARY_MAGIC);
                }
            }
        }

        let index: Value =
            serde_json::from_slice(&fs::read(root.join("json/project.runtime.json")).unwrap())
                .unwrap();
        let dialogue_id = &snapshot.manifest.dialogues[0].id;
        assert_eq!(
            index["dialogues"][dialogue_id]["structurePath"],
            "dialogues/episode-1/runtime.json"
        );
        assert_eq!(
            index["dialogues"][dialogue_id]["localePaths"]["zh-CN"],
            "locales/zh-CN/dialogues/episode-1/runtime.json"
        );
        let global: Value =
            serde_json::from_slice(&fs::read(root.join("json/locales/zh-CN/global.json")).unwrap())
                .unwrap();
        assert!(
            global["texts"]
                .as_object()
                .unwrap()
                .keys()
                .all(|key| !key.starts_with("dialogue."))
        );
        let dialogue_locale: Value = serde_json::from_slice(
            &fs::read(root.join("json/locales/zh-CN/dialogues/episode-1/runtime.json")).unwrap(),
        )
        .unwrap();
        assert!(
            dialogue_locale["texts"]
                .as_object()
                .unwrap()
                .keys()
                .all(|key| key.starts_with(&format!("dialogue.{dialogue_id}.")))
        );

        let deterministic_a = root.join("deterministic-a");
        let deterministic_b = root.join("deterministic-b");
        let first = export_project(
            &snapshot,
            Some(&deterministic_a),
            ExportFormat::Json,
            Some(ExportLayout::DirectoryChunks),
            false,
        )
        .unwrap();
        let second = export_project(
            &snapshot,
            Some(&deterministic_b),
            ExportFormat::Json,
            Some(ExportLayout::DirectoryChunks),
            false,
        )
        .unwrap();
        assert_eq!(first.files, second.files);
        for file in first.files {
            assert_eq!(
                fs::read(deterministic_a.join(&file.path)).unwrap(),
                fs::read(deterministic_b.join(&file.path)).unwrap()
            );
        }

        let switching = root.join("switching");
        export_project(
            &snapshot,
            Some(&switching),
            ExportFormat::Json,
            Some(ExportLayout::Bundled),
            false,
        )
        .unwrap();
        assert!(switching.join("locales/zh-CN.json").is_file());
        export_project(
            &snapshot,
            Some(&switching),
            ExportFormat::Json,
            Some(ExportLayout::DirectoryChunks),
            false,
        )
        .unwrap();
        assert!(!switching.join("locales/zh-CN.json").exists());
        assert!(switching.join("project.runtime.json").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn xml_export_is_deterministic_and_well_formed() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/minimal-project");
        let snapshot = open_project(&fixture).unwrap();
        let root = test_directory("xml-export");
        let first = root.join("first");
        let second = root.join("second");
        export_project(&snapshot, Some(&first), ExportFormat::Xml, None, true).unwrap();
        export_project(&snapshot, Some(&second), ExportFormat::Xml, None, true).unwrap();

        for relative in [
            "manifest.xml",
            "dialogues.runtime.xml",
            "locales/zh-CN.xml",
            "locales/en-US.xml",
        ] {
            let first_bytes = fs::read(first.join(relative)).unwrap();
            assert_eq!(first_bytes, fs::read(second.join(relative)).unwrap());
            let mut reader = Reader::from_reader(first_bytes.as_slice());
            loop {
                if reader.read_event().unwrap() == Event::Eof {
                    break;
                }
            }
        }
        let runtime = fs::read_to_string(first.join("dialogues.runtime.xml")).unwrap();
        assert!(!runtime.contains("position"));
        assert!(!runtime.contains("name=\"edges\""));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn binary_export_is_deterministic_and_self_verifying() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/minimal-project");
        let snapshot = open_project(&fixture).unwrap();
        let root = test_directory("binary-export");
        let first = root.join("first");
        let second = root.join("second");
        export_project(&snapshot, Some(&first), ExportFormat::Binary, None, false).unwrap();
        export_project(&snapshot, Some(&second), ExportFormat::Binary, None, false).unwrap();

        let bytes = fs::read(first.join("runtime.simingbin")).unwrap();
        assert_eq!(bytes, fs::read(second.join("runtime.simingbin")).unwrap());
        assert_eq!(&bytes[..8], BINARY_MAGIC);
        assert_eq!(u32::from_be_bytes(bytes[8..12].try_into().unwrap()), 1);
        assert_eq!(
            u32::from_be_bytes(bytes[12..16].try_into().unwrap()),
            RUNTIME_SCHEMA_VERSION
        );
        let section_count = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
        assert_eq!(section_count, 3);
        let mut cursor = 20;
        let mut names = Vec::new();
        for _ in 0..section_count {
            let name_length =
                u16::from_be_bytes(bytes[cursor..cursor + 2].try_into().unwrap()) as usize;
            cursor += 2;
            let name = std::str::from_utf8(&bytes[cursor..cursor + name_length])
                .unwrap()
                .to_owned();
            cursor += name_length;
            let payload_length =
                u64::from_be_bytes(bytes[cursor..cursor + 8].try_into().unwrap()) as usize;
            cursor += 8;
            let checksum = &bytes[cursor..cursor + 32];
            cursor += 32;
            let payload = &bytes[cursor..cursor + payload_length];
            cursor += payload_length;
            assert_eq!(checksum, Sha256::digest(payload).as_slice());
            names.push(name);
        }
        assert_eq!(cursor, bytes.len());
        assert_eq!(names, ["locale/en-US", "locale/zh-CN", "project"]);
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
