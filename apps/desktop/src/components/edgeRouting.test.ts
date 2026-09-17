import { expect, test } from "vitest";
import {
  routeEdges,
  routeEdge,
  type Obstacle,
  type Point,
} from "./edgeRouting";

function expectAvoidsNodes(path: Point[], nodes: Obstacle[]) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    expect(a.x === b.x || a.y === b.y).toBe(true);
    for (const n of nodes) {
      const crosses =
        a.x === b.x
          ? a.x > n.x &&
            a.x < n.x + n.width &&
            Math.max(a.y, b.y) > n.y &&
            Math.min(a.y, b.y) < n.y + n.height
          : a.y > n.y &&
            a.y < n.y + n.height &&
            Math.max(a.x, b.x) > n.x &&
            Math.min(a.x, b.x) < n.x + n.width;
      expect(crosses).toBe(false);
    }
  }
}

test("routes around a node between the source and target", () => {
  const nodes = [
    { x: 0, y: 0, width: 210, height: 100 },
    { x: 300, y: 0, width: 210, height: 100 },
    { x: 600, y: 0, width: 210, height: 100 },
  ];
  const route = routeEdge({ x: 210, y: 50 }, { x: 600, y: 50 }, nodes)!;
  expect(route).not.toBeNull();
  expectAvoidsNodes(route, nodes);
});

test("backward and self connections leave and approach outside node bodies", () => {
  const nodes = [
    { x: 0, y: 0, width: 210, height: 140 },
    { x: 400, y: 0, width: 210, height: 100 },
  ];
  for (const target of [
    { x: 0, y: 70 },
    { x: 400, y: 50 },
  ]) {
    const route = routeEdge({ x: 610, y: 50 }, target, nodes)!;
    expect(route).not.toBeNull();
    expectAvoidsNodes(route, nodes);
  }
});

test("overlapping nodes return a fallback instead of failing", () => {
  expect(
    routeEdge({ x: 210, y: 50 }, { x: 180, y: 50 }, [
      { x: 0, y: 0, width: 210, height: 100 },
      { x: 180, y: 0, width: 210, height: 100 },
    ]),
  ).toBeNull();
});

test("parallel detours use separate horizontal and vertical lanes", () => {
  const nodes = [
    { x: 0, y: 0, width: 210, height: 200 },
    { x: 400, y: 0, width: 210, height: 200 },
  ];
  const requests = [
    { id: "a", source: { x: 610, y: 80 }, target: { x: 0, y: 80 } },
    { id: "b", source: { x: 610, y: 130 }, target: { x: 0, y: 130 } },
    { id: "c", source: { x: 610, y: 170 }, target: { x: 0, y: 170 } },
  ];
  const paths = routeEdges(requests, nodes);
  const routes = [...paths.values()] as Point[][];
  for (const route of routes) expectAvoidsNodes(route, nodes);
  for (let r = 0; r < routes.length; r++)
    for (let s = r + 1; s < routes.length; s++) {
      for (let i = 1; i < routes[r].length; i++)
        for (let j = 1; j < routes[s].length; j++) {
          const a = routes[r][i - 1],
            b = routes[r][i],
            c = routes[s][j - 1],
            d = routes[s][j];
          if (a.y === b.y && c.y === d.y) {
            const overlap =
              Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
              Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
            if (overlap > 24)
              expect(Math.abs(a.y - c.y)).toBeGreaterThanOrEqual(12);
          }
          if (a.x === b.x && c.x === d.x) {
            const overlap =
              Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
              Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
            if (overlap > 24)
              expect(Math.abs(a.x - c.x)).toBeGreaterThanOrEqual(12);
          }
        }
    }
  expect(routeEdges([...requests].reverse(), nodes)).toEqual(paths);
});
