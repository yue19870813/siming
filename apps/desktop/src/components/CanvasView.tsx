import { resolveBody } from "../model/richText";
import { RichTextView } from "./RichTextView";
import { plainText } from "../model/richText";
import {
  Background,
  type Edge,
  type ReactFlowInstance,
  Connection,
  ConnectionLineType,
  Controls,
  EdgeChange,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Panel,
  SelectionMode,
  type Node as FlowNode,
  type NodeChange,
  NodeProps,
  Position,
  ReactFlow,
  ViewportPortal,
  useUpdateNodeInternals,
  useNodesState,
  useNodesInitialized,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Frame,
  GitBranch,
  MessageCircle,
  Play,
  Square,
  Zap,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CurvedEdge, EdgeRoutingCoordinator, RoutedEdge } from "./RoutedEdge";
import { CharacterAvatar } from "./CharacterAvatar";
import { centeredNodePosition, nodePositionAtPoint } from "./canvasGeometry";
import { alignNodeCenters } from "./canvasAlignment";
import { getCanvasViewport, saveCanvasViewport } from "./canvasViewport";
import { reconcileCanvasNodes } from "./canvasNodeSync";
import {
  getCanvasFrames,
  saveCanvasFrames,
  type CanvasFrame,
} from "./canvasFrames";
import { formatCondition } from "../model/conditions";
import { createId } from "../model/demo";
import type {
  CharacterDefinition,
  DialogueNode,
  NodeType,
  SystemSettings,
} from "../model/types";
import {
  nodeDragCancelEvent,
  type NodeDragDetail,
  nodeDragMoveEvent,
  nodeDropEvent,
} from "../lib/nodeDrag";
import { useEditorStore } from "../store/editorStore";

const typeMeta: Record<
  NodeType,
  { label: string; color: string; icon: typeof Play }
> = {
  start: { label: "开始", color: "#8b7cf6", icon: Play },
  dialogue: { label: "对话", color: "#7c6cf2", icon: MessageCircle },
  choice: { label: "选项", color: "#4ec6b8", icon: GitBranch },
  condition: { label: "条件", color: "#e49a57", icon: GitBranch },
  event: { label: "事件", color: "#d27da8", icon: Zap },
  end: { label: "结束", color: "#7f8698", icon: Square },
};

type CanvasNodeData = {
  node: DialogueNode;
  locale: string;
  projectRoot: string;
  defaultLocale: string;
  character?: CharacterDefinition;
  edgeHighlight?: "related" | "dimmed";
};

type CanvasFrameData = {
  frame: CanvasFrame;
  onUpdate: (id: string, update: Partial<CanvasFrame>) => void;
};

type CanvasFlowNode =
  | FlowNode<CanvasNodeData, "siming">
  | FlowNode<CanvasFrameData, "backgroundFrame">;

const framePalette = ["#f05a67", "#e5a63b", "#42b8a2", "#4b8fe8", "#a176e8"];

