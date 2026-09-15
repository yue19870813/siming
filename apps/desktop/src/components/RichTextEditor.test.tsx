import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { RichTextEditor } from "./RichTextEditor";
import { plainText } from "../model/richText";

test("formatting preserves editor identity, normalizes colors and clears to plain text", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <RichTextEditor label="body" value={"中文\ntext"} onChange={onChange} />,
  );
  const input = screen.getByRole("textbox", { name: "body" });
  const editor = (input as HTMLElement & { editor: Editor }).editor;
  act(() => {
    editor.commands.selectAll();
    editor.commands.toggleBold();
  });
  const rich = onChange.mock.lastCall![0];
  expect(rich.runs[0].style.bold).toBe(true);
  rerender(<RichTextEditor label="body" value={rich} onChange={onChange} />);
  expect(screen.getByRole("textbox", { name: "body" })).toBe(input);
  fireEvent.input(screen.getByLabelText("文字颜色"), {
    target: { value: "#abcdef" },
  });
  expect(onChange.mock.lastCall![0].runs[0].style.color).toBe("#ABCDEF");
  act(() => {
    editor.commands.unsetAllMarks();
  });
  expect(onChange.mock.lastCall![0]).toBe("中文\ntext");
});
test("external HTML pastes as plain text; internal clipboard retains supported styles", () => {
  const onChange = vi.fn();
  render(<RichTextEditor label="body" value="" onChange={onChange} />);
  const input = screen.getByRole("textbox", { name: "body" });
  fireEvent.paste(input, {
    clipboardData: {
      getData: (type: string) =>
        type === "text/plain" ? "<b>文字</b>\nline" : "",
    },
  });
  expect(onChange.mock.lastCall![0]).toBe("<b>文字</b>\nline");
  const editor = (input as HTMLElement & { editor: Editor }).editor;
  act(() => editor.commands.selectAll());
  fireEvent.paste(input, {
    clipboardData: {
      getData: (type: string) =>
        type === "application/x-siming-rich-text"
          ? JSON.stringify({
              version: 1,
              runs: [{ text: "内部", style: { italic: true } }],
            })
          : "",
    },
  });
  expect(onChange.mock.lastCall![0]).toEqual({
    version: 1,
    runs: [{ text: "内部", style: { italic: true } }],
  });
  expect(plainText(onChange.mock.lastCall![0])).toBe("内部");
});
