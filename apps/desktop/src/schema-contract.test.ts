import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(workspaceRoot, path), "utf8"));
}

test.each([
  [
    "project manifest",
    "schemas/project.schema.json",
    "fixtures/minimal-project/.siming/project.json",
  ],
  [
    "dialogue document",
    "schemas/dialogue.schema.json",
    "fixtures/minimal-project/dialogues/intro.json",
  ],
])(
  "%s fixture satisfies its published schema",
  (_name, schemaPath, fixturePath) => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(readJson(schemaPath));
    const valid = validate(readJson(fixturePath));

    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  },
);

test("dialogue schema accepts recursive structured conditions", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(readJson("schemas/dialogue.schema.json"));
  const dialogue = readJson("fixtures/minimal-project/dialogues/intro.json");
  const conditionNode = structuredClone(dialogue.nodes[0]);
  conditionNode.id = "6d069a68-4792-45db-8b38-c80b08eb254e";
  conditionNode.key = "condition-test";
  conditionNode.type = "condition";
  conditionNode.data.condition = {
    all: [
      { variable: "favor", operator: ">=", value: 10 },
      { not: { variable: "blocked", operator: "==", value: true } },
    ],
  };
  dialogue.nodes.push(conditionNode);

  expect(validate(dialogue)).toBe(true);
  expect(validate.errors).toBeNull();
});

test("dialogue schema accepts optional node aliases", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(readJson("schemas/dialogue.schema.json"));
  const dialogue = readJson("fixtures/minimal-project/dialogues/intro.json");
  dialogue.nodes[1].alias = "开场问候";
  expect(validate(dialogue), JSON.stringify(validate.errors)).toBe(true);
  dialogue.nodes[1].alias = 42;
  expect(validate(dialogue)).toBe(false);
});

test("source schema accepts switch cases and rejects invalid case values", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(readJson("schemas/dialogue.schema.json"));
  const dialogue = readJson("fixtures/minimal-project/dialogues/intro.json");
  dialogue.nodes[1].type = "condition";
  dialogue.nodes[1].data = {
    switch: {
      variable: "stage",
      cases: [
        { id: "ready", value: "ready", comment: "已准备完成" },
        { id: "done", value: "done" },
      ],
    },
  };
  expect(validate(dialogue), JSON.stringify(validate.errors)).toBe(true);
  dialogue.nodes[1].data.switch.cases[0].value = {};
  expect(validate(dialogue)).toBe(false);
});

test("runtime schema accepts compiled editor-free nodes", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(readJson("schemas/runtime.schema.json"));
  const startId = "3f0e9d88-5ec4-4cf5-9a83-9ad4ee9f7451";
  const endId = "b4aa0f79-bd0e-45cd-8a6e-094e6f50ccfd";
  const dialogueId = "2fd88ddc-aa3b-466f-92a2-48785adce71e";
  const runtime = {
    schemaVersion: 1,
    defaultLocale: "zh-CN",
    locales: ["zh-CN", "en-US"],
    resources: { characters: {}, variables: {}, events: {} },
    dialogues: {
      [dialogueId]: {
        key: "intro",
        entryNodeId: startId,
        nodes: {
          [startId]: {
            key: "start",
            type: "start",
            next: endId,
            tags: ["tag-print-slowly"],
          },
          [endId]: { key: "end", type: "end" },
        },
      },
    },
  };

  expect(validate(runtime), JSON.stringify(validate.errors)).toBe(true);
  expect(JSON.stringify(runtime)).not.toContain("position");
  runtime.dialogues[dialogueId].nodes[startId].tags = ["bad key"];
  expect(validate(runtime)).toBe(false);
});

test("exported empty nodes share the bundled and chunked schema", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const runtimeSchema = readJson("schemas/runtime.schema.json");
  const validateBundled = ajv.compile(runtimeSchema);
  const validateChunk = ajv.compile(
    readJson("schemas/runtime-dialogue-chunk.schema.json"),
  );
  for (const [validate, path] of [
    [validateBundled, "bundled/dialogues.runtime.json"],
    [validateChunk, "directory-chunks/dialogues/Chapter1/runtime.json"],
  ] as const) {
    const runtime = readJson(`sdks/csharp/contracts/${path}`);
    const dialogue = Object.values<{
      key: string;
      nodes: Record<string, object>;
    }>(runtime.dialogues).find((item) => item.key === "empty_demo")!;
    const empty = Object.values(dialogue.nodes).find(
      (node): node is Record<string, unknown> =>
        "type" in node && node.type === "empty",
    )!;
    expect(validate(runtime), JSON.stringify(validate.errors)).toBe(true);
    for (const field of ["textKey", "speakerId", "choices", "advancePolicy"]) {
      empty[field] = "not allowed";
      expect(validate(runtime)).toBe(false);
      delete empty[field];
    }
    delete empty.next;
    expect(validate(runtime)).toBe(false);
  }
});

