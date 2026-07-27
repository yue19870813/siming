import { describe, expect, test, vi } from "vitest";
import {
  beginNodePointerDrag,
  consumeSuppressedPaletteClick,
  draggedNodeType,
  nodeDropEvent,
} from "./nodeDrag";

describe("draggedNodeType", () => {
  test("accepts supported palette types and rejects other drag data", () => {
    expect(draggedNodeType("dialogue")).toBe("dialogue");
    expect(draggedNodeType("condition")).toBe("condition");
    expect(draggedNodeType("file")).toBeNull();
    expect(draggedNodeType("")).toBeNull();
  });
  test("does not suppress ordinary palette clicks", () => {
    expect(consumeSuppressedPaletteClick()).toBe(false);
  });

  test("dispatches a drop after a pointer drag and suppresses its trailing click", () => {
    const drop = vi.fn();
    window.addEventListener(nodeDropEvent, drop);
    beginNodePointerDrag(
      { button: 0, clientX: 10, clientY: 10 },
      "event",
      "事件",
    );

    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 40, clientY: 50 }),
    );
    window.dispatchEvent(
      new MouseEvent("pointerup", { clientX: 80, clientY: 90 }),
    );

    expect(drop).toHaveBeenCalledOnce();
    expect((drop.mock.calls[0][0] as CustomEvent).detail).toEqual({
      type: "event",
      clientX: 80,
      clientY: 90,
    });
    expect(consumeSuppressedPaletteClick()).toBe(true);
    expect(consumeSuppressedPaletteClick()).toBe(false);
    window.removeEventListener(nodeDropEvent, drop);
  });
});
