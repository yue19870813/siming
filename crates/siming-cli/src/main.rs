use clap::{Parser, Subcommand};
use std::path::PathBuf;

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
    /// Print the shared core version and exit.
    Info {
        /// Project path. Defaults to the current directory.
        #[arg(default_value = ".")]
        path: PathBuf,
    },
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Some(Command::Info { path }) => {
            println!(
                "Siming {} · project {}",
                siming_core::version(),
                path.display()
            );
        }
        None => {
            println!("Siming {}", siming_core::version());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn command_definition_is_valid() {
        Cli::command().debug_assert();
    }
}
