import type { PointerEvent as ReactPointerEvent } from "react";

export function clampPanelSize(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function beginPanelResize(
  event: ReactPointerEvent<HTMLElement>,
  options: {
    axis: "x" | "y";
    initialSize: number;
    direction: 1 | -1;
    min: number;
    max: number;
    onResize: (size: number) => void;
  },
) {
  event.preventDefault();
  const initialCoordinate =
    options.axis === "x" ? event.clientX : event.clientY;
  const cursorClass =
    options.axis === "x" ? "is-resizing-columns" : "is-resizing-rows";
  document.documentElement.classList.add(cursorClass);

  const move = (moveEvent: PointerEvent) => {
    const coordinate =
      options.axis === "x" ? moveEvent.clientX : moveEvent.clientY;
    options.onResize(
      clampPanelSize(
        options.initialSize +
          (coordinate - initialCoordinate) * options.direction,
        options.min,
        options.max,
      ),
    );
  };
  const stop = () => {
    document.documentElement.classList.remove(cursorClass);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
}
