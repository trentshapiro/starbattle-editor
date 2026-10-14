import { type Cell, type Grid, makeGrid, type Puzzle } from "./types";

export function regionGroups(regions: Grid<number | null>): Map<number, Cell[]> {
  const groups = new Map<number, Cell[]>();
  regions.forEach((row, r) =>
    row.forEach((region, c) => {
      if (region === null) return;
      if (!groups.has(region)) groups.set(region, []);
      groups.get(region)!.push([r, c]);
    }),
  );
  return groups;
}

export function nextRegionId(regions: Grid<number | null>): number {
  const used = new Set(regions.flat());
  let id = 0;
  while (used.has(id)) id++;
  return id;
}

function lines(p: Puzzle): Cell[][] {
  const rows: Cell[][] = [];
  const cols: Cell[][] = [];
  for (let i = 0; i < p.size; i++) {
    rows.push(Array.from({ length: p.size }, (_, c): Cell => [i, c]));
    cols.push(Array.from({ length: p.size }, (_, r): Cell => [r, i]));
  }
  return [...rows, ...cols, ...regionGroups(p.regions).values()];
}

function neighbors(p: Puzzle, [r, c]: Cell): Cell[] {
  const out: Cell[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if ((dr || dc) && nr >= 0 && nc >= 0 && nr < p.size && nc < p.size) out.push([nr, nc]);
    }
  }
  return out;
}

const isStar = (p: Puzzle, [r, c]: Cell) => p.marks[r][c] === "star";

export function autoMarks(p: Puzzle): Grid<boolean> {
  const auto = makeGrid(p.size, false);
  const mark = ([r, c]: Cell) => {
    if (p.marks[r][c] !== "star") auto[r][c] = true;
  };
  p.marks.forEach((row, r) =>
    row.forEach((m, c) => {
      if (m === "star") neighbors(p, [r, c]).forEach(mark);
    }),
  );
  for (const cells of lines(p)) {
    if (cells.filter((cell) => isStar(p, cell)).length >= p.stars) cells.forEach(mark);
  }
  return auto;
}

export function violations(p: Puzzle, auto: Grid<boolean> | null): Grid<boolean> {
  const errors = makeGrid(p.size, false);
  const isFree = ([r, c]: Cell) => p.marks[r][c] === "" && !auto?.[r][c];
  for (const cells of lines(p)) {
    const stars = cells.filter((cell) => isStar(p, cell)).length;
    const free = cells.filter(isFree).length;
    if (stars > p.stars || stars + free < p.stars) cells.forEach(([r, c]) => (errors[r][c] = true));
  }
  p.marks.forEach((row, r) =>
    row.forEach((m, c) => {
      if (m === "star" && neighbors(p, [r, c]).some((cell) => isStar(p, cell))) errors[r][c] = true;
    }),
  );
  return errors;
}

export function isSolved(p: Puzzle): boolean {
  const groups = regionGroups(p.regions);
  if (groups.size !== p.size || p.regions.flat().includes(null)) return false;
  const exact = lines(p).every((cells) => cells.filter((cell) => isStar(p, cell)).length === p.stars);
  return exact && !violations(p, null).flat().some(Boolean);
}

/** 4-connected path from `from` to `to`, excluding `from`, so fast drags paint contiguous strokes. */
export function cellPath([r0, c0]: Cell, [r1, c1]: Cell): Cell[] {
  const dr = Math.abs(r1 - r0);
  const dc = Math.abs(c1 - c0);
  const sr = Math.sign(r1 - r0);
  const sc = Math.sign(c1 - c0);
  const out: Cell[] = [];
  let r = r0;
  let c = c0;
  let i = 0;
  let j = 0;
  while (i < dr || j < dc) {
    if (j >= dc || (i < dr && (i + 0.5) / dr < (j + 0.5) / dc)) {
      r += sr;
      i++;
    } else {
      c += sc;
      j++;
    }
    out.push([r, c]);
  }
  return out;
}

export type VerticalEdge = "top" | "bottom" | "both";
export type HorizontalEdge = "left" | "right" | "both";

function offset(delta: number, edge: string): number {
  if (edge === "top" || edge === "left") return delta;
  if (edge === "both") return Math.trunc(delta / 2);
  return 0;
}

/** Add or remove rows and columns on the chosen edges, keeping the rest of the grid in place. */
export function resizeGrid<T>(grid: Grid<T>, size: number, fill: T, v: VerticalEdge, h: HorizontalEdge): Grid<T> {
  const delta = size - grid.length;
  const dr = offset(delta, v);
  const dc = offset(delta, h);
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => grid[r - dr]?.[c - dc] ?? fill),
  );
}
