import { CheckCircle2, Play, Terminal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DialogueDocument, DialogueNode } from "../model/types";
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
  const dialogueId = useEditorStore((state) => state.selectedDialogueId);
  const locale = useEditorStore((state) => state.previewLocale);
  const dialogue = project.dialogues.find((item) => item.id === dialogueId);
  const diagnostics = useMemo(() => collectDiagnostics(project), [project]);

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
        <button className="workbench-close" onClick={onClose} title="关闭面板">
          <X size={14} />
        </button>
      </header>
      <div className="workbench-content">
        {mode === "problems" && <Problems diagnostics={diagnostics} />}
        {mode === "simulator" && (
          <Simulator dialogue={dialogue} locale={locale} />
        )}
        {mode === "terminal" && <TerminalPanel />}
      </div>
    </section>
  );
}

type Diagnostic = {
  severity: "error" | "warning" | "success";
  message: string;
  path: string;
  dialogueId?: string;
  nodeId?: string;
};

function Problems({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const selectDialogue = useEditorStore((state) => state.setSelectedDialogue);
  const selectNode = useEditorStore((state) => state.setSelectedNode);
  if (!diagnostics.length) {
    return (
      <div className="workbench-empty">
        <CheckCircle2 size={17} />
        <strong>校验通过</strong>
        <span>当前可编辑结构未发现错误或缺失翻译。</span>
      </div>
    );
  }
  return (
    <div className="diagnostic-list">
      {diagnostics.map((diagnostic, index) => (
        <button
          key={`${diagnostic.path}-${index}`}
          onClick={() => {
            if (!diagnostic.dialogueId) return;
            selectDialogue(diagnostic.dialogueId);
            selectNode(diagnostic.nodeId ?? null);
          }}
        >
          <span className={`severity severity--${diagnostic.severity}`}>
            {diagnostic.severity}
          </span>
          <span>{diagnostic.message}</span>
          <code>{diagnostic.path}</code>
        </button>
      ))}
    </div>
  );
}

function Simulator({
  dialogue,
  locale,
}: {
  dialogue?: DialogueDocument;
  locale: string;
}) {
  const [nodeId, setNodeId] = useState(dialogue?.entryNodeId ?? "");
  useEffect(() => {
    setNodeId(dialogue?.entryNodeId ?? "");
  }, [dialogue?.id, dialogue?.entryNodeId]);

  if (!dialogue) return <div className="workbench-empty">请选择对话文件。</div>;
  const node = dialogue.nodes.find((item) => item.id === nodeId);
  if (!node) return <div className="workbench-empty">模拟入口节点不存在。</div>;
  const outgoing = dialogue.edges.filter(
    (edge) => edge.sourceNodeId === node.id,
  );
  const speaker =
    node.data.speakerId ||
    (node.type === "dialogue" ? "旁白" : node.type.toUpperCase());
  const text =
    node.data.text?.[locale] ??
    Object.values(node.data.text ?? {})[0] ??
    simulatorFallback(node);

  return (
    <div className="simulator-panel">
      <div className="simulator-speaker">
        <span>{speaker.slice(0, 1)}</span>
        <strong>{speaker}</strong>
        <code>{node.key}</code>
      </div>
      <p>{text}</p>
      {!!node.data.hostEvents?.length && (
        <div className="host-log">
          {node.data.hostEvents.map((event, index) => (
            <code key={`${event.name}-${index}`}>
              HOST {index + 1}/{node.data.hostEvents!.length} ↑ {event.name}{" "}
              {JSON.stringify(event.payload)}
            </code>
          ))}
        </div>
      )}
      <div className="simulator-actions">
        {outgoing.map((edge, index) => (
          <button
            className="button button--ghost"
            key={edge.id}
            onClick={() => setNodeId(edge.targetNodeId)}
          >
            <Play size={12} />
            {branchLabel(node, edge.sourcePort, index, locale)}
          </button>
        ))}
        {!outgoing.length && (
          <button
            className="button button--ghost"
            onClick={() => setNodeId(dialogue.entryNodeId)}
          >
            重新运行
          </button>
        )}
      </div>
    </div>
  );
}

function TerminalPanel() {
  const project = useEditorStore((state) => state.project);
  const [command, setCommand] = useState("siming validate . --format json");
  const [output, setOutput] = useState(
    "$ siming --version\nsiming 0.1.0\n\n输入命令并点击“运行”。",
  );

  const run = () => {
    const summary = {
      project: project.manifest.name,
      schemaVersion: project.manifest.schemaVersion,
      defaultLocale: project.manifest.defaultLocale,
      locales: project.manifest.locales,
      dialogues: project.dialogues.length,
      nodes: project.dialogues.reduce(
        (total, dialogue) => total + dialogue.nodes.length,
        0,
      ),
    };
    if (command.includes("info")) {
      setOutput(
        `$ ${command}\n${JSON.stringify(summary, null, 2)}\n\nExit code: 0`,
      );
      return;
    }
    if (command.includes("validate")) {
      const diagnostics = collectDiagnostics(project);
      const errors = diagnostics.filter(
        (item) => item.severity === "error",
      ).length;
      setOutput(
        `$ ${command}\n${JSON.stringify(
          {
            valid: errors === 0,
            errors,
            warnings: diagnostics.length - errors,
          },
          null,
          2,
        )}\n\nExit code: ${errors ? 1 : 0}`,
      );
      return;
    }
    setOutput(
      `$ ${command}\n当前阶段仅支持 info 与 validate 的编辑器内预览。\n\nExit code: 2`,
    );
  };

  return (
    <div className="terminal-panel">
      <div>
        <Terminal size={14} />
        <input
          value={command}
          aria-label="命令"
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") run();
          }}
        />
        <button className="button button--primary" onClick={run}>
          运行
        </button>
      </div>
      <pre>{output}</pre>
    </div>
  );
}

