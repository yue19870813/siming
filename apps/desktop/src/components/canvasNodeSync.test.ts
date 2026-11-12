import { expect, test } from "vitest";
import { reconcileCanvasNodes } from "./canvasNodeSync";

test("restores missing source nodes while preserving live positions", () => {
  const source = [
    { id: "start", position: { x: 0, y: 0 } },
    { id: "line", position: { x: 300, y: 0 } },
  ];
  const current = [{ id: "line", position: { x: 420, y: 80 } }];

  expect(reconcileCanvasNodes(current, source)).toEqual([
    source[0],
    current[0],
  ]);
});

test("unhides nodes that are hidden only in React Flow state", () => {
  const source = [{ id: "start", position: { x: -150, y: 180 } }];
  const current = [{ ...source[0], hidden: true }];

  expect(reconcileCanvasNodes(current, source)).toEqual(source);
});

test("preserves the live dragged position when the node list is consistent", () => {
  const source = [{ id: "start", position: { x: 0, y: 0 } }];
  const current = [{ id: "start", position: { x: 220, y: 140 } }];

  expect(reconcileCanvasNodes(current, source)).toBe(current);
});
