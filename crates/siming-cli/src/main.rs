use clap::{Parser, Subcommand, ValueEnum};
use serde_json::{Value, json};
use siming_core::{Diagnostic, DiagnosticSeverity, ExportFormat, ExportLayout};
use siming_storage::{DeliveryError, ProjectSnapshot};
use std::{path::PathBuf, process::ExitCode};

const EXIT_SUCCESS: u8 = 0;
const EXIT_VALIDATION: u8 = 1;
const EXIT_USAGE: u8 = 2;
const EXIT_INTERNAL: u8 = 3;

#[derive(Debug, Parser)]
#[command(
    name = "siming",
    version,
    about = "司命（Siming）剧情对话项目命令行工具"
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Validate a project with the shared Siming core.
    Validate {
        /// Project path. Defaults to the current directory.
        #[arg(default_value = ".")]
        path: PathBuf,
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
        #[arg(long)]
        warnings_as_errors: bool,
    },
    /// Compile deterministic runtime data and locale resources.
    Export {
        /// Project path. Defaults to the current directory.
        #[arg(default_value = ".")]
        path: PathBuf,
        /// Output directory. Defaults to the project export setting.
        #[arg(long)]
        output: Option<PathBuf>,
        #[arg(long)]
        pretty: bool,
        /// Runtime export format. Defaults to the project setting.
        #[arg(long, value_enum)]
        format: Option<RuntimeExportFormat>,
        /// Runtime file layout. Defaults to the project setting.
        #[arg(long, value_enum)]
        layout: Option<RuntimeExportLayout>,
    },
    /// Check or apply source schema migrations.
    Migrate {
        /// Project path. Defaults to the current directory.
        #[arg(default_value = ".")]
        path: PathBuf,
        #[arg(long, conflicts_with = "write")]
        check: bool,
        #[arg(long)]
        write: bool,
        #[arg(long, requires = "write")]
        backup_dir: Option<PathBuf>,
    },
    /// Show project schema, languages, content counts and validation summary.
    Info {
        /// Project path. Defaults to the current directory.
        #[arg(default_value = ".")]
        path: PathBuf,
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum OutputFormat {
    Text,
    Json,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum RuntimeExportFormat {
    Json,
    Xml,
    Binary,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum RuntimeExportLayout {
    Bundled,
    DirectoryChunks,
}

impl From<RuntimeExportFormat> for ExportFormat {
    fn from(value: RuntimeExportFormat) -> Self {
        match value {
            RuntimeExportFormat::Json => Self::Json,
            RuntimeExportFormat::Xml => Self::Xml,
            RuntimeExportFormat::Binary => Self::Binary,
        }
    }
}

fn main() -> ExitCode {
    let code = std::panic::catch_unwind(|| run(Cli::parse())).unwrap_or_else(|_| {
        eprintln!("内部错误：命令执行异常终止。");
        EXIT_INTERNAL
    });
    ExitCode::from(code)
}

fn run(cli: Cli) -> u8 {
    match cli.command {
        None => {
            println!("Siming {}", siming_core::version());
            EXIT_SUCCESS
        }
        Some(Command::Validate {
            path,
            format,
            warnings_as_errors,
        }) => validate_command(path, format, warnings_as_errors),
        Some(Command::Export {
            path,
            output,
            pretty,
            format,
            layout,
        }) => export_command(path, output, format, layout, pretty),
        Some(Command::Migrate {
            path,
            check: _,
            write,
            backup_dir,
        }) => migrate_command(path, write, backup_dir),
        Some(Command::Info { path, format }) => info_command(path, format),
    }
}

fn validate_command(path: PathBuf, format: OutputFormat, warnings_as_errors: bool) -> u8 {
    let snapshot = match siming_storage::open_project(&path) {
        Ok(snapshot) => snapshot,
        Err(error) => return command_error("validate", format, error.to_string()),
    };
    let diagnostics =
        siming_core::validate_project(&snapshot.manifest, &snapshot.dialogues, &snapshot.resources);
    let errors = count(&diagnostics, DiagnosticSeverity::Error);
    let warnings = count(&diagnostics, DiagnosticSeverity::Warning);
    let success = errors == 0 && (!warnings_as_errors || warnings == 0);
    match format {
        OutputFormat::Json => print_json(json!({
            "version": siming_core::version(),
            "command": "validate",
            "success": success,
            "diagnostics": diagnostics,
            "result": {
                "errors": errors,
                "warnings": warnings,
                "warningsAsErrors": warnings_as_errors
            }
        })),
        OutputFormat::Text => {
            print_diagnostics(&diagnostics);
            println!(
                "{}：{} 个错误，{} 个警告",
                if success {
                    "校验通过"
                } else {
                    "校验失败"
                },
                errors,
                warnings
            );
        }
    }
    if success {
        EXIT_SUCCESS
    } else {
        EXIT_VALIDATION
    }
}

fn export_command(
    path: PathBuf,
    output: Option<PathBuf>,
    format: Option<RuntimeExportFormat>,
    layout: Option<RuntimeExportLayout>,
    pretty: bool,
) -> u8 {
    let snapshot = match siming_storage::open_project(&path) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            eprintln!("无法读取项目：{error}");
            return EXIT_USAGE;
        }
    };
    let format = format
        .map(ExportFormat::from)
        .unwrap_or(snapshot.manifest.default_export_format);
    let layout = layout.map(|layout| match layout {
        RuntimeExportLayout::Bundled => ExportLayout::Bundled,
        RuntimeExportLayout::DirectoryChunks => ExportLayout::DirectoryChunks,
    });
    match siming_storage::export_project(&snapshot, output.as_deref(), format, layout, pretty) {
        Ok(result) => {
            println!("已导出到 {}", result.output_directory);
            for file in result.files {
                println!("  {}  {}  {} bytes", file.sha256, file.path, file.bytes);
            }
            EXIT_SUCCESS
        }
        Err(DeliveryError::Compile(error)) => {
            if let Some(diagnostics) = error.diagnostics() {
                print_diagnostics(diagnostics);
            } else {
                eprintln!("运行时编译失败：{error}");
            }
            EXIT_VALIDATION
        }
        Err(error) => {
            eprintln!("导出失败：{error}");
            EXIT_USAGE
        }
    }
}

fn migrate_command(path: PathBuf, write: bool, backup_dir: Option<PathBuf>) -> u8 {
    let result = if write {
        siming_storage::migrate_project(&path, backup_dir.as_deref())
    } else {
        siming_storage::check_migration(&path)
    };
    match result {
        Ok(report) => {
            if report.required {
                println!(
                    "项目需要迁移：Schema {} → {}",
                    report.current_schema_version, report.target_schema_version
                );
                for change in &report.changes {
                    println!("  {} · {}", change.file, change.description);
                }
                if write {
                    println!(
                        "迁移完成，备份：{}",
                        report.backup_directory.as_deref().unwrap_or("未生成")
                    );
                } else {
                    println!("使用 --write 执行迁移。");
                }
            } else {
                println!("项目已是最新 Schema，无需迁移。");
            }
            EXIT_SUCCESS
        }
        Err(error) => {
            eprintln!("迁移检查失败：{error}");
            EXIT_USAGE
        }
    }
}

fn info_command(path: PathBuf, format: OutputFormat) -> u8 {
    let snapshot = match siming_storage::open_project(&path) {
        Ok(snapshot) => snapshot,
        Err(error) => return command_error("info", format, error.to_string()),
    };
    let diagnostics =
        siming_core::validate_project(&snapshot.manifest, &snapshot.dialogues, &snapshot.resources);
    let result = project_info(&snapshot, &diagnostics);
    match format {
        OutputFormat::Json => print_json(json!({
            "version": siming_core::version(),
            "command": "info",
            "success": true,
            "diagnostics": diagnostics,
            "result": result
        })),
        OutputFormat::Text => {
            println!(
                "{} ({})",
                snapshot.manifest.name, snapshot.manifest.project_id
            );
            println!(
                "Schema v{} · 默认语言 {} · 支持 {}",
                snapshot.manifest.schema_version,
                snapshot.manifest.default_locale,
                snapshot.manifest.locales.join(", ")
            );
            println!(
                "{} 个对话 · {} 个节点 · {} 个错误 · {} 个警告",
                result["dialogues"], result["nodes"], result["errors"], result["warnings"]
            );
        }
    }
    EXIT_SUCCESS
}

fn project_info(snapshot: &ProjectSnapshot, diagnostics: &[Diagnostic]) -> Value {
    json!({
        "projectId": snapshot.manifest.project_id,
        "name": snapshot.manifest.name,
        "schemaVersion": snapshot.manifest.schema_version,
        "defaultLocale": snapshot.manifest.default_locale,
        "locales": snapshot.manifest.locales,
        "dialogues": snapshot.dialogues.len(),
        "nodes": snapshot.dialogues.iter().map(|item| item.nodes.len()).sum::<usize>(),
        "characters": snapshot.resources.characters.len(),
        "variables": snapshot.resources.variables.len(),
        "events": snapshot.resources.events.len(),
        "tags": snapshot.resources.tags.len(),
        "errors": count(diagnostics, DiagnosticSeverity::Error),
        "warnings": count(diagnostics, DiagnosticSeverity::Warning)
    })
}

fn command_error(command: &str, format: OutputFormat, message: String) -> u8 {
    match format {
        OutputFormat::Json => print_json(json!({
            "version": siming_core::version(),
            "command": command,
            "success": false,
            "diagnostics": [],
            "result": null,
            "error": {
                "code": "PROJECT_READ_FAILED",
                "message": message
            }
        })),
        OutputFormat::Text => eprintln!("无法读取项目：{message}"),
    }
    EXIT_USAGE
}

fn print_json(value: Value) {
    println!(
        "{}",
        serde_json::to_string(&value).expect("CLI JSON envelope should serialize")
    );
}

fn print_diagnostics(diagnostics: &[Diagnostic]) {
    for item in diagnostics {
        println!(
            "{} {} {}{} · {}",
            match item.severity {
                DiagnosticSeverity::Error => "ERROR",
                DiagnosticSeverity::Warning => "WARN ",
            },
            item.code,
            item.file,
            item.entity_id
                .as_deref()
                .map(|id| format!(":{id}"))
                .unwrap_or_default(),
            item.message
        );
    }
}

fn count(diagnostics: &[Diagnostic], severity: DiagnosticSeverity) -> usize {
    diagnostics
        .iter()
        .filter(|item| item.severity == severity)
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn command_definition_is_valid() {
        Cli::command().debug_assert();
    }

    #[test]
    fn parses_all_delivery_subcommands() {
        for args in [
            vec!["siming", "validate", ".", "--format", "json"],
            vec!["siming", "export", ".", "--output", "build", "--pretty"],
            vec!["siming", "export", ".", "--format", "xml"],
            vec!["siming", "export", ".", "--format", "binary"],
            vec!["siming", "export", ".", "--layout", "directory-chunks"],
            vec!["siming", "migrate", ".", "--check"],
            vec![
                "siming",
                "migrate",
                ".",
                "--write",
                "--backup-dir",
                "backup",
            ],
            vec!["siming", "info", ".", "--format", "json"],
        ] {
            assert!(Cli::try_parse_from(args).is_ok());
        }
    }

    #[test]
    fn reserves_documented_exit_codes() {
        assert_eq!(
            [EXIT_SUCCESS, EXIT_VALIDATION, EXIT_USAGE, EXIT_INTERNAL],
            [0, 1, 2, 3]
        );
    }
}
