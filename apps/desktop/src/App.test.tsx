import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  vi.mocked(open).mockReset();
  openUrl.mockReset();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
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
  expect(openUrl).toHaveBeenCalledWith("https://github.com/yue19870813/siming");
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

  expect(screen.getByRole("form", { name: "新建项目" })).toBeInTheDocument();
  expect(screen.getByText("/tmp/siming-story")).toBeInTheDocument();

  const nameInput = screen.getByRole("textbox", { name: "项目名称" });
  fireEvent.change(nameInput, { target: { value: "长安夜话" } });
  fireEvent.click(screen.getByRole("button", { name: "创建项目" }));

  expect(onCreateNew).toHaveBeenCalledWith("长安夜话");
});

test("top-right actions open the matching workbench and export menu", async () => {
  openTestProject();
  const { container } = render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "数据" }));

  fireEvent.click(screen.getByRole("button", { name: "命令行" }));
  expect(screen.getByRole("textbox", { name: "命令" })).toBeInTheDocument();
  expect(container.querySelector(".workspace")).toHaveStyle({
    "--workbench-height": "430px",
  });

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

test("dialogues in the same directory share one folder in the explorer", async () => {
  openTestProject();
  useEditorStore.getState().addDialogue("dialogues/prologue");
  useEditorStore.getState().addDialogue("dialogues/prologue");
  useEditorStore.getState().markSaved();

  const { container } = render(<App />);

  expect(screen.getAllByText("dialogues/prologue")).toHaveLength(1);
  expect(
    [...container.querySelectorAll(".tree-file strong")].map(
      (element) => element.textContent,
    ),
  ).toEqual(
    expect.arrayContaining(["序章 · 雨夜来客", "新对话 2", "新对话 3"]),
  );
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("dark"),
  );
});

test("dialogue directories can be collapsed and search expands matches", async () => {
  openTestProject();
  useEditorStore.getState().addDialogue("dialogues/prologue");
  useEditorStore.getState().markSaved();
  render(<App />);

  const folder = screen.getByRole("button", { name: "dialogues/prologue" });
  expect(folder).toHaveAttribute("aria-expanded", "true");
  expect(
    folder.closest(".tree-file-group")?.querySelectorAll(".tree-file"),
  ).toHaveLength(2);

  fireEvent.click(folder);
  expect(folder).toHaveAttribute("aria-expanded", "false");
  expect(
    folder.closest(".tree-file-group")?.querySelectorAll(".tree-file"),
  ).toHaveLength(0);

  fireEvent.change(screen.getByPlaceholderText("搜索对话、路径…"), {
    target: { value: "新对话 2" },
  });
  expect(folder).toHaveAttribute("aria-expanded", "true");
  expect(
    folder.closest(".tree-file-group")?.querySelectorAll(".tree-file"),
  ).toHaveLength(1);
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("dark"),
  );
});

test("a dialogue directory can be created from the project explorer", async () => {
  openTestProject();
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "新建对话目录" }));
  const directoryPath = screen.getByRole("textbox", { name: "目录路径" });
  expect(directoryPath).toHaveValue("dialogues/prologue/新目录");
  fireEvent.change(directoryPath, {
    target: { value: "dialogues/chapter-2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "创建" }));

  expect(screen.getByText("dialogues/chapter-2")).toBeInTheDocument();
  expect(screen.getByText("空目录")).toBeInTheDocument();
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("dark"),
  );
});

test("a dialogue can be created from the project explorer", async () => {
  openTestProject();
  useEditorStore.getState().addDialogue("dialogues/chapter-2");
  useEditorStore.getState().markSaved();
  const { container } = render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "新建对话" }));
  expect(screen.getByRole("form", { name: "新建对话" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "目录路径" })).toHaveValue(
    "dialogues/chapter-2",
  );
  fireEvent.click(screen.getByRole("button", { name: "创建" }));

  expect(
    [...container.querySelectorAll(".tree-file strong")].map(
      (element) => element.textContent,
    ),
  ).toContain("新对话 3");
  expect(
    useEditorStore.getState().project.manifest.dialogues.at(-1)?.path,
  ).toBe("dialogues/chapter-2/dialogue-3.json");
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

test("project language defaults include five supported locales", async () => {
  openTestProject();
  render(<App />);
  await act(async () => undefined);

  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));

  expect(screen.getByRole("textbox", { name: /支持语言/ })).toHaveValue(
    "zh-CN, zh-TW, en-US, ja-JP, ko-KR",
  );

  fireEvent.click(screen.getByRole("button", { name: "应用项目设置" }));
  expect(useEditorStore.getState().project.manifest.locales).toEqual([
    "zh-CN",
    "zh-TW",
    "en-US",
    "ja-JP",
    "ko-KR",
  ]);
});

