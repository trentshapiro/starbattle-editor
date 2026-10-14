import { isDark, type RegionColors, regionColor } from "./colors";
import { cellPath } from "./rules";
import type { Cell, Grid } from "./types";

export function drawGrid(
  el: HTMLElement,
  regions: Grid<number | null>,
  colors: RegionColors,
  decorate?: (cell: HTMLElement, r: number, c: number) => void,
): void {
  const size = regions.length;
  el.style.setProperty("--size", String(size));
  const cells: HTMLElement[] = [];
  regions.forEach((row, r) =>
    row.forEach((region, c) => {
      const div = document.createElement("div");
      div.className = "cell";
      if (region !== null) {
        const color = regionColor(region, colors);
        div.style.backgroundColor = color;
        if (isDark(color)) div.classList.add("dark");
      }
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
