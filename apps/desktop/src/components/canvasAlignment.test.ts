import { expect, test } from "vitest";
import { alignNodeCenters } from "./canvasAlignment";

const nodes = [
  { id: "a", position: { x: 0, y: 0 }, measured: { width: 100, height: 80 } },
  {
    id: "b",
    position: { x: 300, y: 200 },
    measured: { width: 200, height: 120 },
  },
];

test("aligns measured centers independently on both axes", () => {
  const result = alignNodeCenters(
    nodes,
    new Map([["a", { x: 347, y: 224 }]]),
    1,
  );
  expect(result.positions.get("a")).toEqual({ x: 350, y: 220 });
  expect(result.guides).toEqual({ x: 400, y: 260 });
});

test("keeps the tolerance constant in screen pixels", () => {
  const positions = new Map([["a", { x: 346, y: 0 }]]);
  expect(alignNodeCenters(nodes, positions, 2).guides).toEqual({});
  expect(alignNodeCenters(nodes, positions, 0.5).guides).toEqual({ x: 400 });
});

test("aligns groups without changing their relative spacing", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 100, y: 100 }],
  ]);
  const result = alignNodeCenters(
    [
      ...nodes,
      {
        id: "c",
        position: { x: 104, y: 73 },
        measured: { width: 100, height: 80 },
      },
    ],
    positions,
    1,
  );
  expect(result.guides).toEqual({ x: 154, y: 113 });
  expect(result.positions.get("a")).toEqual({ x: 4, y: 3 });
  expect(result.positions.get("b")).toEqual({ x: 104, y: 103 });
});

test("ignores hidden nodes and chooses the closest center", () => {
  const result = alignNodeCenters(
    [
      ...nodes,
      {
        id: "hidden",
        position: { x: 249, y: 200 },
        measured: { width: 200, height: 120 },
        hidden: true,
      },
      {
        id: "closer",
        position: { x: 298, y: 200 },
        measured: { width: 200, height: 120 },
      },
    ],
    new Map([["a", { x: 347, y: 0 }]]),
    1,
  );
  expect(result.guides).toEqual({ x: 398 });
});
