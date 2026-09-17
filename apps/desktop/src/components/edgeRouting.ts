export type Point = { x: number; y: number };
export type Obstacle = Point & { width: number; height: number };

// Search the visibility grid formed by padded node boundaries.
export function routeEdge(
  source: Point,
  target: Point,
  nodes: Obstacle[],
  occupied: Point[][] = [],
): Point[] | null {
  const boxes = nodes.map((n) => ({
    left: n.x - 16,
    right: n.x + n.width + 16,
    top: n.y - 16,
    bottom: n.y + n.height + 16,
  }));
  const start = { x: source.x + 24, y: source.y },
    end = { x: target.x - 24, y: target.y };
  const inside = (p: Point) =>
    boxes.some(
      (b) => p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom,
    );
  if (inside(start) || inside(end)) return null;
  const segments = occupied.flatMap((path) =>
    path.slice(1).map((b, i) => ({ a: path[i], b })),
  );
  const laneGap = 12;
  const laneXs = segments
    .filter(({ a, b }) => a.x === b.x)
    .flatMap(({ a }) => [a.x - laneGap, a.x + laneGap]);
  const laneYs = segments
    .filter(({ a, b }) => a.y === b.y)
    .flatMap(({ a }) => [a.y - laneGap, a.y + laneGap]);
  const overlapCost = (a: Point, b: Point) =>
    segments.reduce((cost, segment) => {
      const { a: c, b: d } = segment;
      const horizontal = a.y === b.y && c.y === d.y;
      const vertical = a.x === b.x && c.x === d.x;
      if (!horizontal && !vertical) return cost;
      const separation = horizontal ? Math.abs(a.y - c.y) : Math.abs(a.x - c.x);
      if (separation >= laneGap) return cost;
      const overlap = horizontal
        ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
          Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
        : Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
          Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
      return cost + Math.max(0, overlap) * 100 * (1 - separation / laneGap);
    }, 0);
  const xs = [
    ...new Set([
      ...laneXs,
      start.x,
      end.x,
      ...boxes.flatMap((b) => [b.left, b.right]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      ...laneYs,
      start.y,
      end.y,
      ...boxes.flatMap((b) => [b.top, b.bottom]),
    ]),
  ].sort((a, b) => a - b);
  const clear = (a: Point, b: Point) =>
    !boxes.some((r) =>
      a.x === b.x
        ? a.x > r.left &&
          a.x < r.right &&
          Math.max(a.y, b.y) > r.top &&
          Math.min(a.y, b.y) < r.bottom
        : a.y > r.top &&
          a.y < r.bottom &&
          Math.max(a.x, b.x) > r.left &&
          Math.min(a.x, b.x) < r.right,
    );
  const index = (p: Point) => ys.indexOf(p.y) * xs.length + xs.indexOf(p.x);
  const point = (id: number) => ({
    x: xs[id % xs.length],
    y: ys[Math.floor(id / xs.length)],
  });
  const first = index(start),
    last = index(end);
  const distance = new Map<number, number>([[first, 0]]),
    previous = new Map<number, number>();
  const pending = new Set([first]);
  const estimate = (id: number) => {
    const p = point(id);
    return distance.get(id)! + Math.abs(p.x - end.x) + Math.abs(p.y - end.y);
  };
  while (pending.size) {
    let current = pending.values().next().value!;
    for (const id of pending)
      if (estimate(id) < estimate(current)) current = id;
    pending.delete(current);
    if (current === last) {
      const path = [end];
      while (previous.has(current)) {
        current = previous.get(current)!;
        path.unshift(point(current));
      }
      return [source, ...path, target].filter((p, i, all) => {
        const before = all[i - 1],
          after = all[i + 1];
        return (
          !before ||
          !after ||
          !(
            (before.x === p.x && p.x === after.x) ||
            (before.y === p.y && p.y === after.y)
          )
        );
      });
    }
    const x = current % xs.length,
      y = Math.floor(current / xs.length);
    const neighbors = [
      x > 0 ? current - 1 : -1,
      x + 1 < xs.length ? current + 1 : -1,
      y > 0 ? current - xs.length : -1,
      y + 1 < ys.length ? current + xs.length : -1,
    ];
    for (const id of neighbors) {
      if (id < 0) continue;
      const a = point(current),
        b = point(id);
      if (!clear(a, b)) continue;
      const cost =
        distance.get(current)! +
        Math.abs(a.x - b.x) +
        Math.abs(a.y - b.y) +
        overlapCost(a, b);
      if (cost >= (distance.get(id) ?? Infinity)) continue;
      distance.set(id, cost);
      previous.set(id, current);
      pending.add(id);
    }
  }
  return null;
}

export function roundedPath(points: Point[]): string {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const incoming = Math.hypot(b.x - a.x, b.y - a.y),
      outgoing = Math.hypot(c.x - b.x, c.y - b.y);
    const radius = Math.min(8, incoming / 2, outgoing / 2);
    if (!radius) continue;
    path += ` L ${b.x + ((a.x - b.x) * radius) / incoming} ${b.y + ((a.y - b.y) * radius) / incoming} Q ${b.x} ${b.y} ${b.x + ((c.x - b.x) * radius) / outgoing} ${b.y + ((c.y - b.y) * radius) / outgoing}`;
  }
  const end = points.at(-1)!;
  return `${path} L ${end.x} ${end.y}`;
}

export type RouteRequest = { id: string; source: Point; target: Point };

export function routeEdges(requests: RouteRequest[], nodes: Obstacle[]) {
  const routes = new Map<string, Point[] | null>();
  const occupied: Point[][] = [];
  // Stable ordering keeps lanes unchanged when selection/render order changes.
  for (const request of [...requests].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const path = routeEdge(request.source, request.target, nodes, occupied);
    routes.set(request.id, path);
    if (path) occupied.push(path);
  }
  return routes;
}
