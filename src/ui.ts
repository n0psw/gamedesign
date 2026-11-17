import {
  CHARACTERS, ELEMENT_COLOR, ENEMIES, ITEMS, MAX_WEAPONS, RARITY_INFO, TOTAL_WAVES, WEAPONS,
  type EnemyType,
} from './data';
import { tierLabel, weaponLines } from './describe';
import { REACTIONS, REACTION_BY_ID, reactionDetail, reactionFormula } from './reactions';
import { C, FONT } from './render';
import { Run, type Offer } from './run';
import { ARENA } from './sim';
import { STAT_DEFS, STAT_KEYS, formatMod, fmtStat, type StatGroup, type StatKey } from './stats';

export interface Btn { id: string; x: number; y: number; w: number; h: number; enabled: boolean }

export interface BestRecord { wave: number; time: number; kills: number; wins: number }

interface TextOpts { size?: number; color?: string; align?: CanvasTextAlign; bold?: boolean; base?: CanvasTextBaseline; alpha?: number }

export class Ui {
  buttons: Btn[] = [];
  mouse = { x: -1, y: -1 };
  hover: string | null = null;
  tooltip: { x: number; y: number; title: string; lines: string[] } | null = null;

  begin(mouse: { x: number; y: number }): void {
    this.buttons = [];
    this.mouse = mouse;
    this.hover = null;
    this.tooltip = null;
  }

