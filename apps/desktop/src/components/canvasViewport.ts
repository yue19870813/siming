export type CanvasViewport = { x: number; y: number; zoom: number };

const viewports = new Map<string, CanvasViewport>();

export function getCanvasViewport(key: string) {
  return viewports.get(key);
}

export function saveCanvasViewport(key: string, viewport: CanvasViewport) {
  viewports.set(key, viewport);
}
