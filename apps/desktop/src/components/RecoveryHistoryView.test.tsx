import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createDemoProject } from "../model/demo";
import type { RecoverySnapshot, RecoverySnapshotSummary } from "../model/types";
import { RecoveryHistoryView } from "./RecoveryHistoryView";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
});

test("lists snapshot metadata, previews the selected dialogue, and restores it", async () => {
  const project = createDemoProject();
  project.rootPath = "/tmp/recovery-history-project";
  const savedProject = structuredClone(project);
  savedProject.dialogues[0].nodes[1].data.text = {
    "zh-CN": "来自指定快照的对白",
  };
  const summary: RecoverySnapshotSummary = {
    snapshotId: "snapshot-123.json",
    createdAtUnixMs: 123,
    isSaved: false,
    dialogueCount: savedProject.dialogues.length,
    nodeCount: 5,
    edgeCount: 4,
    changedFiles: ["dialogues/prologue/rainy-night.json"],
  };
  const recovery: RecoverySnapshot = {
    schemaVersion: 1,
    projectId: project.manifest.projectId,
    projectRoot: project.rootPath,
    savedFingerprint: "fp",
    project: savedProject,
    isSaved: false,
    createdAtUnixMs: 123,
    appVersion: "test",
  };
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "list_recovery_snapshots") return [summary] as never;
    if (command === "read_recovery_snapshot_at") return recovery as never;
    return undefined as never;
  });
  const onRestore = vi.fn();

  render(<RecoveryHistoryView project={project} onRestore={onRestore} />);

  expect(await screen.findByText("来自指定快照的对白")).toBeInTheDocument();
  expect(screen.getByLabelText("项目文件")).toHaveValue(
    "dialogues/prologue/rainy-night.json",
  );
  fireEvent.click(screen.getByRole("button", { name: /恢复此文件版本/ }));
  expect(onRestore).toHaveBeenCalledWith(
    recovery,
    "dialogues/prologue/rainy-night.json",
  );
});
