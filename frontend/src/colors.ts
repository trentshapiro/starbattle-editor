import type { Grid } from "./types";

export const PALETTE = [
  "#f8b4b4", "#fcd9a8", "#fdf2a2", "#c6efb0", "#a8e6d9", "#a9d4f5",
  "#c3c6f7", "#e2bdf2", "#f7c1dc", "#d9c7a7", "#b9e0a5", "#9fd8e8",
  "#f5b7a1", "#cfd8dc", "#e6ee9c", "#b2dfdb", "#ffccbc", "#d1c4e9",
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
