import { useState } from "react";
import {
  collectDialogueDirectories,
  dialogueRoot,
  directoryConflict,
  nextDialogueKey,
  validDirectoryName,
} from "../lib/dialogueCreation";
import { useEditorStore } from "../store/editorStore";
import { Modal } from "./Modal";

export function CreationDialog({
  type,
  initialDirectory,
  onClose,
  onCreated,
}: {
  type: "dialogue" | "directory";
  initialDirectory: string;
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const project = useEditorStore((state) => state.project);
  const [folder, setFolder] = useState(initialDirectory);
  const [name, setName] = useState(
    type === "directory"
      ? "新目录"
      : `新对话 ${nextDialogueKey(project, initialDirectory).slice(9)}`,
  );
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [error, setError] = useState("");
  const root = dialogueRoot(project);
  const directories = collectDialogueDirectories(project, pending);
  const matched = directories.filter((path) =>
    path.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const visible = directories.filter((path) =>
    query.trim()
      ? matched.some((match) => match === path || match.startsWith(`${path}/`))
      : ![...collapsed].some((parent) => path.startsWith(`${parent}/`)),
  );
  const path =
    type === "directory"
      ? `${folder}/${name.trim()}`
      : `${folder}/${nextDialogueKey(project, folder, pending)}.json`;
  const title = type === "directory" ? "新建对话目录" : "新建对话";
  const stageDirectory = () => {
    const part = newFolder?.trim() ?? "";
    const target = `${folder}/${part}`;
    if (!validDirectoryName(part)) {
      setError("请输入有效的目录名称。");
      return;
    }
    if (
      directories.some((item) => item.toLowerCase() === target.toLowerCase()) ||
      directoryConflict(project, target)
    ) {
      setError("该路径已存在或与对话文件冲突。");
      return;
    }
    setPending([...pending, target]);
    setFolder(target);
    setNewFolder(null);
    setQuery("");
    setCollapsed(new Set());
    setError("");
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (newFolder !== null) {
            stageDirectory();
            return;
          }
          if (!name.trim()) {
            setError("名称不能为空。");
            return;
          }
          if (type === "directory" && !validDirectoryName(name.trim())) {
            setError("请输入有效的目录名称。");
            return;
          }
          const store = useEditorStore.getState();
          const result =
            type === "directory"
              ? store.addDialogueDirectory(path)
              : store.addDialogue(folder, { name, directories: pending });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onCreated(type === "directory" ? result.path : folder);
        }}
      >
        <div className="creation-dialog-grid">
          <section>
            <h3>选择父目录</h3>
            <input
              aria-label="搜索目录"
              placeholder="搜索目录…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div
              className="creation-directory-tree"
              role="tree"
              aria-label="目录树"
            >
              {visible.map((directory) => {
                const children = directories.some((item) =>
                  item.startsWith(`${directory}/`),
                );
                return (
                  <div
                    key={directory}
                    className="creation-directory-row"
                    style={{
                      paddingLeft: `${(directory.split("/").length - root.split("/").length) * 16}px`,
                    }}
                  >
                    <button
                      type="button"
                      className="directory-toggle"
                      disabled={!children}
                      aria-label="展开或折叠目录"
                      aria-expanded={
                        children ? !collapsed.has(directory) : undefined
                      }
                      onClick={() =>
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(directory)) next.delete(directory);
                          else next.add(directory);
                          return next;
                        })
                      }
                    >
                      {children ? (collapsed.has(directory) ? "▸" : "▾") : "·"}
                    </button>
                    <button
                      type="button"
                      role="treeitem"
                      aria-level={
                        directory.split("/").length - root.split("/").length + 1
                      }
                      aria-selected={folder === directory}
                      title={directory}
                      className={folder === directory ? "is-active" : ""}
                      onClick={() => {
                        setFolder(directory);
                        setError("");
                      }}
                    >
                      {directory === root ? root : directory.split("/").at(-1)}
                    </button>
                  </div>
                );
              })}
              {!visible.length && <p>没有匹配的目录。</p>}
            </div>
            {type === "dialogue" &&
              (newFolder === null ? (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setNewFolder("")}
                >
                  新建子目录
                </button>
              ) : (
                <div className="pending-directory">
                  <input
                    aria-label="子目录名称"
                    placeholder="子目录名称"
                    value={newFolder}
                    onChange={(event) => setNewFolder(event.target.value)}
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={stageDirectory}
                  >
                    添加目录
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFolder(null);
                      setError("");
                    }}
                  >
                    取消
                  </button>
                </div>
              ))}
          </section>
          <section className="creation-details">
            <h3>基本信息</h3>
            <label>
              <span>{type === "directory" ? "目录名称" : "对话名称"}</span>
              <input
                autoFocus
                data-autofocus
                aria-label={type === "directory" ? "目录名称" : "对话名称"}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError("");
                }}
              />
            </label>
            <label>
              <span>目标目录</span>
              <output>{folder}</output>
            </label>
            <label>
              <span>最终路径</span>
              <output className="creation-path">{path}</output>
            </label>
          </section>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="editor-modal-actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={onClose}
          >
            取消
          </button>
          <button type="submit" className="button button--primary">
            创建
          </button>
        </div>
      </form>
    </Modal>
  );
}
