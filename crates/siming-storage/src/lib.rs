//! Filesystem boundary helpers shared by the desktop application and CLI.

use std::path::{Component, Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PathError {
    #[error("project path must be relative")]
    Absolute,
    #[error("project path cannot escape the project root")]
    EscapesProject,
    #[error("project path cannot be empty")]
    Empty,
}

/// Normalizes a project-relative path without touching the filesystem.
///
/// All persisted project paths use `/` separators. Absolute paths and parent
/// traversal are rejected before the storage layer joins them to a project root.
pub fn normalize_project_relative_path(path: &Path) -> Result<PathBuf, PathError> {
    if path.as_os_str().is_empty() {
        return Err(PathError::Empty);
    }
    if path.is_absolute() {
        return Err(PathError::Absolute);
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(segment) => normalized.push(segment),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(PathError::EscapesProject);
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(PathError::Empty);
    }
    Ok(normalized)
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
        assert_eq!(
            normalize_project_relative_path(Path::new("../outside.json")),
            Err(PathError::EscapesProject)
        );
    }

    #[test]
    fn rejects_absolute_paths() {
        let path = if cfg!(windows) {
            Path::new(r"C:\outside.json")
        } else {
            Path::new("/outside.json")
        };

        assert_eq!(
            normalize_project_relative_path(path),
            Err(PathError::Absolute)
        );
    }
}
