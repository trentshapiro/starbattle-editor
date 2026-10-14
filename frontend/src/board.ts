import { cellPath } from "./rules";
import type { Cell, Grid } from "./types";

const PALETTE = [
  "#f8b4b4", "#fcd9a8", "#fdf2a2", "#c6efb0", "#a8e6d9", "#a9d4f5", "#c3c6f7", "#e2bdf2",
  "#f7c1dc", "#d9c7a7", "#b9e0a5", "#9fd8e8", "#f5b7a1", "#cfd8dc", "#e6ee9c", "#b2dfdb",
  "#ffccbc", "#d1c4e9",
];

export function regionColor(region: number): string {
  return PALETTE[region % PALETTE.length];
}

export function drawGrid(
  el: HTMLElement,
  regions: Grid<number | null>,
  decorate?: (cell: HTMLElement, r: number, c: number) => void,
): void {
  const size = regions.length;
  el.style.setProperty("--size", String(size));
  const cells: HTMLElement[] = [];
  regions.forEach((row, r) =>
    row.forEach((region, c) => {
      const div = document.createElement("div");
      div.className = "cell";
      if (region !== null) div.style.backgroundColor = regionColor(region);
      if (r === 0 || regions[r - 1][c] !== region) div.classList.add("edge-top");
      if (c === 0 || regions[r][c - 1] !== region) div.classList.add("edge-left");
      if (r === size - 1) div.classList.add("edge-bottom");
      if (c === size - 1) div.classList.add("edge-right");
      decorate?.(div, r, c);
      cells.push(div);
    }),
  );
  el.replaceChildren(...cells);
}

export interface BoardHandlers {
  start(cell: Cell, e: PointerEvent): void;
  move(cell: Cell): void;
  end(): void;
}

export class Board {
  private active = false;
  private last: Cell | null = null;

  constructor(
    readonly el: HTMLElement,
    private handlers: BoardHandlers,
  ) {
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
  }

  private cellAt(e: PointerEvent): Cell | null {
    const rect = this.el.getBoundingClientRect();
    const size = Number(this.el.style.getPropertyValue("--size"));
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * size);
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * size);
    return r >= 0 && c >= 0 && r < size && c < size ? [r, c] : null;
  }

  private onDown = (e: PointerEvent) => {
    if (this.active || (e.button !== 0 && e.button !== 2)) return;
    const cell = this.cellAt(e);
    if (!cell) return;
    e.preventDefault();
    this.el.setPointerCapture(e.pointerId);
    this.active = true;
    this.last = cell;
    this.handlers.start(cell, e);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.active) return;
    const cell = this.cellAt(e);
    if (!cell) {
      this.last = null;
      return;
    }
    if (this.last && this.last[0] === cell[0] && this.last[1] === cell[1]) return;
    const path = this.last ? cellPath(this.last, cell) : [cell];
    path.forEach((step) => this.handlers.move(step));
    this.last = cell;
  };

  private onUp = () => {
    if (!this.active) return;
    this.active = false;
    this.last = null;
    this.handlers.end();
  };
}
