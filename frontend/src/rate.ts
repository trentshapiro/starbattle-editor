import { regionGroups } from "./rules";
import type { CheckResult, SolverInput } from "./solver";

interface Shape {
  size: number;
  stars: number;
  /** Rows, then columns, then regions. Each unit lists cell indexes. */
  units: number[][];
  /** Unit indexes of the rows, the columns and the regions. */
  families: number[][];
  /** For each family, the position within it of the unit that holds each cell. */
  position: number[][];
  unitsOf: number[][];
  near: number[][];
}

function shapeOf({ size, stars, regions }: SolverInput): Shape {
  const rows = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => r * size + c));
  const cols = Array.from({ length: size }, (_, c) => Array.from({ length: size }, (_, r) => r * size + c));
  const areas = [...regionGroups(regions).values()].map((cells) => cells.map(([r, c]) => r * size + c));
  const units = [...rows, ...cols, ...areas];
  const ids = units.map((_, u) => u);
  const families = [ids.slice(0, size), ids.slice(size, 2 * size), ids.slice(2 * size)];
  const position = families.map((family) => {
    const out = Array<number>(size * size);
    family.forEach((u, i) => units[u].forEach((cell) => (out[cell] = i)));
    return out;
  });
  const unitsOf = Array.from({ length: size * size }, (): number[] => []);
  units.forEach((unit, u) => unit.forEach((cell) => unitsOf[cell].push(u)));
  const near = Array.from({ length: size * size }, (_, cell) => {
    const [r, c] = [Math.floor(cell / size), cell % size];
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const [nr, nc] = [r + dr, c + dc];
        if ((dr || dc) && nr >= 0 && nc >= 0 && nr < size && nc < size) out.push(nr * size + nc);
      }
    }
    return out;
  });
  return { size, stars, units, families, position, unitsOf, near };
}

const touches = (a: number, b: number, size: number) =>
  Math.abs(Math.floor(a / size) - Math.floor(b / size)) <= 1 && Math.abs((a % size) - (b % size)) <= 1;

/** True when `need` stars fit in `cells` without touching. */
function holds(cells: number[], need: number, size: number): boolean {
  if (need <= 0) return true;
  return cells.some((a, i) => holds(cells.slice(i + 1).filter((b) => !touches(a, b, size)), need - 1, size));
}

class Board {
  constructor(
    readonly shape: Shape,
    readonly candidate: Uint8Array,
    readonly count: Uint8Array,
  ) {}

  static from(input: SolverInput): Board {
    const shape = shapeOf(input);
    return new Board(shape, new Uint8Array(shape.size * shape.size).fill(1), new Uint8Array(shape.units.length));
  }

  copy(): Board {
    return new Board(this.shape, this.candidate.slice(), this.count.slice());
  }

  need(u: number): number {
    return this.shape.stars - this.count[u];
  }

  open(u: number): number[] {
    return this.shape.units[u].filter((cell) => this.candidate[cell]);
  }

  place(cell: number): void {
    const { units, unitsOf, near, stars } = this.shape;
    this.candidate[cell] = 0;
    for (const other of near[cell]) this.candidate[other] = 0;
    for (const u of unitsOf[cell]) {
      if (++this.count[u] >= stars) for (const other of units[u]) this.candidate[other] = 0;
    }
  }

  broken(): boolean {
    return this.shape.units.some((_, u) => !holds(this.open(u), this.need(u), this.shape.size));
  }

  solved(): boolean {
    return this.shape.units.every((_, u) => this.need(u) <= 0);
  }
}

function singles(b: Board): boolean {
  for (let u = 0; u < b.shape.units.length; u++) {
    const cells = b.open(u);
    if (b.need(u) > 0 && cells.length === b.need(u)) {
      b.place(cells[0]);
      return true;
    }
  }
  return false;
}

