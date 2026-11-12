import { act, render } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Node, ReactFlowProps } from "@xyflow/react";
import { beforeEach, expect, test, vi } from "vitest";
import { createDemoProject, createNode } from "../model/demo";
import { useEditorStore } from "../store/editorStore";
import { getCanvasFrames, saveCanvasFrames } from "./canvasFrames";
import { CanvasView } from "./CanvasView";

let flowProps: ReactFlowProps;

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    ReactFlow: (props: ReactFlowProps) => {
      flowProps = props;
      return null;
    },
  };
});

beforeEach(() => {
  localStorage.clear();
  useEditorStore.getState().setProject(createDemoProject());
});

test("mounts a 123-node file in batches and keeps edges deferred until completion", () => {
  vi.useFakeTimers();
  const project = createDemoProject();
  const dialogue = project.dialogues[0];
  dialogue.nodes = Array.from({ length: 123 }, (_, index) =>
    createNode("dialogue", { x: index * 250, y: 0 }),
  );
  dialogue.entryNodeId = dialogue.nodes[0].id;
  dialogue.edges = [
    {
      id: "test-edge",
      sourceNodeId: dialogue.nodes[0].id,
      sourcePort: "next",
      targetNodeId: dialogue.nodes[1].id,
      targetPort: "in",
    },
  ];
  useEditorStore.getState().setProject(project);
  const { unmount } = render(<CanvasView />);
  try {
    act(() => vi.advanceTimersByTime(40));
    expect(flowProps.nodes).toHaveLength(0);
    act(() => vi.advanceTimersByTime(32));
    expect(flowProps.nodes).toHaveLength(16);
    expect(flowProps.edges).toHaveLength(0);
    for (let i = 0; i < 7; i++) act(() => vi.advanceTimersByTime(32));
    expect(flowProps.nodes).toHaveLength(123);
    expect(flowProps.edges).toHaveLength(1);
  } finally {
    unmount();
    vi.useRealTimers();
  }
});

test("cancels a partial large-file mount when switching to a small file", () => {
  vi.useFakeTimers();
  const project = createDemoProject();
  const small = project.dialogues[0];
  const large = structuredClone(small);
  large.id = "large-file";
  large.nodes = Array.from({ length: 123 }, (_, index) =>
    createNode("dialogue", { x: index * 250, y: 0 }),
  );
  large.edges = [];
  large.entryNodeId = large.nodes[0].id;
  project.dialogues.push(large);
  useEditorStore.getState().setProject(project, false, large.id);
  const { unmount } = render(<CanvasView />);
  try {
    act(() => vi.advanceTimersByTime(40));
    act(() => vi.advanceTimersByTime(32));
    expect(flowProps.nodes).toHaveLength(16);
    act(() => useEditorStore.getState().setSelectedDialogue(small.id));
    act(() => vi.advanceTimersByTime(1000));
    expect(flowProps.nodes?.map((node) => node.id)).toEqual(
      small.nodes.map((node) => node.id),
    );
    expect(flowProps.edges).toHaveLength(small.edges.length);
  } finally {
    unmount();
    vi.useRealTimers();
  }
});

test("box selection moves multiple nodes in one undoable edit", () => {
  render(<CanvasView />);
  const state = useEditorStore.getState();
  const [first, second] = state.project.dialogues[0].nodes;
  const original = [first.position, second.position];
  const initialHistory = state.past.length;

  act(() => {
    flowProps.onNodesChange?.([
      { type: "select", id: first.id, selected: true },
      { type: "select", id: second.id, selected: true },
    ]);
    flowProps.onSelectionEnd?.({} as ReactMouseEvent);
  });

  expect(flowProps.selectionOnDrag).toBe(true);
  expect(flowProps.panOnDrag).toEqual([1, 2]);
  expect(flowProps.nodes?.filter((node) => node.selected)).toHaveLength(2);

  const moved = [first, second].map((node) => ({
    ...node,
    position: { x: node.position.x + 40, y: node.position.y + 25 },
  })) as Node[];
  act(() => {
    flowProps.onNodeDragStop?.(new MouseEvent("mouseup"), moved[0], moved);
  });

  const updated = useEditorStore.getState();
  expect(
    updated.project.dialogues[0].nodes.slice(0, 2).map((node) => node.position),
  ).toEqual(moved.map((node) => node.position));
  expect(updated.past).toHaveLength(initialHistory + 1);
  act(() => updated.undo());
  expect(
    useEditorStore
      .getState()
      .project.dialogues[0].nodes.slice(0, 2)
      .map((node) => node.position),
  ).toEqual(original);
});

