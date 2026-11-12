export type CanvasFrame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  note: string;
  color: string;
};

const storagePrefix = "siming.canvas-frames.v1:";

export function getCanvasFrames(key: string): CanvasFrame[] {
  try {
    const value = localStorage.getItem(`${storagePrefix}${key}`);
    if (!value) return [];
    const frames: unknown = JSON.parse(value);
    if (!Array.isArray(frames)) return [];
    return frames.filter(isCanvasFrame);
  } catch {
    return [];
  }
}

export function saveCanvasFrames(key: string, frames: CanvasFrame[]) {
  try {
    localStorage.setItem(`${storagePrefix}${key}`, JSON.stringify(frames));
  } catch {
    // Storage can be unavailable in private browsing or when its quota is full.
  }
}

function isCanvasFrame(value: unknown): value is CanvasFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<CanvasFrame>;
  return (
    typeof frame.id === "string" &&
    typeof frame.x === "number" &&
    typeof frame.y === "number" &&
    typeof frame.width === "number" &&
    typeof frame.height === "number" &&
    typeof frame.title === "string" &&
    typeof frame.note === "string" &&
    typeof frame.color === "string"
  );
}
