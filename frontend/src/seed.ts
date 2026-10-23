import { MIN_REGION } from "./reshape";
import { regionGroups } from "./rules";
import { type Cell, type Grid, makeGrid, type StarCount } from "./types";

// Seeding is cheap next to reshaping, so redraw a layout until its smallest region meets the floor.
const SEED_TRIES = 500;
const MATCH_STEPS = 2000;
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Ways to pick `k` of the sorted `columns` with no two side by side. */
const apart = (columns: number[], k: number): number[][] =>
  k === 0
    ? [[]]
    : columns.flatMap((c, i) =>
        apart(columns.slice(i + 1).filter((next) => next - c > 1), k - 1).map((rest) => [c, ...rest]),
      );

/** `stars` stars per row and column, no two touching, ignoring regions. */
export function randomStars(size: number, stars: number, random: () => number): Cell[] {
  const count = Array<number>(size).fill(0);
  const rows: number[][] = [];
  const place = (r: number): boolean => {
    if (r === size) return true;
    const above = rows[r - 1] ?? [];
    const open = count.flatMap((n, c) => (n < stars && above.every((a) => Math.abs(a - c) > 1) ? [c] : []));
    const left = size - r - 1;
    for (const option of shuffle(apart(open, stars), random)) {
      option.forEach((c) => count[c]++);
      // Stars in one column cannot sit in neighboring rows, so the rows left hold at most half as many.
      const room = (c: number) => Math.ceil((option.includes(c) ? left - 1 : left) / 2);
      if (count.every((n, c) => stars - n <= room(c))) {
        rows.push(option);
        if (place(r + 1)) return true;
        rows.pop();
      }
      option.forEach((c) => count[c]--);
    }
    return false;
  };
  if (!place(0)) throw new Error(`No star placement fits a ${size}x${size} grid.`);
  return rows.flatMap((columns, r) => columns.map((c): Cell => [r, c]));
}

/** Each seed cell grows into unclaimed orthogonal neighbors at random until the grid is full. */
function seedRegions(size: number, seeds: Cell[], random: () => number): Grid<number> {
  const regions = makeGrid<number | null>(size, null);
  const frontier: [Cell, number][] = [];
  const claim = ([r, c]: Cell, id: number) => {
    regions[r][c] = id;
    for (const [dr, dc] of STEPS) {
      if (regions[r + dr]?.[c + dc] === null) frontier.push([[r + dr, c + dc], id]);
    }
  };
  seeds.forEach((cell, id) => claim(cell, id));
  while (frontier.length) {
    const i = Math.floor(random() * frontier.length);
    [frontier[i], frontier[frontier.length - 1]] = [frontier[frontier.length - 1], frontier[i]];
    const [[r, c], id] = frontier.pop()!;
    if (regions[r][c] === null) claim([r, c], id);
  }
  return regions as Grid<number>;
}

/** Merge adjacent regions in pairs that reach `minSize` together, or null when no pairing covers them all. */
function pairRegions(regions: Grid<number>, minSize: number, random: () => number): Grid<number> | null {
  const groups = regionGroups(regions);
  const near = new Map([...groups.keys()].map((id) => [id, new Set<number>()]));
  regions.forEach((row, r) =>
    row.forEach((id, c) => {
      for (const other of [row[c + 1], regions[r + 1]?.[c]]) {
        if (other === undefined || other === id) continue;
        near.get(id)!.add(other);
        near.get(other)!.add(id);
      }
    }),
  );
  const partner = new Map<number, number>();
  const sizeOf = (id: number) => groups.get(id)!.length;
  const options = (id: number) =>
    [...near.get(id)!].filter((other) => !partner.has(other) && sizeOf(id) + sizeOf(other) >= minSize);
  let steps = 0;
  const match = (): boolean => {
    const left = [...groups.keys()].filter((id) => !partner.has(id));
    if (!left.length) return true;
    if (++steps > MATCH_STEPS) return false;
    // The region with the fewest partners left is the hardest to place, so it goes first.
    const id = left.reduce((a, b) => (options(b).length < options(a).length ? b : a));
    for (const other of shuffle(options(id), random)) {
      partner.set(id, other).set(other, id);
      if (match()) return true;
      partner.delete(id);
      partner.delete(other);
    }
    return false;
  };
  if (!match()) return null;
  const ids = new Map<number, number>();
  return regions.map((row) =>
    row.map((id) => {
      const pair = Math.min(id, partner.get(id)!);
      if (!ids.has(pair)) ids.set(pair, ids.size);
      return ids.get(pair)!;
    }),
  );
}

const smallest = (regions: Grid<number>) =>
  Math.min(...[...regionGroups(regions).values()].map((cells) => cells.length));

/** Regions grown around a random star layout, so each one holds `stars` of the target stars. */
export function seedLayout(
  size: number,
  stars: StarCount,
  random: () => number,
): { regions: Grid<number>; target: Cell[] } | null {
  const target = randomStars(size, stars, random);
  for (let i = 0; i < SEED_TRIES; i++) {
    const grown = seedRegions(size, target, random);
    const regions = stars === 1 ? grown : pairRegions(grown, MIN_REGION[stars], random);
    if (regions && smallest(regions) >= MIN_REGION[stars]) return { regions, target };
  }
  return null;
}
