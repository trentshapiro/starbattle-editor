import type { Grid } from "./types";

export const PALETTE = [
  "#800000", "#9A6324", "#808000", "#469990", "#000075",
  "#e6194B", "#f58231", "#3cb44b", "#42d4f4", "#4363d8",
  "#911eb4", "#f032e6", "#a9a9a9", "#ffe119", "#bfef45",
];

export type RegionColors = Record<number, string>;

export function regionColor(region: number, colors: RegionColors): string {
  return colors[region] ?? PALETTE[region % PALETTE.length];
}

/** First palette color that no region on the grid uses yet. */
export function unusedColor(regions: Grid<number | null>, colors: RegionColors): string {
  const used = new Set<string>();
  for (const region of regions.flat()) if (region !== null) used.add(regionColor(region, colors));
  return PALETTE.find((color) => !used.has(color)) ?? PALETTE[used.size % PALETTE.length];
}

/** True when white text reads better than black on this background. */
export function isDark(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05) > (luminance + 0.05) / 0.05;
}
