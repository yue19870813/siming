import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { WelcomeView } from "./components/WelcomeView";
import { createDemoProject } from "./model/demo";
import { useEditorStore } from "./store/editorStore";

const { openUrl } = vi.hoisted(() => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl,
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  openUrl.mockReset();
  localStorage.clear();
  useEditorStore.getState().closeProject();
});

function openTestProject() {
  useEditorStore.getState().setProject(createDemoProject());
}

test("starts on the welcome page without a demo project", async () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: "让每一条剧情分支清晰可见" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "新建项目" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "打开项目" })).toBeInTheDocument();
  const repositoryLink = screen.getByRole("link", {
    name: "欢迎使用司命。",
  });
  expect(repositoryLink).toHaveAttribute(
    "href",
    "https://github.com/yue19870813/siming",
  );
  fireEvent.click(repositoryLink);
  expect(openUrl).toHaveBeenCalledWith(
    "https://github.com/yue19870813/siming",
  );
  expect(screen.queryByText("司命演示项目")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "画布" }),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("dark"),
  );
});

test("uses dark as the default browser theme", async () => {
  render(<App />);

  await screen.findByRole("heading", { name: "让每一条剧情分支清晰可见" });
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("new project details are confirmed in an in-app dialog", () => {
  const onCreateNew = vi.fn();

  render(
    <WelcomeView
      notice="请填写项目名称。"
      busy={false}
      onNew={vi.fn()}
      onOpen={vi.fn()}
      newProjectRootPath="/tmp/siming-story"
      onCreateNew={onCreateNew}
      onCancelNew={vi.fn()}
    />,
  );

  expect(
    screen.getByRole("form", { name: "新建项目" }),
  ).toBeInTheDocument();
  expect(screen.getByText("/tmp/siming-story")).toBeInTheDocument();

  const nameInput = screen.getByRole("textbox", { name: "项目名称" });
  fireEvent.change(nameInput, { target: { value: "长安夜话" } });
  fireEvent.click(screen.getByRole("button", { name: "创建项目" }));

  expect(onCreateNew).toHaveBeenCalledWith("长安夜话");
});

test("top-right actions open the matching workbench and export menu", async () => {
  openTestProject();
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
  openTestProject();
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
  openTestProject();
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

test("an open project can visit the welcome page and return", async () => {
  openTestProject();
  render(<App />);
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("dark"),
  );

  fireEvent.click(screen.getByRole("button", { name: "欢迎页" }));
  expect(
    screen.getByRole("heading", { name: "让每一条剧情分支清晰可见" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /返回“司命演示项目”/ }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /返回“司命演示项目”/ }));
  expect(screen.getByRole("button", { name: "画布" })).toBeInTheDocument();
});
