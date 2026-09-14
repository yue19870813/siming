import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { createDemoProject } from "../model/demo";
import { useEditorStore } from "../store/editorStore";
import { ResourceView } from "./ResourceView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  const project = createDemoProject();
  project.rootPath = "/tmp/siming-avatar-project";
  useEditorStore.getState().setProject(project);
  vi.mocked(open).mockReset();
  vi.mocked(invoke).mockReset();
});

test("imports a selected character avatar into the project", async () => {
  vi.mocked(open).mockResolvedValue("/tmp/dur.png");
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "import_character_avatar") {
      return "assets/characters/dur-avatar.png" as never;
    }
    if (command === "read_project_asset") return [] as never;
    return undefined as never;
  });

  render(<ResourceView activity="characters" />);
  fireEvent.click(screen.getByRole("button", { name: "选择头像" }));

  await waitFor(() =>
    expect(
      useEditorStore.getState().project.resources.characters[0].avatar,
    ).toBe("assets/characters/dur-avatar.png"),
  );
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "选择角色头像",
      filters: [
        {
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "webp"],
        },
      ],
    }),
  );
  expect(invoke).toHaveBeenCalledWith("import_character_avatar", {
    rootPath: "/tmp/siming-avatar-project",
    characterId: useEditorStore.getState().project.resources.characters[0].id,
    sourcePath: "/tmp/dur.png",
  });
});

test("groups support creation, inherited membership, batch movement and safe deletion", () => {
  render(<ResourceView activity="characters" />);
  fireEvent.click(screen.getByText("新建分组"));
  fireEvent.change(screen.getByLabelText("分组名称"), {
    target: { value: " 主角 " },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  const group = useEditorStore.getState().project.manifest.characterGroups![0];
  expect(group.name).toBe("主角");
  fireEvent.click(screen.getByRole("button", { name: "新增角色" }));
  expect(
    useEditorStore.getState().project.resources.characters.at(-1)?.groupId,
  ).toBe(group.id);
  fireEvent.click(screen.getByLabelText("全选当前角色"));
  fireEvent.change(screen.getByLabelText("批量移动角色"), {
    target: { value: "ungrouped" },
  });
  expect(
    useEditorStore.getState().project.resources.characters.at(-1)?.groupId,
  ).toBeUndefined();
  fireEvent.change(screen.getByLabelText("所属分组"), {
    target: { value: group.id },
  });
  fireEvent.click(screen.getByLabelText("重命名分组 主角"));
  fireEvent.change(screen.getByLabelText("分组名称"), {
    target: { value: "英雄" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(
    useEditorStore.getState().project.manifest.characterGroups![0],
  ).toEqual({ ...group, name: "英雄" });
  const dialogues = structuredClone(
    useEditorStore.getState().project.dialogues,
  );
  fireEvent.click(screen.getByLabelText("删除分组 英雄"));
  fireEvent.click(screen.getByRole("button", { name: "删除分组" }));
  expect(useEditorStore.getState().project.manifest.characterGroups).toEqual(
    [],
  );
  expect(
    useEditorStore
      .getState()
      .project.resources.characters.every((character) => !character.groupId),
  ).toBe(true);
  expect(useEditorStore.getState().project.dialogues).toEqual(dialogues);
});

test("group name validation and filtering respect the selected group", () => {
  const project = useEditorStore.getState().project;
  project.manifest.characterGroups = [
    { id: "group-a", name: "主角" },
    { id: "group-b", name: "配角" },
  ];
  project.resources.characters[0].groupId = "group-a";
  render(<ResourceView activity="characters" />);
  fireEvent.click(screen.getByRole("button", { name: /^配角\s*0$/ }));
  expect(screen.queryByLabelText("选择角色 杜尔")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("新建分组"));
  fireEvent.change(screen.getByLabelText("分组名称"), {
    target: { value: " 主角 " },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByRole("alert")).toHaveTextContent("重复");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  fireEvent.click(screen.getByRole("button", { name: /^主角\s*1$/ }));
  expect(screen.getByLabelText("选择角色 杜尔")).toBeInTheDocument();
});
