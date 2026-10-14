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

export function downloadPuzzle({ size, stars, regions, colors }: Puzzle): void {
  const present = new Set(regions.flat());
  const used = Object.fromEntries(Object.entries(colors).filter(([id]) => present.has(Number(id))));
  const data = { version: FILE_VERSION, size, stars, regions, colors: used };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `starbattle-${size}x${size}-${stars}star.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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

function parseLayout(data: unknown): Omit<Puzzle, "marks"> {
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

/** Files hold only the grid, regions, and region colors, so an import always starts with no marks. */
export function parsePuzzleFile(data: unknown): Puzzle {
  const layout = parseLayout(data);
  return { ...layout, marks: makeGrid<Mark>(layout.size, "") };
}

function parseSavedPuzzle(data: unknown): Puzzle {
  const layout = parseLayout(data);
  const { marks } = data as Record<string, unknown>;
  const isMark = (v: unknown) => v === "" || v === "star" || v === "x";
  if (!isGrid(marks, layout.size, isMark)) throw new Error("Saved marks are invalid.");
  return { ...layout, marks: marks as Puzzle["marks"] };
}
