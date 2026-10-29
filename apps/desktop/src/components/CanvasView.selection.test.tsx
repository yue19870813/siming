import { act, render } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Node, ReactFlowProps } from "@xyflow/react";
import { beforeEach, expect, test, vi } from "vitest";
import { createDemoProject } from "../model/demo";
import { useEditorStore } from "../store/editorStore";
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
  useEditorStore.getState().setProject(createDemoProject());
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
