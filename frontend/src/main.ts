import "./style.css";
import { Board, drawGrid } from "./board";
import { checkPuzzle } from "./check";
import { PALETTE, regionColor, unusedColor } from "./colors";
import { History } from "./history";
import { loadState, parsePuzzleHash, puzzleHash, saveState } from "./io";
import type { ReshapeInput, ReshapeMessage, ReshapeProgress, ReshapeResult } from "./reshape";
import {
  autoMarks,
  type HorizontalEdge,
  isSolved,
  nextRegionId,
  regionGroups,
  resizeGrid,
  type VerticalEdge,
  violations,
} from "./rules";
import type { CheckResult, CheckStatus } from "./solver";
import {
  blankPuzzle,
  type Cell,
  isBlank,
  makeGrid,
  type Mark,
  MAX_SIZE,
  MIN_SIZE,
  type Mode,
  type Puzzle,
  type StarCount,
} from "./types";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  modeEdit: $<HTMLButtonElement>("mode-edit"),
  modeSolve: $<HTMLButtonElement>("mode-solve"),
  size: $<HTMLSelectElement>("size"),
  stars: $<HTMLSelectElement>("stars"),
  autoMark: $<HTMLInputElement>("auto-mark"),
  undo: $<HTMLButtonElement>("undo"),
  redo: $<HTMLButtonElement>("redo"),
  clearMarks: $<HTMLButtonElement>("clear-marks"),
  clearRegions: $<HTMLButtonElement>("clear-regions"),
  share: $<HTMLButtonElement>("share"),
  check: $<HTMLButtonElement>("check"),
  reshape: $<HTMLButtonElement>("reshape"),
  toolbar: $("toolbar"),
  hint: $("hint"),
  status: $("status"),
  results: $("results"),
  resizeDialog: $<HTMLDialogElement>("resize-dialog"),
  resizeText: $("resize-text"),
  resizeV: $<HTMLSelectElement>("resize-v"),
  resizeH: $<HTMLSelectElement>("resize-h"),
  picker: $("color-picker"),
};

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD_KEY = IS_MAC ? "Cmd" : "Ctrl";

const HINTS: Record<Mode, string> = {
  edit:
    "Left-drag draws a new region. Start the drag on a region to extend it. Right-drag erases regions. " +
    `${MOD_KEY}+click changes a region's color. ${MOD_KEY}+right-click removes a whole region. ` +
    "Shift+click locks a region so Find unique does not change it.",
  solve: "Left-click places or removes a star. Right-click or right-drag places or removes X marks.",
};

const SUMMARY: Record<CheckStatus, { title: string; detail: string; tone: string }> = {
  invalid: { title: "Regions need fixes", detail: "Fix these issues before the solver can run.", tone: "warn" },
  none: { title: "Over-constrained", detail: "The puzzle has no solution.", tone: "bad" },
  unique: { title: "Unique solution", detail: "The puzzle has exactly one solution.", tone: "good" },
  multiple: {
    title: "Under-constrained",
    detail: "The puzzle has more than one solution. Two are shown. Highlighted cells are different.",
    tone: "warn",
  },
  timeout: { title: "Solver timed out", detail: "The solver did not finish in time.", tone: "warn" },
};

const SEARCH_LIMIT_MS = 60_000;

type Stroke = { kind: "region"; region: number | null } | { kind: "x"; erase: boolean };

const saved = loadState();
let puzzle = saved.puzzle ?? blankPuzzle(10, 2);
let mode: Mode = saved.mode ?? "edit";
let autoMark = saved.autoMark ?? true;
let check: CheckResult | null = null;
let failure: { title: string; detail: string } | null = null;
let checking = false;
let search: { worker: Worker; timer: ReturnType<typeof setTimeout>; progress: ReshapeProgress | null } | null = null;
let pendingSize: number | null = null;
let snapshot: Puzzle | null = null;
let stroke: Stroke | null = null;
const history = new History<Puzzle>();

const key = ([r, c]: Cell) => `${r},${c}`;
const structureKey = (p: Puzzle) => JSON.stringify([p.size, p.stars, p.regions]);

function clearCheck() {
  check = null;
  failure = null;
}

function begin() {
  snapshot = structuredClone(puzzle);
}

function commit() {
  if (snapshot && JSON.stringify(snapshot) !== JSON.stringify(puzzle)) {
    history.record(snapshot);
    if (structureKey(snapshot) !== structureKey(puzzle)) clearCheck();
  }
  snapshot = null;
  render();
}

function change(apply: () => void) {
  begin();
  apply();
  commit();
}

function restore(next: Puzzle | undefined) {
  if (!next) return;
  if (structureKey(next) !== structureKey(puzzle)) clearCheck();
  puzzle = next;
  render();
}

