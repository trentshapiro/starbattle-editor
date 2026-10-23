import { regionGroups } from "./rules";
import { ambiguousCells, type CheckResult, findSolutions, solutionWith, type SolverInput, validate } from "./solver";
import type { Cell, Grid, StarCount } from "./types";

export interface ReshapeInput extends SolverInput {
  locked: number[];
}

export interface ReshapeProgress {
  regions: Grid<number | null>;
  /** Cells that hold a star in some solution other than the target. Null while regions still need balancing. */
  ambiguous: number | null;
  iterations: number;
}

export type ReshapeResult =
  | { type: "done"; regions: Grid<number | null>; result: CheckResult }
  | { type: "error"; message: string };

export type ReshapeMessage = ({ type: "progress" } & ReshapeProgress) | ReshapeResult;

export interface ReshapeOptions {
  random?: () => number;
  maxIterations?: number;
  /** Give up after this many stalls in a row without a better layout. */
  maxStalls?: number;
  onProgress?: (progress: ReshapeProgress) => void;
}

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const TARGET_CHOICES = 6;
const STALL = 150;
const NEAR = 2;
const BALANCE_STEPS = 5000;
const SWAP_RATE = 0.2;
const JUMP_AFTER = 3;

// Tiny regions give the solver an easy foothold, so each floor sits 3 cells above the smallest
// region that can hold the stars: 1 cell for 1 star, 3 in a line for 2.
export const MIN_REGION: Record<StarCount, number> = { 1: 4, 2: 6 };

const key = ([r, c]: Cell) => `${r},${c}`;

/** Count 4-connected pieces of a region, ignoring the `skip` cell. */
function components(regions: Grid<number | null>, cells: Cell[], skip: Cell | null): number {
  const [r0, c0] = cells[0];
  const id = regions[r0][c0];
  const seen = new Set<string>(skip ? [key(skip)] : []);
  let count = 0;
  for (const start of cells) {
    if (seen.has(key(start))) continue;
    count++;
    const stack = [start];
    seen.add(key(start));
    while (stack.length) {
      const [r, c] = stack.pop()!;
      for (const [dr, dc] of STEPS) {
        const next: Cell = [r + dr, c + dc];
        if (regions[next[0]]?.[next[1]] === id && !seen.has(key(next))) {
          seen.add(key(next));
          stack.push(next);
        }
      }
    }
  }
  return count;
}

const lockedOnly = (input: SolverInput, locked: Set<number>): SolverInput => ({
  ...input,
  regions: input.regions.map((row) => row.map((id) => (locked.has(id!) ? id : null))),
});

/** Candidate star layouts for the reshaped puzzle to keep as a solution. */
function targetChoices(input: SolverInput, locked: Set<number>): Cell[][] {
  const current = findSolutions(input, TARGET_CHOICES);
  return current.length ? current : findSolutions(lockedOnly(input, locked), TARGET_CHOICES);
}

/**
 * Move cells between adjacent unlocked regions until the puzzle has one solution.
 * Each region keeps `stars` cells of a target solution, so a balanced layout always stays solvable.
 * When the search stalls, it restarts from the best layout with a different target.
 * The score does not depend on the target, so the best layout stays comparable across restarts.
 */
