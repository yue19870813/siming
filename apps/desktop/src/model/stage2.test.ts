import { expect, test } from "vitest";
import {
  conditionUsesVariable,
  formatCondition,
  renameConditionVariable,
} from "./conditions";
import { createDemoProject } from "./demo";
import { dialogueHasMissingTranslation, translationCompletion } from "./i18n";
import type { ConditionExpression } from "./types";

test("formats and renames variables in recursive conditions", () => {
  const expression: ConditionExpression = {
    all: [
      { variable: "favor", operator: ">=", value: 10 },
      {
        not: { variable: "blocked", operator: "==", value: true },
      },
    ],
  };
  expect(formatCondition(expression)).toContain("favor >= 10");
  expect(conditionUsesVariable(expression, "blocked")).toBe(true);
  renameConditionVariable(expression, "favor", "trust");
  expect(formatCondition(expression)).toContain("trust >= 10");
});

test("translation completion includes node text, choices, and characters", () => {
  const project = createDemoProject();
  expect(translationCompletion(project, "en-US")).toBe(100);
  project.dialogues[0].nodes.find(
    (node) => node.type === "choice",
  )!.data.choices![0].text["en-US"] = "";
  project.resources.characters[0].name["en-US"] = "";
  expect(translationCompletion(project, "en-US")).toBeLessThan(100);
  expect(
    dialogueHasMissingTranslation(
      project.dialogues[0],
      project.manifest.locales,
    ),
  ).toBe(true);
});
