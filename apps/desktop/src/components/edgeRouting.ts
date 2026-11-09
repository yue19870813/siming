export type Point = { x: number; y: number };
export type Obstacle = Point & { width: number; height: number };

type HeapEntry = { state: number; cost: number; estimate: number };

function pushHeap(heap: HeapEntry[], entry: HeapEntry) {
  let index = heap.length;
  heap.push(entry);
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent].estimate <= entry.estimate) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = entry;
}

function popHeap(heap: HeapEntry[]) {
  const first = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= heap.length) break;
      const right = left + 1;
      const child =
        right < heap.length && heap[right].estimate < heap[left].estimate
          ? right
          : left;
      if (heap[child].estimate >= last.estimate) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return first;
}

function blockedGrid(
  rows: number,
  columns: number,
  rectangles: [
    rowStart: number,
    rowEnd: number,
    columnStart: number,
    columnEnd: number,
  ][],
) {
  const stride = columns + 1;
  const diff = new Int32Array((rows + 1) * stride);
  for (const [rowStart, rowEnd, columnStart, columnEnd] of rectangles) {
    if (rowStart >= rowEnd || columnStart >= columnEnd) continue;
    diff[rowStart * stride + columnStart]++;
    diff[rowEnd * stride + columnStart]--;
    diff[rowStart * stride + columnEnd]--;
    diff[rowEnd * stride + columnEnd]++;
  }
  const blocked = new Uint8Array(rows * columns);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * stride + column;
      const above = row > 0 ? diff[index - stride] : 0;
      const left = column > 0 ? diff[index - 1] : 0;
      const diagonal = row > 0 && column > 0 ? diff[index - stride - 1] : 0;
      diff[index] += above + left - diagonal;
      blocked[row * columns + column] = diff[index] > 0 ? 1 : 0;
    }
  }
  return blocked;
}

