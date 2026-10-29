import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { hasInvalidHostDraft } from "../lib/hostDraftGuard";
import { useEditorStore } from "../store/editorStore";
import { UpdateControl } from "./UpdateControl";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "0.1.2"),
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("../lib/hostDraftGuard", () => ({
  hasInvalidHostDraft: vi.fn(() => false),
}));

let update: Update;
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  useEditorStore.setState({ dirty: false, sourceDraftDirty: false });
  vi.mocked(hasInvalidHostDraft).mockReturnValue(false);
  update = {
    version: "0.2.0",
    body: "修复与改进",
    close: vi.fn(async () => {}),
    download: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
  } as unknown as Update;
  vi.mocked(check).mockResolvedValue(update);
});

async function findUpdate() {
  render(<UpdateControl />);
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  fireEvent.click(await screen.findByRole("button", { name: "查看更新" }));
}

async function downloadUpdate() {
  await findUpdate();
  fireEvent.click(screen.getByRole("button", { name: "下载更新" }));
  await screen.findByRole("button", { name: "安装并重启" });
}

test("shows current version and no-update result", async () => {
  vi.mocked(check).mockResolvedValue(null);
  render(<UpdateControl />);
  expect(await screen.findByText("司命 v0.1.2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  expect(await screen.findByText("当前已是最新版本。")).toBeInTheDocument();
});

test("keeps checking errors visible and permits retry", async () => {
  vi.mocked(check).mockRejectedValueOnce(new Error("network offline"));
  render(<UpdateControl />);
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  expect(
    await screen.findByText(/检查失败.*network offline/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  expect(
    await screen.findByRole("button", { name: "查看更新" }),
  ).toBeInTheDocument();
});

test.each(["dirty", "sourceDraftDirty", "hostDraft"])(
  "blocks installation with unsaved %s",
  async (field) => {
    await downloadUpdate();
    if (field === "hostDraft")
      vi.mocked(hasInvalidHostDraft).mockReturnValue(true);
    else useEditorStore.setState({ [field]: true });
    fireEvent.click(screen.getByRole("button", { name: "安装并重启" }));
    expect(await screen.findByText(/存在未保存的项目/)).toBeInTheDocument();
    expect(update.install).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  },
);

test("downloads before installing and only relaunches after successful installation", async () => {
  await downloadUpdate();
  expect(update.install).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "安装并重启" }));
  await waitFor(() => expect(relaunch).toHaveBeenCalledOnce());
  expect(update.install).toHaveBeenCalledOnce();
});

test("signature failure never enables installation and allows retry", async () => {
  vi.mocked(update.download).mockRejectedValueOnce(
    new Error("invalid signature"),
  );
  await findUpdate();
  fireEvent.click(screen.getByRole("button", { name: "下载更新" }));
  expect(
    await screen.findByText(/下载或签名校验失败.*invalid signature/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "安装并重启" }),
  ).not.toBeInTheDocument();
  expect(update.install).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "下载更新" }));
  expect(
    await screen.findByRole("button", { name: "安装并重启" }),
  ).toBeInTheDocument();
});

test("install failure does not restart and can be retried", async () => {
  vi.mocked(update.install).mockRejectedValueOnce(
    new Error("permission denied"),
  );
  await downloadUpdate();
  fireEvent.click(screen.getByRole("button", { name: "安装并重启" }));
  expect(
    await screen.findByText(/安装或重启失败.*permission denied/),
  ).toBeInTheDocument();
  expect(relaunch).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "安装并重启" }),
  ).toBeInTheDocument();
});

test("closes an update resource if checking completes after unmount", async () => {
  let resolve!: (value: Update) => void;
  vi.mocked(check).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(<UpdateControl />);
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  await act(async () => {});
  view.unmount();
  await act(async () => {
    resolve(update);
  });
  expect(update.close).toHaveBeenCalledOnce();
});
