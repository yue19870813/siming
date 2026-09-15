import { textRuns, type TextContent } from "../model/richText";
export function RichTextView({ value }: { value: TextContent }) {
  return (
    <span className="rich-text-view">
      {textRuns(value).map((run, index) => (
        <span
          key={index}
          style={{
            fontWeight: run.style?.bold ? 700 : undefined,
            fontStyle: run.style?.italic ? "italic" : undefined,
            color:
              run.style?.color && /^#[0-9a-f]{6}$/i.test(run.style.color)
                ? run.style.color
                : undefined,
          }}
        >
          {run.text}
        </span>
      ))}
    </span>
  );
}
