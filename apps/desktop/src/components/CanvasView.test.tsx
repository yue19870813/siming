import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import { createDemoProject, createNode } from "../model/demo";
import { nodeDropEvent } from "../lib/nodeDrag";
import { useEditorStore } from "../store/editorStore";
import { CanvasView } from "./CanvasView";
import { centeredNodePosition, nodePositionAtPoint } from "./canvasGeometry";

test("shows feedback before mounting a large canvas and cancels it on file switch", () => {
  const project = createDemoProject();
  const large = structuredClone(project.dialogues[0]);
  large.id = "large-dialogue";
  large.nodes = Array.from({ length: 80 }, (_, index) =>
    createNode("dialogue", { x: index * 250, y: 0 }),
  );
  large.edges = [];
  large.entryNodeId = large.nodes[0].id;
  project.dialogues.push(large);
  useEditorStore.getState().setProject(project, false, large.id);
  const { container } = render(<CanvasView />);
  expect(screen.getByRole("status")).toHaveTextContent("正在初始化 80 个节点");
  expect(container.querySelector(".react-flow")).toBeNull();

  act(() =>
    useEditorStore.getState().setSelectedDialogue(project.dialogues[0].id),
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(container.querySelector(".react-flow")).not.toBeNull();
});

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

  test("shows the character name and portrait placeholder on dialogue nodes", () => {
    const { container } = render(<CanvasView />);

    expect(screen.getByText("杜尔")).toBeInTheDocument();
    expect(container.querySelector(".dialogue-node-avatar")).not.toBeNull();
  });

  test("keeps narrator dialogue content in the text column", () => {
    useEditorStore.getState().commit("改为旁白", (project) => {
      const dialogueNode = project.dialogues[0].nodes.find(
        (node) => node.type === "dialogue",
      );
      if (dialogueNode) dialogueNode.data.speakerId = undefined;
    });

    render(<CanvasView />);
    const narrator = screen.getByText("旁白");
    const content = narrator.closest(".dialogue-node-content");

    expect(content?.querySelector(".dialogue-node-avatar")).not.toBeNull();
    expect(narrator.parentElement).not.toHaveClass("dialogue-node-avatar");
  });

  test("shows an alias on the canvas while retaining the node key", () => {
    useEditorStore.getState().commit("设置节点别名", (project) => {
      const node = project.dialogues[0].nodes.find(
        (item) => item.type === "dialogue",
      );
      if (node) node.alias = "开场问候";
    });
    render(<CanvasView />);
    expect(screen.getByText("开场问候")).toHaveAttribute(
      "title",
      "line-welcome",
    );
  });
});

test("host summaries show ordered names, overflow count and no payload", () => {
  const project = createDemoProject();
  project.dialogues[0].nodes.forEach((node) => {
    delete node.data.hostEvents;
  });
  project.dialogues[0].nodes[0].data.hostEvents = [
    { name: "ui.first", payload: { private: "body-must-not-appear" } },
    { name: "", payload: {} },
    { name: "ui.third", payload: {} },
  ];
  useEditorStore.getState().setProject(project);
  const { container } = render(<CanvasView />);
  const summary = container.querySelector(".host-event-summary")!;
  expect(summary).toHaveTextContent("ui.first");
  expect(summary).toHaveTextContent("未命名消息");
  expect(summary).toHaveTextContent("+1");
  expect(summary).toHaveAttribute("title", "ui.first\n未命名消息\nui.third");
  expect(summary.outerHTML).not.toContain("body-must-not-appear");
});

test("switch nodes render independent case handles plus a default handle", () => {
  const project = createDemoProject();
  const node = createNode("condition", { x: 0, y: 0 });
  delete node.data.condition;
  node.data.switch = {
    variable: "stage",
    cases: [
      { id: "ready", value: "ready" },
      { id: "done", value: "done" },
    ],
  };
  project.dialogues[0].nodes.push(node);
  useEditorStore.getState().setProject(project);
  const { container } = render(<CanvasView />);
  const card = container.querySelector(".flow-node--condition")!;
  expect(card).toHaveTextContent('case "ready"');
  expect(card).toHaveTextContent('case "done"');
  expect(card.querySelectorAll(".react-flow__handle.source")).toHaveLength(3);
  expect(card.querySelector('[data-handleid="default"]')).not.toBeNull();
  expect(card.querySelector('[data-handleid="true"]')).toBeNull();
});
