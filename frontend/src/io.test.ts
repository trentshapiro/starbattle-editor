import { describe, expect, test } from "vitest";
import { parsePuzzleHash, puzzleHash } from "./io";
import { blankPuzzle } from "./types";

describe("puzzle links", () => {
  test("round-trip regions and colors with region ids renumbered", () => {
    const puzzle = blankPuzzle(8, 2);
    puzzle.regions = puzzle.regions.map((row, r) => row.map((_, c) => (c === 7 ? null : r + 40)));
    puzzle.colors = { 41: "#123abc" };
    puzzle.marks[0][0] = "star";

    const hash = puzzleHash(puzzle);
    expect(hash).toMatch(/^1\.8\.2\.[0-7-]{64}\.[0-9a-f]{48}$/);

    const parsed = parsePuzzleHash(`#${hash}`);
    expect(parsed.marks.flat().every((mark) => mark === "")).toBe(true);
    expect(parsed.regions).toEqual(puzzle.regions.map((row, r) => row.map((id) => (id === null ? null : r))));
    expect(parsed.colors[1]).toBe("#123abc");
    expect(puzzleHash(parsed)).toBe(hash);
  });

  test.each([
    "",
    "#2.8.2..",
    "#1.8.2.abc.",
    "#1.20.1." + "-".repeat(400) + ".",
    "#1.8.3." + "-".repeat(64) + ".",
    "#1.8.1." + "<".repeat(64) + ".",
    "#1.8.1." + "0".repeat(64) + ".ffffffffffff",
  ])("rejects %s", (hash) => expect(() => parsePuzzleHash(hash)).toThrow());
});
