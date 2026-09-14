import type { ProjectSnapshot } from "../model/types";

export type CreationResult =
  { ok: true; path: string; id?: string } | { ok: false; error: string };
export type DialogueCreationOptions = { name?: string; directories?: string[] };
export const dialogueRoot = (project: ProjectSnapshot) =>
  project.manifest.paths.dialogues.replace(/\/+$/g, "");
export function validDirectoryName(name: string) {
  return (
    Boolean(name.trim()) &&
    !/[<>:"/\\|?*]/.test(name) &&
    ![...name].some((char) => char.charCodeAt(0) < 32) &&
    !/[. ]$/.test(name) &&
    name !== "." &&
    name !== ".." &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)
  );
}
export function normalizeDialogueDirectory(path: string, root: string) {
  if (/^(\/|\\|[A-Za-z]:)/.test(path.trim())) return null;
  const normalized = path.trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  const normalizedRoot = root.replace(/\/+$/g, "");
  if (
    !normalized.split("/").every(validDirectoryName) ||
    (normalized !== normalizedRoot &&
      !normalized.startsWith(`${normalizedRoot}/`))
  )
    return null;
  return normalized;
}
export function collectDialogueDirectories(
  project: ProjectSnapshot,
  pending: string[] = [],
) {
  const root = dialogueRoot(project);
  const directories = new Set([root]);
  for (const path of [
    ...(project.manifest.dialogueDirectories ?? []),
    ...project.manifest.dialogues.map((entry) =>
      entry.path.split("/").slice(0, -1).join("/"),
    ),
    ...pending,
  ]) {
    let directory = normalizeDialogueDirectory(path, root);
    while (directory) {
      directories.add(directory);
      if (directory === root) break;
      directory = directory.split("/").slice(0, -1).join("/");
    }
  }
  return [...directories].sort();
}
export function directoryConflict(project: ProjectSnapshot, path: string) {
  const lower = path.toLowerCase();
  return project.manifest.dialogues.some((entry) => {
    const file = entry.path.toLowerCase();
    return lower === file || lower.startsWith(`${file}/`);
  });
}
export function nextDialogueKey(
  project: ProjectSnapshot,
  folder: string,
  pending: string[] = [],
) {
  const keys = new Set([
    ...project.dialogues.map((item) => item.key),
    ...project.manifest.dialogues.map((item) => item.key),
  ]);
  const paths = new Set(
    [
      ...project.manifest.dialogues.map((item) => item.path),
      ...collectDialogueDirectories(project, pending),
    ].map((path) => path.toLowerCase()),
  );
  let sequence = project.dialogues.length + 1;
  while (
    keys.has(`dialogue-${sequence}`) ||
    paths.has(`${folder}/dialogue-${sequence}.json`.toLowerCase())
  )
    sequence++;
  return `dialogue-${sequence}`;
}
