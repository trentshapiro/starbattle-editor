import { describe, expect, test } from "vitest";
import { checkPuzzle, type SolverInput } from "./solver";
import type { Cell } from "./types";

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

const rowsAsRegions = (size: number) => Array.from({ length: size }, (_, r) => Array<number>(size).fill(r));

function expectValid({ size, stars, regions }: SolverInput, solution: Cell[]) {
  expect(solution).toHaveLength(size * stars);
  const count = (pick: (cell: Cell) => number | null, value: number) =>
    solution.filter((cell) => pick(cell) === value).length;
  for (let i = 0; i < size; i++) {
    expect(count(([r]) => r, i)).toBe(stars);
    expect(count(([, c]) => c, i)).toBe(stars);
  }
  for (const region of new Set(regions.flat())) expect(count(([r, c]) => regions[r][c], region!)).toBe(stars);
  for (const a of solution) {
    for (const b of solution) {
      if (a !== b) expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))).toBeGreaterThan(1);
    }
  }
}

describe("checkPuzzle", () => {
  test("unique puzzle", () => {
    const input = { size: 8, stars: 1, regions: UNIQUE_8 };
    const result = checkPuzzle(input);
    expect(result.status).toBe("unique");
    expect(result.solutions).toHaveLength(1);
    expectValid(input, result.solutions[0]);
  });

  test.each([
    [8, 1],
    [10, 2],
    [15, 2],
  ])("under-constrained %ix%i", (size, stars) => {
    const input = { size, stars, regions: rowsAsRegions(size) };
    const result = checkPuzzle(input);
    expect(result.status).toBe("multiple");
    expect(result.solutions).toHaveLength(2);
    expect(result.solutions[0]).not.toEqual(result.solutions[1]);
    result.solutions.forEach((solution) => expectValid(input, solution));
  });

  test("over-constrained", () => {
    // Two touching single-cell regions can never both hold a star.
    const regions = [[0, 1, ...Array(6).fill(2)], Array(8).fill(2), ...[3, 4, 5, 6].map((r) => Array(8).fill(r)), Array(8).fill(7), Array(8).fill(7)];
    const result = checkPuzzle({ size: 8, stars: 1, regions });
    expect(result.status).toBe("none");
    expect(result.solutions).toEqual([]);
  });

  test("invalid regions", () => {
    const regions: (number | null)[][] = rowsAsRegions(8);
    regions[0][0] = null;
    regions[7] = Array(8).fill(0);
    const result = checkPuzzle({ size: 8, stars: 1, regions });
    expect(result.status).toBe("invalid");
    expect(result.issues.map((issue) => issue.message)).toEqual(["1 cell has no region", "Grid has 7 regions but needs 8"]);
  });

  test("split regions are solved", () => {
    // Each region is two half-rows far apart, so no region is contiguous.
    const regions = Array.from({ length: 8 }, (_, r) => [...Array(4).fill(r), ...Array(4).fill((r + 4) % 8)]);
    const result = checkPuzzle({ size: 8, stars: 1, regions });
    expect(["unique", "multiple"]).toContain(result.status);
    expect(result.issues).toEqual([]);
  });
});
