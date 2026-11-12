type CanvasNodeState = {
  id: string;
  position: { x: number; y: number };
  hidden?: boolean;
};

export function reconcileCanvasNodes<T extends CanvasNodeState>(
  current: T[],
  source: T[],
): T[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  const needsRepair =
    current.length !== source.length ||
    source.some((node) => {
      const existing = currentById.get(node.id);
      return (
        !existing ||
        existing.hidden ||
        !Number.isFinite(existing.position.x) ||
        !Number.isFinite(existing.position.y)
      );
    });

  if (!needsRepair) return current;

  return source.map((node) => {
    const existing = currentById.get(node.id);
    if (!existing) return node;
    if (
      !existing.hidden &&
      Number.isFinite(existing.position.x) &&
      Number.isFinite(existing.position.y)
    ) {
      return existing;
    }
    return {
      ...node,
      position:
        Number.isFinite(existing.position.x) &&
        Number.isFinite(existing.position.y)
          ? existing.position
          : node.position,
    };
  });
}
