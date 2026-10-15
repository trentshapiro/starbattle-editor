import type { Mode } from "./types";

const BUTTONS = {
  lmb: { label: "Left click", path: "M7 1A6 6 0 0 0 1 7v1h6z" },
  rmb: { label: "Right click", path: "M7 1a6 6 0 0 1 6 6v1H7z" },
};

type Button = keyof typeof BUTTONS;
type Token = Button | "mod" | "shift" | "Z";

const SVG = "http://www.w3.org/2000/svg";

function mouse(button: Button): Element {
  const { label, path } = BUTTONS[button];
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 14 20");
  svg.setAttribute("class", "mouse");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  const title = document.createElementNS(SVG, "title");
  title.textContent = label;
  const body = document.createElementNS(SVG, "rect");
  Object.entries({ x: 1, y: 1, width: 12, height: 18, rx: 6 }).forEach(([k, v]) => body.setAttribute(k, String(v)));
  const divider = document.createElementNS(SVG, "path");
  divider.setAttribute("d", "M7 1v7M1 8h12");
  const pressed = document.createElementNS(SVG, "path");
  pressed.setAttribute("d", path);
  pressed.setAttribute("class", "pressed");
  svg.append(title, body, divider, pressed);
  return svg;
}

function key(text: string, label: string): HTMLElement {
  const kbd = document.createElement("kbd");
  kbd.textContent = text;
  kbd.title = label;
  return kbd;
}

const HELP: Record<Mode, [Token[], string][]> = {
  edit: [
    [["lmb"], "Drag to draw a new region. Start on a region to extend it."],
    [["rmb"], "Drag to erase regions."],
    [["mod", "lmb"], "Change a region's color."],
    [["mod", "rmb"], "Remove a whole region."],
    [["shift", "lmb"], "Lock a region so Find unique keeps it."],
  ],
  solve: [
    [["lmb"], "Place or remove a star."],
    [["rmb"], "Click or drag to place or remove X marks."],
  ],
};

const SHORTCUTS: [Token[], string][] = [
  [["mod", "Z"], "Undo"],
  [["shift", "mod", "Z"], "Redo"],
];

export function helpItems(mode: Mode, isMac: boolean): HTMLElement[] {
  const token = (t: Token): Element => {
    if (t === "lmb" || t === "rmb") return mouse(t);
    if (t === "mod") return isMac ? key("⌘", "Command") : key("Ctrl", "Control");
    if (t === "shift") return key("⇧", "Shift");
    return key(t, t);
  };
  return [...HELP[mode], ...SHORTCUTS].map(([tokens, text]) => {
    const item = document.createElement("li");
    const gesture = document.createElement("span");
    gesture.className = "gesture";
    gesture.append(...tokens.map(token));
    const description = document.createElement("span");
    description.textContent = text;
    item.append(gesture, description);
    return item;
  });
}
