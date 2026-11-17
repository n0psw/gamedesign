import { Sfx } from './audio';
import { CHARACTERS } from './data';
import { Input } from './input';
import { C, renderWorld } from './render';
import { REACTION_BY_ID } from './reactions';
import { Run } from './run';
import { ARENA, type SimEvent } from './sim';
import { Ui, drawEnd, drawHud, drawLevelUp, drawMenu, drawPause, drawShop, drawTooltip, text, type BestRecord, type FeedEntry } from './ui';

export type Scene = 'menu' | 'run' | 'paused';
const STORE_KEY = 'swarm-survivor-best-v1';

function loadBest(): Record<string, BestRecord> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}'); } catch { return {}; }
}
function saveBest(b: Record<string, BestRecord>): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(b)); } catch { /* приватный режим */ }
}

export class Game {
  scene: Scene = 'menu';
  run: Run | null = null;
  selected = 0;
  ui = new Ui();
  sfx = new Sfx();
  best = loadBest();
  feed: FeedEntry[] = [];
  clock = 0;
  endTime = 0;
  private lastPhase = '';
  private recorded = false;
  private seedCounter = Math.floor(Math.random() * 1e6);

  constructor(public input: Input) {
    input.onGesture = () => this.sfx.unlock();
  }

  // ───────────────────────── Управление сценами ─────────────────────────
  startRun(): void {
    const ch = CHARACTERS[this.selected];
    this.run = new Run(ch.id, ++this.seedCounter);
    this.attach(this.run);
    this.scene = 'run';
    this.feed = [];
    this.lastPhase = 'wave';
    this.recorded = false;
    this.sfx.play('wave');
  }

  private attach(run: Run): void {
    run.sim.onEvent = (ev: SimEvent, data?: string) => {
      if (ev === 'reaction' && data) {
        const last = this.feed[this.feed.length - 1];
        if (last && last.id === data && last.t > 0.2) { last.count++; last.t = 2.2; }
        else { this.feed.push({ id: data, count: 1, t: 2.2 }); if (this.feed.length > 5) this.feed.shift(); }
      }
      this.sfx.play(ev, data);
    };
  }

  private record(victory: boolean): void {
    if (!this.run || this.recorded) return;
    this.recorded = true;
    const r = this.run;
    const id = CHARACTERS[this.selected].id;
    const prev = this.best[id] ?? { wave: 0, time: 0, kills: 0, wins: 0 };
    const wave = victory ? 10 : r.wave;
    this.endTime = r.sim.time;
    const better = wave > prev.wave || (wave === prev.wave && r.sim.kills > prev.kills);
    this.best[id] = {
      wave: better ? wave : prev.wave,
      time: better ? r.sim.time : prev.time,
      kills: better ? r.sim.kills : prev.kills,
      wins: prev.wins + (victory ? 1 : 0),
    };
    saveBest(this.best);
  }

  // ───────────────────────── Обновление ─────────────────────────
  update(dt: number): void {
    this.clock += dt;
    for (const f of this.feed) f.t -= dt;
    this.feed = this.feed.filter((f) => f.t > 0);
    const inp = this.input;

    if (inp.wasPressed('KeyM')) this.sfx.muted = !this.sfx.muted;
    if (inp.wasPressed('KeyN') && this.run) this.run.sim.showNumbers = !this.run.sim.showNumbers;
    if (inp.wasPressed('KeyF')) {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    }

    const clicks = inp.takeClicks();
    const clickIds: string[] = [];
    for (const c of clicks) {
      const b = this.ui.hit(c.x, c.y);
      if (b) clickIds.push(b.id);
    }

    switch (this.scene) {
      case 'menu': this.updateMenu(clickIds); break;
      case 'paused': this.updatePaused(clickIds); break;
      case 'run': this.updateRun(dt, clickIds); break;
    }
  }

  private updateMenu(clicks: string[]): void {
    const inp = this.input;
    for (let i = 0; i < CHARACTERS.length; i++) if (inp.wasPressed(`Digit${i + 1}`)) this.selected = i;
    if (inp.wasPressed('ArrowRight') || inp.wasPressed('KeyD')) this.selected = Math.min(CHARACTERS.length - 1, this.selected + 1);
    if (inp.wasPressed('ArrowLeft') || inp.wasPressed('KeyA')) this.selected = Math.max(0, this.selected - 1);
    for (const id of clicks) {
      if (id.startsWith('char:')) { this.selected = Number(id.slice(5)); this.sfx.play('click'); }
      if (id === 'start') { this.startRun(); return; }
    }
    if (inp.wasPressed('Enter') || inp.wasPressed('Space')) this.startRun();
  }