test("project export path can switch between relative and absolute modes", async () => {
  openTestProject();
  render(<App />);
  await act(async () => undefined);
  const projectId = useEditorStore.getState().project.manifest.projectId;

  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  fireEvent.click(screen.getByRole("button", { name: "绝对路径" }));
  const exportPath = screen.getByRole("textbox", {
    name: /导出文件位置/,
  });
  fireEvent.change(exportPath, {
    target: { value: "/tmp/siming-runtime" },
  });
  fireEvent.click(screen.getByRole("button", { name: "应用项目设置" }));

  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem("siming.system-settings") ?? "{}")
        .projectExportDirectories,
    ).toEqual({ [projectId]: "/tmp/siming-runtime" }),
  );
  expect(
    screen.getByText("绝对路径仅保存在当前设备，不会写入项目配置。"),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "相对路径" }));
  expect(exportPath).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "应用项目设置" }));
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem("siming.system-settings") ?? "{}")
        .projectExportDirectories,
    ).toEqual({}),
  );
});

test("first export asks for a directory and reuses it afterwards", async () => {
  const project = createDemoProject();
  project.rootPath = "/tmp/siming-project";
  useEditorStore.getState().setProject(project);
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  vi.mocked(open).mockResolvedValue("/tmp/siming-export");
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "read_system_settings") {
      return {
        schemaVersion: 1,
        theme: "dark",
        defaultProjectDirectory: null,
        interfaceLocale: "zh-CN",
        uiFontSize: "medium",
        editorFontSize: 13,
        keymap: "system",
        autoSaveDelaySeconds: 30,
        recoverySnapshotIntervalSeconds: 60,
        restoreLastProject: true,
        projectExportDirectories: {},
      } as never;
    }
    if (command === "export_project") {
      return {
        outputDirectory: "/tmp/siming-export",
        files: [],
      } as never;
    }
    return undefined as never;
  });
  render(<App />);
  await act(async () => undefined);

  fireEvent.click(screen.getByRole("button", { name: "导出 JSON" }));

  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith(
      "export_project",
      expect.objectContaining({ outputPath: "/tmp/siming-export" }),
    ),
  );
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({
      directory: true,
      title: "选择导出文件位置",
    }),
  );
  expect(invoke).toHaveBeenCalledWith(
    "write_system_settings",
    expect.objectContaining({
      settings: expect.objectContaining({
        projectExportDirectories: {
          [project.manifest.projectId]: "/tmp/siming-export",
        },
      }),
    }),
  );

  vi.mocked(open).mockClear();
  fireEvent.click(screen.getByRole("button", { name: "导出 JSON" }));
  await waitFor(() =>
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === "export_project"),
    ).toHaveLength(2),
  );
  expect(open).not.toHaveBeenCalled();
});

test("system language and editor font size settings are applied", async () => {
  openTestProject();
  render(<App />);
  await act(async () => undefined);

  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  fireEvent.click(screen.getByRole("button", { name: "系统设置" }));
  fireEvent.change(screen.getByRole("combobox", { name: /界面语言/ }), {
    target: { value: "en-US" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /^编辑器字号/ }), {
    target: { value: "large" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /数据编辑器字号/ }), {
    target: { value: "18" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存系统设置" }));

  await waitFor(() => {
    expect(document.documentElement.lang).toBe("en-US");
    expect(document.documentElement.dataset.uiFontSize).toBe("large");
    expect(
      document.documentElement.style.getPropertyValue("--editor-font-size"),
    ).toBe("18px");
    expect(
      screen.getByRole("heading", { name: "System Settings" }),
    ).toBeInTheDocument();
  });
  expect(
    JSON.parse(localStorage.getItem("siming.system-settings") ?? "{}"),
  ).toMatchObject({
    interfaceLocale: "en-US",
    uiFontSize: "large",
    editorFontSize: 18,
  });
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

test("command copy and paste duplicates the selected canvas node", async () => {
  openTestProject();
  render(<App />);
  const initial = useEditorStore.getState();
  const dialogue = initial.project.dialogues[0];
  const selected = dialogue.nodes[1];
  act(() => initial.setSelectedNode(selected.id));
  const initialCount = dialogue.nodes.length;

  fireEvent.keyDown(window, { key: "c", metaKey: true });
  fireEvent.keyDown(window, { key: "v", metaKey: true });

  await waitFor(() =>
    expect(useEditorStore.getState().project.dialogues[0].nodes).toHaveLength(
      initialCount + 1,
    ),
  );
  const state = useEditorStore.getState();
  expect(state.selectedNodeId).not.toBe(selected.id);
  expect(state.notice).toMatch(/^已粘贴节点：/);
});