const DialogueNodeCard = memo(function DialogueNodeCard({
  data,
  selected,
}: NodeProps) {
  const { node, locale, projectRoot, character, defaultLocale, edgeHighlight } =
    data as CanvasNodeData;
  const meta = typeMeta[node.type];
  const updateNodeInternals = useUpdateNodeInternals();
  const switchPorts = JSON.stringify(
    node.data.switch?.cases.map((item) => item.id),
  );
  const previousSwitchPorts = useRef(switchPorts);
  useEffect(() => {
    // React Flow measures new nodes itself. Only refresh handles when ports
    // change; refreshing every newly mounted node repeats whole-store work.
    if (previousSwitchPorts.current !== switchPorts) {
      previousSwitchPorts.current = switchPorts;
      updateNodeInternals(node.id);
    }
  }, [node.id, switchPorts, updateNodeInternals]);
  const Icon = meta.icon;
  const text = resolveBody(node.data.text, locale, defaultLocale) ?? meta.label;
  const speakerName = character
    ? (character.name[locale] ??
      Object.values(character.name)[0] ??
      character.key)
    : node.data.speakerId || "旁白";

  return (
    <article
      className={`flow-node flow-node--${node.type} ${selected ? "is-selected" : ""} ${edgeHighlight ? `is-edge-${edgeHighlight}` : ""}`}
      style={{ "--node-color": meta.color } as React.CSSProperties}
    >
      {node.type !== "start" && (
        <Handle type="target" position={Position.Left} id="in" />
      )}
      <header>
        <span className="node-type-icon">
          <Icon size={13} />
        </span>
        <span>{meta.label}</span>
        <small title={node.key}>{node.alias?.trim() || node.key}</small>
      </header>
      <div className="flow-node-content">
        {node.type === "dialogue" && (
          <div className="dialogue-node-content">
            <CharacterAvatar
              className="dialogue-node-avatar"
              rootPath={projectRoot}
              avatar={character?.avatar}
              name={speakerName}
              color={character?.color ?? meta.color}
            />
            <div>
              <strong>{speakerName}</strong>
              <p>
                <RichTextView
                  value={plainText(text) ? text : "输入对话内容…"}
                />
              </p>
            </div>
          </div>
        )}
        {node.type === "choice" &&
          node.data.choices?.map((choice, index) => (
            <div
              className="node-option"
              key={choice.id}
              title={
                choice.visibleWhen
                  ? formatCondition(choice.visibleWhen)
                  : undefined
              }
            >
              <span>{String.fromCharCode(65 + index)}</span>
              {choice.text[locale] ?? Object.values(choice.text)[0] ?? "空选项"}
              {choice.visibleWhen && (
                <small className="choice-condition-badge" aria-label="条件显示">
                  ◆
                </small>
              )}
              <Handle
                type="source"
                position={Position.Right}
                id={choice.id}
                style={{ top: "50%" }}
              />
            </div>
          ))}
        {node.type === "condition" && !node.data.switch && (
          <code>{formatCondition(node.data.condition)}</code>
        )}
        {node.type === "condition" && node.data.switch && (
          <div className="switch-node-cases">
            <code>switch {node.data.switch.variable || "选择变量"}</code>
            {[
              ...node.data.switch.cases.map((item) => ({
                id: item.id,
                label: `case ${JSON.stringify(item.value)}`,
              })),
              { id: "default", label: "默认" },
            ].map((item) => (
              <div className="switch-node-case" key={item.id}>
                <span title={item.label}>{item.label}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={item.id}
                  style={{ top: "50%" }}
                />
              </div>
            ))}
          </div>
        )}
        {node.type === "event" && (
          <code>{node.data.event || "选择业务事件"}</code>
        )}
        {node.type === "start" && <p>对话入口</p>}
        {node.type === "end" && <p>结束当前对话</p>}
      </div>
      {node.data.hostEvents && node.data.hostEvents.length > 0 && (
        <footer
          className="host-event-summary"
          title={node.data.hostEvents
            .map((event) => event.name.trim() || "未命名消息")
            .join("\n")}
        >
          <b>HOST</b>
          {node.data.hostEvents.slice(0, 2).map((event, index) => (
            <span key={index}>{event.name.trim() || "未命名消息"}</span>
          ))}
          {node.data.hostEvents.length > 2 && (
            <b>+{node.data.hostEvents.length - 2}</b>
          )}
        </footer>
      )}
      {node.type === "condition" && !node.data.switch && (
        <>
          <span className="branch-label branch-label--true">TRUE</span>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: "42%" }}
          />
          <span className="branch-label branch-label--false">FALSE</span>
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: "76%" }}
          />
        </>
      )}
      {!["choice", "condition", "end"].includes(node.type) && (
        <Handle type="source" position={Position.Right} id="next" />
      )}
    </article>
  );
});