test("chunked runtime schemas accept index, dialogue, and locale files", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(readJson("schemas/runtime.schema.json"));
  const validateIndex = ajv.compile(
    readJson("schemas/runtime-index.schema.json"),
  );
  const validateDialogue = ajv.compile(
    readJson("schemas/runtime-dialogue-chunk.schema.json"),
  );
  const validateLocale = ajv.compile(
    readJson("schemas/runtime-locale-chunk.schema.json"),
  );
  const dialogueId = "2fd88ddc-aa3b-466f-92a2-48785adce71e";
  const startId = "3f0e9d88-5ec4-4cf5-9a83-9ad4ee9f7451";
  const endId = "b4aa0f79-bd0e-45cd-8a6e-094e6f50ccfd";

  expect(
    validateIndex({
      schemaVersion: 1,
      defaultLocale: "zh-CN",
      locales: ["zh-CN"],
      resources: { characters: {}, variables: {}, events: {} },
      localePaths: { "zh-CN": "locales/zh-CN/global.json" },
      dialogues: {
        [dialogueId]: {
          key: "intro",
          structurePath: "dialogues/chapter-1/runtime.json",
          localePaths: {
            "zh-CN": "locales/zh-CN/dialogues/chapter-1/runtime.json",
          },
        },
      },
    }),
    JSON.stringify(validateIndex.errors),
  ).toBe(true);
  expect(
    validateDialogue({
      schemaVersion: 1,
      dialogues: {
        [dialogueId]: {
          key: "intro",
          entryNodeId: startId,
          nodes: {
            [startId]: { key: "start", type: "start", next: endId },
            [endId]: { key: "end", type: "end", tags: ["chapter-end"] },
          },
        },
      },
    }),
    JSON.stringify(validateDialogue.errors),
  ).toBe(true);
  expect(
    validateLocale({
      schemaVersion: 1,
      locale: "zh-CN",
      texts: { [`dialogue.${dialogueId}.${startId}.text`]: "正文" },
    }),
    JSON.stringify(validateLocale.errors),
  ).toBe(true);
});

test("project schema accepts optional character groups and rejects malformed groups", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(readJson("schemas/project.schema.json"));
  const project = readJson("fixtures/minimal-project/.siming/project.json");
  project.characterGroups = [
    { id: "2fd88ddc-aa3b-466f-92a2-48785adce71e", name: "主角" },
  ];
  expect(validate(project)).toBe(true);
  project.characterGroups[0].name = "   ";
  expect(validate(project)).toBe(false);
});

test("project schema accepts variable groups and rejects malformed groups", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(readJson("schemas/project.schema.json"));
  const project = readJson("fixtures/minimal-project/.siming/project.json");
  project.variableGroups = [
    { id: "2fd88ddc-aa3b-466f-92a2-48785adce71e", name: "剧情状态" },
  ];
  expect(validate(project)).toBe(true);
  project.variableGroups[0].name = "   ";
  expect(validate(project)).toBe(false);
});

test("v2 body schema accepts supported runs and rejects unknown versions or styles", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(readJson("schemas/dialogue.schema.json"));
  const dialogue = readJson("fixtures/minimal-project/dialogues/intro.json");
  dialogue.schemaVersion = 2;
  const node = dialogue.nodes.find(
    (node: { type: string }) => node.type === "dialogue",
  );
  const rich = {
    version: 1,
    runs: [
      { text: "中文\n", style: { bold: true, italic: true, color: "#123ABC" } },
    ],
  };
  node.data.text = { "zh-CN": rich };
  expect(validate(dialogue)).toBe(true);
  dialogue.schemaVersion = 1;
  expect(validate(dialogue)).toBe(false);
  dialogue.schemaVersion = 2;
  for (const value of [
    { ...rich, version: 99 },
    { version: 1, runs: [{ text: "x", style: { color: "red" } }] },
    { version: 1, runs: [{ text: "x", style: { bold: null } }] },
    { version: 1, runs: [{ text: "x", style: { font: "html" } }] },
  ]) {
    node.data.text = { "zh-CN": value };
    expect(validate(dialogue)).toBe(false);
  }
});
