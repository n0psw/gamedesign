/** Равномерная сетка для быстрых запросов «кто рядом» (сотни врагов + взрывы). */
export interface Positioned {
  x: number;
  y: number;
}

export class Grid<T extends Positioned> {
  private cols: number;
  private rows: number;
  private cells: T[][];
  constructor(w: number, h: number, private size = 64, private pad = 128) {
    this.cols = Math.ceil((w + pad * 2) / size);
    this.rows = Math.ceil((h + pad * 2) / size);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  private cx(x: number): number {
    const c = Math.floor((x + this.pad) / this.size);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  private cy(y: number): number {
    const c = Math.floor((y + this.pad) / this.size);
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  rebuild(items: readonly T[]): void {
    for (const c of this.cells) c.length = 0;
    for (const it of items) this.cells[this.cy(it.y) * this.cols + this.cx(it.x)].push(it);
  }

  /** Вызывает cb для всех объектов в ячейках, пересекающих круг (x,y,r). Точная проверка — на вызывающем. */
  forEachNear(x: number, y: number, r: number, cb: (t: T) => void): void {
    const x0 = this.cx(x - r), x1 = this.cx(x + r);
    const y0 = this.cy(y - r), y1 = this.cy(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * this.cols + cx];
        for (let i = 0; i < cell.length; i++) cb(cell[i]);
      }
    }
  }
}
