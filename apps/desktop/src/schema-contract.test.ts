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
          [startId]: { key: "start", type: "start", next: endId },
          [endId]: { key: "end", type: "end" },
        },
      },
    },
  };

  expect(validate(runtime), JSON.stringify(validate.errors)).toBe(true);
  expect(JSON.stringify(runtime)).not.toContain("position");
});