function lowerBound(values: number[], target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

// Search the visibility grid formed by padded node boundaries.
export function routeEdge(
  source: Point,
  target: Point,
  nodes: Obstacle[],
  occupied: Point[][] = [],
): Point[] | null {
  const start = { x: source.x + 24, y: source.y },
    end = { x: target.x - 24, y: target.y };
  const searchMargin = 48;
  const minX = Math.min(start.x, end.x) - searchMargin;
  const maxX = Math.max(start.x, end.x) + searchMargin;
  const minY = Math.min(start.y, end.y) - searchMargin;
  const maxY = Math.max(start.y, end.y) + searchMargin;
  const boxes = nodes
    .map((n) => ({
      left: n.x - 16,
      right: n.x + n.width + 16,
      top: n.y - 16,
      bottom: n.y + n.height + 16,
    }))
    .filter(
      (box) =>
        box.right >= minX &&
        box.left <= maxX &&
        box.bottom >= minY &&
        box.top <= maxY,
    );
  const inside = (p: Point) =>
    boxes.some(
      (b) => p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom,
    );
  if (inside(start) || inside(end)) return null;
  const laneGap = 24;
  const segments = occupied
    .flatMap((path) => path.slice(1).map((b, i) => ({ a: path[i], b })))
    .filter(
      ({ a, b }) =>
        Math.max(a.x, b.x) >= minX - laneGap &&
        Math.min(a.x, b.x) <= maxX + laneGap &&
        Math.max(a.y, b.y) >= minY - laneGap &&
        Math.min(a.y, b.y) <= maxY + laneGap,
    );
  const laneXs = segments
    .filter(({ a, b }) => a.x === b.x)
    .flatMap(({ a }) => [a.x - laneGap, a.x + laneGap]);
  const laneYs = segments
    .filter(({ a, b }) => a.y === b.y)
    .flatMap(({ a }) => [a.y - laneGap, a.y + laneGap]);
  const horizontalSegments = new Map<number, [number, number][]>();
  const verticalSegments = new Map<number, [number, number][]>();
  for (const { a, b } of segments) {
    if (a.y === b.y) {
      const line = horizontalSegments.get(a.y) ?? [];
      line.push([Math.min(a.x, b.x), Math.max(a.x, b.x)]);
      horizontalSegments.set(a.y, line);
    } else if (a.x === b.x) {
      const line = verticalSegments.get(a.x) ?? [];
      line.push([Math.min(a.y, b.y), Math.max(a.y, b.y)]);
      verticalSegments.set(a.x, line);
    }
  }
  const horizontalLines = [...horizontalSegments.keys()].sort((a, b) => a - b);
  const verticalLines = [...verticalSegments.keys()].sort((a, b) => a - b);
  const overlapCost = (a: Point, b: Point) => {
    const horizontal = a.y === b.y;
    const lines = horizontal ? horizontalLines : verticalLines;
    const grouped = horizontal ? horizontalSegments : verticalSegments;
    const start = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const end = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    let cost = 0;
    for (
      let i = lowerBound(lines, (horizontal ? a.y : a.x) - laneGap);
      i < lines.length && lines[i] - (horizontal ? a.y : a.x) < laneGap;
      i++
    ) {
      const separation = Math.abs(lines[i] - (horizontal ? a.y : a.x));
      for (const [segmentStart, segmentEnd] of grouped.get(lines[i]) ?? []) {
        const overlap =
          Math.min(end, segmentEnd) - Math.max(start, segmentStart);
        if (overlap > 0) cost += overlap * 100 * (1 - separation / laneGap);
      }
    }
    return cost;
  };
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
  const xIndex = new Map(xs.map((x, index) => [x, index]));
  const yIndex = new Map(ys.map((y, index) => [y, index]));
  const boxIndices = boxes.map((box) => ({
    left: xIndex.get(box.left)!,
    right: xIndex.get(box.right)!,
    top: yIndex.get(box.top)!,
    bottom: yIndex.get(box.bottom)!,
  }));
  const horizontalBlocked = blockedGrid(
    ys.length,
    xs.length - 1,
    boxIndices.map(({ left, right, top, bottom }) => [
      top + 1,
      bottom,
      left,
      right,
    ]),
  );
  const verticalBlocked = blockedGrid(
    xs.length,
    ys.length - 1,
    boxIndices.map(({ left, right, top, bottom }) => [
      left + 1,
      right,
      top,
      bottom,
    ]),
  );
  const first = yIndex.get(start.y)! * xs.length + xIndex.get(start.x)!;
  const last = yIndex.get(end.y)! * xs.length + xIndex.get(end.x)!;
  const pointX = (id: number) => xs[id % xs.length];
  const pointY = (id: number) => ys[Math.floor(id / xs.length)];
  const firstState = first * 3;
  const statePoint = (state: number): Point => {
    const pointId = Math.floor(state / 3);
    return { x: pointX(pointId), y: pointY(pointId) };
  };
  const stateDirection = (state: number) => state % 3;
  const stateCount = xs.length * ys.length * 3;
  const distance = new Float64Array(stateCount).fill(Infinity);
  const previous = new Int32Array(stateCount).fill(-1);
  const pending: HeapEntry[] = [];
  distance[firstState] = 0;
  pushHeap(pending, {
    state: firstState,
    cost: 0,
    estimate: Math.abs(start.x - end.x) + Math.abs(start.y - end.y),
  });
  while (pending.length) {
    const entry = popHeap(pending);
    let current = entry.state;
    if (entry.cost !== distance[current]) continue;
    if (Math.floor(current / 3) === last) {
      const path = [end];
      while (previous[current] !== -1) {
        current = previous[current];
        path.unshift(statePoint(current));
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
    const pointId = Math.floor(current / 3);
    const x = pointId % xs.length;
    const y = Math.floor(pointId / xs.length);
    const neighbors: [number, 1 | 2][] = [];
    if (x > 0 && !horizontalBlocked[y * (xs.length - 1) + x - 1])
      neighbors.push([pointId - 1, 1]);
    if (x + 1 < xs.length && !horizontalBlocked[y * (xs.length - 1) + x])
      neighbors.push([pointId + 1, 1]);
    if (y > 0 && !verticalBlocked[x * (ys.length - 1) + y - 1])
      neighbors.push([pointId - xs.length, 2]);
    if (y + 1 < ys.length && !verticalBlocked[x * (ys.length - 1) + y])
      neighbors.push([pointId + xs.length, 2]);
    const a = { x: pointX(pointId), y: pointY(pointId) };
    for (const [neighborPointId, direction] of neighbors) {
      const b = { x: pointX(neighborPointId), y: pointY(neighborPointId) };
      const nextState = neighborPointId * 3 + direction;
      const cost =
        entry.cost +
        Math.abs(a.x - b.x) +
        Math.abs(a.y - b.y) +
        (stateDirection(current) !== 0 && stateDirection(current) !== direction
          ? 48
          : 0) +
        overlapCost(a, b);
      if (cost >= distance[nextState]) continue;
      distance[nextState] = cost;
      previous[nextState] = current;
      pushHeap(pending, {
        state: nextState,
        cost,
        estimate: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y),
      });
    }
  }
  return null;
}

export function roundedPath(points: Point[]): string {
  const radiusFor = (index: number, corner: Point) => {
    const before = points[index - 1],
      after = points[index + 1];
    const incoming = Math.hypot(corner.x - before.x, corner.y - before.y),
      outgoing = Math.hypot(after.x - corner.x, after.y - corner.y);
    return Math.min(8, incoming / 3, outgoing / 3);
  };
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const incoming = Math.hypot(b.x - a.x, b.y - a.y),
      outgoing = Math.hypot(c.x - b.x, c.y - b.y);
    const radius = radiusFor(i, b);
    if (!radius) continue;
    path += ` L ${b.x + ((a.x - b.x) * radius) / incoming} ${b.y + ((a.y - b.y) * radius) / incoming} Q ${b.x} ${b.y} ${b.x + ((c.x - b.x) * radius) / outgoing} ${b.y + ((c.y - b.y) * radius) / outgoing}`;
  }
  const end = points.at(-1)!;
  return `${path} L ${end.x} ${end.y}`;
}

export type RouteRequest = {
  id: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  source: Point;
  target: Point;
};

export function requestsForNodes(requests: RouteRequest[], nodeIds: string[]) {
  const selected = new Set(nodeIds);
  return requests.filter(
    (request) =>
      selected.has(request.sourceNodeId ?? "") ||
      selected.has(request.targetNodeId ?? ""),
  );
}

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