const undo = () => restore(history.undo(puzzle));
const redo = () => restore(history.redo(puzzle));

const board = new Board($("board"), {
  start([r, c], { button, metaKey, ctrlKey, shiftKey, clientX, clientY }) {
    if (search) return;
    begin();
    const target = puzzle.regions[r][c];
    if (mode === "edit" && shiftKey) {
      if (target !== null && button === 0) {
        const locked = puzzle.locked.includes(target);
        puzzle.locked = locked ? puzzle.locked.filter((id) => id !== target) : [...puzzle.locked, target];
      }
    } else if (mode === "edit" && (IS_MAC ? metaKey : ctrlKey)) {
      if (target !== null && button === 0) openPicker(target, clientX, clientY);
      if (target !== null && button === 2) {
        puzzle.regions = puzzle.regions.map((row) => row.map((id) => (id === target ? null : id)));
        puzzle.locked = puzzle.locked.filter((id) => id !== target);
      }
    } else if (mode === "edit") {
      let region = target;
      if (button === 2) region = null;
      else if (region === null) {
        region = nextRegionId(puzzle.regions);
        puzzle.colors[region] = unusedColor(puzzle.regions, puzzle.colors);
        puzzle.locked = puzzle.locked.filter((id) => id !== region);
      }
      stroke = { kind: "region", region };
      puzzle.regions[r][c] = region;
    } else if (button === 0) {
      puzzle.marks[r][c] = puzzle.marks[r][c] === "star" ? "" : "star";
    } else {
      const erase = puzzle.marks[r][c] === "x";
      stroke = { kind: "x", erase };
      puzzle.marks[r][c] = erase ? "" : "x";
    }
    render();
  },
  move([r, c]) {
    if (stroke?.kind === "region") {
      puzzle.regions[r][c] = stroke.region;
    } else if (stroke?.kind === "x") {
      const mark = puzzle.marks[r][c];
      if (stroke.erase && mark === "x") puzzle.marks[r][c] = "";
      if (!stroke.erase && mark === "") puzzle.marks[r][c] = "x";
    } else {
      return;
    }
    render();
  },
  end() {
    if (search) return;
    stroke = null;
    commit();
  },
});

function glyph(el: HTMLElement, kind: "star" | "x" | "auto-x") {
  el.classList.add(kind);
  el.textContent = kind === "star" ? "★" : "✕";
}

function render() {
  document.body.dataset.mode = mode;
  ui.modeEdit.classList.toggle("active", mode === "edit");
  ui.modeSolve.classList.toggle("active", mode === "solve");
  ui.size.value = String(puzzle.size);
  ui.stars.value = String(puzzle.stars);
  ui.autoMark.checked = autoMark;
  const busy = search !== null;
  for (const control of ui.toolbar.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>(
    "button, select, input",
  )) {
    control.disabled = busy;
  }
  ui.undo.disabled = busy || !history.canUndo;
  ui.redo.disabled = busy || !history.canRedo;
  ui.check.disabled = busy || checking;
  ui.check.textContent = checking ? "Checking..." : "Check constraints";
  ui.reshape.disabled = checking;
  ui.reshape.hidden = mode !== "edit";
  ui.reshape.textContent = busy ? "Stop" : "Find unique";
  ui.hint.textContent = HINTS[mode];

  // While searching, the board previews the best layout so far without changing the puzzle.
  const shown = search?.progress ? { ...puzzle, regions: search.progress.regions } : puzzle;
  const auto = autoMark ? autoMarks(shown) : null;
  const errors = violations(shown, auto);
  const issues = new Set(check?.issues.flatMap((issue) => issue.cells.map(key)) ?? []);
  const locked = new Set(shown.locked);
  drawGrid(board.el, shown.regions, shown.colors, (el, r, c) => {
    if (issues.has(key([r, c]))) el.classList.add("issue");
    if (locked.has(shown.regions[r][c]!)) el.classList.add("locked");
    const mark = puzzle.marks[r][c];
    if (mark === "star") glyph(el, "star");
    else if (mark === "x") glyph(el, "x");
    else if (auto?.[r][c]) glyph(el, "auto-x");
    if (errors[r][c]) el.classList.add("error");
  });

  renderStatus();
  renderResults();
  if (!snapshot) saveState({ puzzle, mode, autoMark });
}

function renderStatus() {
  const { size, stars, regions, marks } = puzzle;
  ui.status.classList.remove("solved");
  if (search) {
    const progress = search.progress;
    const parts = [progress ? `Searching, step ${progress.iterations}` : "Searching"];
    if (progress?.ambiguous === null) parts.push("Giving each region its share of stars");
    else if (progress) parts.push(`${progress.ambiguous} cells can still hold a star in another solution`);
    ui.status.textContent = parts.join(". ");
  } else if (mode === "edit") {
    const unassigned = regions.flat().filter((region) => region === null).length;
    const parts = [`${regionGroups(regions).size} of ${size} regions`];
    if (unassigned) parts.push(`${unassigned} cells without a region`);
    ui.status.textContent = parts.join(", ");
  } else if (isSolved(puzzle)) {
    ui.status.textContent = "Solved!";
    ui.status.classList.add("solved");
  } else {
    const placed = marks.flat().filter((mark) => mark === "star").length;
    ui.status.textContent = `${placed} of ${size * stars} stars placed`;
  }
}