export function reshape(input: ReshapeInput, options: ReshapeOptions = {}): ReshapeResult {
  const { random = Math.random, maxIterations = Infinity, maxStalls = Infinity, onProgress } = options;
  const { size, stars } = input;
  const floor = MIN_REGION[stars as StarCount];
  const issues = validate(input);
  if (issues.length) return { type: "error", message: issues.map((issue) => issue.message).join(". ") };

  const locked = new Set(input.locked);
  const free = [...regionGroups(input.regions).keys()].filter((id) => !locked.has(id));
  if (free.length < 2) return { type: "error", message: "Leave at least two regions unlocked." };

  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  let target: Cell[] = [];
  let isTarget = new Set<string>();
  const starCounts = (regions: Grid<number | null>, targetStars = target) => {
    const counts = new Map(free.map((id) => [id, 0]));
    for (const [r, c] of targetStars) {
      const id = regions[r][c]!;
      if (counts.has(id)) counts.set(id, counts.get(id)! + 1);
    }
    return counts;
  };
  const imbalance = (regions: Grid<number | null>, targetStars = target) =>
    [...starCounts(regions, targetStars).values()].reduce((sum, n) => sum + Math.abs(n - stars), 0);

  /** Switch to another target. The first call picks the one that fits the current regions best. */
  const retarget = (regions: Grid<number | null>, closest = false) => {
    const choices = targetChoices({ size, stars, regions }, locked);
    if (!choices.length) return false;
    const fit = closest ? Math.min(...choices.map((choice) => imbalance(regions, choice))) : 0;
    target = pick(closest ? choices.filter((choice) => imbalance(regions, choice) === fit) : choices);
    isTarget = new Set(target.map(key));
    return true;
  };
  /** Switch to a random target that only has to fit the locked regions. */
  const jump = (regions: Grid<number | null>) => {
    const cell: Cell = [Math.floor(random() * size), Math.floor(random() * size)];
    const choice = solutionWith(lockedOnly({ size, stars, regions }, locked), cell);
    if (choice) {
      target = choice;
      isTarget = new Set(target.map(key));
    }
  };
  if (!retarget(input.regions, true)) {
    return { type: "error", message: "The locked regions cannot be part of any solution." };
  }
  const unbalanced = size * size;

  const evaluate = (regions: Grid<number | null>) => {
    const off = imbalance(regions);
    if (off) return { regions, score: unbalanced + off, hot: new Set<string>() };
    // Moving any of these cells to another region removes every solution that has a star there.
    const hot = new Set(ambiguousCells({ size, stars, regions }, target).map(key));
    return { regions, score: hot.size, hot };
  };

  /** Cells of `from` that can move to an adjacent unlocked region `to`. */
  const borders = (regions: Grid<number | null>, cells: Cell[]) =>
    cells.flatMap(([r, c]): [Cell, number][] => {
      const from = regions[r][c]!;
      if (locked.has(from)) return [];
      return STEPS.flatMap(([dr, dc]): [Cell, number][] => {
        const to = regions[r + dr]?.[c + dc];
        return to === undefined || to === null || to === from || locked.has(to) ? [] : [[[r, c], to]];
      });
    });

  /** Move one cell, keeping the region it leaves in one piece and above the floor. */
  const move = (regions: Grid<number | null>, [[r, c], to]: [Cell, number]) => {
    const cells = regionGroups(regions).get(regions[r][c]!)!;
    if (cells.length <= floor || components(regions, cells, [r, c]) > components(regions, cells, null)) return null;
    const next = regions.map((row) => [...row]);
    next[r][c] = to;
    return next;
  };

  const propose = ({ regions, score, hot }: ReturnType<typeof evaluate>) => {
    const all: Cell[] = regions.flatMap((row, r) => row.map((_, c): Cell => [r, c]));
    if (score >= unbalanced) {
      const counts = starCounts(regions);
      const moves = borders(regions, all);
      if (!moves.length) return null;
      const fixes = moves.filter(([cell, to]) => {
        const from = regions[cell[0]][cell[1]]!;
        return counts.get(to)! < stars || (isTarget.has(key(cell)) && counts.get(from)! > stars);
      });
      return move(regions, pick(fixes.length && random() < 0.8 ? fixes : moves));
    }
    if (random() < SWAP_RATE) {
      // Trade target stars across a border so both regions keep their count.
      const first = borders(regions, target);
      if (!first.length) return null;
      const [[r, c], to] = pick(first);
      const from = regions[r][c]!;
      const mid = move(regions, [[r, c], to]);
      if (!mid) return null;
      const back = borders(mid, target).filter(([[r2, c2], id]) => mid[r2][c2] === to && id === from);
      return back.length ? move(mid, pick(back)) : null;
    }
    const moves = borders(regions, all).filter(([cell]) => !isTarget.has(key(cell)));
    if (!moves.length) return null;
    // Hot cells are often stuck inside a region, so reshaping the cells around them comes next.
    const hotMoves = moves.filter(([cell]) => hot.has(key(cell)));
    const nearMoves = moves.filter(([[r, c]]) =>
      [...hot].some((k) => {
        const [hr, hc] = k.split(",").map(Number);
        return Math.max(Math.abs(hr - r), Math.abs(hc - c)) <= NEAR;
      }),
    );
    const roll = random();
    const pool = roll < 0.5 && hotMoves.length ? hotMoves : roll < 0.9 && nearMoves.length ? nearMoves : moves;
    return move(regions, pick(pool));
  };

  /** Cheap moves, with no solver calls, until every region holds its share of target stars. */
  const balance = (start: ReturnType<typeof evaluate>) => {
    let state = start;
    for (let step = 0; step < BALANCE_STEPS && state.score >= unbalanced; step++) {
      const next = propose(state);
      if (!next) continue;
      const candidate = evaluate(next);
      if (candidate.score <= state.score || random() < Math.exp(state.score - candidate.score)) state = candidate;
    }
    return state;
  };

  let state = evaluate(input.regions.map((row) => [...row]));
  let best = state;
  let since = 0;
  let stalls = 0;
  let stuck = 0;
  const report = (iterations: number) =>
    onProgress?.({ regions: best.regions, ambiguous: best.score < unbalanced ? best.score : null, iterations });
  report(0);

  for (let i = 1; i <= maxIterations && best.score > 0; ) {
    if (since >= STALL) {
      if (best.score < unbalanced && ++stalls > maxStalls) break;
      // Targets drawn from the best layout can share its ambiguity, so repeated stalls need a fresh one.
      if (best.score >= unbalanced || stalls % JUMP_AFTER === 0) jump(best.regions);
      else retarget(best.regions);
      state = evaluate(best.regions);
      since = 0;
    }
    if (state.score >= unbalanced) {
      state = balance(state);
      if (state.score < best.score) best = state;
      if (state.score >= unbalanced) since = STALL;
      i++;
      continue;
    }
    const next = propose(state);
    if (!next) {
      if (stuck++ > 1000) break;
      continue;
    }
    stuck = 0;
    const candidate = evaluate(next);
    const temperature = 1.5 * (1 - since / STALL) + 0.1;
    if (candidate.score <= state.score || random() < Math.exp((state.score - candidate.score) / temperature)) {
      state = candidate;
    }
    since++;
    if (state.score < best.score) {
      best = state;
      since = 0;
      stalls = 0;
      report(i);
    } else if (i % 20 === 0) {
      report(i);
    }
    i++;
  }

  if (best.score >= unbalanced) return { type: "error", message: "Could not give every region its share of stars." };
  const solutions = findSolutions({ size, stars, regions: best.regions });
  const status = solutions.length === 0 ? "none" : solutions.length === 1 ? "unique" : "multiple";
  return { type: "done", regions: best.regions, result: { status, issues: [], solutions } };
}
