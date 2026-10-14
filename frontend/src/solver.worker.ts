import { checkPuzzle, type SolverInput } from "./solver";

self.onmessage = (e: MessageEvent<SolverInput>) => self.postMessage(checkPuzzle(e.data));
