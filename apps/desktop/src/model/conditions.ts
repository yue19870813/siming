import type { ConditionExpression, VariableDefinition } from "./types";

export function createConditionLeaf(
  variable?: VariableDefinition,
): ConditionExpression {
  if (!variable) return { variable: "", operator: "==", value: true };
  return {
    variable: variable.key,
    operator: "==",
    value: variable.defaultValue,
  };
}

export function formatCondition(expression?: ConditionExpression): string {
  if (!expression) return "条件未配置";
  if ("variable" in expression) {
    const value =
      typeof expression.value === "string"
        ? JSON.stringify(expression.value)
        : String(expression.value);
    return `${expression.variable || "variable"} ${expression.operator} ${value}`;
  }
  if ("all" in expression) {
    return `(${expression.all.map(formatCondition).join(" AND ")})`;
  }
  if ("any" in expression) {
    return `(${expression.any.map(formatCondition).join(" OR ")})`;
  }
  return `NOT ${formatCondition(expression.not)}`;
}

export function conditionUsesVariable(
  expression: ConditionExpression | undefined,
  key: string,
): boolean {
  if (!expression) return false;
  if ("variable" in expression) return expression.variable === key;
  if ("all" in expression)
    return expression.all.some((item) => conditionUsesVariable(item, key));
  if ("any" in expression)
    return expression.any.some((item) => conditionUsesVariable(item, key));
  return conditionUsesVariable(expression.not, key);
}

export function renameConditionVariable(
  expression: ConditionExpression | undefined,
  previousKey: string,
  nextKey: string,
) {
  if (!expression) return;
  if ("variable" in expression) {
    if (expression.variable === previousKey) expression.variable = nextKey;
    return;
  }
  if ("all" in expression) {
    expression.all.forEach((item) =>
      renameConditionVariable(item, previousKey, nextKey),
    );
    return;
  }
  if ("any" in expression) {
    expression.any.forEach((item) =>
      renameConditionVariable(item, previousKey, nextKey),
    );
    return;
  }
  renameConditionVariable(expression.not, previousKey, nextKey);
}
