import { beforeEach, expect, test } from "vitest";
import {
  getCanvasFrames,
  saveCanvasFrames,
  type CanvasFrame,
} from "./canvasFrames";

beforeEach(() => localStorage.clear());

test("stores frames separately by project and dialogue key", () => {
  const frame: CanvasFrame = {
    id: "frame-1",
    x: 100,
    y: 80,
    width: 520,
    height: 360,
    title: "章节一",
    note: "支线规划",
    color: "#f05a67",
  };
  saveCanvasFrames("project-a:dialogue-a", [frame]);
  expect(getCanvasFrames("project-a:dialogue-a")).toEqual([frame]);
  expect(getCanvasFrames("project-a:dialogue-b")).toEqual([]);
  expect(getCanvasFrames("project-b:dialogue-a")).toEqual([]);
});

test("ignores malformed frame records", () => {
  localStorage.setItem("siming.canvas-frames.v1:broken", '[{"id":"x"}]');
  expect(getCanvasFrames("broken")).toEqual([]);
});
