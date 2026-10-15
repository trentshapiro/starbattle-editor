import { describe, expect, test } from "vitest";
import { reshape } from "./reshape";
import { regionGroups } from "./rules";
import { checkPuzzle } from "./solver";
import type { Grid } from "./types";

const UNIQUE_8 = [
  [7, 4, 4, 0, 0, 1, 1, 1],
  [7, 4, 4, 2, 0, 2, 1, 1],
  [7, 4, 4, 2, 2, 2, 1, 1],
  [7, 4, 4, 3, 2, 2, 5, 1],
  [7, 4, 4, 4, 2, 5, 5, 5],
  [7, 7, 6, 6, 6, 5, 5, 5],
  [7, 7, 6, 6, 6, 6, 6, 5],
  [7, 7, 7, 6, 6, 6, 6, 5],
];

// UNIQUE_8 with a few cells moved, which gives it more than one solution.
const DRAFT_8 = [
  [7, 4, 4, 0, 0, 0, 1, 1],
  [7, 4, 4, 2, 0, 2, 1, 1],
  [7, 4, 4, 2, 2, 2, 2, 1],
  [7, 4, 4, 3, 2, 2, 5, 1],
  [7, 4, 4, 4, 5, 5, 5, 5],
  [7, 7, 7, 6, 6, 5, 5, 5],
  [7, 7, 6, 6, 6, 6, 5, 5],
  [7, 7, 7, 6, 6, 6, 6, 5],
];

const rowsAsRegions = (size: number) => Array.from({ length: size }, (_, r) => Array<number>(size).fill(r));

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isConnected(regions: Grid<number | null>, cells: [number, number][]): boolean {
  const id = regions[cells[0][0]][cells[0][1]];
  const seen = new Set([String(cells[0])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    for (const next of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]] as [number, number][]) {
      if (regions[next[0]]?.[next[1]] === id && !seen.has(String(next))) {
        seen.add(String(next));
        stack.push(next);
      }
    }
  }
  return seen.size === cells.length;
}

describe("reshape", () => {
  test("keeps a unique puzzle as it is", () => {
    const out = reshape({ size: 8, stars: 1, regions: UNIQUE_8, locked: [] });
    expect(out.type === "done" && out.regions).toEqual(UNIQUE_8);
  });

  test("reaches a unique puzzle without changing locked regions", () => {
    expect(checkPuzzle({ size: 8, stars: 1, regions: DRAFT_8 }).status).toBe("multiple");
    const out = reshape({ size: 8, stars: 1, regions: DRAFT_8, locked: [4, 7] }, { random: seeded(1), maxIterations: 400 });
    if (out.type !== "done") throw new Error(out.message);
    expect(out.result.status).toBe("unique");
    expect(checkPuzzle({ size: 8, stars: 1, regions: out.regions }).status).toBe("unique");
    const lockedCells = (regions: Grid<number | null>) => regions.map((row) => row.map((id) => id === 4 || id === 7));
    expect(lockedCells(out.regions)).toEqual(lockedCells(DRAFT_8));
    for (const cells of regionGroups(out.regions).values()) expect(isConnected(out.regions, cells)).toBe(true);
  });

  test("never leaves the puzzle without a solution", () => {
    const out = reshape({ size: 10, stars: 2, regions: rowsAsRegions(10), locked: [] }, { random: seeded(1), maxIterations: 5 });
    if (out.type !== "done") throw new Error(out.message);
    expect(["unique", "multiple"]).toContain(out.result.status);
  });

  test.each([
    ["regions are incomplete", rowsAsRegions(8).map((row, r) => (r === 0 ? row.map(() => null) : row)), []],
    ["fewer than two regions are unlocked", rowsAsRegions(8), [0, 1, 2, 3, 4, 5, 6]],
  ])("reports an error when %s", (_, regions, locked) => {
    expect(reshape({ size: 8, stars: 1, regions, locked }).type).toBe("error");
  });
});
