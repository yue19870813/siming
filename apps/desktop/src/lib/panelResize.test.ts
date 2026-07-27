import { describe, expect, test } from "vitest";
import { clampPanelSize } from "./panelResize";

describe("clampPanelSize", () => {
  test("keeps panel dimensions inside their resize bounds", () => {
    expect(clampPanelSize(180, 220, 480)).toBe(220);
    expect(clampPanelSize(340, 220, 480)).toBe(340);
    expect(clampPanelSize(560, 220, 480)).toBe(480);
  });

  test("never returns less than the minimum when the viewport is narrow", () => {
    expect(clampPanelSize(300, 260, 180)).toBe(260);
  });
});
