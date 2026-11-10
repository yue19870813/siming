type Point = { x: number; y: number };
type AlignmentNode = {
  id: string;
  position: Point;
  measured?: { width?: number; height?: number };
  hidden?: boolean;
};

// Align the dragged group's center without changing spacing within the group.
export function alignNodeCenters(
  nodes: AlignmentNode[],
  positions: Map<string, Point>,
  zoom: number,
) {
  const moving = nodes.filter((node) => positions.has(node.id));
  const guides: { x?: number; y?: number } = {};
  const offset = { x: 0, y: 0 };
  if (!moving.length) return { positions, guides };
  const bounds = moving.map((node) => {
    const position = positions.get(node.id)!;
    return {
      ...position,
      right: position.x + (node.measured?.width ?? 210),
      bottom: position.y + (node.measured?.height ?? 86),
    };
  });
  const center = {
    x:
      (Math.min(...bounds.map((b) => b.x)) +
        Math.max(...bounds.map((b) => b.right))) /
      2,
    y:
      (Math.min(...bounds.map((b) => b.y)) +
        Math.max(...bounds.map((b) => b.bottom))) /
      2,
  };
  const nearest = { x: 6 / zoom, y: 6 / zoom };
  for (const node of nodes) {
    if (positions.has(node.id) || node.hidden) continue;
    const target = {
      x: node.position.x + (node.measured?.width ?? 210) / 2,
      y: node.position.y + (node.measured?.height ?? 86) / 2,
    };
    for (const axis of ["x", "y"] as const) {
      const delta = target[axis] - center[axis];
      if (Math.abs(delta) < nearest[axis]) {
        nearest[axis] = Math.abs(delta);
        offset[axis] = delta;
        guides[axis] = target[axis];
      }
    }
  }
  return {
    positions: new Map(
      [...positions].map(([id, p]) => [
        id,
        { x: p.x + offset.x, y: p.y + offset.y },
      ]),
    ),
    guides,
  };
}