  hit(x: number, y: number): Btn | null {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (b.enabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  /** Регистрирует кликабельную область. true если под курсором. */
  region(id: string, x: number, y: number, w: number, h: number, enabled = true): boolean {
    this.buttons.push({ id, x, y, w, h, enabled });
    const over = enabled && this.mouse.x >= x && this.mouse.x <= x + w && this.mouse.y >= y && this.mouse.y <= y + h;
    if (over) this.hover = id;
    return over;
  }

  button(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number, label: string, o: { enabled?: boolean; color?: string; size?: number } = {}): boolean {
    const enabled = o.enabled !== false;
    const color = enabled ? (o.color ?? C.player) : C.dim;
    const over = this.region(id, x, y, w, h, enabled);
    ctx.save();
    ctx.fillStyle = over ? color : 'rgba(0,0,0,0.6)';
    ctx.globalAlpha = over ? 0.22 : 1;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = over ? 2 : 1.2;
    if (over) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
    text(ctx, label, x + w / 2, y + h / 2, { size: o.size ?? 16, color: enabled ? (over ? C.white : color) : C.dim, align: 'center', base: 'middle', bold: true });
    return over;
  }
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts = {}): void {
  ctx.save();
  ctx.font = `${o.bold ? 'bold ' : ''}${o.size ?? 16}px ${FONT}`;
  ctx.fillStyle = o.color ?? C.hud;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.base ?? 'top';
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color = C.dim, fill = 'rgba(2,10,12,0.92)'): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}

function dim(ctx: CanvasRenderingContext2D, a = 0.78): void {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
}

function modColor(v: number): string {
  return v >= 0 ? C.good : C.bad;
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ───────────────────────── HUD ─────────────────────────
export interface FeedEntry { id: string; count: number; t: number }

export function drawHud(ctx: CanvasRenderingContext2D, run: Run, feed: FeedEntry[]): void {
  const sim = run.sim;
  // HP
  const hpW = 260;
  const hp = Math.max(0, sim.player.hp);
  ctx.strokeStyle = C.dim; ctx.lineWidth = 1;
  ctx.strokeRect(20.5, 18.5, hpW, 16);
  ctx.fillStyle = hp / sim.maxHp < 0.3 ? C.bad : C.player;
  ctx.fillRect(22, 20, (hpW - 3) * Math.min(1, hp / sim.maxHp), 13);
  text(ctx, `HP ${Math.ceil(hp)}/${Math.round(sim.maxHp)}`, 28, 21, { size: 12, color: '#001014', bold: true });
  // XP
  ctx.strokeRect(20.5, 40.5, hpW, 10);
  ctx.fillStyle = '#4dffd0';
  ctx.fillRect(22, 42, (hpW - 3) * Math.min(1, run.xp / run.xpNeeded), 7);
  text(ctx, `LV ${run.level}   XP ${Math.floor(run.xp)}/${run.xpNeeded}`, 20, 54, { size: 12, color: C.hud });

  // волна
  const boss = run.wave >= TOTAL_WAVES;
  const remain = Math.max(0, run.waveDur - run.waveTime);
  text(ctx, `WAVE ${run.wave}/${TOTAL_WAVES}`, ARENA.w / 2, 14, { size: 18, color: C.hud, align: 'center', bold: true });
  text(ctx, boss && remain <= 0 ? 'OVERTIME' : remain.toFixed(1), ARENA.w / 2, 36, { size: 30, color: remain < 5 && !boss ? C.warn : C.white, align: 'center', bold: true });

  // босс
  const b = sim.enemies.find((e) => e.type === 'boss' && e.alive);
  if (b) {
    const w = 520, x = (ARENA.w - w) / 2;
    ctx.strokeStyle = C.enemy; ctx.strokeRect(x + 0.5, 78.5, w, 14);
    ctx.fillStyle = C.enemy; ctx.fillRect(x + 2, 80, (w - 3) * Math.max(0, b.hp / b.maxHp), 11);
    text(ctx, `SENTINEL  ${Math.ceil(b.hp)}/${Math.round(b.maxHp)}`, ARENA.w / 2, 96, { size: 12, color: C.enemy, align: 'center' });
  }

  // справа
  text(ctx, `CREDITS ${Math.floor(run.credits)}`, ARENA.w - 20, 18, { size: 16, color: C.warn, align: 'right', bold: true });
  text(ctx, `KILLS ${sim.kills}`, ARENA.w - 20, 40, { size: 14, align: 'right' });
  text(ctx, `ENEMIES ${sim.enemies.length}`, ARENA.w - 20, 60, { size: 12, color: C.dim, align: 'right' });

  // оружие (слева снизу)
  let y = ARENA.h - 28;
  for (let i = sim.weapons.length - 1; i >= 0; i--) {
    const w = sim.weapons[i];
    const d = WEAPONS[w.id];
    ctx.fillStyle = ELEMENT_COLOR[d.element];
    ctx.fillRect(20, y + 3, 10, 10);
    text(ctx, `${d.name}  ${tierLabel(w.tier)}`, 38, y, { size: 13, color: C.hud });
    y -= 20;
  }

  // лента реакций (справа снизу)
  let fy = ARENA.h - 28;
  for (let i = feed.length - 1; i >= 0; i--) {
    const f = feed[i];
    const r = REACTION_BY_ID[f.id];
    if (!r) continue;
    text(ctx, `${r.name}${f.count > 1 ? ` x${f.count}` : ''}`, ARENA.w - 20, fy, { size: 14, color: r.color, align: 'right', bold: true, alpha: Math.min(1, f.t * 1.2) });
    fy -= 20;
  }

  // баннер волны
  if (run.waveTime < 2.4) {
    const a = Math.min(1, (2.4 - run.waveTime) * 1.2);
    text(ctx, boss ? 'FINAL WAVE: DEFEAT THE SENTINEL' : `WAVE ${run.wave}`, ARENA.w / 2, ARENA.h / 2 - 90, { size: boss ? 30 : 48, color: boss ? C.enemy : C.player, align: 'center', bold: true, alpha: a });
    const fresh = (Object.keys(ENEMIES) as EnemyType[]).filter((t) => ENEMIES[t].minWave === run.wave && t !== 'boss');
    if (fresh.length) text(ctx, `NEW THREAT: ${fresh.map((t) => t.toUpperCase()).join(', ')}`, ARENA.w / 2, ARENA.h / 2 - 30, { size: 18, color: C.warn, align: 'center', alpha: a });
  }
}

// ───────────────────────── Меню ─────────────────────────
export function drawMenu(ctx: CanvasRenderingContext2D, ui: Ui, selected: number, best: Record<string, BestRecord>): void {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  ctx.save();
  ctx.shadowColor = C.player; ctx.shadowBlur = 24;
  text(ctx, 'SWARM SURVIVOR', 60, 36, { size: 46, color: C.player, bold: true });
  ctx.restore();
  text(ctx, '2D MINIMALIST ARENA SURVIVAL ROGUELITE', 62, 92, { size: 13, color: C.dim });

  text(ctx, 'SELECT CHARACTER', 60, 130, { size: 14, color: C.hud, bold: true });
  CHARACTERS.forEach((ch, i) => {
    const x = 60 + (i % 2) * 310, y = 155 + Math.floor(i / 2) * 175;
    const over = ui.region(`char:${i}`, x, y, 295, 163);
    const sel = i === selected;
    panel(ctx, x, y, 295, 163, sel ? C.player : over ? C.hud : C.dim, sel ? 'rgba(0,229,255,0.07)' : 'rgba(2,10,12,0.92)');
    text(ctx, `[${i + 1}] ${ch.name}`, x + 12, y + 10, { size: 17, color: sel ? C.player : C.hud, bold: true });
    const dc = ch.difficulty === 'Easy' ? C.good : ch.difficulty === 'Medium' ? C.warn : C.bad;
    text(ctx, ch.difficulty.toUpperCase(), x + 283, y + 12, { size: 11, color: dc, align: 'right', bold: true });
    text(ctx, ch.tagline, x + 12, y + 36, { size: 12, color: C.dim });
    text(ctx, 'START: ' + ch.weapons.map((w) => WEAPONS[w].name).join(' + '), x + 12, y + 58, { size: 12, color: C.white });
    ch.mods.forEach((m, k) => text(ctx, formatMod(m), x + 12, y + 84 + k * 16, { size: 12, color: modColor(m.value) }));
    const b = best[ch.id];
    if (b) text(ctx, `BEST W${b.wave} ${fmtTime(b.time)}${b.wins ? `  ★${b.wins}` : ''}`, x + 283, y + 143, { size: 11, color: C.warn, align: 'right' });
  });

  ui.button(ctx, 'start', 60, 520, 605, 52, `START RUN  [ENTER]`, { size: 20 });
  text(ctx, 'WASD / ARROWS  move      (aim & fire are automatic)', 60, 596, { size: 13, color: C.hud });
  text(ctx, 'ESC pause + stats      M mute      N damage numbers      F fullscreen', 60, 618, { size: 13, color: C.hud });
  text(ctx, 'Combine elements: soak enemies, lay oil, then ignite, shock or freeze them.', 60, 650, { size: 13, color: C.dim });
  text(ctx, 'Hover any stat in the shop or pause screen to see exactly where it comes from.', 60, 670, { size: 13, color: C.dim });

  // кодекс реакций
  const cx = 700;
  panel(ctx, cx - 14, 30, 574, 662);
  text(ctx, 'REACTION CODEX', cx, 42, { size: 16, color: C.warn, bold: true });
  text(ctx, 'trigger  →  effect (base values, scaled by your stats)', cx, 64, { size: 11, color: C.dim });
  let y = 90;
  for (const scope of ['target', 'zone'] as const) {
    text(ctx, scope === 'target' ? 'STATUS REACTIONS' : 'PUDDLE REACTIONS', cx, y, { size: 12, color: C.dim, bold: true });
    y += 20;
    for (const r of REACTIONS.filter((q) => q.scope === scope)) {
      text(ctx, r.name, cx, y, { size: 13, color: r.color, bold: true });
      text(ctx, reactionFormula(r), cx + 150, y, { size: 12, color: C.white });
      text(ctx, reactionDetail(r), cx + 12, y + 16, { size: 11, color: C.dim });
      y += 38;
    }
    y += 6;
  }
  text(ctx, 'Frozen: +40% damage taken.  Burning: damage over time.  Chilled: -40% speed.', cx, y - 2, { size: 11, color: C.hud });
}

// ───────────────────────── Level-up ─────────────────────────
export function drawLevelUp(ctx: CanvasRenderingContext2D, ui: Ui, run: Run): void {
  dim(ctx);
  text(ctx, 'LEVEL UP', ARENA.w / 2, 70, { size: 40, color: C.player, align: 'center', bold: true });
  text(ctx, `LV ${run.level}${run.pendingLevelUps > 1 ? `   (${run.pendingLevelUps - 1} more pending)` : ''}   choose 1 upgrade   [1] [2] [3]`, ARENA.w / 2, 120, { size: 14, color: C.hud, align: 'center' });
  const w = 340, h = 380, gap = 40;
  const x0 = (ARENA.w - (w * 3 + gap * 2)) / 2;
  run.cards.forEach((c, i) => {
    const x = x0 + i * (w + gap), y = 170;
    const info = RARITY_INFO[c.rarity];
    const over = ui.region(`card:${i}`, x, y, w, h);
    panel(ctx, x, y, w, h, info.color, over ? 'rgba(10,30,36,0.98)' : 'rgba(2,10,12,0.96)');
    if (over) { ctx.save(); ctx.strokeStyle = info.color; ctx.shadowColor = info.color; ctx.shadowBlur = 16; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); ctx.restore(); }
    text(ctx, info.label, x + w / 2, y + 16, { size: 12, color: info.color, align: 'center', bold: true });
    text(ctx, c.name, x + w / 2, y + 44, { size: 22, color: C.white, align: 'center', bold: true });
    ctx.fillStyle = info.color; ctx.globalAlpha = 0.5; ctx.fillRect(x + 30, y + 90, w - 60, 1); ctx.globalAlpha = 1;
    c.mods.forEach((m, k) => text(ctx, formatMod(m), x + w / 2, y + 125 + k * 42, { size: 22, color: modColor(m.value), align: 'center', bold: true }));
    text(ctx, `[${i + 1}]`, x + w / 2, y + h - 36, { size: 16, color: C.dim, align: 'center' });
  });
}

// ───────────────────────── Статы с подсказкой ─────────────────────────
export function statsPanel(ctx: CanvasRenderingContext2D, ui: Ui, run: Run, x: number, y: number, w: number, cols = 2, rowH = 21, size = 13): void {
  const sim = run.sim;
  const groups: StatGroup[] = ['Offense', 'Elements', 'Defense', 'Utility'];
  const keys: (StatKey | StatGroup)[] = [];
  for (const g of groups) { keys.push(g); for (const k of STAT_KEYS) if (STAT_DEFS[k].group === g) keys.push(k); }
  const perCol = Math.ceil(keys.length / cols);
  const cw = w / cols;
  keys.forEach((k, i) => {
    const cx = x + Math.floor(i / perCol) * cw, cy = y + (i % perCol) * rowH;
    if (groups.includes(k as StatGroup)) {
      text(ctx, (k as string).toUpperCase(), cx, cy + 2, { size: size - 2, color: C.dim, bold: true });
      return;
    }
    const key = k as StatKey;
    const def = STAT_DEFS[key];
    const v = sim.stats.get(key);
    const changed = Math.abs(v - def.base) > 1e-6;
    const over = ui.region(`stat:${key}`, cx, cy, cw - 12, rowH);
    if (over) { ctx.fillStyle = 'rgba(0,229,255,0.1)'; ctx.fillRect(cx - 2, cy, cw - 10, rowH); }
    text(ctx, def.label, cx, cy + 2, { size, color: changed ? C.hud : C.dim });
    text(ctx, fmtStat(key, v), cx + cw - 14, cy + 2, { size, color: !changed ? C.dim : v > def.base ? C.good : C.bad, align: 'right', bold: true });
    if (over) {
      ui.tooltip = {
        x: ui.mouse.x, y: ui.mouse.y, title: def.label,
        lines: sim.stats.breakdown(key).map((b) => `${b.source}: ${b.text}`).concat([`= ${fmtStat(key, v)}`]),
      };
    }
  });
}

export function drawTooltip(ctx: CanvasRenderingContext2D, ui: Ui): void {
  const t = ui.tooltip;
  if (!t) return;
  const w = 250, h = 30 + t.lines.length * 18;
  let x = t.x + 16, y = t.y + 12;
  if (x + w > ARENA.w - 6) x = t.x - w - 12;
  if (y + h > ARENA.h - 6) y = ARENA.h - h - 6;
  panel(ctx, x, y, w, h, C.player, 'rgba(0,12,16,0.97)');
  text(ctx, t.title, x + 10, y + 8, { size: 13, color: C.player, bold: true });
  t.lines.forEach((l, i) => text(ctx, l, x + 10, y + 30 + i * 18, { size: 12, color: i === t.lines.length - 1 ? C.white : C.hud }));
}

// ───────────────────────── Магазин ─────────────────────────
function offerLines(run: Run, o: Offer): string[] {
  if (o.kind === 'weapon') return weaponLines(run.sim, o.id as never, 1).slice(0, 6);
  const it = ITEMS.find((i) => i.id === o.id)!;
  return it.mods.map(formatMod);
}

export function drawShop(ctx: CanvasRenderingContext2D, ui: Ui, run: Run): void {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  text(ctx, `WAVE ${run.wave} CLEARED`, 40, 16, { size: 26, color: C.player, bold: true });
  text(ctx, `Wave bonus +${run.waveBonus} credits    Heals fully before next wave`, 42, 48, { size: 12, color: C.dim });
  text(ctx, `CREDITS ${Math.floor(run.credits)}`, ARENA.w - 40, 18, { size: 26, color: C.warn, align: 'right', bold: true });
  text(ctx, `LV ${run.level}`, ARENA.w - 40, 50, { size: 12, color: C.dim, align: 'right' });

  const cw = 290, ch = 232, gap = 20;
  run.offers.forEach((o, i) => {
    const x = 40 + i * (cw + gap), y = 72;
    const col = RARITY_INFO[o.rarity].color;
    const can = run.canBuy(i);
    const price = run.price(o);
    const over = ui.region(`buy:${i}`, x, y, cw, ch, can);
    panel(ctx, x, y, cw, ch, o.sold ? C.dimmer : col, over ? 'rgba(10,30,36,0.98)' : 'rgba(2,10,12,0.96)');
    ctx.globalAlpha = o.sold ? 0.3 : 1;
    text(ctx, `${o.kind === 'weapon' ? 'WEAPON' : RARITY_INFO[o.rarity].label}`, x + 12, y + 10, { size: 11, color: col, bold: true });
    text(ctx, o.name, x + 12, y + 28, { size: 18, color: C.white, bold: true });
    offerLines(run, o).forEach((l, k) => {
      const m = /^([+-])/.test(l);
      text(ctx, l, x + 12, y + 62 + k * 20, { size: 14, color: m ? modColor(l.startsWith('+') ? 1 : -1) : C.hud });
    });
    ctx.globalAlpha = 1;
    const label = o.sold ? 'SOLD' : `BUY  ${price}`;
    ui.button(ctx, `buybtn:${i}`, x + 12, y + ch - 46, cw - 24, 34, label, { enabled: can, color: C.warn, size: 15 });
    // buybtn поверх карточки уже перехватывает клик
  });

  // оружие
  const py = 322;
  panel(ctx, 40, py, 610, 296);
  text(ctx, `WEAPONS ${run.sim.weapons.length}/${MAX_WEAPONS}`, 54, py + 10, { size: 14, color: C.hud, bold: true });
  const pairs = run.mergeablePairs();
  run.sim.weapons.forEach((w, i) => {
    const d = WEAPONS[w.id];
    const x = 54 + (i % 3) * 196, y = py + 36 + Math.floor(i / 3) * 112;
    const pair = pairs.find((p) => p[0] === i || p[1] === i);
    panel(ctx, x, y, 186, 102, pair ? C.warn : ELEMENT_COLOR[d.element], 'rgba(0,0,0,0.5)');
    text(ctx, d.name, x + 8, y + 7, { size: 13, color: C.white, bold: true });
    text(ctx, tierLabel(w.tier), x + 178, y + 7, { size: 13, color: ELEMENT_COLOR[d.element], align: 'right', bold: true });
    weaponLines(run.sim, w.id, w.tier).slice(1, 4).forEach((l, k) => text(ctx, l, x + 8, y + 27 + k * 15, { size: 11, color: C.hud }));
    if (pair) ui.button(ctx, `merge:${pair[0]}:${pair[1]}`, x + 8, y + 76, 170, 20, 'MERGE → TIER UP', { color: C.warn, size: 11 });
  });
  const itemY = py + 36 + 2 * 112 - 2;
  if (run.items.length) {
    const txt = run.items.map((it) => `${it.def.name}${it.count > 1 ? ` x${it.count}` : ''}`).join(' · ');
    text(ctx, txt.length > 92 ? txt.slice(0, 90) + '…' : txt, 54, itemY, { size: 11, color: C.dim });
  } else {
    text(ctx, 'No items yet', 54, itemY, { size: 11, color: C.dim });
  }

  // статы
  panel(ctx, 670, py, 570, 296);
  text(ctx, 'STATS  (hover for breakdown)', 684, py + 10, { size: 14, color: C.hud, bold: true });
  statsPanel(ctx, ui, run, 684, py + 34, 546, 2, 20, 12);

  ui.button(ctx, 'reroll', 40, 640, 270, 50, `REROLL  [R]   ${run.rerollCost}`, { enabled: run.credits >= run.rerollCost, color: C.warn });
  ui.button(ctx, 'next', 770, 640, 470, 50, `START WAVE ${run.wave + 1}  [ENTER]`, { size: 20 });
  text(ctx, 'Merge two identical weapons of the same tier to power them up.', 330, 656, { size: 12, color: C.dim });
}

// ───────────────────────── Пауза / концовка ─────────────────────────
function summaryColumn(ctx: CanvasRenderingContext2D, run: Run, x: number, y: number): void {
  const s = run.sim;
  const lines: [string, string][] = [
    ['Wave reached', `${run.wave}/${TOTAL_WAVES}`],
    ['Level', String(run.level)],
    ['Kills', String(s.kills)],
    ['Damage dealt', String(Math.round(s.damageDealt))],
    ['Damage taken', String(Math.round(s.damageTaken))],
    ['Credits earned', String(Math.round(run.totalCreditsEarned))],
  ];
  lines.forEach(([k, v], i) => { text(ctx, k, x, y + i * 22, { size: 14, color: C.dim }); text(ctx, v, x + 240, y + i * 22, { size: 14, color: C.white, align: 'right', bold: true }); });
  let yy = y + lines.length * 22 + 14;
  text(ctx, 'REACTIONS TRIGGERED', x, yy, { size: 13, color: C.warn, bold: true });
  yy += 22;
  const rc = Object.entries(s.reactionCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!rc.length) text(ctx, 'none yet', x, yy, { size: 13, color: C.dim });
  for (const [id, n] of rc) {
    text(ctx, REACTION_BY_ID[id]?.name ?? id, x, yy, { size: 13, color: REACTION_BY_ID[id]?.color ?? C.hud });
    text(ctx, String(n), x + 240, yy, { size: 13, color: C.white, align: 'right' });
    yy += 19;
  }
}

export function drawPause(ctx: CanvasRenderingContext2D, ui: Ui, run: Run): void {
  dim(ctx, 0.94);
  text(ctx, 'PAUSED', ARENA.w / 2, 24, { size: 36, color: C.player, align: 'center', bold: true });
  panel(ctx, 40, 80, 640, 530);
  text(ctx, 'STATS  (hover for breakdown)', 56, 92, { size: 14, color: C.hud, bold: true });
  statsPanel(ctx, ui, run, 56, 120, 610, 2, 21, 13);
  panel(ctx, 700, 80, 540, 530);
  text(ctx, 'RUN', 716, 92, { size: 14, color: C.hud, bold: true });
  summaryColumn(ctx, run, 716, 120);
  text(ctx, 'LOADOUT', 1000, 92, { size: 14, color: C.hud, bold: true });
  let y = 120;
  for (const w of run.sim.weapons) { text(ctx, `${WEAPONS[w.id].name} ${tierLabel(w.tier)}`, 1000, y, { size: 12, color: ELEMENT_COLOR[WEAPONS[w.id].element] }); y += 17; }
  y += 8;
  for (const it of run.items.slice(0, 14)) { text(ctx, `${it.def.name}${it.count > 1 ? ` x${it.count}` : ''}`, 1000, y, { size: 11, color: C.dim }); y += 15; }
  ui.button(ctx, 'resume', 340, 636, 280, 48, 'RESUME  [ESC]');
  ui.button(ctx, 'quit', 660, 636, 280, 48, 'QUIT TO MENU  [Q]', { color: C.bad });
}

export function drawEnd(ctx: CanvasRenderingContext2D, ui: Ui, run: Run, victory: boolean, time: number): void {
  dim(ctx, 0.93);
  const col = victory ? C.good : C.enemy;
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 22;
  text(ctx, victory ? 'SYSTEM SECURED' : 'SYSTEM FAILURE', ARENA.w / 2, 40, { size: 50, color: col, align: 'center', bold: true });
  ctx.restore();
  text(ctx, victory ? 'The Sentinel is down. Run complete.' : `Terminated on wave ${run.wave} after ${fmtTime(time)}`, ARENA.w / 2, 104, { size: 16, color: C.hud, align: 'center' });
  panel(ctx, 200, 150, 400, 420);
  summaryColumn(ctx, run, 220, 170);
  panel(ctx, 640, 150, 440, 420);
  text(ctx, 'BUILD', 660, 166, { size: 14, color: C.hud, bold: true });
  let y = 194;
  for (const w of run.sim.weapons) { text(ctx, `${WEAPONS[w.id].name} ${tierLabel(w.tier)}`, 660, y, { size: 13, color: ELEMENT_COLOR[WEAPONS[w.id].element] }); y += 19; }
  y += 8;
  for (const it of run.items.slice(0, 14)) { text(ctx, `${it.def.name}${it.count > 1 ? ` x${it.count}` : ''}`, 660, y, { size: 12, color: C.dim }); y += 17; }
  ui.button(ctx, 'retry', 340, 610, 280, 52, 'TRY AGAIN  [ENTER]');
  ui.button(ctx, 'menu', 660, 610, 280, 52, 'MENU  [ESC]', { color: C.dim });
}
