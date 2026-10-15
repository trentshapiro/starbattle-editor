import { regionColor } from "./colors";
import { makeGrid, type Mark, MAX_SIZE, MIN_SIZE, type Mode, type Puzzle, type StarCount } from "./types";

const FILE_VERSION = 1;
const STORAGE_KEY = "starbattle-editor";

export interface SavedState {
  puzzle: Puzzle;
  mode: Mode;
  autoMark: boolean;
}

export function saveState({ puzzle, mode, autoMark }: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: FILE_VERSION, ...puzzle, mode, autoMark }));
  } catch {
    // Storage can be full or disabled. The editor still works without it.
  }
}

export function loadState(): Partial<SavedState> {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return { puzzle: parseSavedPuzzle(data), mode: data.mode === "solve" ? "solve" : "edit", autoMark: data.autoMark !== false };
  } catch {
    return {};
  }
}

const LINK_VERSION = "1";
const REGION_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NO_REGION = "-";

/** Links hold only the grid, regions, and region colors, so opening one always starts with no marks or locks. */
export function puzzleHash({ size, stars, regions, colors }: Puzzle): string {
  const ids = [...new Set(regions.flat().filter((id) => id !== null))];
  if (ids.length > REGION_CHARS.length) throw new Error(`A link can hold at most ${REGION_CHARS.length} regions.`);
  const cells = regions.flat().map((id) => (id === null ? NO_REGION : REGION_CHARS[ids.indexOf(id)]));
  const hex = ids.map((id) => regionColor(id, colors).slice(1));
  return [LINK_VERSION, size, stars, cells.join(""), hex.join("")].join(".");
}

export function parsePuzzleHash(hash: string): Puzzle {
  const [version, size, stars, cells = "", hex = "", ...rest] = hash.replace(/^#/, "").split(".");
  const n = Number(size);
  if (version !== LINK_VERSION || rest.length || cells.length !== n * n || hex.length % 6) {
    throw new Error("The link does not contain a puzzle.");
  }
  const ids = [...cells].map((ch) => (ch === NO_REGION ? null : REGION_CHARS.indexOf(ch)));
  const regions = Array.from({ length: n }, (_, r) => ids.slice(r * n, (r + 1) * n));
  const colors = Object.fromEntries((hex.match(/.{6}/g) ?? []).map((color, id) => [id, `#${color}`]));
  const layout = parseLayout({ size: n, stars: Number(stars), regions, colors });
  return { ...layout, marks: makeGrid<Mark>(layout.size, ""), locked: [] };
}

function isGrid(grid: unknown, size: number, valid: (value: unknown) => boolean): boolean {
  return (
    Array.isArray(grid) &&
    grid.length === size &&
    grid.every((row) => Array.isArray(row) && row.length === size && row.every(valid))
  );
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function parseColors(colors: unknown): Puzzle["colors"] {
  if (colors === undefined) return {};
  if (typeof colors !== "object" || colors === null || Array.isArray(colors)) throw new Error("Colors must be an object.");
  const out: Puzzle["colors"] = {};
  for (const [id, color] of Object.entries(colors)) {
    if (!/^\d+$/.test(id) || typeof color !== "string" || !HEX_COLOR.test(color)) {
      throw new Error("Colors must map region numbers to #rrggbb values.");
    }
    out[Number(id)] = color;
  }
  return out;
}

function parseLayout(data: unknown): Omit<Puzzle, "marks" | "locked"> {
  if (typeof data !== "object" || data === null) throw new Error("The file does not contain a puzzle.");
  const { size, stars, regions, colors } = data as Record<string, unknown>;
  if (typeof size !== "number" || !Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new Error(`Size must be a whole number from ${MIN_SIZE} to ${MAX_SIZE}.`);
  }
  if (stars !== 1 && stars !== 2) throw new Error("Stars must be 1 or 2.");
  const isRegion = (v: unknown) => v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0);
  if (!isGrid(regions, size, isRegion)) throw new Error(`Regions must be a ${size}x${size} grid.`);
  return { size, stars: stars as StarCount, regions: regions as Puzzle["regions"], colors: parseColors(colors) };
}

function parseSavedPuzzle(data: unknown): Puzzle {
  const layout = parseLayout(data);
  const { marks, locked } = data as Record<string, unknown>;
  const isMark = (v: unknown) => v === "" || v === "star" || v === "x";
  if (!isGrid(marks, layout.size, isMark)) throw new Error("Saved marks are invalid.");
  const lockedIds = Array.isArray(locked) ? locked.filter((id) => Number.isInteger(id)) : [];
  return { ...layout, marks: marks as Puzzle["marks"], locked: lockedIds };
}
