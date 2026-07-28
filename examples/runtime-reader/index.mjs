import { readFile } from "node:fs/promises";
import { join } from "node:path";

const [root = "exports/runtime", dialogueKey, localeName] =
  process.argv.slice(2);
const chunked = await readJsonIfExists(join(root, "project.runtime.json"));
const bundled = chunked
  ? null
  : JSON.parse(await readFile(join(root, "dialogues.runtime.json"), "utf8"));
const project = chunked ?? bundled;
const locale = localeName ?? project.defaultLocale;
const dialogueEntry = Object.entries(project.dialogues).find(
  ([, item]) => item.key === dialogueKey,
);

if (!dialogueEntry) {
  throw new Error(`Dialogue key not found: ${dialogueKey}`);
}

const [dialogueId, dialogueIndex] = dialogueEntry;
let dialogue;
let texts;
if (chunked) {
  const structure = JSON.parse(
    await readFile(join(root, dialogueIndex.structurePath), "utf8"),
  );
  dialogue = structure.dialogues[dialogueId];
  if (!dialogue) {
    throw new Error(
      `Dialogue ${dialogueId} is missing from its structure chunk`,
    );
  }
  const globalPath = project.localePaths[locale];
  const dialogueLocalePath = dialogueIndex.localePaths[locale];
  const globalTexts = globalPath
    ? JSON.parse(await readFile(join(root, globalPath), "utf8")).texts
    : {};
  const dialogueTexts = dialogueLocalePath
    ? JSON.parse(await readFile(join(root, dialogueLocalePath), "utf8")).texts
    : {};
  texts = { ...globalTexts, ...dialogueTexts };
} else {
  dialogue = dialogueIndex;
  texts = JSON.parse(
    await readFile(join(root, "locales", `${locale}.json`), "utf8"),
  ).texts;
}

const variables = Object.fromEntries(
  Object.values(project.resources.variables).map((item) => [
    item.key,
    item.defaultValue,
  ]),
);
let nodeId = dialogue.entryNodeId;

while (nodeId) {
  const node = dialogue.nodes[nodeId];
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  for (const message of node.hostEvents ?? []) {
    console.log("HOST", message.name, message.payload);
  }

  switch (node.type) {
    case "start":
      nodeId = node.next;
      break;
    case "dialogue":
      console.log(
        node.speakerId ?? "narrator",
        texts[node.textKey] ?? `[missing:${node.textKey}]`,
      );
      nodeId = node.next;
      break;
    case "choice": {
      node.choices.forEach((choice, index) =>
        console.log(`${index + 1}.`, texts[choice.textKey]),
      );
      const selected = node.choices[0];
      console.log("AUTO SELECT", selected.id);
      nodeId = selected.next;
      break;
    }
    case "condition":
      nodeId = evaluate(node.condition, variables)
        ? node.branches.true
        : node.branches.false;
      break;
    case "event":
      console.log("EVENT", node.event, node.params);
      nodeId = node.next;
      break;
    case "end":
      console.log("END", node.key);
      nodeId = null;
      break;
    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function evaluate(expression, context) {
  if ("all" in expression)
    return expression.all.every((item) => evaluate(item, context));
  if ("any" in expression)
    return expression.any.some((item) => evaluate(item, context));
  if ("not" in expression) return !evaluate(expression.not, context);

  const left = context[expression.variable];
  const right = expression.value;
  if (typeof left !== typeof right)
    throw new Error(`Condition type mismatch: ${expression.variable}`);

  switch (expression.operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    default:
      throw new Error(`Unsupported operator: ${expression.operator}`);
  }
}
