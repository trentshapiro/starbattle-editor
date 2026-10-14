import type { CheckResult, SolverInput } from "./solver";
import type { Puzzle } from "./types";

const TIMEOUT_MS = 10_000;

export function checkPuzzle({ size, stars, regions }: Puzzle): Promise<CheckResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
    const done = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      done();
      resolve({ status: "timeout", issues: [], solutions: [] });
    }, TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<CheckResult>) => {
      done();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      done();
      reject(new Error(e.message || "The solver failed."));
    };
    worker.postMessage({ size, stars, regions } satisfies SolverInput);
  });
}