  private updatePaused(clicks: string[]): void {
    const inp = this.input;
    if (inp.wasPressed('Escape') || inp.wasPressed('KeyP') || clicks.includes('resume')) { this.scene = 'run'; return; }
    if (inp.wasPressed('KeyQ') || clicks.includes('quit')) { this.scene = 'menu'; this.run = null; }
  }

  private updateRun(dt: number, clicks: string[]): void {
    const run = this.run!;
    const inp = this.input;
    const phase = run.phase;

    if (phase === 'wave') {
      if (inp.wasPressed('Escape') || inp.wasPressed('KeyP')) { this.scene = 'paused'; return; }
      const m = inp.moveVector();
      run.update(dt, m.x, m.y);
    } else if (phase === 'levelup') {
      for (let i = 0; i < run.cards.length; i++) {
        if (inp.wasPressed(`Digit${i + 1}`) || inp.wasPressed(`Numpad${i + 1}`)) run.pickCard(i);
      }
      for (const id of clicks) if (id.startsWith('card:')) run.pickCard(Number(id.slice(5)));
      if (inp.wasPressed('Escape')) { this.scene = 'paused'; }
    } else if (phase === 'shop') {
      for (const id of clicks) {
        if (id.startsWith('buy:') || id.startsWith('buybtn:')) {
          const i = Number(id.split(':')[1]);
          this.sfx.play(run.buy(i) ? 'buy' : 'deny');
        } else if (id.startsWith('merge:')) {
          const [, a, b] = id.split(':');
          this.sfx.play(run.merge(Number(a), Number(b)) ? 'levelup' : 'deny');
        } else if (id === 'reroll') this.sfx.play(run.reroll() ? 'click' : 'deny');
        else if (id === 'next') { run.nextWave(); this.sfx.play('wave'); }
      }
      if (inp.wasPressed('KeyR')) this.sfx.play(run.reroll() ? 'click' : 'deny');
      if (run.phase === 'shop' && (inp.wasPressed('Enter') || inp.wasPressed('Space'))) { run.nextWave(); this.sfx.play('wave'); }
      if (inp.wasPressed('Escape')) this.scene = 'paused';
    } else {
      // gameover / victory
      this.record(phase === 'victory');
      if (inp.wasPressed('Enter') || inp.wasPressed('Space') || clicks.includes('retry')) { this.startRun(); return; }
      if (inp.wasPressed('Escape') || clicks.includes('menu')) { this.scene = 'menu'; this.run = null; return; }
    }

    // звуки смены фазы
    if (this.run && this.run.phase !== this.lastPhase) {
      if (this.run.phase === 'levelup') this.sfx.play('levelup');
      if (this.run.phase === 'victory') this.sfx.play('win');
      if (this.run.phase === 'gameover') this.sfx.play('lose');
      this.lastPhase = this.run.phase;
    }
  }

  // ───────────────────────── Рендер ─────────────────────────
  render(ctx: CanvasRenderingContext2D): void {
    this.ui.begin(this.input.mouse);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);

    if (this.scene === 'menu' || !this.run) {
      drawMenu(ctx, this.ui, this.selected, this.best);
      drawTooltip(ctx, this.ui);
      return;
    }
    const run = this.run;
    const phase = run.phase;

    if (phase === 'shop' && this.scene === 'run') {
      drawShop(ctx, this.ui, run);
    } else {
      renderWorld(ctx, run.sim, this.clock);
      if (phase === 'wave' || phase === 'levelup') drawHud(ctx, run, this.feed);
      if (phase === 'levelup' && this.scene === 'run') drawLevelUp(ctx, this.ui, run);
      if (phase === 'gameover' || phase === 'victory') drawEnd(ctx, this.ui, run, phase === 'victory', this.endTime || run.sim.time);
    }
    if (this.scene === 'paused') {
      if (phase === 'shop') drawShop(ctx, new Ui(), run);
      drawPause(ctx, this.ui, run);
    }
    if (this.sfx.muted) text(ctx, 'MUTED', ARENA.w - 14, ARENA.h - 18, { size: 11, color: C.dim, align: 'right' });
    drawTooltip(ctx, this.ui);
  }
}

// чтобы REACTION_BY_ID не считался неиспользуемым при tree-shaking в dev
void REACTION_BY_ID;
