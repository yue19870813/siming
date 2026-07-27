import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createConditionLeaf } from "../model/conditions";
import { createId } from "../model/demo";
import type {
  ComparisonOperator,
  ConditionExpression,
  DialogueDocument,
  DialogueNode,
  HostEvent,
  ProjectSnapshot,
  VariableDefinition,
} from "../model/types";
import { useEditorStore } from "../store/editorStore";

export function Inspector({
  width,
  onResizeStart,
  onResizeBy,
}: {
  width: number;
  onResizeStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizeBy: (delta: number) => void;
}) {
  const project = useEditorStore((state) => state.project);
  const dialogueId = useEditorStore((state) => state.selectedDialogueId);
  const nodeId = useEditorStore((state) => state.selectedNodeId);
  const locale = useEditorStore((state) => state.previewLocale);
  const commit = useEditorStore((state) => state.commit);
  const setSelectedNode = useEditorStore((state) => state.setSelectedNode);
  const dialogue = project.dialogues.find((item) => item.id === dialogueId);
  const node = dialogue?.nodes.find((item) => item.id === nodeId);

  if (!dialogue) return <aside className="inspector" />;

  const updateDialogue = (
    recipe: (draft: DialogueDocument, project: ProjectSnapshot) => void,
    label = "修改对话属性",
  ) =>
    commit(label, (draft) => {
      const target = draft.dialogues.find((item) => item.id === dialogueId);
      if (target) recipe(target, draft);
    });
  const updateNode = (
    recipe: (draft: DialogueNode, dialogue: DialogueDocument) => void,
    label = "修改节点属性",
  ) =>
    updateDialogue((dialogueDraft) => {
      const target = dialogueDraft.nodes.find((item) => item.id === nodeId);
      if (target) recipe(target, dialogueDraft);
    }, label);

  return (
    <aside className="inspector">
      <div
        className="panel-resize-handle panel-resize-handle--right"
        role="separator"
        aria-label="调整右侧面板宽度"
        aria-orientation="vertical"
        aria-valuemin={260}
        aria-valuemax={520}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        onPointerDown={onResizeStart}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onResizeBy(12);
          if (event.key === "ArrowRight") onResizeBy(-12);
        }}
      />
      <header className="inspector-heading">
        <div>
          <small>{node ? "节点属性" : "对话文件属性"}</small>
          <strong>{node?.key ?? dialogue.name}</strong>
        </div>
        <button
          title="复制 UUID"
          onClick={() => navigator.clipboard.writeText(node?.id ?? dialogue.id)}
        >
          <Copy size={14} />
        </button>
      </header>
      <div className="inspector-content">
        {node ? (
          <NodeInspector
            node={node}
            project={project}
            locale={locale}
            update={updateNode}
            onDelete={() => {
              if (node.id === dialogue.entryNodeId) {
                useEditorStore
                  .getState()
                  .setNotice("入口节点不能直接删除，请先修改对话入口。");
                return;
              }
              updateDialogue((draft) => {
                draft.nodes = draft.nodes.filter((item) => item.id !== node.id);
                draft.edges = draft.edges.filter(
                  (edge) =>
                    edge.sourceNodeId !== node.id &&
                    edge.targetNodeId !== node.id,
                );
              }, "删除节点");
              setSelectedNode(null);
            }}
          />
        ) : (
          <DialogueInspector
            dialogue={dialogue}
            project={project}
            update={updateDialogue}
          />
        )}
      </div>
    </aside>
  );
}

