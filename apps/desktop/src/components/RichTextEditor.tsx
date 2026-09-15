import { useEffect, useId, useRef } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { plainText, type TextContent } from "../model/richText";
import { documentFromText, textFromDocument } from "../model/richTextDocument";
import { useEditorStore } from "../store/editorStore";

const ProjectHistory = Extension.create({
  name: "projectHistory",
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => {
        useEditorStore.getState().undo();
        return true;
      },
      "Mod-Shift-z": () => {
        useEditorStore.getState().redo();
        return true;
      },
      "Mod-y": () => {
        useEditorStore.getState().redo();
        return true;
      },
    };
  },
});
export function RichTextEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TextContent;
  onChange: (value: TextContent, typing: boolean) => void;
}) {
  const id = useId();
  const published = useRef(JSON.stringify(value));
  const callback = useRef(onChange);
  callback.current = onChange;
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Bold,
      Italic,
      TextStyle,
      Color,
      ProjectHistory,
    ],
    content: documentFromText(value),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        "data-placeholder": "输入对话内容…",
        class: "dialogue-rich-input",
      },
      handlePaste: (view, event) => {
        const internal = event.clipboardData?.getData(
          "application/x-siming-rich-text",
        );
        if (internal) {
          try {
            const content = JSON.parse(internal) as TextContent;
            const doc = documentFromText(content);
            view.dispatch(
              view.state.tr
                .replaceWith(
                  view.state.selection.from,
                  view.state.selection.to,
                  view.state.schema.nodeFromJSON(doc).firstChild!.content,
                )
                .setMeta("uiEvent", "paste"),
            );
            return true;
          } catch {
            /* fall back to plain text */
          }
        }
        const text = event.clipboardData?.getData("text/plain");
        if (text === undefined) return false;
        const nodes = documentFromText(text).content?.[0].content ?? [];
        const { state } = view;
        const fragment = state.schema.nodeFromJSON({
          type: "paragraph",
          content: nodes,
        }).content;
        view.dispatch(
          state.tr
            .replaceWith(state.selection.from, state.selection.to, fragment)
            .setMeta("uiEvent", "paste"),
        );
        return true;
      },
      handleDOMEvents: {
        copy: (view, event) => {
          if (!event.clipboardData || view.state.selection.empty) return false;
          const fragment = view.state.selection.content().content.toJSON();
          const content = textFromDocument({ type: "doc", content: fragment });
          event.clipboardData.setData("text/plain", plainText(content));
          event.clipboardData.setData(
            "application/x-siming-rich-text",
            JSON.stringify(content),
          );
          event.preventDefault();
          return true;
        },
      },
    },
    onFocus: ({ editor }) => {
      if (plainText(textFromDocument(editor.getJSON())) === "输入对话内容…")
        editor.commands.clearContent();
    },
    onUpdate: ({ editor, transaction }) => {
      const next = textFromDocument(editor.getJSON());
      published.current = JSON.stringify(next);
      const typing =
        transaction.steps.every(
          (step) => step.toJSON().stepType === "replace",
        ) && transaction.getMeta("uiEvent") !== "paste";
      callback.current(next, typing);
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      color: editor?.getAttributes("textStyle").color ?? "#806CF5",
    }),
  });
  useEffect(() => {
    if (!editor) return;
    const signature = JSON.stringify(value);
    if (signature !== published.current) {
      published.current = signature;
      editor.commands.setContent(documentFromText(value), {
        emitUpdate: false,
      });
    }
  }, [editor, value]);
  if (!editor) return null;
  return (
    <div className="inspector-field rich-text-editor">
      <span id={id}>{label}</span>
      <div className="rich-text-toolbar" role="toolbar" aria-label="正文格式">
        <button
          type="button"
          aria-label="加粗"
          aria-pressed={state?.bold}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          aria-label="斜体"
          aria-pressed={state?.italic}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <label title="文字颜色">
          A
          <input
            aria-label="文字颜色"
            type="color"
            value={state?.color}
            onInput={(event) =>
              editor.chain().focus().setColor(event.currentTarget.value).run()
            }
          />
        </label>
        <button
          type="button"
          aria-label="清除格式"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
        >
          清除格式
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
