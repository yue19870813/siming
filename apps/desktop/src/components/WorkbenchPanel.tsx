import {
  AlertTriangle,
  CheckCircle2,
  CircleStop,
  Play,
  RotateCcw,
  Terminal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { simulateStep, validateProject } from "../lib/projectApi";
import type {
  Diagnostic,
  DialogueDocument,
  SimulationAction,
  SimulationSession,
  VariableDefinition,
} from "../model/types";
import { useEditorStore } from "../store/editorStore";

export type WorkbenchPanelMode = "problems" | "simulator" | "terminal";

export function WorkbenchPanel({
  mode,
  onModeChange,
  onClose,
}: {
  mode: WorkbenchPanelMode;
  onModeChange: (mode: WorkbenchPanelMode) => void;
  onClose: () => void;
}) {
  const project = useEditorStore((state) => state.project);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [validationState, setValidationState] = useState<
    "idle" | "running" | "complete" | "error"
  >("idle");
  const [validationError, setValidationError] = useState("");

  const runValidation = useCallback(async () => {
    setValidationState("running");
    setValidationError("");
    try {
      setDiagnostics(await validateProject(project));
      setValidationState("complete");
    } catch (error) {
      setValidationError(errorMessage(error));
      setValidationState("error");
    }
  }, [project]);

  useEffect(() => {
    if (mode === "problems") void runValidation();
  }, [mode, runValidation]);

  return (
    <section className="workbench-panel" aria-label="工作面板">
      <header>
        <div className="workbench-tabs">
          <button
            className={mode === "problems" ? "is-active" : undefined}
            onClick={() => onModeChange("problems")}
          >
            问题
            <span>{diagnostics.length}</span>
          </button>
          <button
            className={mode === "simulator" ? "is-active" : undefined}
            onClick={() => onModeChange("simulator")}
          >
            模拟运行
          </button>
          <button
            className={mode === "terminal" ? "is-active" : undefined}
            onClick={() => onModeChange("terminal")}
          >
            命令行
          </button>
        </div>
        <div className="workbench-header-actions">
          {mode === "problems" && (
            <button
              className="workbench-refresh"
              onClick={() => void runValidation()}
              disabled={validationState === "running"}
            >
              <RotateCcw size={12} />
              {validationState === "running" ? "校验中…" : "重新校验"}
            </button>
          )}
          <button
            className="workbench-close"
            onClick={onClose}
            title="关闭面板"
          >
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="workbench-content">
        {mode === "problems" && (
          <Problems
            diagnostics={diagnostics}
            state={validationState}
            error={validationError}
          />
        )}
        {mode === "simulator" && <Simulator />}
        {mode === "terminal" && <TerminalPanel />}
      </div>
    </section>
  );
}

function Problems({
  diagnostics,
  state,
  error,
}: {
  diagnostics: Diagnostic[];
  state: "idle" | "running" | "complete" | "error";
  error: string;
}) {
  const project = useEditorStore((store) => store.project);
  const selectDialogue = useEditorStore((store) => store.setSelectedDialogue);
  const selectNode = useEditorStore((store) => store.setSelectedNode);
  const setViewMode = useEditorStore((store) => store.setViewMode);
  const setActivity = useEditorStore((store) => store.setActivity);
  if (state === "running" || state === "idle") {
    return <div className="workbench-empty">正在使用共享核心校验项目…</div>;
  }
  if (state === "error") {
    return (
      <div className="workbench-empty workbench-empty--error">
        <AlertTriangle size={17} />
        <strong>无法运行校验</strong>
        <span>{error}</span>
      </div>
    );
  }
  if (!diagnostics.length) {
    return (
      <div className="workbench-empty">
        <CheckCircle2 size={17} />
        <strong>校验通过</strong>
        <span>共享核心未发现结构、引用、分支或翻译问题。</span>
      </div>
    );
  }
  const groups = groupDiagnostics(diagnostics);
  const errors = diagnostics.filter((item) => item.severity === "error").length;
  return (
    <div className="diagnostics-view">
      <header className="diagnostics-summary">
        <strong>{errors} 个错误</strong>
        <span>{diagnostics.length - errors} 个警告</span>
        <code>共 {diagnostics.length} 项</code>
      </header>
      {groups.map(([file, items]) => (
        <section className="diagnostic-group" key={file}>
          <header>
            <strong>{file || "项目配置"}</strong>
            <span>{items.length}</span>
          </header>
          <div className="diagnostic-list">
            {items.map((diagnostic, index) => (
              <button
                key={`${diagnostic.code}-${diagnostic.entityId}-${index}`}
                onClick={() => {
                  const dialogue = locateDiagnosticDialogue(
                    project.dialogues,
                    diagnostic,
                    file,
                  );
                  setActivity("project");
                  if (dialogue) selectDialogue(dialogue.id);
                  if (diagnostic.entityType === "node" && diagnostic.entityId) {
                    selectNode(diagnostic.entityId);
                  } else if (
                    diagnostic.entityType === "edge" &&
                    diagnostic.entityId &&
                    dialogue
                  ) {
                    const edge = dialogue.edges.find(
                      (item) => item.id === diagnostic.entityId,
                    );
                    selectNode(edge?.sourceNodeId ?? null);
                  } else {
                    selectNode(null);
                  }
                  if (diagnostic.range) setViewMode("data");
                }}
              >
                <span className={`severity severity--${diagnostic.severity}`}>
                  {diagnostic.severity === "error" ? "错误" : "警告"}
                </span>
                <span>
                  <strong>{diagnostic.message}</strong>
                  <small>
                    {diagnostic.code}
                    {diagnostic.fieldPath ? ` · ${diagnostic.fieldPath}` : ""}
                  </small>
                </span>
                <code>{diagnostic.entityId?.slice(0, 8) ?? "PROJECT"}</code>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Simulator() {
  const project = useEditorStore((state) => state.project);
  const dialogueId = useEditorStore((state) => state.selectedDialogueId);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const previewLocale = useEditorStore((state) => state.previewLocale);
  const setPreviewLocale = useEditorStore((state) => state.setPreviewLocale);
  const dialogue = project.dialogues.find((item) => item.id === dialogueId);
  const [session, setSession] = useState<SimulationSession>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [startAtSelection, setStartAtSelection] = useState(false);

  useEffect(() => {
    setSession(undefined);
    setError("");
  }, [dialogueId]);

  const runAction = async (action: SimulationAction) => {
    if (!dialogue) return;
    setBusy(true);
    setError("");
    try {
      setSession(
        await simulateStep({
          manifest: project.manifest,
          dialogue,
          resources: project.resources,
          session,
          action,
        }),
      );
    } catch (runError) {
      setError(errorMessage(runError));
    } finally {
      setBusy(false);
    }
  };

  if (!dialogue) return <div className="workbench-empty">请选择对话文件。</div>;
  if (!session) {
    return (
      <div className="simulator-start">
        <Play size={22} />
        <strong>验证当前对话的实际运行路径</strong>
        <p>变量和事件只存在于本次内存会话，不会修改项目源数据。</p>
        <label>
          <input
            type="checkbox"
            checked={startAtSelection}
            disabled={!selectedNodeId}
            onChange={(event) => setStartAtSelection(event.target.checked)}
          />
          从当前选中节点开始
        </label>
        <button
          className="button button--success"
          disabled={busy}
          onClick={() =>
            void runAction({
              type: "start",
              startNodeId:
                startAtSelection && selectedNodeId ? selectedNodeId : undefined,
              locale: previewLocale,
            })
          }
        >
          <Play size={13} /> 开始模拟
        </button>
        {error && <span className="simulator-error">{error}</span>}
      </div>
    );
  }

  const node = dialogue.nodes.find((item) => item.id === session.currentNodeId);
  const text = node ? localizedNodeText(node, project, session.locale) : null;
  const choices =
    node?.type === "choice"
      ? (node.data.choices ?? []).map((choice) => ({
          id: choice.id,
          text: localizedValue(
            choice.text,
            session.locale,
            project.manifest.defaultLocale,
          ),
        }))
      : [];

  return (
    <div className="simulator-workspace">
      <aside className="simulator-variables">
        <header>
          <strong>临时变量</strong>
          <span>不回写项目</span>
        </header>
        {project.resources.variables.map((variable) => (
          <VariableControl
            key={variable.id}
            variable={variable}
            value={session.variables[variable.key]}
            disabled={busy}
            onChange={(value) =>
              void runAction({
                type: "setVariable",
                key: variable.key,
                value,
              })
            }
          />
        ))}
      </aside>
      <main className="simulator-current">
        <header>
          <span className={`simulation-status status--${session.status}`}>
            {statusLabel(session.status)}
          </span>
          <select
            aria-label="模拟语言"
            value={session.locale}
            disabled={busy}
            onChange={(event) => {
              const locale = event.target.value;
              setPreviewLocale(locale);
              void runAction({ type: "setLocale", locale });
            }}
          >
            {project.manifest.locales.map((locale) => (
              <option key={locale}>{locale}</option>
            ))}
          </select>
        </header>
        {node ? (
          <div className="simulator-dialogue">
            <small>
              {node.type} · {node.key}
            </small>
            <strong>
              {speakerName(node.data.speakerId, project, session.locale)}
            </strong>
            <p>{text?.value ?? simulatorFallback(node.type)}</p>
            {text?.fallback && (
              <span className="locale-fallback">
                已回退到 {project.manifest.defaultLocale}
              </span>
            )}
          </div>
        ) : (
          <div className="simulator-dialogue">
            <CircleStop size={20} />
            <p>{session.error ?? "模拟已结束"}</p>
          </div>
        )}
        <div className="simulator-actions">
          {session.status === "waitingContinue" && (
            <button
              className="button button--primary"
              disabled={busy}
              onClick={() => void runAction({ type: "continue" })}
            >
              继续
            </button>
          )}
          {session.status === "waitingChoice" &&
            choices.map((choice) => (
              <button
                className="button button--ghost"
                key={choice.id}
                disabled={busy}
                onClick={() =>
                  void runAction({ type: "choose", optionId: choice.id })
                }
              >
                {choice.text.value}
                {choice.text.fallback ? " · 回退" : ""}
              </button>
            ))}
          {["completed", "loopGuard", "error"].includes(session.status) && (
            <button
              className="button button--ghost"
              disabled={busy}
              onClick={() =>
                void runAction({
                  type: "start",
                  locale: session.locale,
                })
              }
            >
              <RotateCcw size={12} /> 重新运行
            </button>
          )}
        </div>
        {error && <span className="simulator-error">{error}</span>}
      </main>
      <aside className="simulation-trace">
        <header>
          <strong>运行轨迹</strong>
          <span>{session.trace.length}</span>
        </header>
        <div>
          {session.trace.map((entry) => (
            <button
              key={entry.sequence}
              className={`trace-entry trace-entry--${entry.kind}`}
              onClick={() => {
                if (!entry.nodeId) return;
                useEditorStore.getState().setSelectedNode(entry.nodeId);
              }}
            >
              <code>{String(entry.sequence).padStart(3, "0")}</code>
              <span>
                <strong>{traceKindLabel(entry.kind)}</strong>
                <small>{entry.message}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function VariableControl({
  variable,
  value,
  disabled,
  onChange,
}: {
  variable: VariableDefinition;
  value: boolean | number | string | undefined;
  disabled: boolean;
  onChange: (value: boolean | number | string) => void;
}) {
  return (
    <label>
      <span>
        <strong>{variable.key}</strong>
        <small>{variable.type}</small>
      </span>
      {variable.type === "boolean" ? (
        <select
          value={String(value ?? variable.defaultValue)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === "true")}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type={variable.type === "number" ? "number" : "text"}
          value={String(value ?? variable.defaultValue)}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              variable.type === "number"
                ? Number(event.target.value)
                : event.target.value,
            )
          }
        />
      )}
    </label>
  );
}

function TerminalPanel() {
  const [command, setCommand] = useState("siming validate . --format json");
  return (
    <div className="terminal-panel">
      <div>
        <Terminal size={14} />
        <input
          aria-label="命令"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
        />
        <button className="button button--primary" disabled>
          运行
        </button>
      </div>
      <pre>
        {`$ ${command}\n\nCLI 正式子命令属于阶段 3。\n当前阶段请使用顶部“校验”和“模拟运行”调用共享 Rust 核心。`}
      </pre>
    </div>
  );
}

function groupDiagnostics(diagnostics: Diagnostic[]) {
  const groups = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const list = groups.get(diagnostic.file) ?? [];
    list.push(diagnostic);
    groups.set(diagnostic.file, list);
  }
  return [...groups.entries()];
}

function locateDiagnosticDialogue(
  dialogues: DialogueDocument[],
  diagnostic: Diagnostic,
  file: string,
) {
  if (diagnostic.entityType === "dialogue" && diagnostic.entityId) {
    return dialogues.find((item) => item.id === diagnostic.entityId);
  }
  if (diagnostic.entityId) {
    const byEntity = dialogues.find(
      (item) =>
        item.nodes.some((node) => node.id === diagnostic.entityId) ||
        item.edges.some((edge) => edge.id === diagnostic.entityId),
    );
    if (byEntity) return byEntity;
  }
  return dialogues.find((item) => file.endsWith(`${item.key}.json`));
}

function localizedNodeText(
  node: DialogueDocument["nodes"][number],
  project: ReturnType<typeof useEditorStore.getState>["project"],
  locale: string,
) {
  if (!node.data.text) return null;
  return localizedValue(node.data.text, locale, project.manifest.defaultLocale);
}

function localizedValue(
  text: Record<string, string>,
  locale: string,
  defaultLocale: string,
) {
  if (text[locale]?.trim()) return { value: text[locale], fallback: false };
  if (text[defaultLocale]?.trim())
    return { value: text[defaultLocale], fallback: true };
  return { value: "缺失文本", fallback: true };
}

function speakerName(
  speakerId: string | undefined,
  project: ReturnType<typeof useEditorStore.getState>["project"],
  locale: string,
) {
  if (!speakerId) return "旁白";
  const character = project.resources.characters.find(
    (item) => item.key === speakerId,
  );
  if (!character) return speakerId;
  return localizedValue(character.name, locale, project.manifest.defaultLocale)
    .value;
}

function statusLabel(status: SimulationSession["status"]) {
  if (status === "waitingContinue") return "等待继续";
  if (status === "waitingChoice") return "等待选择";
  if (status === "completed") return "已结束";
  if (status === "loopGuard") return "循环保护";
  if (status === "error") return "运行错误";
  return "运行中";
}

function traceKindLabel(kind: SimulationSession["trace"][number]["kind"]) {
  if (kind === "hostEvent") return "HOST";
  if (kind === "businessEvent") return "EVENT";
  if (kind === "localeFallback") return "I18N";
  if (kind === "condition") return "COND";
  if (kind === "choice") return "CHOICE";
  if (kind === "variable") return "VAR";
  return kind.toUpperCase();
}

function simulatorFallback(type: DialogueDocument["nodes"][number]["type"]) {
  if (type === "start") return "对话入口";
  if (type === "choice") return "请选择一个分支";
  if (type === "condition") return "正在计算条件";
  if (type === "event") return "业务事件";
  if (type === "end") return "对话结束";
  return "继续";
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}
