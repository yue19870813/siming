import { invoke } from "@tauri-apps/api/core";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  localStorage.clear();
});

test("renders the editable demo workspace", async () => {
  render(<App />);

  expect(screen.getByText("司命演示项目")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "画布" })).toBeInTheDocument();
  expect(screen.getAllByText("序章 · 雨夜来客")).not.toHaveLength(0);
  expect(screen.getByText(/演示项目尚未写入磁盘/)).toBeInTheDocument();
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("dark"),
  );
});

test("uses dark as the default browser theme", async () => {
  render(<App />);

  await screen.findByText("项目内容");
  expect(document.documentElement.dataset.theme).toBe("dark");
});
