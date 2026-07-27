const nodeWidth = 210;
const estimatedNodeHeight = 86;

export function nodePositionAtPoint(point: { x: number; y: number }) {
  return {
    x: point.x - nodeWidth / 2,
    y: point.y - estimatedNodeHeight / 2,
  };
}

export function centeredNodePosition(
  viewport: { x: number; y: number; zoom: number },
  canvasSize: { width: number; height: number },
) {
  return nodePositionAtPoint({
    x: (canvasSize.width / 2 - viewport.x) / viewport.zoom,
    y: (canvasSize.height / 2 - viewport.y) / viewport.zoom,
  });
}
