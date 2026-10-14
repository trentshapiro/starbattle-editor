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
    return { puzzle: parsePuzzle(data), mode: data.mode === "solve" ? "solve" : "edit", autoMark: data.autoMark !== false };
  } catch {
    return {};
  }
}

export function downloadPuzzle({ size, stars, regions, marks }: Puzzle): void {
  const data = { version: FILE_VERSION, size, stars, regions, marks };
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

export function parsePuzzle(data: unknown): Puzzle {
  if (typeof data !== "object" || data === null) throw new Error("The file does not contain a puzzle.");
  const { size, stars, regions, marks } = data as Record<string, unknown>;
  if (typeof size !== "number" || !Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new Error(`Size must be a whole number from ${MIN_SIZE} to ${MAX_SIZE}.`);
  }
  if (stars !== 1 && stars !== 2) throw new Error("Stars must be 1 or 2.");
  const isRegion = (v: unknown) => v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0);
  if (!isGrid(regions, size, isRegion)) throw new Error(`Regions must be a ${size}x${size} grid.`);
  const isMark = (v: unknown) => v === "" || v === "star" || v === "x";
  if (marks !== undefined && !isGrid(marks, size, isMark)) throw new Error(`Marks must be a ${size}x${size} grid.`);
  return {
    size,
    stars: stars as StarCount,
    regions: regions as Puzzle["regions"],
    marks: (marks as Puzzle["marks"] | undefined) ?? makeGrid<Mark>(size, ""),
  };
}