function miniGrid(solution: Cell[], diff: Set<string>): HTMLElement {
  const el = document.createElement("div");
  el.className = "grid mini";
  const stars = new Set(solution.map(key));
  drawGrid(el, puzzle.regions, puzzle.colors, (cell, r, c) => {
    if (stars.has(key([r, c]))) glyph(cell, "star");
    if (diff.has(key([r, c]))) cell.classList.add("diff");
  });
  return el;
}

function renderResults() {
  const el = ui.results;
  el.hidden = !check && !failure;
  if (el.hidden) return;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.title = "Dismiss";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "✕";
  close.addEventListener("click", () => {
    clearCheck();
    render();
  });
  const title = document.createElement("h2");
  const detail = document.createElement("p");
  const children: HTMLElement[] = [close, title, detail];
  if (!check) {
    el.className = "results bad";
    title.textContent = failure?.title ?? "";
    detail.textContent = failure?.detail ?? "";
    el.replaceChildren(...children);
    return;
  }

  const summary = SUMMARY[check.status];
  el.className = `results ${summary.tone}`;
  title.textContent = summary.title;
  detail.textContent = summary.detail;

  if (check.issues.length) {
    const list = document.createElement("ul");
    for (const issue of check.issues) {
      const item = document.createElement("li");
      item.textContent = issue.message;
      list.append(item);
    }
    children.push(list);
  }

  const [a, b] = check.solutions;
  const diff = new Set<string>();
  if (a && b) {
    const sa = new Set(a.map(key));
    const sb = new Set(b.map(key));
    for (const k of sa) if (!sb.has(k)) diff.add(k);
    for (const k of sb) if (!sa.has(k)) diff.add(k);
  }
  const solutions = document.createElement("div");
  solutions.className = "solutions";
  solutions.append(...check.solutions.map((solution) => miniGrid(solution, diff)));
  children.push(solutions);
  el.replaceChildren(...children);
}

async function runCheck() {
  const target = structuredClone(puzzle);
  checking = true;
  clearCheck();
  render();
  try {
    const result = await checkPuzzle(target);
    if (structureKey(target) === structureKey(puzzle)) check = result;
  } catch (e) {
    failure = { title: "Check failed", detail: e instanceof Error ? e.message : String(e) };
  }
  checking = false;
  render();
}

function startSearch() {
  const { size, stars, regions, locked } = puzzle;
  const worker = new Worker(new URL("./reshape.worker.ts", import.meta.url), { type: "module" });
  search = { worker, timer: setTimeout(() => finishSearch(null), SEARCH_LIMIT_MS), progress: null };
  closePicker();
  clearCheck();
  worker.onmessage = (e: MessageEvent<ReshapeMessage>) => {
    if (e.data.type !== "progress") finishSearch(e.data);
    else if (search) {
      search.progress = e.data;
      render();
    }
  };
  worker.onerror = (e) => finishSearch({ type: "error", message: e.message || "The search failed." });
  worker.postMessage({ size, stars, regions, locked } satisfies ReshapeInput);
  render();
}

/** A null outcome means the user stopped the search or it ran out of time. */
function finishSearch(outcome: ReshapeResult | null) {
  if (!search) return;
  const { worker, timer, progress } = search;
  worker.terminate();
  clearTimeout(timer);
  search = null;
  if (outcome?.type === "error") {
    failure = { title: "Find unique failed", detail: outcome.message };
    render();
    return;
  }
  // Layouts that are still balancing stars may have no solution, so they are not kept.
  const regions = outcome ? outcome.regions : progress?.ambiguous !== null ? progress?.regions : undefined;
  if (regions) change(() => (puzzle.regions = regions));
  if (outcome) {
    check = outcome.result;
    render();
  } else if (regions) {
    runCheck();
  }
}

function requestResize(size: number) {
  if (isBlank(puzzle)) {
    change(() => (puzzle = blankPuzzle(size, puzzle.stars)));
    return;
  }
  const delta = size - puzzle.size;
  const count = Math.abs(delta);
  const noun = count === 1 ? "row and 1 column" : `rows and ${count} columns`;
  ui.resizeText.textContent =
    `Change the grid from ${puzzle.size}x${puzzle.size} to ${size}x${size}. ` +
    `Choose where to ${delta > 0 ? "add" : "remove"} ${count} ${noun}.`;
  pendingSize = size;
  ui.resizeDialog.returnValue = "";
  ui.resizeDialog.showModal();
}

