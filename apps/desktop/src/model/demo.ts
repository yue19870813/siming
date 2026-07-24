import type {
  DialogueDocument,
  DialogueNode,
  NodeType,
  ProjectSnapshot,
} from "./types";

export const createId = () => crypto.randomUUID();

export function createNode(
  type: NodeType,
  position: { x: number; y: number },
  locale = "zh-CN",
): DialogueNode {
  const id = createId();
  const data: DialogueNode["data"] = { hostEvents: [] };

  if (type === "dialogue") {
    data.text = { [locale]: "输入对话内容…" };
    data.advancePolicy = { mode: "manual" };
  }
  if (type === "choice") {
    data.choices = [
      { id: createId(), text: { [locale]: "选项 A" } },
      { id: createId(), text: { [locale]: "选项 B" } },
    ];
  }
  if (type === "condition") {
    data.condition = { variable: "favor", operator: ">=", value: 10 };
  }
  if (type === "event") {
    data.event = "story.advance";
    data.params = {};
  }

  return {
    id,
    key: `${type}-${id.slice(0, 8)}`,
    type,
    position,
    data,
  };
}

function createDemoDialogue(): DialogueDocument {
  const start = createNode("start", { x: 80, y: 180 });
  const line = createNode("dialogue", { x: 360, y: 180 });
  line.key = "line-welcome";
  line.data.speakerId = "dur";
  line.data.text = {
    "zh-CN": "雨还没有停，你确定现在出发？",
    "en-US": "The rain has not stopped. Are you sure?",
  };
  line.data.hostEvents = [
    { name: "ui.portrait.show", payload: { character: "dur", side: "left" } },
  ];
  const choice = createNode("choice", { x: 660, y: 180 });
  choice.key = "choice-depart";
  choice.data.choices = [
    {
      id: createId(),
      text: { "zh-CN": "立刻出发", "en-US": "Leave now" },
    },
    {
      id: createId(),
      text: { "zh-CN": "再等等", "en-US": "Wait" },
    },
  ];
  const endA = createNode("end", { x: 980, y: 80 });
  const endB = createNode("end", { x: 980, y: 300 });
  endA.key = "end-depart";
  endB.key = "end-wait";

  return {
    schemaVersion: 1,
    id: createId(),
    key: "prologue-rain",
    name: "序章 · 雨夜来客",
    description: "演示画布、分支、多语言和宿主消息的可编辑对话。",
    tags: ["main-story", "prologue"],
    entryNodeId: start.id,
    nodes: [start, line, choice, endA, endB],
    edges: [
      {
        id: createId(),
        sourceNodeId: start.id,
        sourcePort: "next",
        targetNodeId: line.id,
        targetPort: "in",
      },
      {
        id: createId(),
        sourceNodeId: line.id,
        sourcePort: "next",
        targetNodeId: choice.id,
        targetPort: "in",
      },
      {
        id: createId(),
        sourceNodeId: choice.id,
        sourcePort: choice.data.choices![0].id,
        targetNodeId: endA.id,
        targetPort: "in",
      },
      {
        id: createId(),
        sourceNodeId: choice.id,
        sourcePort: choice.data.choices![1].id,
        targetNodeId: endB.id,
        targetPort: "in",
      },
    ],
  };
}

export function createDemoProject(): ProjectSnapshot {
  const dialogue = createDemoDialogue();
  return {
    rootPath: "",
    manifest: {
      schemaVersion: 1,
      projectId: createId(),
      name: "司命演示项目",
      paths: {
        dialogues: "dialogues/",
        exports: "exports/runtime/",
      },
      defaultExportFormat: "json",
      defaultLocale: "zh-CN",
      locales: ["zh-CN", "en-US"],
      dialogues: [
        {
          id: dialogue.id,
          key: dialogue.key,
          path: "dialogues/prologue/rainy-night.json",
        },
      ],
    },
    dialogues: [dialogue],
    resources: {
      characters: [
        {
          id: createId(),
          key: "dur",
          name: { "zh-CN": "杜尔", "en-US": "Dur" },
          color: "#8b7cf6",
          description: "谨慎、敏锐的同行者。",
          tags: [],
        },
      ],
      variables: [
        {
          id: createId(),
          key: "favor",
          type: "number",
          defaultValue: 0,
          description: "杜尔的信任值。",
        },
      ],
      events: [
        {
          id: createId(),
          key: "story.advance",
          name: { "zh-CN": "推进剧情", "en-US": "Advance story" },
          description: "通知宿主推进当前任务阶段。",
          params: [],
        },
      ],
      tags: [
        {
          id: createId(),
          key: "main-story",
          name: "主线",
          color: "#8b7cf6",
          scopes: ["dialogue", "node"],
          description: "主线剧情内容。",
        },
        {
          id: createId(),
          key: "prologue",
          name: "序章",
          color: "#5fd4b8",
          scopes: ["dialogue"],
          description: "序章内容。",
        },
      ],
    },
  };
}
