import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { createDemoProject } from "../model/demo";
import type { SimulationSession } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import { WorkbenchPanel } from "./WorkbenchPanel";

const api = vi.hoisted(() => ({
  validateProject: vi.fn(),
  simulateStep: vi.fn(),
}));

vi.mock("../lib/projectApi", () => api);

beforeEach(() => {
  useEditorStore.getState().setProject(createDemoProject());
  api.validateProject.mockReset();
  api.simulateStep.mockReset();
});

test("shared diagnostics locate their node", async () => {
  const project = useEditorStore.getState().project;
  const dialogue = project.dialogues[0];
  const node = dialogue.nodes[1];
  api.validateProject.mockResolvedValue([
    {
      code: "LOCALE_TRANSLATION_MISSING",
      severity: "warning",
      message: "非默认语言文本缺失",
      file: project.manifest.dialogues[0].path,
      entityType: "node",
      entityId: node.id,
      fieldPath: "/nodes/1/data/text/en-US",
      related: [],
    },
  ]);

  render(
    <WorkbenchPanel
      mode="problems"
      height={430}
      onModeChange={vi.fn()}
      onClose={vi.fn()}
      onResizeStart={vi.fn()}
      onResizeBy={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByText("非默认语言文本缺失"));
  expect(useEditorStore.getState().selectedDialogueId).toBe(dialogue.id);
  expect(useEditorStore.getState().selectedNodeId).toBe(node.id);
});

test("simulator starts from shared IPC and submits player choices", async () => {
  const project = useEditorStore.getState().project;
  const dialogue = project.dialogues[0];
  const choice = dialogue.nodes.find((node) => node.type === "choice")!;
  const running: SimulationSession = {
    currentNodeId: choice.id,
    status: "waitingChoice",
    locale: "zh-CN",
    variables: { favor: 0 },
    consecutiveSteps: 0,
    visitSequence: 2,
    trace: [
      {
        sequence: 1,
        kind: "node",
        nodeId: choice.id,
        nodeKey: choice.key,
        message: "进入节点",
        details: {},
      },
      {
        sequence: 2,
        kind: "hostEvent",
        nodeId: choice.id,
        nodeKey: choice.key,
        message: "宿主消息 1/1：ui.open",
        details: {},
      },
    ],
  };
  api.simulateStep.mockResolvedValue(running);

  render(
    <WorkbenchPanel
      mode="simulator"
      height={430}
      onModeChange={vi.fn()}
      onClose={vi.fn()}
      onResizeStart={vi.fn()}
      onResizeBy={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /开始模拟/ }));
  expect(await screen.findByText("HOST")).toBeInTheDocument();
  const choiceButton = await screen.findByRole("button", {
    name: choice.data.choices![0].text["zh-CN"],
  });
  fireEvent.click(choiceButton);
  await waitFor(() =>
    expect(api.simulateStep).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: {
          type: "choose",
          optionId: choice.data.choices![0].id,
        },
      }),
    ),
  );
});