const BackgroundFrameNode = memo(function BackgroundFrameNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { frame, onUpdate } = data as CanvasFrameData;
  return (
    <section
      className={`canvas-frame-node ${selected ? "is-selected" : ""}`}
      style={
        {
          "--frame-color": frame.color,
          "--frame-tint": `${frame.color}14`,
        } as React.CSSProperties
      }
    >
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={140}
        lineClassName="canvas-frame-resize-line"
        handleClassName="canvas-frame-resize-handle"
        onResizeEnd={(_event, params) =>
          onUpdate(id, { width: params.width, height: params.height })
        }
      />
      <div className="canvas-frame-content">
        <header className="canvas-frame-header">
          <Frame size={16} aria-hidden="true" />
          <input
            className="nodrag nopan"
            aria-label="背景框标题"
            value={frame.title}
            placeholder="分类标题"
            onChange={(event) => onUpdate(id, { title: event.target.value })}
          />
          <div
            className="canvas-frame-colors nodrag nopan"
            aria-label="背景框颜色"
          >
            {framePalette.map((color) => (
              <button
                key={color}
                type="button"
                className={frame.color === color ? "is-active" : ""}
                aria-label={`背景框颜色 ${color}`}
                title={color}
                style={{ backgroundColor: color }}
                onClick={() => onUpdate(id, { color })}
              />
            ))}
            <input
              type="color"
              aria-label="自定义背景框颜色"
              value={frame.color}
              onChange={(event) => onUpdate(id, { color: event.target.value })}
            />
          </div>
        </header>
        <textarea
          className="nodrag nopan"
          aria-label="背景框注释"
          placeholder="添加注释…"
          value={frame.note}
          onChange={(event) => onUpdate(id, { note: event.target.value })}
        />
      </div>
    </section>
  );
});

const nodeTypes = { siming: DialogueNodeCard };
const canvasNodeTypes = { ...nodeTypes, backgroundFrame: BackgroundFrameNode };
const edgeTypes = { routed: RoutedEdge, bezier: CurvedEdge };

function CanvasReady({ onReady }: { onReady: () => void }) {
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (initialized) onReady();
  }, [initialized, onReady]);
  return null;
}

function CanvasLoading({
  count,
  mounted = 0,
}: {
  count: number;
  mounted?: number;
}) {
  return (
    <div className="canvas-loading-overlay" role="status">
      <div className="canvas-loading-card">
        <span className="canvas-loading-spinner" aria-hidden="true" />
        <strong>正在打开对话</strong>
        <span>正在初始化 {count} 个节点…</span>
        <small>
          已加载 {mounted} / {count}
        </small>
      </div>
    </div>
  );
}