/** A star in a cell next to a unit would leave that unit too little room for its stars. */
function sharedNeighbors(b: Board): boolean {
  const { units, near, size } = b.shape;
  let changed = false;
  units.forEach((unit, u) => {
    const cells = b.open(u);
    if (b.need(u) <= 0 || !cells.length) return;
    const inside = new Set(unit);
    for (const cell of new Set(cells.flatMap((open) => near[open]))) {
      if (!b.candidate[cell] || inside.has(cell)) continue;
      if (!holds(cells.filter((open) => !touches(open, cell, size)), b.need(u), size)) {
        b.candidate[cell] = 0;
        changed = true;
      }
    }
  });
  return changed;
}

/**
 * When k units of one kind fit inside units of another kind that need the same number of stars,
 * the rest of those outer units holds no star.
 */
function confinement(b: Board, minK: number, maxK: number): boolean {
  const { units, families, position, stars } = b.shape;
  for (const [i, inner] of families.entries()) {
    for (const [o, outer] of families.entries()) {
      if (i === o) continue;
      const live = inner.filter((u) => b.need(u) > 0);
      const needs = live.map((u) => b.need(u));
      const bits = live.map((u) => 1 << inner.indexOf(u));
      const masks = live.map((u) => b.open(u).reduce((mask, cell) => mask | (1 << position[o][cell]), 0));
      const outerNeed = outer.map((u) => b.need(u));
      const neededBy = (mask: number) => outerNeed.reduce((sum, need, j) => sum + (mask & (1 << j) ? need : 0), 0);

      const drop = (chosen: number, covered: number) => {
        const cells = outer
          .filter((_, j) => covered & (1 << j))
          .flatMap((u) => units[u].filter((cell) => b.candidate[cell] && !(chosen & (1 << position[i][cell]))));
        cells.forEach((cell) => (b.candidate[cell] = 0));
        return cells.length > 0;
      };
      // Combinations in lexicographic order. A branch ends once its covered units need more stars
      // than its inner units can still supply.
      const pick = (start: number, left: number, chosen: number, covered: number, inNeed: number): boolean => {
        if (neededBy(covered) > inNeed + left * stars) return false;
        if (!left) return neededBy(covered) === inNeed && drop(chosen, covered);
        for (let j = start; j <= live.length - left; j++) {
          if (pick(j + 1, left - 1, chosen | bits[j], covered | masks[j], inNeed + needs[j])) return true;
        }
        return false;
      };
      for (let k = minK; k <= Math.min(maxK, live.length - 1); k++) if (pick(0, k, 0, 0, 0)) return true;
    }
  }
  return false;
}

/** A star in this cell would leave some row, column or region without room for its stars. */
function contradiction(b: Board): boolean {
  for (let cell = 0; cell < b.candidate.length; cell++) {
    if (!b.candidate[cell]) continue;
    const trial = b.copy();
    trial.place(cell);
    if (trial.broken()) {
      b.candidate[cell] = 0;
      return true;
    }
  }
  return false;
}

// (effort, technique), easiest first. A forced single costs nothing, so effort counts the
// steps where a player has to look past the obvious move, weighted by how hard that look is.
const TECHNIQUES: [number, (b: Board) => boolean][] = [
  [0, singles],
  [0.5, sharedNeighbors],
  [1, (b) => confinement(b, 1, 1)],
  [2, (b) => confinement(b, 2, 3)],
  [3, (b) => confinement(b, 4, b.shape.size)],
  [4, contradiction],
];

const SMALL_REGION_CELLS = 6;
// Small regions give the solver an easy foothold, so each small region short of this count adds 1 to the score.
const OPEN_LAYOUT_REGIONS = 5;

/** How hard the puzzle is to solve with human techniques, or null when it needs guessing. */
export function assess(input: SolverInput): number | null {
  const b = Board.from(input);
  let effort = 0;
  while (!b.solved()) {
    if (b.broken()) return null;
    const step = TECHNIQUES.find(([, technique]) => technique(b));
    if (!step) return null;
    effort += step[0];
  }
  const [, , areas] = b.shape.families;
  const small = areas.filter((u) => b.shape.units[u].length < SMALL_REGION_CELLS).length;
  return effort + Math.max(0, OPEN_LAYOUT_REGIONS - small);
}

export const withRating = (input: SolverInput, result: CheckResult): CheckResult =>
  result.status === "unique" ? { ...result, rating: assess(input) } : result;
