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
