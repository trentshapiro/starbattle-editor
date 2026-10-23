import { describe, expect, test } from "vitest";
import { assess } from "./rate";

// Reference layouts from the fde-one generator tests, which rate them 2.5 and 14.
const EASY = "0099999988000993331800099333182099993318000093331866003331186333384888668888888866887888886666777785";
const HARD = "7777444666774445666674445556067414482226741118229671188822961118282296118822229911111233991111111339";
const MIN_SCORE = 12;

const decode = (text: string) => Array.from({ length: 10 }, (_, r) => [...text.slice(r * 10, r * 10 + 10)].map(Number));
const rowsAsRegions = (size: number) => Array.from({ length: size }, (_, r) => Array<number>(size).fill(r));

describe("assess", () => {
  test("rates the reference layouts either side of the cutoff", () => {
    const easy = assess({ size: 10, stars: 1, regions: decode(EASY) });
    const hard = assess({ size: 10, stars: 1, regions: decode(HARD) });
    expect(easy).toBe(2.5);
    expect(hard).toBe(14);
    expect(easy!).toBeLessThan(MIN_SCORE);
    expect(hard!).toBeGreaterThanOrEqual(MIN_SCORE);
  });

  test.each([1, 2])("returns null when logic cannot finish %i-star row regions", (stars) => {
    expect(assess({ size: 10, stars, regions: rowsAsRegions(10) })).toBeNull();
  });
});
