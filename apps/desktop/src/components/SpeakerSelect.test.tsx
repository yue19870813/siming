import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, test } from "vitest";
import { SpeakerSelect } from "./SpeakerSelect";
import { speakerSelectionCounts } from "./speakerSelectionCounts";

beforeEach(() => speakerSelectionCounts.clear());

const characters = [
  {
    id: "1",
    key: "hero.dur",
    name: { "zh-CN": "杜尔", "en-US": "Dur" },
    color: "",
    description: "",
    tags: [],
  },
  {
    id: "2",
    key: "guard.north",
    name: { "zh-CN": "北门守卫", "en-US": "Guard" },
    color: "",
    description: "",
    tags: [],
  },
];
function Harness() {
  const [value, setValue] = useState("hero.dur");
  return (
    <>
      <SpeakerSelect
        characters={characters}
        locale="zh-CN"
        value={value}
        onChange={setValue}
      />
      <span data-testid="value">{value}</span>
      <button>外部</button>
    </>
  );
}

test("filters names and keys case insensitively, selects existing keys only", () => {
  render(<Harness />);
  const input = screen.getByRole("combobox", { name: "说话人" });
  expect(input).toHaveValue("杜尔 · hero.dur");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "守卫" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option")).toHaveTextContent("guard.north");
  fireEvent.change(input, { target: { value: " GUARD.N " } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.getByTestId("value")).toHaveTextContent("guard.north");
  expect(input).toHaveValue("北门守卫 · guard.north");
  fireEvent.click(input);
  fireEvent.change(input, { target: { value: "missing" } });
  expect(screen.getByRole("status")).toHaveTextContent("没有匹配的角色");
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.blur(input, { relatedTarget: screen.getByRole("button") });
  expect(input).toHaveValue("北门守卫 · guard.north");
});

test("supports localized names, escape cancellation, keyboard navigation and narrator", () => {
  render(<Harness />);
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Dur" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveValue("杜尔 · hero.dur");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toHaveValue("北门守卫 · guard.north");
  fireEvent.click(input);
  fireEvent.click(screen.getByRole("option", { name: "旁白" }));
  expect(screen.getByTestId("value")).toBeEmptyDOMElement();
  expect(input).toHaveValue("旁白");
});

test("ranks frequently selected characters first while keeping narrator and stable ties", () => {
  const { unmount } = render(<Harness />);
  const input = screen.getByRole("combobox");
  const optionKeys = () =>
    screen.getAllByRole("option").map((option) => option.textContent);

  fireEvent.focus(input);
  expect(optionKeys()).toEqual(["旁白", "杜尔hero.dur", "北门守卫guard.north"]);
  fireEvent.click(screen.getByRole("option", { name: /北门守卫/ }));
  fireEvent.click(input);
  expect(optionKeys()).toEqual(["旁白", "北门守卫guard.north", "杜尔hero.dur"]);
  fireEvent.click(screen.getByRole("option", { name: /杜尔/ }));
  fireEvent.click(input);
  expect(optionKeys()).toEqual(["旁白", "杜尔hero.dur", "北门守卫guard.north"]);
  fireEvent.click(screen.getByRole("option", { name: /北门守卫/ }));
  fireEvent.click(input);
  expect(optionKeys()).toEqual(["旁白", "北门守卫guard.north", "杜尔hero.dur"]);
  unmount();

  render(<Harness />);
  fireEvent.focus(screen.getByRole("combobox"));
  expect(optionKeys()).toEqual(["旁白", "北门守卫guard.north", "杜尔hero.dur"]);
  speakerSelectionCounts.clear();
  fireEvent.blur(screen.getByRole("combobox"));
  fireEvent.focus(screen.getByRole("combobox"));
  expect(optionKeys()).toEqual(["旁白", "杜尔hero.dur", "北门守卫guard.north"]);
});
