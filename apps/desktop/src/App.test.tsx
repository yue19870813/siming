import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

test("top-right actions open the matching workbench and export menu", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "命令行" }));
  expect(screen.getByRole("textbox", { name: "命令" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /校验/ }));
  expect(screen.getByRole("region", { name: "工作面板" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "选择导出格式" }));
  expect(
    screen.getByRole("menuitem", { name: /运行时 JSON/ }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("dark"),
  );
});

test("project title opens the project menu", async () => {
  render(<App />);

  const trigger = screen.getByRole("button", { name: /司命演示项目/ });
  expect(trigger).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(trigger);

  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "新建项目" })).toBeVisible();
  expect(screen.getByRole("button", { name: "打开项目" })).toBeVisible();
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("dark"),
  );
});

test("project and system settings are separate pages", async () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  expect(screen.getByRole("heading", { name: "项目设置" })).toBeInTheDocument();
  expect(screen.queryByText("新项目保存位置")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "系统设置" }));
  expect(screen.getByRole("heading", { name: "系统设置" })).toBeInTheDocument();
  expect(screen.getByText("新项目保存位置")).toBeInTheDocument();
  expect(screen.queryByText("项目配置文件")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("dark"),
  );
});
