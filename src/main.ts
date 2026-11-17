import { Game } from './game';
import { Input } from './input';
import { ARENA } from './sim';

export const SIM_DT = 1 / 60;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// Логическое разрешение арены фиксировано, canvas масштабируется под окно.
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(window.innerWidth / ARENA.w, window.innerHeight / ARENA.h);
  const cssW = ARENA.w * scale;
  const cssH = ARENA.h * scale;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.style.left = `${(window.innerWidth - cssW) / 2}px`;
  canvas.style.top = `${(window.innerHeight - cssH) / 2}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / ARENA.w, 0, 0, canvas.height / ARENA.h, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const input = new Input(canvas);
const game = new Game(input);
if (import.meta.env.DEV) {
  // для автотестов в браузере (в продакшн-сборку не попадает)
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
  void import('./bot').then((b) => { w.__bot = b; });
}

// Фиксированный шаг симуляции + рендер каждый кадр.
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= SIM_DT) {
    game.update(SIM_DT);
    input.endFrame();
    acc -= SIM_DT;
  }
  game.render(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
