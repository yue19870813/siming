import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import { createDemoProject } from "../model/demo";
import { nodeDropEvent } from "../lib/nodeDrag";
import { useEditorStore } from "../store/editorStore";
import { CanvasView } from "./CanvasView";
import {
  centeredNodePosition,
  nodePositionAtPoint,
} from "./canvasGeometry";

describe("centeredNodePosition", () => {
  test("accounts for the current pan and zoom", () => {
    expect(
      centeredNodePosition(
        { x: -200, y: 100, zoom: 2 },
        { width: 1200, height: 800 },
      ),
    ).toEqual({ x: 295, y: 107 });
  });

  test("centers a dropped node on the pointer position", () => {
    expect(nodePositionAtPoint({ x: 500, y: 300 })).toEqual({
      x: 395,
      y: 257,
    });
  });
});

describe("CanvasView palette drop", () => {
  beforeEach(() => {
    useEditorStore.getState().setProject(createDemoProject());
  });

  test("creates and selects a node at the pointer release position", () => {
    const initialCount =
      useEditorStore.getState().project.dialogues[0].nodes.length;
    const { container } = render(<CanvasView />);
    const canvas = container.querySelector(".canvas-view");
    expect(canvas).not.toBeNull();
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({
        left: 100,
        top: 50,
        right: 1100,
        bottom: 750,
        width: 1000,
        height: 700,
        x: 100,
        y: 50,
        toJSON: () => undefined,
      }),
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(nodeDropEvent, {
          detail: {
            type: "condition",
            clientX: 600,
            clientY: 400,
          },
        }),
      );
    });

    const state = useEditorStore.getState();
    expect(state.project.dialogues[0].nodes).toHaveLength(initialCount + 1);
    const created = state.project.dialogues[0].nodes.find(
      (node) => node.id === state.selectedNodeId,
    );
    expect(created?.type).toBe("condition");
    expect(created?.position).toEqual({ x: 395, y: 307 });
  });
});