ui.resizeDialog.addEventListener("close", () => {
  const size = pendingSize;
  pendingSize = null;
  if (ui.resizeDialog.returnValue !== "apply" || size === null) {
    render();
    return;
  }
  const v = ui.resizeV.value as VerticalEdge;
  const h = ui.resizeH.value as HorizontalEdge;
  change(() => {
    puzzle = {
      ...puzzle,
      size,
      regions: resizeGrid(puzzle.regions, size, null, v, h),
      marks: resizeGrid<Mark>(puzzle.marks, size, "", v, h),
    };
  });
});

function openLink() {
  if (!location.hash) return;
  try {
    const next = parsePuzzleHash(location.hash);
    clearCheck();
    mode = "solve";
    change(() => (puzzle = next));
  } catch (e) {
    alert(`Could not open the puzzle link: ${e instanceof Error ? e.message : e}`);
  }
  window.history.replaceState(null, "", location.pathname + location.search);
}

let shareTimer: ReturnType<typeof setTimeout> | undefined;

async function copyLink() {
  const url = new URL(location.href);
  try {
    url.hash = puzzleHash(puzzle);
  } catch (e) {
    alert(e instanceof Error ? e.message : e);
    return;
  }
  try {
    await navigator.clipboard.writeText(url.href);
  } catch {
    prompt("Copy this link:", url.href);
    return;
  }
  ui.share.textContent = "Link copied";
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => (ui.share.textContent = "Copy link"), 1500);
}

for (let size = MIN_SIZE; size <= MAX_SIZE; size++) ui.size.add(new Option(`${size}x${size}`, String(size)));

let pickerRegion: number | null = null;

const swatches = PALETTE.map((color) => {
  const swatch = document.createElement("button");
  swatch.type = "button";
  swatch.className = "swatch";
  swatch.style.backgroundColor = color;
  swatch.title = color;
  swatch.setAttribute("aria-label", color);
  swatch.addEventListener("click", () => {
    const region = pickerRegion;
    closePicker();
    if (region !== null) change(() => (puzzle.colors[region] = color));
  });
  return swatch;
});
ui.picker.replaceChildren(...swatches);

function openPicker(region: number, x: number, y: number) {
  pickerRegion = region;
  const current = regionColor(region, puzzle.colors);
  const others = new Set(
    puzzle.regions.flat().flatMap((id) => (id === null || id === region ? [] : [regionColor(id, puzzle.colors)])),
  );
  swatches.forEach((swatch, i) => {
    swatch.classList.toggle("current", PALETTE[i] === current);
    swatch.classList.toggle("used", others.has(PALETTE[i]));
  });
  ui.picker.hidden = false;
  const { width, height } = ui.picker.getBoundingClientRect();
  ui.picker.style.left = `${Math.min(x + 8, window.innerWidth - width - 8)}px`;
  ui.picker.style.top = `${Math.min(y + 8, window.innerHeight - height - 8)}px`;
}

function closePicker() {
  pickerRegion = null;
  ui.picker.hidden = true;
}

document.addEventListener(
  "pointerdown",
  (e) => {
    if (!ui.picker.hidden && !ui.picker.contains(e.target as Node)) closePicker();
  },
  { capture: true },
);

ui.modeEdit.addEventListener("click", () => {
  mode = "edit";
  render();
});
ui.modeSolve.addEventListener("click", () => {
  mode = "solve";
  closePicker();
  render();
});
ui.size.addEventListener("change", () => requestResize(Number(ui.size.value)));
ui.stars.addEventListener("change", () => change(() => (puzzle.stars = Number(ui.stars.value) as StarCount)));
ui.autoMark.addEventListener("change", () => {
  autoMark = ui.autoMark.checked;
  render();
});
ui.undo.addEventListener("click", undo);
ui.redo.addEventListener("click", redo);
ui.clearMarks.addEventListener("click", () => change(() => (puzzle.marks = makeGrid<Mark>(puzzle.size, ""))));
ui.clearRegions.addEventListener("click", () =>
  change(() => {
    puzzle.regions = makeGrid(puzzle.size, null);
    puzzle.colors = {};
    puzzle.locked = [];
  }),
);
ui.share.addEventListener("click", copyLink);
window.addEventListener("hashchange", openLink);
ui.check.addEventListener("click", runCheck);
ui.reshape.addEventListener("click", () => (search ? finishSearch(null) : startSearch()));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePicker();
  if (!(e.metaKey || e.ctrlKey) || snapshot || search || ui.resizeDialog.open) return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((k === "z" && e.shiftKey) || k === "y") {
    e.preventDefault();
    redo();
  }
});

render();
openLink();
