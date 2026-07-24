import { invoke } from "@tauri-apps/api/core";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("shows the shared core version returned by IPC", async () => {
  vi.mocked(invoke).mockResolvedValue("0.1.0");

  render(<App />);

  expect(await screen.findByText("IPC 已连接")).toBeInTheDocument();
  expect(screen.getByTestId("core-version")).toHaveTextContent("0.1.0");
  expect(invoke).toHaveBeenCalledWith("core_version");
});

test("falls back to browser preview when Tauri IPC is unavailable", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("not running in Tauri"));

  render(<App />);

  expect(await screen.findByText("浏览器预览模式")).toBeInTheDocument();
  expect(screen.getByTestId("core-version")).toHaveTextContent("web preview");
});
