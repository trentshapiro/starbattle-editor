import { assess } from "./rate";
import { reshape, type ReshapeProgress, type ReshapeResult } from "./reshape";
import { seedLayout } from "./seed";
import type { StarCount } from "./types";

export interface GenerateInput {
  size: number;
  stars: StarCount;
}

export interface GenerateProgress extends ReshapeProgress {
  attempt: number;
}

export type GenerateMessage = ({ type: "progress" } & GenerateProgress) | ReshapeResult;

export interface GenerateOptions {
  random?: () => number;
  maxAttempts?: number;
  onProgress?: (progress: GenerateProgress) => void;
}

const ATTEMPT_STALLS = 4;

/** Reshape fresh target-first layouts until one has a single solution that logic alone reaches. */
export function generate({ size, stars }: GenerateInput, options: GenerateOptions = {}): ReshapeResult {
  const { random = Math.random, maxAttempts = Infinity, onProgress } = options;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const seeded = seedLayout(size, stars, random);
    if (!seeded) continue;
    const out = reshape(
      { size, stars, regions: seeded.regions, locked: [] },
      { random, maxStalls: ATTEMPT_STALLS, onProgress: (progress) => onProgress?.({ ...progress, attempt }) },
    );
    if (out.type !== "done" || out.result.status !== "unique") continue;
    const rating = assess({ size, stars, regions: out.regions });
    if (rating !== null) return { ...out, result: { ...out.result, rating } };
  }
  return { type: "error", message: `No layout had one solution that logic can reach in ${maxAttempts} attempts.` };
}
