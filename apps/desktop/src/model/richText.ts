export type TextStyle = { bold?: boolean; italic?: boolean; color?: string };
export type TextRun = { text: string; style?: TextStyle };
export type RichText = { version: 1; runs: TextRun[] };
export type TextContent = string | RichText;
export type LocalizedBody = Record<string, TextContent>;
export function plainText(value: TextContent | undefined): string {
  return typeof value === "string"
    ? value
    : (value?.runs.map((run) => run.text).join("") ?? "");
}
export function textRuns(value: TextContent): TextRun[] {
  return typeof value === "string" ? [{ text: value }] : value.runs;
}
export function normalizeText(runs: TextRun[]): TextContent {
  const result: TextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const style: TextStyle = {};
    if (run.style?.bold) style.bold = true;
    if (run.style?.italic) style.italic = true;
    if (run.style?.color && /^#[0-9a-f]{6}$/i.test(run.style.color))
      style.color = run.style.color.toUpperCase();
    const previous = result.at(-1);
    if (
      previous &&
      JSON.stringify(previous.style ?? {}) === JSON.stringify(style)
    )
      previous.text += run.text;
    else
      result.push({
        text: run.text,
        ...(Object.keys(style).length ? { style } : {}),
      });
  }
  return result.some((run) => run.style)
    ? { version: 1, runs: result }
    : result.map((run) => run.text).join("");
}

export function resolveBody(
  text: LocalizedBody | undefined,
  locale: string,
  defaultLocale: string,
): TextContent | undefined {
  if (plainText(text?.[locale]).trim()) return text?.[locale];
  if (plainText(text?.[defaultLocale]).trim()) return text?.[defaultLocale];
  return undefined;
}