test("background frames move independently and persist outside dialogue data", () => {
  const project = createDemoProject();
  const dialogue = project.dialogues[0];
  const frame = {
    id: "editor-frame:test-frame",
    x: 300,
    y: 180,
    width: 500,
    height: 340,
    title: "支线",
    note: "规划节点",
    color: "#f05a67",
  };
  saveCanvasFrames(`${project.rootPath}:${dialogue.id}`, [frame]);
  useEditorStore.getState().setProject(project);
  render(<CanvasView />);

  expect(flowProps.nodes?.[0]).toMatchObject({
    id: frame.id,
    type: "backgroundFrame",
    position: { x: frame.x, y: frame.y },
    width: frame.width,
    height: frame.height,
    zIndex: -1,
  });
  act(() =>
    flowProps.onNodesChange?.([
      { type: "select", id: frame.id, selected: true },
    ]),
  );
  expect(flowProps.nodes?.[0].selected).toBe(true);
  act(() =>
    flowProps.onNodeClick?.(
      {} as ReactMouseEvent,
      {
        id: frame.id,
        type: "backgroundFrame",
      } as Node,
    ),
  );
  expect(flowProps.nodes?.[0].selected).toBe(true);
  expect(useEditorStore.getState().selectedNodeIds).toEqual([]);

  const movedFrame = {
    ...flowProps.nodes?.[0],
    position: { x: 420, y: 260 },
  } as Node;
  act(() => {
    flowProps.onNodeDragStop?.(new MouseEvent("mouseup"), movedFrame, [
      movedFrame,
    ]);
  });

  expect(
    getCanvasFrames(`${project.rootPath}:${dialogue.id}`)[0],
  ).toMatchObject({
    x: 420,
    y: 260,
  });
  expect(useEditorStore.getState().project.dialogues[0]).toEqual(dialogue);

  act(() => flowProps.onPaneClick?.({} as ReactMouseEvent));
  expect(flowProps.nodes?.[0].selected).toBe(false);
});

test("modifier selection keeps the first node selected", () => {
  render(<CanvasView />);
  const [first, second] = useEditorStore.getState().project.dialogues[0].nodes;

  act(() => {
    flowProps.onNodesChange?.([
      { type: "select", id: first.id, selected: true },
    ]);
    flowProps.onNodeClick?.(
      { metaKey: false, ctrlKey: false } as ReactMouseEvent,
      {
        id: first.id,
      } as Node,
    );
  });
  act(() => {
    flowProps.onNodesChange?.([
      { type: "select", id: second.id, selected: true },
    ]);
    flowProps.onNodeClick?.(
      { metaKey: true, ctrlKey: false } as ReactMouseEvent,
      {
        id: second.id,
      } as Node,
    );
  });

  expect(flowProps.multiSelectionKeyCode).toEqual(["Meta", "Control"]);
  expect(
    flowProps.nodes?.filter((node) => node.selected).map((node) => node.id),
  ).toEqual([first.id, second.id]);

  act(() => useEditorStore.getState().setSelectedNode(null));
  expect(flowProps.nodes?.filter((node) => node.selected)).toHaveLength(0);
});

test("keeps the live position when selection changes during a node drag", () => {
  render(<CanvasView />);
  const [node] = useEditorStore.getState().project.dialogues[0].nodes;
  const movedPosition = {
    x: node.position.x + 160,
    y: node.position.y + 72,
  };

  act(() => {
    flowProps.onNodeDragStart?.(
      new MouseEvent("mousedown"),
      { id: node.id } as Node,
      [{ id: node.id } as Node],
    );
    flowProps.onNodesChange?.([
      {
        type: "position",
        id: node.id,
        position: movedPosition,
        dragging: true,
      },
      { type: "select", id: node.id, selected: true },
    ]);
  });

  expect(
    flowProps.nodes?.find((flowNode) => flowNode.id === node.id)?.position,
  ).toEqual(movedPosition);
});

test("highlights the endpoints of a selected edge and dims unrelated nodes", () => {
  const project = createDemoProject();
  const dialogue = project.dialogues[0];
  const [source, target, unrelated] = dialogue.nodes;
  dialogue.edges = [
    {
      id: "highlight-edge",
      sourceNodeId: source.id,
      sourcePort: "next",
      targetNodeId: target.id,
      targetPort: "in",
    },
  ];
  useEditorStore.getState().setProject(project);
  render(<CanvasView />);

  act(() => {
    flowProps.onEdgesChange?.([
      { type: "select", id: "highlight-edge", selected: true },
    ]);
  });

  const dataById = new Map(
    flowProps.nodes?.map((node) => [node.id, node.data]),
  );
  expect(dataById.get(source.id)?.edgeHighlight).toBe("related");
  expect(dataById.get(target.id)?.edgeHighlight).toBe("related");
  expect(dataById.get(unrelated.id)?.edgeHighlight).toBe("dimmed");

  act(() => {
    flowProps.onEdgesChange?.([
      { type: "select", id: "highlight-edge", selected: false },
    ]);
  });
  expect(
    flowProps.nodes?.every((node) => node.data.edgeHighlight === undefined),
  ).toBe(true);
});

test("pasted multi-selection is selected on the canvas", () => {
  render(<CanvasView />);
  const state = useEditorStore.getState();
  const [first, second] = state.project.dialogues[0].nodes;

  act(() => {
    state.setSelectedNodes([first.id, second.id], first.id);
    useEditorStore.getState().copySelectedNode();
    useEditorStore.getState().pasteCopiedNode();
  });

  const selectedIds = useEditorStore.getState().selectedNodeIds;
  expect(selectedIds).toHaveLength(2);
  expect(
    flowProps.nodes?.filter((node) => node.selected).map((node) => node.id),
  ).toEqual(selectedIds);
});
