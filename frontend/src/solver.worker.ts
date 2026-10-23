import { withRating } from "./rate";
import { checkPuzzle, type SolverInput } from "./solver";

self.onmessage = (e: MessageEvent<SolverInput>) => self.postMessage(withRating(e.data, checkPuzzle(e.data)));
