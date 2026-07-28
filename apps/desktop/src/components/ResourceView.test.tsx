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
