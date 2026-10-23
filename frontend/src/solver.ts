import Logic from "logic-solver";
import { regionGroups } from "./rules";
import type { Cell, Grid } from "./types";

export type CheckStatus = "invalid" | "none" | "unique" | "multiple" | "timeout";

export interface Issue {
  message: string;
  cells: Cell[];
}

export interface CheckResult {
  status: CheckStatus;
  issues: Issue[];
  solutions: Cell[][];
  /** Logic score of a unique puzzle, or null when it needs guessing. */
  rating?: number | null;
}

export interface SolverInput {
  size: number;
  stars: number;
  regions: Grid<number | null>;
}

export function validate({ size, regions }: SolverInput): Issue[] {
  const issues: Issue[] = [];
  const unassigned: Cell[] = [];
  regions.forEach((row, r) => row.forEach((region, c) => region === null && unassigned.push([r, c])));
  if (unassigned.length) {
    const noun = unassigned.length === 1 ? "cell has" : "cells have";
    issues.push({ message: `${unassigned.length} ${noun} no region`, cells: unassigned });
  }
  const count = regionGroups(regions).size;
  if (count !== size) issues.push({ message: `Grid has ${count} regions but needs ${size}`, cells: [] });
  return issues;
}

const cellVar = ([r, c]: Cell) => `${r},${c}`;

const toCell = (v: string): Cell => v.split(",").map(Number) as Cell;

function buildSolver({ size: n, stars: k, regions }: SolverInput): InstanceType<typeof Logic.Solver> {
  const solver = new Logic.Solver();
  const units: Cell[][] = [...regionGroups(regions).values()];
  for (let i = 0; i < n; i++) {
    units.push(Array.from({ length: n }, (_, c): Cell => [i, c]));
    units.push(Array.from({ length: n }, (_, r): Cell => [r, i]));
  }
  for (const unit of units) {
    const vars = unit.map(cellVar);
    solver.require(k === 1 ? Logic.exactlyOne(vars) : Logic.equalBits(Logic.sum(vars), Logic.constantBits(k)));
  }
  // At most one star per 2x2 block covers every orthogonal and diagonal adjacency.
  for (let r = 0; r + 1 < n; r++) {
    for (let c = 0; c + 1 < n; c++) {
      const block: Cell[] = [[r, c], [r + 1, c], [r, c + 1], [r + 1, c + 1]];
      solver.require(Logic.atMostOne(block.map(cellVar)));
    }
  }
  return solver;
}

export function findSolutions(input: SolverInput, limit = 2): Cell[][] {
  const solver = buildSolver(input);
  const solutions: Cell[][] = [];
  while (solutions.length < limit) {
    const solution = solver.solve();
    if (!solution) break;
    solutions.push(solution.getTrueVars().map(toCell));
    solver.forbid(solution.getFormula());
  }
  return solutions;
}

/** A solution with a star in `cell`, or any solution when none has one there. */
export function solutionWith(input: SolverInput, cell: Cell): Cell[] | undefined {
  const solver = buildSolver(input);
  return (solver.solveAssuming(cellVar(cell)) ?? solver.solve())?.getTrueVars().map(toCell);
}

/** Cells outside `target` that hold a star in some solution. None means `target` is the only solution. */
export function ambiguousCells(input: SolverInput, target: Cell[]): Cell[] {
  const solver = buildSolver(input);
  const taken = new Set(target.map(cellVar));
  let open: string[] = [];
  for (let r = 0; r < input.size; r++) {
    for (let c = 0; c < input.size; c++) if (!taken.has(cellVar([r, c]))) open.push(cellVar([r, c]));
  }
  const found: string[] = [];
  while (open.length) {
    // Each new requirement is stronger than the last, so it can stay on the solver.
    solver.require(Logic.or(open));
    const solution = solver.solve();
    if (!solution) break;
    const stars = new Set(solution.getTrueVars());
    found.push(...open.filter((v) => stars.has(v)));
    open = open.filter((v) => !stars.has(v));
  }
  return found.map(toCell);
}

export function checkPuzzle(input: SolverInput): CheckResult {
  const issues = validate(input);
  if (issues.length) return { status: "invalid", issues, solutions: [] };
  const solutions = findSolutions(input);
  const status = solutions.length === 0 ? "none" : solutions.length === 1 ? "unique" : "multiple";
  return { status, issues: [], solutions };
}