function collectDiagnostics(
  project: ReturnType<typeof useEditorStore.getState>["project"],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const dialogue of project.dialogues) {
    const ids = new Set(dialogue.nodes.map((node) => node.id));
    const keys = new Set<string>();
    for (const node of dialogue.nodes) {
      if (keys.has(node.key)) {
        diagnostics.push({
          severity: "error",
          message: "同一对话内存在重复节点 Key",
          path: `${dialogue.name} · ${node.key}`,
          dialogueId: dialogue.id,
          nodeId: node.id,
        });
      }
      keys.add(node.key);
      if (
        node.data.text &&
        project.manifest.locales.some(
          (locale) => !node.data.text?.[locale]?.trim(),
        )
      ) {
        diagnostics.push({
          severity: "warning",
          message: "节点存在缺失翻译，将回退到默认语言",
          path: `${dialogue.name} · ${node.key}`,
          dialogueId: dialogue.id,
          nodeId: node.id,
        });
      }
    }
    if (!ids.has(dialogue.entryNodeId)) {
      diagnostics.push({
        severity: "error",
        message: "对话入口节点不存在",
        path: dialogue.name,
        dialogueId: dialogue.id,
      });
    }
    for (const edge of dialogue.edges) {
      if (!ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId)) {
        diagnostics.push({
          severity: "error",
          message: "连线引用了不存在的节点",
          path: `${dialogue.name} · ${edge.id.slice(0, 8)}`,
          dialogueId: dialogue.id,
        });
      }
    }
  }
  return diagnostics;
}

function simulatorFallback(node: DialogueNode) {
  if (node.type === "start") return "对话入口";
  if (node.type === "end") return "对话结束";
  if (node.type === "choice") return "请选择一个分支";
  if (node.type === "condition") {
    const condition = node.data.condition;
    return condition
      ? `${condition.variable} ${condition.operator} ${String(condition.value)}`
      : "条件未配置";
  }
  if (node.type === "event") return node.data.event || "业务事件未配置";
  return "继续";
}

function branchLabel(
  node: DialogueNode,
  sourcePort: string,
  index: number,
  locale: string,
) {
  if (node.type === "condition") return sourcePort.toUpperCase();
  if (node.type === "choice") {
    const choice = node.data.choices?.find((item) => item.id === sourcePort);
    return (
      choice?.text[locale] ??
      Object.values(choice?.text ?? {})[0] ??
      `选项 ${index + 1}`
    );
  }
  return "继续";
}
