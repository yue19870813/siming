import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  confirmDiscardHostDraft,
  registerHostDraft,
} from "../lib/hostDraftGuard";
import { createId } from "../model/demo";
import type { DialogueDocument, DialogueNode, HostEvent } from "../model/types";

type Row = { id: string; event: HostEvent; text: string; invalid: boolean };
const toRows = (events: HostEvent[]): Row[] =>
  events.map((event) => ({
    id: createId(),
    event,
    text: JSON.stringify(event.payload, null, 2),
    invalid: false,
  }));
export function HostEventsEditor({
  events,
  update,
}: {
  events: HostEvent[];
  update: (
    recipe: (node: DialogueNode, dialogue: DialogueDocument) => void,
    label?: string,
  ) => void;
}) {
  const [rows, setRows] = useState(() => toRows(events));
  const liveRows = useRef(rows);
  const published = useRef(JSON.stringify(events));
  const signature = JSON.stringify(events);
  useLayoutEffect(() => {
    liveRows.current = rows;
  }, [rows]);
  useEffect(
    () =>
      registerHostDraft({
        dirty: () => liveRows.current.some((row) => row.invalid),
        discard: () => {
          const next = liveRows.current.map((row) =>
            row.invalid
              ? {
                  ...row,
                  text: JSON.stringify(row.event.payload, null, 2),
                  invalid: false,
                }
              : row,
          );
          liveRows.current = next;
          setRows(next);
        },
      }),
    [],
  );
  useEffect(() => {
    if (signature !== published.current) {
      published.current = signature;
      const next = toRows(JSON.parse(signature) as HostEvent[]);
      liveRows.current = next;
      setRows(next);
    }
  }, [signature]);
  const change = (next: Row[], persist = true) => {
    liveRows.current = next;
    setRows(next);
    if (persist) {
      const value = next.map((row) => row.event);
      published.current = JSON.stringify(value);
      update((draft) => {
        draft.data.hostEvents = value;
      }, "修改宿主消息");
    }
  };
  return (
    <section className="inspector-section">
      <header>
        <strong>宿主消息</strong>
        <button
          onClick={() =>
            change([
              ...liveRows.current,
              ...toRows([{ name: "ui.custom", payload: {} }]),
            ])
          }
        >
          <Plus size={13} /> 新增
        </button>
      </header>
      {!rows.length && <p className="section-empty">当前节点没有宿主消息。</p>}
      {rows.map((row, index) => (
        <div className="host-event-card" key={row.id}>
          <header>
            <strong>#{index + 1}</strong>
            <span>HOST</span>
            {([-1, 1] as const).map((direction) => (
              <button
                key={direction}
                aria-label={direction === -1 ? "上移消息" : "下移消息"}
                disabled={
                  index + direction < 0 || index + direction >= rows.length
                }
                onClick={() => {
                  const next = [...liveRows.current];
                  [next[index], next[index + direction]] = [
                    next[index + direction],
                    next[index],
                  ];
                  change(next);
                }}
              >
                {direction === -1 ? (
                  <ArrowUp size={12} />
                ) : (
                  <ArrowDown size={12} />
                )}
              </button>
            ))}
            <button
              aria-label="删除消息"
              onClick={() => {
                if (row.invalid && !confirmDiscardHostDraft()) return;
                change(liveRows.current.filter((item) => item.id !== row.id));
              }}
            >
              <Trash2 size={12} />
            </button>
          </header>
          <input
            aria-label={`消息名称 ${index + 1}`}
            value={row.event.name}
            onChange={(event) =>
              change(
                liveRows.current.map((item) =>
                  item.id === row.id
                    ? {
                        ...item,
                        event: { ...item.event, name: event.target.value },
                      }
                    : item,
                ),
              )
            }
          />
          <textarea
            aria-label={`消息体 ${index + 1}`}
            aria-invalid={row.invalid}
            aria-describedby={row.invalid ? `host-error-${row.id}` : undefined}
            rows={4}
            value={row.text}
            onChange={(event) => {
              const text = event.target.value;
              let payload: Record<string, unknown> | undefined;
              try {
                const value: unknown = JSON.parse(text);
                if (
                  value !== null &&
                  typeof value === "object" &&
                  !Array.isArray(value)
                )
                  payload = value as Record<string, unknown>;
              } catch {
                /* Incomplete JSON stays in the editor. */
              }
              change(
                liveRows.current.map((item) =>
                  item.id === row.id
                    ? {
                        ...item,
                        text,
                        invalid: !payload,
                        event: payload
                          ? { ...item.event, payload }
                          : item.event,
                      }
                    : item,
                ),
                Boolean(payload),
              );
            }}
          />
          {row.invalid && (
            <div
              className="form-error"
              role="alert"
              id={`host-error-${row.id}`}
            >
              <p>消息体必须是有效的 JSON 对象。当前输入尚未保存。</p>
              <button
                onClick={() =>
                  change(
                    liveRows.current.map((item) =>
                      item.id === row.id
                        ? {
                            ...item,
                            text: JSON.stringify(item.event.payload, null, 2),
                            invalid: false,
                          }
                        : item,
                    ),
                    false,
                  )
                }
              >
                还原
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
