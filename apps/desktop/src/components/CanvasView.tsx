import {
  Background,
  Connection,
  Controls,
  EdgeChange,
  Handle,
  MiniMap,
  type Node as FlowNode,
  type NodeChange,
  NodeProps,
  Position,
  ReactFlow,
  applyEdgeChanges,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitBranch, MessageCircle, Play, Square, Zap } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { centeredNodePosition, nodePositionAtPoint } from "./canvasGeometry";
import { formatCondition } from "../model/conditions";
import { createId } from "../model/demo";
import type { DialogueNode, NodeType } from "../model/types";
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
};

type CanvasFlowNode = FlowNode<CanvasNodeData, "siming">;

const DialogueNodeCard = memo(function DialogueNodeCard({
  data,
  selected,
}: NodeProps) {
  const { node, locale } = data as CanvasNodeData;
  const meta = typeMeta[node.type];
  const Icon = meta.icon;
  const text =
    node.data.text?.[locale] ??
    Object.values(node.data.text ?? {})[0] ??
    meta.label;

  return (
    <article
      className={`flow-node flow-node--${node.type} ${selected ? "is-selected" : ""}`}
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
        <small>{node.key}</small>
      </header>
      <div className="flow-node-content">
        {node.type === "dialogue" && (
          <>
            <strong>{node.data.speakerId || "旁白"}</strong>
            <p>{text}</p>
          </>
        )}
        {node.type === "choice" &&
          node.data.choices?.map((choice, index) => (
            <div className="node-option" key={choice.id}>
              <span>{String.fromCharCode(65 + index)}</span>
              {choice.text[locale] ?? Object.values(choice.text)[0] ?? "空选项"}
              <Handle
                type="source"
                position={Position.Right}
                id={choice.id}
                style={{ top: "50%" }}
              />
            </div>
          ))}
        {node.type === "condition" && (
          <code>{formatCondition(node.data.condition)}</code>
        )}
        {node.type === "event" && (
          <code>{node.data.event || "选择业务事件"}</code>
        )}
        {node.type === "start" && <p>对话入口</p>}
        {node.type === "end" && <p>结束当前对话</p>}
      </div>
      {node.data.hostEvents && node.data.hostEvents.length > 0 && (
        <footer>HOST ×{node.data.hostEvents.length}</footer>
      )}
      {node.type === "condition" && (
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

const nodeTypes = { siming: DialogueNodeCard };

export function CanvasView() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowInstanceRef = useRef<{
    screenToFlowPosition: (position: { x: number; y: number }) => {
      x: number;
      y: number;
    };
  } | null>(null);
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const [nodeDragOver, setNodeDragOver] = useState(false);
  const project = useEditorStore((state) => state.project);
  const dialogueId = useEditorStore((state) => state.selectedDialogueId);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const locale = useEditorStore((state) => state.previewLocale);
  const setSelectedNode = useEditorStore((state) => state.setSelectedNode);
  const setCanvasInsertionPosition = useEditorStore(
    (state) => state.setCanvasInsertionPosition,
  );
  const addNode = useEditorStore((state) => state.addNode);
  const deleteNodes = useEditorStore((state) => state.deleteNodes);
  const commit = useEditorStore((state) => state.commit);
  const dialogue = project.dialogues.find((item) => item.id === dialogueId);

  const derivedNodes = useMemo<CanvasFlowNode[]>(
    () =>
      (dialogue?.nodes ?? []).map((node) => ({
        id: node.id,
        type: "siming",
        position: node.position,
        selected: node.id === selectedNodeId,
        data: { node, locale },
      })),
    [dialogue, locale, selectedNodeId],
  );
  const [nodes, setNodes, onNodesChange] =
    useNodesState<CanvasFlowNode>(derivedNodes);

  useEffect(() => {
    setNodes(derivedNodes);
  }, [derivedNodes, setNodes]);

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

  const edges = useMemo(
    () =>
      (dialogue?.edges ?? []).map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        sourceHandle: edge.sourcePort,
        target: edge.targetNodeId,
        targetHandle: edge.targetPort,
        animated: false,
        className: "siming-edge",
      })),
    [dialogue],
  );

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
    const next = applyEdgeChanges(changes, edges);
    const nextIds = new Set(next.map((edge) => edge.id));
    if (nextIds.size === edges.length) return;
    commit("删除连线", (draft) => {
      const target = draft.dialogues.find((item) => item.id === dialogueId);
      if (target) {
        target.edges = target.edges.filter((edge) => nextIds.has(edge.id));
      }
    });
  };

  const nodesChange = (changes: NodeChange<CanvasFlowNode>[]) => {
    const removedIds = changes
      .filter((change) => change.type === "remove")
      .map((change) => change.id);
    const localChanges = changes.filter(
      (change) =>
        change.type !== "remove" || change.id !== dialogue.entryNodeId,
    );

    onNodesChange(localChanges);
    if (removedIds.length > 0) deleteNodes(removedIds);
  };

  return (
    <div
      className={`canvas-view ${nodeDragOver ? "is-node-drop-target" : ""}`}
      ref={canvasRef}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          flowInstanceRef.current = instance;
        }}
        onNodesChange={nodesChange}
        onConnect={connect}
        onEdgesChange={edgesChange}
        onNodeClick={(_event, node) => setSelectedNode(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        onMoveEnd={(_event, viewport) => {
          viewportRef.current = viewport;
          const bounds = canvasRef.current?.getBoundingClientRect();
          if (!bounds) return;
          setCanvasInsertionPosition(
            centeredNodePosition(viewport, {
              width: bounds.width,
              height: bounds.height,
            }),
          );
        }}
        onNodeDragStop={(_event, moved) => {
          const previous = dialogue.nodes.find((node) => node.id === moved.id);
          if (
            previous &&
            previous.position.x === moved.position.x &&
            previous.position.y === moved.position.y
          )
            return;
          commit("移动节点", (draft) => {
            const node = draft.dialogues
              .find((item) => item.id === dialogueId)
              ?.nodes.find((item) => item.id === moved.id);
            if (node) node.position = moved.position;
          });
        }}
        fitView
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background gap={22} size={1} />
        <Controls position="top-left" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(node) => {
            const data = node.data as CanvasNodeData;
            return typeMeta[data.node.type].color;
          }}
        />
      </ReactFlow>
    </div>
  );
}