export function CanvasView({
  edgeStyle = "routed",
}: {
  edgeStyle?: SystemSettings["canvasEdgeStyle"];
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<CanvasFlowNode> | null>(
    null,
  );
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const [readyViewportKey, setReadyViewportKey] = useState<string | null>(null);
  const [nodeDragOver, setNodeDragOver] = useState(false);
  const [draggingNodeIds, setDraggingNodeIds] = useState<string[]>([]);
  const [preparedDialogueId, setPreparedDialogueId] = useState<string | null>(
    null,
  );
  const [alignmentGuides, setAlignmentGuides] = useState<{
    x?: number;
    y?: number;
  }>({});
  const alignedPositions = useRef(new Map<string, { x: number; y: number }>());
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [frameState, setFrameState] = useState<{
    key: string;
    frames: CanvasFrame[];
  }>({ key: "", frames: [] });
  const selectedNodeIds = useRef(new Set<string>());
  const selectionDialogueId = useRef<string | null>(null);
  const project = useEditorStore((state) => state.project);
  const dialogueId = useEditorStore((state) => state.selectedDialogueId);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const selectedNodeIdsFromStore = useEditorStore(
    (state) => state.selectedNodeIds,
  );
  const locale = useEditorStore((state) => state.previewLocale);
  const setSelectedNode = useEditorStore((state) => state.setSelectedNode);
  const setSelectedNodes = useEditorStore((state) => state.setSelectedNodes);
  const setCanvasInsertionPosition = useEditorStore(
    (state) => state.setCanvasInsertionPosition,
  );
  const addNode = useEditorStore((state) => state.addNode);
  const deleteNodes = useEditorStore((state) => state.deleteNodes);
  const deleteProjectEdges = useEditorStore((state) => state.deleteEdges);
  const commit = useEditorStore((state) => state.commit);
  const dialogue = project.dialogues.find((item) => item.id === dialogueId);
  const viewportKey = `${project.rootPath}:${dialogueId}`;
  const canvasFrames =
    frameState.key === viewportKey
      ? frameState.frames
      : getCanvasFrames(viewportKey);
  const updateFrame = useCallback(
    (id: string, update: Partial<CanvasFrame>) => {
      setFrameState((current) => ({
        key: viewportKey,
        frames: (current.key === viewportKey
          ? current.frames
          : getCanvasFrames(viewportKey)
        ).map((frame) => (frame.id === id ? { ...frame, ...update } : frame)),
      }));
    },
    [viewportKey],
  );
  const removeFrame = useCallback(
    (id: string) => {
      setFrameState((current) => ({
        key: viewportKey,
        frames: (current.key === viewportKey
          ? current.frames
          : getCanvasFrames(viewportKey)
        ).filter((frame) => frame.id !== id),
      }));
    },
    [viewportKey],
  );
  const savedViewport = getCanvasViewport(viewportKey);
  const [mountProgress, setMountProgress] = useState({ key: "", count: 0 });
  const largeCanvas = Boolean(dialogue && dialogue.nodes.length >= 80);
  const mountedCount = largeCanvas
    ? mountProgress.key === viewportKey
      ? mountProgress.count
      : 0
    : (dialogue?.nodes.length ?? 0);
  const allNodesMounted = mountedCount >= (dialogue?.nodes.length ?? 0);
  const preparingLargeCanvas =
    Boolean(dialogue && dialogue.nodes.length >= 80) &&
    preparedDialogueId !== dialogueId;

  useEffect(() => {
    if (!preparingLargeCanvas) return;
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() =>
        setPreparedDialogueId(dialogueId),
      );
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
    };
  }, [dialogueId, preparingLargeCanvas]);

  useEffect(() => {
    if (!largeCanvas || preparingLargeCanvas || allNodesMounted) return;
    // Yield to the browser between batches so the loading state can paint and
    // animate instead of spending the entire opening operation in one task.
    const timer = window.setTimeout(() => {
      setMountProgress({
        key: viewportKey,
        count: Math.min(mountedCount + 16, dialogue?.nodes.length ?? 0),
      });
    }, 32);
    return () => window.clearTimeout(timer);
  }, [
    largeCanvas,
    preparingLargeCanvas,
    allNodesMounted,
    viewportKey,
    mountedCount,
    dialogue?.nodes.length,
  ]);

  const derivedNodes = useMemo<CanvasFlowNode[]>(() => {
    const canvasSelection = new Set(
      selectionDialogueId.current === dialogueId
        ? selectedNodeIdsFromStore
        : selectedNodeId
          ? [selectedNodeId]
          : [],
    );
    const selectedEdges = (dialogue?.edges ?? []).filter((edge) =>
      selectedEdgeIds.has(edge.id),
    );
    const edgeNodeIds = new Set(
      selectedEdges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId]),
    );
    const dialogueNodes = (dialogue?.nodes ?? []).map(
      (node) =>
        ({
          id: node.id,
          type: "siming",
          position: node.position,
          selected: canvasSelection.has(node.id),
          deletable: node.id !== dialogue?.entryNodeId,
          data: {
            node,
            locale,
            projectRoot: project.rootPath,
            defaultLocale: project.manifest.defaultLocale,
            character: project.resources.characters.find(
              (item) => item.key === node.data.speakerId,
            ),
            edgeHighlight:
              selectedEdges.length === 0
                ? undefined
                : edgeNodeIds.has(node.id)
                  ? "related"
                  : "dimmed",
          },
        }) satisfies CanvasFlowNode,
    );
    const frameNodes: CanvasFlowNode[] = canvasFrames.map((frame) => ({
      id: frame.id,
      type: "backgroundFrame",
      position: { x: frame.x, y: frame.y },
      selected: selectedFrameIds.has(frame.id),
      width: frame.width,
      height: frame.height,
      zIndex: -1,
      draggable: true,
      selectable: true,
      data: { frame, onUpdate: updateFrame },
    }));
    return [...frameNodes, ...dialogueNodes];
  }, [
    dialogue,
    locale,
    project.resources.characters,
    project.rootPath,
    project.manifest.defaultLocale,
    dialogueId,
    selectedNodeId,
    selectedNodeIdsFromStore,
    selectedEdgeIds,
    selectedFrameIds,
    canvasFrames,
    updateFrame,
  ]);
  const [nodes, setNodes, onNodesChange] =
    useNodesState<CanvasFlowNode>(derivedNodes);
  const [nodeRepairVersion, setNodeRepairVersion] = useState(0);
  const activeDraggedNodeIds = useRef(new Set<string>());

  useEffect(() => {
    setFrameState({ key: viewportKey, frames: getCanvasFrames(viewportKey) });
  }, [viewportKey]);

  useEffect(() => {
    if (frameState.key === viewportKey) {
      saveCanvasFrames(viewportKey, frameState.frames);
    }
  }, [frameState, viewportKey]);

  useEffect(() => {
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]));
      return derivedNodes.map((node) => {
        const currentNode = currentById.get(node.id);
        return currentNode && activeDraggedNodeIds.current.has(node.id)
          ? { ...node, position: currentNode.position }
          : node;
      });
    });
  }, [derivedNodes, setNodes]);

  useEffect(() => {
    setNodes((current) => reconcileCanvasNodes(current, derivedNodes));
  }, [derivedNodes, nodeRepairVersion, setNodes]);

  useEffect(() => {
    selectedNodeIds.current.clear();
    selectionDialogueId.current = dialogueId;
  }, [dialogueId]);

  useEffect(() => {
    if (selectionDialogueId.current !== dialogueId) return;
    selectedNodeIds.current = new Set(selectedNodeIdsFromStore);
  }, [dialogueId, selectedNodeIdsFromStore]);

  useEffect(() => {
    if (selectionDialogueId.current !== dialogueId) return;
    if (!selectedNodeId && selectedNodeIds.current.size > 0) {
      selectedNodeIds.current.clear();
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: false })),
      );
      return;
    }
    if (selectedNodeId && !selectedNodeIds.current.has(selectedNodeId)) {
      selectedNodeIds.current = new Set([selectedNodeId]);
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          selected: node.id === selectedNodeId,
        })),
      );
    }
  }, [dialogueId, selectedNodeId, setNodes]);

  useEffect(() => {
    const insideCanvas = (detail: NodeDragDetail) => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      return Boolean(
        bounds &&
        detail.clientX >= bounds.left &&
        detail.clientX <= bounds.right &&
        detail.clientY >= bounds.top &&
        detail.clientY <= bounds.bottom,
      );
    };
    const move = (event: Event) => {
      const detail = (event as CustomEvent<NodeDragDetail>).detail;
      setNodeDragOver(insideCanvas(detail));
    };
    const drop = (event: Event) => {
      const detail = (event as CustomEvent<NodeDragDetail>).detail;
      setNodeDragOver(false);
      if (!insideCanvas(detail)) return;

      const instance = flowInstanceRef.current;
      const bounds = canvasRef.current?.getBoundingClientRect();
      const viewport = viewportRef.current;
      const point = instance
        ? instance.screenToFlowPosition({
            x: detail.clientX,
            y: detail.clientY,
          })
        : bounds
          ? {
              x: (detail.clientX - bounds.left - viewport.x) / viewport.zoom,
              y: (detail.clientY - bounds.top - viewport.y) / viewport.zoom,
            }
          : null;
      if (point) addNode(detail.type, nodePositionAtPoint(point));
    };
    const cancel = () => setNodeDragOver(false);

    window.addEventListener(nodeDragMoveEvent, move);
    window.addEventListener(nodeDropEvent, drop);
    window.addEventListener(nodeDragCancelEvent, cancel);
    return () => {
      window.removeEventListener(nodeDragMoveEvent, move);
      window.removeEventListener(nodeDropEvent, drop);
      window.removeEventListener(nodeDragCancelEvent, cancel);
    };
  }, [addNode]);

  const edges = useMemo<Edge[]>(
    () =>
      (dialogue?.edges ?? []).map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        sourceHandle: edge.sourcePort,
        target: edge.targetNodeId,
        targetHandle: edge.targetPort,
        type: edgeStyle === "bezier" ? "bezier" : "routed",
        data: { dialogueId, draggingNodeIds },
        interactionWidth: 24,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
        },
        selected: selectedEdgeIds.has(edge.id),
        animated: false,
        className: "siming-edge",
      })),
    [dialogue, dialogueId, selectedEdgeIds, edgeStyle, draggingNodeIds],
  );

  useEffect(() => {
    setSelectedEdgeIds(new Set());
  }, [dialogueId]);

  if (!dialogue) return <div className="empty-state">请选择对话文件</div>;

  const connect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    commit("连接节点", (draft) => {
      const target = draft.dialogues.find((item) => item.id === dialogueId);
      if (!target) return;
      const port = connection.sourceHandle ?? "next";
      target.edges = target.edges.filter(
        (edge) =>
          !(
            edge.sourceNodeId === connection.source && edge.sourcePort === port
          ),
      );
      target.edges.push({
        id: createId(),
        sourceNodeId: connection.source!,
        sourcePort: port,
        targetNodeId: connection.target!,
        targetPort: connection.targetHandle ?? "in",
      });
    });
  };

  const edgesChange = (changes: EdgeChange[]) => {
    const removedIds = changes
      .filter((change) => change.type === "remove")
      .map((change) => change.id);
    if (removedIds.length > 0) {
      deleteProjectEdges(removedIds);
      setSelectedEdgeIds(
        (current) =>
          new Set([...current].filter((id) => !removedIds.includes(id))),
      );
    }

    const selectionChanges = changes.filter(
      (change) => change.type === "select",
    );
    if (selectionChanges.length === 0) return;
    setSelectedEdgeIds((current) => {
      const next = new Set(current);
      selectionChanges.forEach((change) => {
        if (change.type !== "select") return;
        if (change.selected) next.add(change.id);
        else next.delete(change.id);
      });
      return next;
    });
  };

  const nodesChange = (changes: NodeChange<CanvasFlowNode>[]) => {
    if (
      changes.some(
        (change) =>
          change.type === "replace" ||
          (change.type === "remove" && change.id === dialogue.entryNodeId),
      )
    ) {
      setNodeRepairVersion((version) => version + 1);
    }
    const removedIds = changes
      .filter((change) => change.type === "remove")
      .map((change) => change.id);
    const dialogueNodeIds = new Set(dialogue.nodes.map((node) => node.id));
    removedIds
      .filter((id) => canvasFrames.some((frame) => frame.id === id))
      .forEach(removeFrame);
    let localChanges = changes.filter((change) => {
      if (change.type === "position" && change.position) {
        if (
          !Number.isFinite(change.position.x) ||
          !Number.isFinite(change.position.y)
        )
          return false;
      }
      return (
        change.type !== "remove" ||
        (change.id !== dialogue.entryNodeId && dialogueNodeIds.has(change.id))
      );
    });

    const positions = new Map<string, { x: number; y: number }>();
    for (const change of localChanges) {
      if (
        change.type === "position" &&
        change.dragging &&
        change.position &&
        dialogueNodeIds.has(change.id)
      ) {
        positions.set(change.id, change.position);
      }
    }
    if (positions.size) {
      const aligned = alignNodeCenters(
        nodes,
        positions,
        viewportRef.current.zoom,
      );
      alignedPositions.current = aligned.positions;
      setAlignmentGuides(aligned.guides);
      localChanges = localChanges.map((change) =>
        change.type === "position" && aligned.positions.has(change.id)
          ? { ...change, position: aligned.positions.get(change.id)! }
          : change,
      );
    } else {
      localChanges = localChanges.map((change) =>
        change.type === "position" &&
        change.dragging === false &&
        alignedPositions.current.has(change.id)
          ? { ...change, position: alignedPositions.current.get(change.id)! }
          : change,
      );
    }

    for (const change of localChanges) {
      if (change.type === "select") {
        if (dialogueNodeIds.has(change.id)) {
          if (change.selected) selectedNodeIds.current.add(change.id);
          else selectedNodeIds.current.delete(change.id);
        } else if (canvasFrames.some((frame) => frame.id === change.id)) {
          setSelectedFrameIds((current) => {
            const next = new Set(current);
            if (change.selected) next.add(change.id);
            else next.delete(change.id);
            return next;
          });
        }
      }
      if (change.type === "remove") {
        selectedNodeIds.current.delete(change.id);
        setSelectedFrameIds((current) => {
          if (!current.has(change.id)) return current;
          const next = new Set(current);
          next.delete(change.id);
          return next;
        });
      }
    }

    if (
      localChanges.some(
        (change) =>
          (change.type === "select" || change.type === "remove") &&
          dialogueNodeIds.has(change.id),
      )
    ) {
      setSelectedNodes([...selectedNodeIds.current]);
    }

    onNodesChange(localChanges);
    const removedDialogueIds = removedIds.filter((id) =>
      dialogueNodeIds.has(id),
    );
    if (removedDialogueIds.length > 0) deleteNodes(removedDialogueIds);
  };

  const addFrame = () => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const viewport = viewportRef.current;
    const center = bounds
      ? (flowInstanceRef.current?.screenToFlowPosition({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        }) ?? {
          x: (bounds.width / 2 - viewport.x) / viewport.zoom,
          y: (bounds.height / 2 - viewport.y) / viewport.zoom,
        })
      : { x: 0, y: 0 };
    const frame: CanvasFrame = {
      id: `editor-frame:${crypto.randomUUID()}`,
      x: center.x - 260,
      y: center.y - 180,
      width: 520,
      height: 360,
      title: "新的分类",
      note: "",
      color: framePalette[0],
    };
    setFrameState((current) => ({
      key: viewportKey,
      frames: [
        ...(current.key === viewportKey
          ? current.frames
          : getCanvasFrames(viewportKey)),
        frame,
      ],
    }));
  };

  if (preparingLargeCanvas) {
    return (
      <div className="canvas-view canvas-view--loading" aria-busy="true">
        <CanvasLoading count={dialogue?.nodes.length ?? 0} />
      </div>
    );
  }

  return (
    <div
      className={`canvas-view ${nodeDragOver ? "is-node-drop-target" : ""}`}
      ref={canvasRef}
      aria-busy={
        dialogue.nodes.length >= 80 && readyViewportKey !== viewportKey
      }
    >
      <ReactFlow
        key={viewportKey}
        nodes={largeCanvas ? nodes.slice(0, mountedCount) : nodes}
        edges={allNodesMounted ? edges : []}
        defaultViewport={savedViewport}
        fitView={!largeCanvas && !savedViewport}
        nodesDraggable={allNodesMounted}
        nodesConnectable={allNodesMounted}
        nodeTypes={canvasNodeTypes}
        edgeTypes={edgeTypes}
        onInit={(instance) => {
          flowInstanceRef.current = instance;
          viewportRef.current = instance.getViewport();
        }}
        onNodesChange={nodesChange}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        multiSelectionKeyCode={["Meta", "Control"]}
        onConnect={connect}
        onEdgesChange={edgesChange}
        onEdgeClick={() => {
          selectedNodeIds.current.clear();
          setSelectedNode(null);
        }}
        onNodeClick={(_event, node) => {
          setSelectedEdgeIds(new Set());
          if (node.type === "backgroundFrame") {
            selectedNodeIds.current.clear();
            setSelectedNodes([]);
            setSelectedFrameIds(new Set([node.id]));
            return;
          }
          setSelectedFrameIds(new Set());
          setSelectedNodes(
            [...selectedNodeIds.current],
            selectedNodeIds.current.has(node.id)
              ? node.id
              : (selectedNodeIds.current.values().next().value ?? null),
          );
        }}
        onPaneClick={() => {
          setSelectedEdgeIds(new Set());
          setSelectedFrameIds(new Set());
          selectedNodeIds.current.clear();
          setSelectedNode(null);
        }}
        onSelectionEnd={() => {
          setSelectedNodes(
            [...selectedNodeIds.current],
            selectedNodeIds.current.values().next().value ?? null,
          );
        }}
        onMoveEnd={(_event, viewport) => {
          viewportRef.current = viewport;
          saveCanvasViewport(viewportKey, viewport);
          const bounds = canvasRef.current?.getBoundingClientRect();
          if (!bounds) return;
          setCanvasInsertionPosition(
            centeredNodePosition(viewport, {
              width: bounds.width,
              height: bounds.height,
            }),
          );
        }}
        onMove={(_event, viewport) => {
          viewportRef.current = viewport;
          saveCanvasViewport(viewportKey, viewport);
        }}
        onNodeDragStart={(_event, node) => {
          alignedPositions.current.clear();
          const dragged = new Set(selectedNodeIds.current);
          dragged.add(node.id);
          activeDraggedNodeIds.current = dragged;
          setDraggingNodeIds([...dragged]);
        }}
        onNodeDragStop={(_event, _moved, draggedNodes) => {
          setDraggingNodeIds([]);
          setAlignmentGuides({});
          const positions = new Map(
            draggedNodes.flatMap((node) => {
              const position =
                alignedPositions.current.get(node.id) ?? node.position;
              return Number.isFinite(position.x) && Number.isFinite(position.y)
                ? [[node.id, position] as const]
                : [];
            }),
          );
          setNodes((current) => {
            const repaired = reconcileCanvasNodes(current, derivedNodes);
            return repaired.map((node) => {
              const position = positions.get(node.id);
              return position ? { ...node, position } : node;
            });
          });
          for (const [id, position] of positions) {
            if (canvasFrames.some((frame) => frame.id === id)) {
              updateFrame(id, { x: position.x, y: position.y });
            }
          }
          const changed = dialogue.nodes.some((node) => {
            const position = positions.get(node.id);
            return (
              position &&
              (node.position.x !== position.x || node.position.y !== position.y)
            );
          });
          activeDraggedNodeIds.current.clear();
          if (!changed) return;
          commit(
            draggedNodes.length > 1 ? "移动多个节点" : "移动节点",
            (draft) => {
              const target = draft.dialogues.find(
                (item) => item.id === dialogueId,
              );
              for (const node of target?.nodes ?? []) {
                const position = positions.get(node.id);
                if (position) node.position = position;
              }
            },
          );
        }}
        minZoom={0.2}
        maxZoom={2}
        connectionLineType={
          edgeStyle === "bezier"
            ? ConnectionLineType.Bezier
            : ConnectionLineType.SmoothStep
        }
        elevateEdgesOnSelect={false}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        {allNodesMounted && edgeStyle === "routed" && (
          <EdgeRoutingCoordinator />
        )}
        {allNodesMounted && (
          <CanvasReady
            onReady={() => {
              if (readyViewportKey === viewportKey) return;
              if (largeCanvas && !savedViewport) {
                // Fit only after the final batch has been measured.
                void flowInstanceRef.current?.fitView();
              }
              setReadyViewportKey(viewportKey);
            }}
          />
        )}
        <ViewportPortal>
          <svg className="canvas-alignment-guides" aria-hidden="true">
            {alignmentGuides.x !== undefined && (
              <line
                x1={alignmentGuides.x}
                x2={alignmentGuides.x}
                y1={-100000}
                y2={100000}
              />
            )}
            {alignmentGuides.y !== undefined && (
              <line
                y1={alignmentGuides.y}
                y2={alignmentGuides.y}
                x1={-100000}
                x2={100000}
              />
            )}
          </svg>
        </ViewportPortal>
        <Background gap={22} size={1} />
        <Panel position="top-right" className="canvas-frame-toolbar">
          <button
            type="button"
            className="button"
            title="添加背景框"
            aria-label="添加背景框"
            onClick={addFrame}
          >
            <Frame size={14} />
          </button>
          {nodes.some(
            (node) => node.type === "backgroundFrame" && node.selected,
          ) && (
            <button
              type="button"
              className="button"
              title="删除选中的背景框"
              aria-label="删除选中的背景框"
              onClick={() =>
                nodes
                  .filter(
                    (node) => node.type === "backgroundFrame" && node.selected,
                  )
                  .forEach((node) => removeFrame(node.id))
              }
            >
              删除框
            </button>
          )}
        </Panel>
        <Controls position="top-left" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(node) => {
            if (node.type === "backgroundFrame") {
              return (node.data as CanvasFrameData).frame.color;
            }
            const data = node.data as CanvasNodeData;
            return typeMeta[data.node.type].color;
          }}
        />
      </ReactFlow>
      {dialogue.nodes.length >= 80 && readyViewportKey !== viewportKey && (
        <CanvasLoading count={dialogue.nodes.length} mounted={mountedCount} />
      )}
    </div>
  );
}
