import { Copy, Plus, Search, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  conditionUsesVariable,
  renameConditionVariable,
} from "../model/conditions";
import { createId } from "../model/demo";
import type {
  Activity,
  CharacterDefinition,
  EventDefinition,
  TagDefinition,
  VariableDefinition,
} from "../model/types";
import { useEditorStore } from "../store/editorStore";

type Resource =
  CharacterDefinition | VariableDefinition | EventDefinition | TagDefinition;
type ResourceKey = "characters" | "variables" | "events" | "tags";

const metadata: Record<
  ResourceKey,
  { title: string; singular: string; placeholder: string }
> = {
  characters: { title: "角色", singular: "角色", placeholder: "搜索角色…" },
  variables: { title: "变量", singular: "变量", placeholder: "搜索变量…" },
  events: { title: "业务事件", singular: "事件", placeholder: "搜索事件…" },
  tags: { title: "标签", singular: "标签", placeholder: "搜索标签…" },
};

const RESOURCE_KEY_MAX_LENGTH = 64;
const RESOURCE_NAME_MAX_LENGTH = 50;

function keyFromActivity(activity: Activity): ResourceKey {
  return activity as ResourceKey;
}

export function ResourceView({ activity }: { activity: Activity }) {
  const resourceKey = keyFromActivity(activity);
  const meta = metadata[resourceKey];
  const project = useEditorStore((state) => state.project);
  const commit = useEditorStore((state) => state.commit);
  const setNotice = useEditorStore((state) => state.setNotice);
  const locale = useEditorStore((state) => state.previewLocale);
  const resources = project.resources[resourceKey] as Resource[];
  const [selectedId, setSelectedId] = useState(resources[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const selected = resources.find((item) => item.id === selectedId);

  useEffect(() => {
    if (!resources.some((item) => item.id === selectedId)) {
      setSelectedId(resources[0]?.id ?? "");
    }
  }, [resources, selectedId]);

  const filtered = resources.filter((item) =>
    `${item.key} ${resourceName(item, locale)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const referenceCount = selected
    ? countReferences(project, resourceKey, selected.key)
    : 0;

  const add = () => {
    const id = createId();
    const key = `${resourceKey.slice(0, -1)}-${resources.length + 1}`;
    const resource = createResource(resourceKey, id, key, locale);
    commit(`新增${meta.singular}`, (draft) => {
      (draft.resources[resourceKey] as Resource[]).push(resource);
    });
    setSelectedId(id);
  };

  const update = (
    recipe: (item: Resource) => void,
    label = `修改${meta.singular}`,
  ) => {
    if (!selected) return;
    commit(label, (draft) => {
      const item = (draft.resources[resourceKey] as Resource[]).find(
        (entry) => entry.id === selected.id,
      );
      if (item) recipe(item);
    });
  };

  const renameKey = (nextKey: string) => {
    if (!selected || nextKey === selected.key) return;
    if (
      resources.some((item) => item.id !== selected.id && item.key === nextKey)
    ) {
      setNotice(`无法重命名：Key “${nextKey}” 已存在。`);
      return;
    }
    const previousKey = selected.key;
    commit(`重命名${meta.singular}并更新引用`, (draft) => {
      const item = (draft.resources[resourceKey] as Resource[]).find(
        (entry) => entry.id === selected.id,
      );
      if (item) item.key = nextKey;
      replaceReferences(draft, resourceKey, previousKey, nextKey);
    });
  };

  return (
    <section className="resource-view">
      <header className="workspace-heading">
        <div>
          <small>项目资源</small>
          <h2>{meta.title}</h2>
          <p>稳定 ID、定义字段与项目引用统一维护。</p>
        </div>
        <button className="button button--primary" onClick={add}>
          <Plus size={14} /> 新增{meta.singular}
        </button>
      </header>
      <div className="resource-layout">
        <aside className="resource-list">
          <label className="search-field">
            <Search size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={meta.placeholder}
            />
          </label>
          <div className="resource-list-items">
            {filtered.map((item) => (
              <button
                key={item.id}
                className={item.id === selectedId ? "is-active" : undefined}
                onClick={() => setSelectedId(item.id)}
              >
                <i
                  style={{
                    background:
                      "color" in item ? item.color : "var(--accent-primary)",
                  }}
                />
                <span>
                  <strong>{resourceName(item, locale)}</strong>
                  <span
                    className="resource-identity-separator"
                    aria-hidden="true"
                  >
                    ·
                  </span>
                  <small>{item.key}</small>
                </span>
                <em>{countReferences(project, resourceKey, item.key)} 引用</em>
              </button>
            ))}
            {!filtered.length && <p className="empty-list">暂无定义</p>}
          </div>
        </aside>
        <div className="resource-editor">
          {!selected ? (
            <div className="empty-state">新增或选择一个{meta.singular}</div>
          ) : (
            <>
              <div className="editor-section-title">
                <div>
                  <strong>{resourceName(selected, locale)}</strong>
                  <span
                    className="resource-identity-separator"
                    aria-hidden="true"
                  >
                    ·
                  </span>
                  <small>{selected.id}</small>
                </div>
                <div>
                  <button
                    title="复制稳定 ID"
                    onClick={() => navigator.clipboard.writeText(selected.id)}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    title="删除"
                    onClick={() => {
                      if (referenceCount) {
                        setNotice(
                          `无法删除：${selected.key} 仍有 ${referenceCount} 处引用。`,
                        );
                        return;
                      }
                      if (
                        !window.confirm(
                          `删除“${resourceName(selected, locale)}”？`,
                        )
                      )
                        return;
                      commit(`删除${meta.singular}`, (draft) => {
                        draft.resources[resourceKey] = (
                          draft.resources[resourceKey] as Resource[]
                        ).filter((item) => item.id !== selected.id) as never;
                      });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {referenceCount > 0 && (
                <div className="reference-banner">
                  <ShieldAlert size={15} />
                  当前定义有 {referenceCount} 处引用，删除保护已启用。
                </div>
              )}
              <div className="form-grid">
                <label>
                  <span>Key</span>
                  <input
                    value={selected.key}
                    maxLength={RESOURCE_KEY_MAX_LENGTH}
                    title={`最多 ${RESOURCE_KEY_MAX_LENGTH} 个字符`}
                    onChange={(event) => renameKey(event.target.value)}
                  />
                </label>
                {"name" in selected && typeof selected.name !== "string" && (
                  <label>
                    <span>显示名称 · {locale}</span>
                    <input
                      value={selected.name[locale] ?? ""}
                      maxLength={RESOURCE_NAME_MAX_LENGTH}
                      title={`最多 ${RESOURCE_NAME_MAX_LENGTH} 个字符`}
                      onChange={(event) =>
                        update((item) => {
                          if ("name" in item && typeof item.name !== "string") {
                            item.name[locale] = event.target.value;
                          }
                        })
                      }
                    />
                  </label>
                )}
                {"name" in selected && typeof selected.name === "string" && (
                  <label>
                    <span>显示名称</span>
                    <input
                      value={selected.name}
                      maxLength={RESOURCE_NAME_MAX_LENGTH}
                      title={`最多 ${RESOURCE_NAME_MAX_LENGTH} 个字符`}
                      onChange={(event) =>
                        update((item) => {
                          if ("name" in item && typeof item.name === "string") {
                            item.name = event.target.value;
                          }
                        })
                      }
                    />
                  </label>
                )}
                {"color" in selected && (
                  <label>
                    <span>颜色</span>
                    <div className="color-input">
                      <input
                        type="color"
                        value={selected.color}
                        onChange={(event) =>
                          update((item) => {
                            if ("color" in item)
                              item.color = event.target.value;
                          })
                        }
                      />
                      <code>{selected.color}</code>
                    </div>
                  </label>
                )}
                {"type" in selected && (
                  <>
                    <label>
                      <span>变量类型</span>
                      <select
                        value={selected.type}
                        onChange={(event) =>
                          update((item) => {
                            if ("type" in item) {
                              item.type = event.target
                                .value as VariableDefinition["type"];
                              item.defaultValue =
                                item.type === "boolean"
                                  ? false
                                  : item.type === "number"
                                    ? 0
                                    : "";
                            }
                          })
                        }
                      >
                        <option value="boolean">boolean</option>
                        <option value="number">number</option>
                        <option value="string">string</option>
                      </select>
                    </label>
                    <label>
                      <span>默认值</span>
                      <input
                        value={String(selected.defaultValue)}
                        onChange={(event) =>
                          update((item) => {
                            if (!("type" in item)) return;
                            item.defaultValue =
                              item.type === "boolean"
                                ? event.target.value === "true"
                                : item.type === "number"
                                  ? Number(event.target.value)
                                  : event.target.value;
                          })
                        }
                      />
                    </label>
                  </>
                )}
                <label className="form-span">
                  <span>说明</span>
                  <textarea
                    rows={5}
                    value={selected.description}
                    onChange={(event) =>
                      update((item) => {
                        item.description = event.target.value;
                      })
                    }
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function resourceName(item: Resource, locale: string) {
  if ("name" in item) {
    return typeof item.name === "string"
      ? item.name
      : item.name[locale] || Object.values(item.name)[0] || item.key;
  }
  return item.key;
}

function createResource(
  resourceKey: ResourceKey,
  id: string,
  key: string,
  locale: string,
): Resource {
  if (resourceKey === "characters") {
    return {
      id,
      key,
      name: { [locale]: "新角色" },
      color: "#8b7cf6",
      description: "",
      tags: [],
    };
  }
  if (resourceKey === "variables") {
    return {
      id,
      key,
      type: "boolean",
      defaultValue: false,
      description: "",
    };
  }
  if (resourceKey === "events") {
    return {
      id,
      key,
      name: { [locale]: "新事件" },
      description: "",
      params: [],
    };
  }
  return {
    id,
    key,
    name: "新标签",
    color: "#8b7cf6",
    scopes: ["dialogue"],
    description: "",
  };
}

function countReferences(
  project: ReturnType<typeof useEditorStore.getState>["project"],
  resourceKey: ResourceKey,
  key: string,
) {
  let count = 0;
  for (const dialogue of project.dialogues) {
    if (resourceKey === "tags" && dialogue.tags.includes(key)) count += 1;
    for (const node of dialogue.nodes) {
      if (resourceKey === "characters" && node.data.speakerId === key)
        count += 1;
      if (
        resourceKey === "variables" &&
        conditionUsesVariable(node.data.condition, key)
      )
        count += 1;
      if (resourceKey === "events" && node.data.event === key) count += 1;
      if (resourceKey === "tags" && node.data.tags?.includes(key)) count += 1;
    }
  }
  return count;
}

function replaceReferences(
  project: ReturnType<typeof useEditorStore.getState>["project"],
  resourceKey: ResourceKey,
  previousKey: string,
  nextKey: string,
) {
  for (const dialogue of project.dialogues) {
    if (resourceKey === "tags") {
      dialogue.tags = dialogue.tags.map((key) =>
        key === previousKey ? nextKey : key,
      );
    }
    for (const node of dialogue.nodes) {
      if (resourceKey === "characters" && node.data.speakerId === previousKey) {
        node.data.speakerId = nextKey;
      }
      if (resourceKey === "variables") {
        renameConditionVariable(node.data.condition, previousKey, nextKey);
      }
      if (resourceKey === "events" && node.data.event === previousKey) {
        node.data.event = nextKey;
      }
      if (resourceKey === "tags" && node.data.tags) {
        node.data.tags = node.data.tags.map((key) =>
          key === previousKey ? nextKey : key,
        );
      }
    }
  }
}
