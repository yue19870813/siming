import type { ProjectSnapshot } from "../model/types";

export const withinDialogueRoot = (path: string, root: string) =>
  path === root.replace(/\/+$/g, "") ||
  path.startsWith(`${root.replace(/\/+$/g, "")}/`);

// Update the index only. Saving copies current documents; storage preserves originals.
export function migrateDialogueDirectory(
  project: ProjectSnapshot,
  nextRoot: string,
) {
  const oldRoot = project.manifest.paths.dialogues.replace(/\/+$/g, "");
  const root = nextRoot.replace(/\/+$/g, "");
  const relocate = (path: string) =>
    withinDialogueRoot(path, oldRoot)
      ? root + path.slice(oldRoot.length)
      : path;
  const entries = project.manifest.dialogues.map((entry) => ({
    ...entry,
    path: relocate(entry.path),
  }));
  const paths = entries.map((entry) => entry.path.toLowerCase());
  const directories = [
    ...new Set(
      (project.manifest.dialogueDirectories ?? []).map(relocate).concat(root),
    ),
  ];
  if (
    new Set(paths).size !== paths.length ||
    paths.some(
      (path) =>
        paths.some((other) => other.startsWith(`${path}/`)) ||
        directories.some(
          (directory) =>
            directory.toLowerCase() === path ||
            directory.toLowerCase().startsWith(`${path}/`),
        ),
    )
  ) {
    throw new Error("迁移目标路径存在冲突，请选择其它目录。");
  }
  project.manifest.dialogues = entries;
  project.manifest.dialogueDirectories = directories;
}
