import { useState } from "react";
import { createId } from "../model/demo";
import { useEditorStore } from "../store/editorStore";
import { Modal } from "./Modal";

export function CharacterGroups({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const project = useEditorStore((state) => state.project);
  const commit = useEditorStore((state) => state.commit);
  const groups = project.manifest.characterGroups ?? [];
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const entries = [
    { id: "all", name: "全部角色" },
    { id: "ungrouped", name: "未分组" },
    ...groups,
  ];
  return (
    <section className="character-groups" aria-label="角色分组">
      <div className="character-group-heading">
        <strong>角色分组</strong>
        <button
          className="button button--ghost"
          onClick={() => {
            setEditing({ name: "" });
            setError("");
          }}
        >
          新建分组
        </button>
      </div>
      <nav>
        {entries.map((group) => (
          <div className="character-group-row" key={group.id}>
            <button
              className={selected === group.id ? "is-active" : ""}
              aria-pressed={selected === group.id}
              onClick={() => onSelect(group.id)}
            >
              <span>{group.name}</span>
              <small>
                {
                  project.resources.characters.filter(
                    (character) =>
                      group.id === "all" ||
                      (group.id === "ungrouped"
                        ? !character.groupId
                        : character.groupId === group.id),
                  ).length
                }
              </small>
            </button>
            {group.id !== "all" && group.id !== "ungrouped" && (
              <>
                <button
                  aria-label={`重命名分组 ${group.name}`}
                  title="重命名分组"
                  onClick={() => {
                    setEditing({ id: group.id, name: group.name });
                    setError("");
                  }}
                >
                  ✎
                </button>
                <button
                  aria-label={`删除分组 ${group.name}`}
                  title="删除分组"
                  onClick={() => setDeleting(group.id)}
                >
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      </nav>
      {editing && (
        <Modal
          title={editing.id ? "重命名分组" : "新建分组"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = editing.name.trim();
              if (
                !name ||
                name === "全部角色" ||
                name === "未分组" ||
                groups.some(
                  (group) =>
                    group.id !== editing.id && group.name.trim() === name,
                )
              ) {
                setError("分组名称不能为空或重复，也不能使用保留名称。");
                return;
              }
              const id = editing.id ?? createId();
              commit(
                editing.id ? "重命名角色分组" : "新建角色分组",
                (draft) => {
                  draft.manifest.characterGroups ??= [];
                  const group = draft.manifest.characterGroups.find(
                    (item) => item.id === id,
                  );
                  if (group) group.name = name;
                  else draft.manifest.characterGroups.push({ id, name });
                },
              );
              onSelect(id);
              setEditing(null);
            }}
          >
            <label>
              分组名称
              <input
                autoFocus
                data-autofocus
                aria-label="分组名称"
                value={editing.name}
                onChange={(event) => {
                  setEditing({ ...editing, name: event.target.value });
                  setError("");
                }}
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="editor-modal-actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button className="button button--primary" type="submit">
                保存
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="删除分组" onClose={() => setDeleting(null)}>
          <p>删除分组后，组内角色将移至“未分组”。角色及对话引用会保留。</p>
          <div className="editor-modal-actions">
            <button
              className="button button--ghost"
              onClick={() => setDeleting(null)}
            >
              取消
            </button>
            <button
              className="button button--primary"
              onClick={() => {
                commit("删除角色分组", (draft) => {
                  draft.manifest.characterGroups =
                    draft.manifest.characterGroups?.filter(
                      (group) => group.id !== deleting,
                    );
                  draft.resources.characters.forEach((character) => {
                    if (character.groupId === deleting)
                      delete character.groupId;
                  });
                });
                if (selected === deleting) onSelect("ungrouped");
                setDeleting(null);
              }}
            >
              删除分组
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
