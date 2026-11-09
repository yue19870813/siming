import { beforeEach, expect, test } from "vitest";
import { getCanvasViewport, saveCanvasViewport } from "./canvasViewport";

beforeEach(() => {
  saveCanvasViewport("project-a:dialogue-1", { x: 0, y: 0, zoom: 1 });
});

test("keeps each dialogue canvas viewport independently in memory", () => {
  saveCanvasViewport("project-a:dialogue-1", { x: -240, y: 86, zoom: 1.4 });
  saveCanvasViewport("project-a:dialogue-2", { x: 20, y: -50, zoom: 0.8 });

  expect(getCanvasViewport("project-a:dialogue-1")).toEqual({
    x: -240,
    y: 86,
    zoom: 1.4,
  });
  expect(getCanvasViewport("project-a:dialogue-2")).toEqual({
    x: 20,
    y: -50,
    zoom: 0.8,
  });
  expect(getCanvasViewport("project-b:dialogue-1")).toBeUndefined();
});
