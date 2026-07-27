import type { NodeType } from "../model/types";

export const nodeDragMoveEvent = "siming:node-drag-move";
export const nodeDropEvent = "siming:node-drop";
export const nodeDragCancelEvent = "siming:node-drag-cancel";

export type NodeDragDetail = {
  type: NodeType;
  clientX: number;
  clientY: number;
};

const nodeTypes: NodeType[] = [
  "start",
  "dialogue",
  "choice",
  "condition",
  "event",
  "end",
];

let suppressNextPaletteClick = false;

export function draggedNodeType(value: string): NodeType | null {
  return nodeTypes.includes(value as NodeType) ? (value as NodeType) : null;
}

export function consumeSuppressedPaletteClick() {
  const suppressed = suppressNextPaletteClick;
  suppressNextPaletteClick = false;
  return suppressed;
}

export function beginNodePointerDrag(
  startEvent: {
    button: number;
    clientX: number;
    clientY: number;
  },
  type: NodeType,
  label: string,
) {
  if (startEvent.button !== 0) return;

  const start = { x: startEvent.clientX, y: startEvent.clientY };
  let dragging = false;
  let preview: HTMLDivElement | null = null;

  const detail = (event: PointerEvent): NodeDragDetail => ({
    type,
    clientX: event.clientX,
    clientY: event.clientY,
  });
  const movePreview = (event: PointerEvent) => {
    if (!preview) return;
    preview.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 14}px)`;
  };
  const startDragging = (event: PointerEvent) => {
    dragging = true;
    document.documentElement.classList.add("is-dragging-node");
    preview = document.createElement("div");
    preview.className = "node-drag-preview";
    preview.textContent = `＋ ${label}`;
    document.body.append(preview);
    movePreview(event);
  };
  const cleanup = () => {
    document.documentElement.classList.remove("is-dragging-node");
    preview?.remove();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", drop);
    window.removeEventListener("pointercancel", cancel);
  };
  const move = (event: PointerEvent) => {
    if (
      !dragging &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5
    )
      return;
    if (!dragging) startDragging(event);
    event.preventDefault();
    movePreview(event);
    window.dispatchEvent(
      new CustomEvent<NodeDragDetail>(nodeDragMoveEvent, {
        detail: detail(event),
      }),
    );
  };
  const drop = (event: PointerEvent) => {
    if (dragging) {
      suppressNextPaletteClick = true;
      window.dispatchEvent(
        new CustomEvent<NodeDragDetail>(nodeDropEvent, {
          detail: detail(event),
        }),
      );
    }
    cleanup();
  };
  const cancel = () => {
    if (dragging) window.dispatchEvent(new Event(nodeDragCancelEvent));
    cleanup();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", drop);
  window.addEventListener("pointercancel", cancel);
}
