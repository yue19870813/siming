import { useEffect, useId, useRef, useState } from "react";
import type { CharacterDefinition } from "../model/types";

export function SpeakerSelect({
  characters,
  locale,
  value,
  onChange,
}: {
  characters: CharacterDefinition[];
  locale: string;
  value: string;
  onChange: (key: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const options = [
    { id: "narrator", key: "", name: "旁白", search: "旁白 narrator" },
    ...characters.map((character) => ({
      id: character.id,
      key: character.key,
      name:
        character.name[locale] ||
        Object.values(character.name).find(Boolean) ||
        character.key,
      search: `${Object.values(character.name).join(" ")} ${character.key}`,
    })),
  ];
  const selected = options.find((option) => option.key === value);
  const filtered = options.filter((option) =>
    option.search
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const activeIndex = Math.min(active, filtered.length - 1);
  useEffect(() => {
    if (open)
      list.current?.children[activeIndex]?.scrollIntoView?.({
        block: "nearest",
      });
  }, [activeIndex, open, query]);
  const choose = (key: string) => {
    onChange(key);
    input.current?.focus();
    setOpen(false);
    setQuery("");
  };
  return (
    <div
      className="inspector-field speaker-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <label htmlFor={id}>说话人</label>
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={
          open && activeIndex >= 0
            ? `${id}-option-${filtered[activeIndex].id}`
            : undefined
        }
        autoComplete="off"
        placeholder="搜索角色显示名称或 Key…"
        value={
          open
            ? query
            : selected
              ? selected.key
                ? `${selected.name} · ${selected.key}`
                : selected.name
              : value
        }
        onFocus={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onClick={() => {
          if (!open) {
            setQuery("");
            setActive(0);
            setOpen(true);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setQuery("");
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              setQuery("");
              setActive(0);
            } else
              setActive(
                Math.max(
                  0,
                  Math.min(
                    filtered.length - 1,
                    activeIndex + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            if (filtered[activeIndex]) choose(filtered[activeIndex].key);
          }
        }}
      />
      {open && (
        <div className="speaker-select-popup">
          <div
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label="说话人搜索结果"
          >
            {filtered.map((option, index) => (
              <div
                key={option.id}
                id={`${id}-option-${option.id}`}
                role="option"
                aria-selected={option.key === value}
                className={`speaker-select-option ${index === activeIndex ? "is-active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.key)}
                onMouseEnter={() => setActive(index)}
              >
                <span>{option.name}</span>
                {option.key && <small>{option.key}</small>}
              </div>
            ))}
          </div>
          {!filtered.length && <p role="status">没有匹配的角色</p>}
        </div>
      )}
    </div>
  );
}
