import { describe, expect, test } from "vitest";
import { generate } from "./generate";
import { assess } from "./rate";
import { MIN_REGION } from "./reshape";
import { regionGroups } from "./rules";
import { randomStars, seedLayout } from "./seed";
import { checkPuzzle } from "./solver";
import type { Cell, Grid, StarCount } from "./types";

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

function expectRegions(regions: Grid<number | null>, size: number, stars: StarCount) {
  const groups = regionGroups(regions);
  expect(groups.size).toBe(size);
  for (const cells of groups.values()) {
    expect(isConnected(regions, cells)).toBe(true);
    expect(cells.length).toBeGreaterThanOrEqual(MIN_REGION[stars]);
  }
}

function expectApart(size: number, stars: number, target: Cell[]) {
  for (let i = 0; i < size; i++) {
    expect(target.filter(([r]) => r === i)).toHaveLength(stars);
    expect(target.filter(([, c]) => c === i)).toHaveLength(stars);
  }
  for (const a of target) {
    for (const b of target) {
      if (a !== b) expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))).toBeGreaterThan(1);
    }
  }
}

const SIZES = [8, 10, 15].flatMap((size) => [1, 2].map((stars) => [size, stars] as [number, StarCount]));

describe("randomStars", () => {
  test.each(SIZES)("places stars on a %ix%i grid with %i per row and column, none touching", (size, stars) => {
    expectApart(size, stars, randomStars(size, stars, seeded(size)));
  });
});

describe("seedLayout", () => {
  test.each(SIZES)("covers a %ix%i grid with connected regions that each hold %i target stars", (size, stars) => {
    for (let seed = 1; seed <= 5; seed++) {
      const { regions, target } = seedLayout(size, stars, seeded(seed))!;
      expectApart(size, stars, target);
      expectRegions(regions, size, stars);
      for (const cells of regionGroups(regions).values()) {
        expect(target.filter(([r, c]) => cells.some(([r2, c2]) => r === r2 && c === c2))).toHaveLength(stars);
      }
    }
  });
});

describe("generate", () => {
  test.each([
    [1, 2],
    [2, 10],
  ] as const)("returns a unique 10x10 %i-star layout that logic can solve", (stars, seed) => {
    const out = generate({ size: 10, stars }, { random: seeded(seed), maxAttempts: 3 });
    if (out.type !== "done") throw new Error(out.message);
    const input = { size: 10, stars, regions: out.regions };
    expect(checkPuzzle(input).status).toBe("unique");
    expect(out.result.status).toBe("unique");
    expect(out.result.rating).not.toBeNull();
    expect(out.result.rating).toBe(assess(input));
    expectRegions(out.regions, 10, stars);
  }, 30_000);
});