function DialogueInspector({
  dialogue,
  project,
  update,
}: {
  dialogue: DialogueDocument;
  project: ProjectSnapshot;
  update: (
    recipe: (draft: DialogueDocument, project: ProjectSnapshot) => void,
    label?: string,
  ) => void;
}) {
  const entry = project.manifest.dialogues.find(
    (item) => item.id === dialogue.id,
  )!;
  return (
    <>
      <Section title="基础信息">
        <Field label="名称">
          <input
            value={dialogue.name}
            onChange={(event) =>
              update((draft) => {
                draft.name = event.target.value;
              })
            }
          />
        </Field>
        <Field label="Key">
          <input
            value={dialogue.key}
            onChange={(event) =>
              update((draft, projectDraft) => {
                draft.key = event.target.value;
                const index = projectDraft.manifest.dialogues.find(
                  (item) => item.id === draft.id,
                );
                if (index) index.key = event.target.value;
              })
            }
          />
        </Field>
        <Field label="描述">
          <textarea
            rows={4}
            value={dialogue.description}
            onChange={(event) =>
              update((draft) => {
                draft.description = event.target.value;
              })
            }
          />
        </Field>
        <Field label="标签">
          <div className="tag-picker">
            {project.resources.tags.map((tag) => (
              <button
                key={tag.id}
                className={dialogue.tags.includes(tag.key) ? "is-active" : ""}
                onClick={() =>
                  update((draft) => {
                    draft.tags = draft.tags.includes(tag.key)
                      ? draft.tags.filter((item) => item !== tag.key)
                      : [...draft.tags, tag.key];
                  })
                }
              >
                <i style={{ background: tag.color }} />
                {tag.name}
              </button>
            ))}
          </div>
        </Field>
      </Section>
      <Section title="文件">
        <Field label="相对路径">
          <input
            value={entry.path}
            onChange={(event) =>
              update((_draft, projectDraft) => {
                const index = projectDraft.manifest.dialogues.find(
                  (item) => item.id === dialogue.id,
                );
                if (index)
                  index.path = event.target.value.replaceAll("\\", "/");
              }, "移动对话文件")
            }
          />
        </Field>
        <Field label="入口节点">
          <select
            value={dialogue.entryNodeId}
            onChange={(event) =>
              update((draft) => {
                draft.entryNodeId = event.target.value;
              })
            }
          >
            {dialogue.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.key}
              </option>
            ))}
          </select>
        </Field>
        <div className="stats-row">
          <span>{dialogue.nodes.length} 节点</span>
          <span>{dialogue.edges.length} 连线</span>
          <span>{dialogue.id.slice(0, 8)}</span>
        </div>
      </Section>
    </>
  );
}

