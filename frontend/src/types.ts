export const MIN_SIZE = 8;
export const MAX_SIZE = 15;

export type Mode = "edit" | "solve";
export type StarCount = 1 | 2;
export type Mark = "" | "star" | "x";
export type Cell = [number, number];
export type Grid<T> = T[][];

export interface Puzzle {
  size: number;
  stars: StarCount;
  regions: Grid<number | null>;
  marks: Grid<Mark>;
}

export function makeGrid<T>(size: number, fill: T): Grid<T> {
  return Array.from({ length: size }, () => Array<T>(size).fill(fill));
}

export function blankPuzzle(size: number, stars: StarCount): Puzzle {
  return { size, stars, regions: makeGrid(size, null), marks: makeGrid<Mark>(size, "") };
}

export function isBlank(p: Puzzle): boolean {
  return p.regions.every((row, r) => row.every((region, c) => region === null && p.marks[r][c] === ""));
}
