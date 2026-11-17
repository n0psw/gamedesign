import { ARENA } from './sim';

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouse = { x: -1, y: -1 };
  private clicks: { x: number; y: number }[] = [];
  /** Любое взаимодействие пользователя (для разблокировки звука) */
  onGesture: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      this.onGesture();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousemove', (e) => { this.mouse = this.toLogical(e); });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse = this.toLogical(e);
      this.clicks.push({ ...this.mouse });
      this.onGesture();
    });
    canvas.addEventListener('mouseleave', () => { this.mouse = { x: -1, y: -1 }; });
  }

  private toLogical(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ARENA.w, y: ((e.clientY - r.top) / r.height) * ARENA.h };
  }

  isDown(code: string): boolean { return this.down.has(code); }
  wasPressed(code: string): boolean { return this.pressed.has(code); }
  takeClicks(): { x: number; y: number }[] {
    const c = this.clicks;
    this.clicks = [];
    return c;
  }

  moveVector(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  endFrame(): void { this.pressed.clear(); }
}