function NodeInspector({
  node,
  project,
  locale,
  update,
  onDelete,
}: {
  node: DialogueNode;
  project: ProjectSnapshot;
  locale: string;
  update: (
    recipe: (draft: DialogueNode, dialogue: DialogueDocument) => void,
    label?: string,
  ) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <Section title="基础信息">
        <Field label="节点类型">
          <input value={node.type} disabled />
        </Field>
        <Field label="Key">
          <input
            value={node.key}
            onChange={(event) =>
              update((draft) => {
                draft.key = event.target.value;
              })
            }
          />
        </Field>
        {node.type === "dialogue" && (
          <>
            <Field label="说话人">
              <select
                value={node.data.speakerId ?? ""}
                onChange={(event) =>
                  update((draft) => {
                    draft.data.speakerId = event.target.value || undefined;
                  })
                }
              >
                <option value="">旁白</option>
                {project.resources.characters.map((character) => (
                  <option key={character.id} value={character.key}>
                    {character.name[locale] ??
                      Object.values(character.name)[0] ??
                      character.key}
                  </option>
                ))}
              </select>
            </Field>
            <LocalizedField
              label={`正文 · ${locale}`}
              value={node.data.text?.[locale] ?? ""}
              onChange={(value) =>
                update((draft) => {
                  draft.data.text ??= {};
                  draft.data.text[locale] = value;
                })
              }
            />
          </>
        )}
        {node.type === "condition" && (
          <ConditionEditor
            expression={
              node.data.condition ??
              createConditionLeaf(project.resources.variables[0])
            }
            variables={project.resources.variables}
            onChange={(expression) =>
              update((draft) => {
                draft.data.condition = expression;
              }, "修改条件表达式")
            }
          />
        )}
        {node.type === "event" && (
          <>
            <Field label="业务事件">
              <select
                value={node.data.event ?? ""}
                onChange={(event) =>
                  update((draft) => {
                    draft.data.event = event.target.value;
                  })
                }
              >
                <option value="">选择事件</option>
                {project.resources.events.map((event) => (
                  <option key={event.id} value={event.key}>
                    {event.name[locale] ??
                      Object.values(event.name)[0] ??
                      event.key}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="JSON 参数">
              <textarea
                rows={4}
                value={JSON.stringify(node.data.params ?? {}, null, 2)}
                onChange={(event) => {
                  try {
                    const params = JSON.parse(event.target.value);
                    update((draft) => {
                      draft.data.params = params;
                    });
                  } catch {
                    // Keep the last valid object. The source editor exposes diagnostics.
                  }
                }}
              />
            </Field>
          </>
        )}
        {node.type === "choice" && (
          <ChoiceEditor node={node} locale={locale} update={update} />
        )}
      </Section>
      <HostEventsEditor events={node.data.hostEvents ?? []} update={update} />
      <Section title="高级">
        <Field label="UUID">
          <input value={node.id} disabled />
        </Field>
        <button className="button button--danger" onClick={onDelete}>
          <Trash2 size={14} /> 删除节点
        </button>
      </Section>
    </>
  );
}

function ConditionEditor({
  expression,
  variables,
  onChange,
  onDelete,
  depth = 0,
}: {
  expression: ConditionExpression;
  variables: VariableDefinition[];
  onChange: (expression: ConditionExpression) => void;
  onDelete?: () => void;
  depth?: number;
}) {
  const kind =
    "variable" in expression
      ? "compare"
      : "all" in expression
        ? "all"
        : "any" in expression
          ? "any"
          : "not";
  const convert = (next: string) => {
    if (next === "compare") {
      onChange(createConditionLeaf(variables[0]));
    } else if (next === "not") {
      onChange({ not: createConditionLeaf(variables[0]) });
    } else if (next === "all") {
      onChange({ all: [createConditionLeaf(variables[0])] });
    } else {
      onChange({ any: [createConditionLeaf(variables[0])] });
    }
  };

  if ("variable" in expression) {
    const variable = variables.find((item) => item.key === expression.variable);
    const operators: ComparisonOperator[] =
      variable?.type === "number"
        ? ["==", "!=", ">", ">=", "<", "<="]
        : ["==", "!="];
    return (
      <div className="condition-expression" data-depth={depth}>
        <div className="condition-expression-head">
          <select
            value={kind}
            onChange={(event) => convert(event.target.value)}
          >
            <option value="compare">比较</option>
            <option value="all">全部满足</option>
            <option value="any">任一满足</option>
            <option value="not">取反</option>
          </select>
          {onDelete && (
            <button onClick={onDelete} title="删除条件">
              <Trash2 size={12} />
            </button>
          )}
        </div>
        <div className="condition-grid">
          <select
            value={expression.variable}
            onChange={(event) => {
              const nextVariable = variables.find(
                (item) => item.key === event.target.value,
              );
              onChange(createConditionLeaf(nextVariable));
            }}
          >
            <option value="">选择变量</option>
            {variables.map((item) => (
              <option key={item.id} value={item.key}>
                {item.key}
              </option>
            ))}
          </select>
          <select
            value={expression.operator}
            onChange={(event) =>
              onChange({
                ...expression,
                operator: event.target.value as ComparisonOperator,
              })
            }
          >
            {operators.map((operator) => (
              <option key={operator}>{operator}</option>
            ))}
          </select>
          <ConditionValueEditor
            variable={variable}
            value={expression.value}
            onChange={(value) => onChange({ ...expression, value })}
          />
        </div>
      </div>
    );
  }

  const children =
    "all" in expression
      ? expression.all
      : "any" in expression
        ? expression.any
        : [expression.not];
  return (
    <div className="condition-expression condition-expression--group">
      <div className="condition-expression-head">
        <select value={kind} onChange={(event) => convert(event.target.value)}>
          <option value="compare">比较</option>
          <option value="all">全部满足</option>
          <option value="any">任一满足</option>
          <option value="not">取反</option>
        </select>
        {kind !== "not" && (
          <button
            onClick={() => {
              const next = [...children, createConditionLeaf(variables[0])];
              onChange(kind === "all" ? { all: next } : { any: next });
            }}
          >
            <Plus size={12} /> 条件
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} title="删除条件组">
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div className="condition-children">
        {children.map((child, index) => (
          <ConditionEditor
            key={index}
            expression={child}
            variables={variables}
            depth={depth + 1}
            onChange={(nextChild) => {
              if (kind === "not") {
                onChange({ not: nextChild });
                return;
              }
              const next = [...children];
              next[index] = nextChild;
              onChange(kind === "all" ? { all: next } : { any: next });
            }}
            onDelete={
              kind === "not"
                ? undefined
                : () => {
                    const next = children.filter(
                      (_item, childIndex) => childIndex !== index,
                    );
                    onChange(kind === "all" ? { all: next } : { any: next });
                  }
            }
          />
        ))}
      </div>
    </div>
  );
}

function ConditionValueEditor({
  variable,
  value,
  onChange,
}: {
  variable?: VariableDefinition;
  value: boolean | number | string;
  onChange: (value: boolean | number | string) => void;
}) {
  if (variable?.type === "boolean") {
    return (
      <select
        value={String(value)}
        onChange={(event) => onChange(event.target.value === "true")}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      type={variable?.type === "number" ? "number" : "text"}
      value={String(value)}
      onChange={(event) =>
        onChange(
          variable?.type === "number"
            ? Number(event.target.value)
            : event.target.value,
        )
      }
    />
  );
}

function ChoiceEditor({
  node,
  locale,
  update,
}: {
  node: DialogueNode;
  locale: string;
  update: (
    recipe: (draft: DialogueNode, dialogue: DialogueDocument) => void,
    label?: string,
  ) => void;
}) {
  return (
    <div className="choice-editor">
      {(node.data.choices ?? []).map((choice, index) => (
        <div key={choice.id}>
          <span>{String.fromCharCode(65 + index)}</span>
          <input
            value={choice.text[locale] ?? ""}
            onChange={(event) =>
              update((draft) => {
                const target = draft.data.choices?.find(
                  (item) => item.id === choice.id,
                );
                if (target) target.text[locale] = event.target.value;
              })
            }
          />
          <button
            onClick={() =>
              update((draft, dialogue) => {
                draft.data.choices = draft.data.choices?.filter(
                  (item) => item.id !== choice.id,
                );
                dialogue.edges = dialogue.edges.filter(
                  (edge) =>
                    !(
                      edge.sourceNodeId === draft.id &&
                      edge.sourcePort === choice.id
                    ),
                );
              }, "删除选项")
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        className="button button--ghost"
        onClick={() =>
          update((draft) => {
            draft.data.choices ??= [];
            draft.data.choices.push({
              id: createId(),
              text: { [locale]: `选项 ${draft.data.choices.length + 1}` },
            });
          }, "新增选项")
        }
      >
        <Plus size={13} /> 新增选项
      </button>
    </div>
  );
}

function HostEventsEditor({
  events,
  update,
}: {
  events: HostEvent[];
  update: (
    recipe: (draft: DialogueNode, dialogue: DialogueDocument) => void,
    label?: string,
  ) => void;
}) {
  const move = (index: number, direction: -1 | 1) =>
    update((draft) => {
      const list = draft.data.hostEvents ?? [];
      const target = index + direction;
      if (target < 0 || target >= list.length) return;
      [list[index], list[target]] = [list[target], list[index]];
    }, "调整宿主消息顺序");

  return (
    <Section
      title="宿主消息"
      action={
        <button
          onClick={() =>
            update((draft) => {
              draft.data.hostEvents ??= [];
              draft.data.hostEvents.push({ name: "ui.custom", payload: {} });
            }, "新增宿主消息")
          }
        >
          <Plus size={13} /> 新增
        </button>
      }
    >
      {!events.length && (
        <p className="section-empty">当前节点没有宿主消息。</p>
      )}
      {events.map((event, index) => (
        <div className="host-event-card" key={`${index}-${event.name}`}>
          <header>
            <strong>#{index + 1}</strong>
            <span>HOST</span>
            <button disabled={index === 0} onClick={() => move(index, -1)}>
              <ArrowUp size={12} />
            </button>
            <button
              disabled={index === events.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={12} />
            </button>
            <button
              onClick={() =>
                update((draft) => {
                  draft.data.hostEvents = draft.data.hostEvents?.filter(
                    (_item, itemIndex) => itemIndex !== index,
                  );
                }, "删除宿主消息")
              }
            >
              <Trash2 size={12} />
            </button>
          </header>
          <input
            value={event.name}
            onChange={(changeEvent) =>
              update((draft) => {
                if (draft.data.hostEvents?.[index]) {
                  draft.data.hostEvents[index].name = changeEvent.target.value;
                }
              })
            }
          />
          <textarea
            rows={3}
            value={JSON.stringify(event.payload, null, 2)}
            onChange={(changeEvent) => {
              try {
                const payload = JSON.parse(changeEvent.target.value);
                update((draft) => {
                  if (draft.data.hostEvents?.[index]) {
                    draft.data.hostEvents[index].payload = payload;
                  }
                });
              } catch {
                // Keep the last valid payload.
              }
            }}
          />
        </div>
      ))}
    </Section>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="inspector-section">
      <header>
        <strong>{title}</strong>
        {action}
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="inspector-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function LocalizedField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <textarea
        rows={5}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
