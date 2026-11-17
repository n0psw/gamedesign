import { ELEMENT_STAT, WEAPONS, type Element } from './data';
import type { Run } from './run';
import { ARENA } from './sim';
import type { StatKey } from './stats';

/** Бот: уворачивается, собирает кристаллы, выбирает карты и покупает предметы. Нужен для тестов и баланса. */
export type BotStrategy = 'smart' | 'random';

export function botMove(run: Run): { x: number; y: number } {
  const sim = run.sim;
  const p = sim.player;
  let best = { x: 0, y: 0 };
  let bestScore = -Infinity;
  const spd = sim.stats.get('moveSpeed');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    const px = p.x + dx * spd * 0.45, py = p.y + dy * spd * 0.45;
    let score = 0;
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - px, e.y - py);
      const safe = e.r + 80;
      if (d < safe) score -= ((safe - d) / safe) ** 2 * (e.type === 'brute' ? 1.5 : 1);
      if (e.type === 'dasher' && e.mode >= 1) {
        const cross = Math.abs((px - e.x) * -e.dy + (py - e.y) * e.dx);
        if (cross < 40) score -= 1;
      }
    }
    for (const b of sim.ebullets) {
      const d = Math.hypot(b.x + b.vx * 0.25 - px, b.y + b.vy * 0.25 - py);
      if (d < 50) score -= (1 - d / 50) * 2;
    }
    // стены
    const m = 70;
    if (px < m) score -= (m - px) / m;
    if (px > ARENA.w - m) score -= (px - (ARENA.w - m)) / m;
    if (py < m) score -= (m - py) / m;
    if (py > ARENA.h - m) score -= (py - (ARENA.h - m)) / m;
    // кристаллы
    let cb = 0;
    for (const c of sim.crystals) {
      const d = Math.hypot(c.x - px, c.y - py);
      if (d < 220) cb = Math.max(cb, 1 - d / 220);
    }
    score += cb * 0.35;
    // лёгкое тяготение к центру (чтобы не залипать у стен)
    score -= Math.hypot(px - ARENA.w / 2, py - ARENA.h / 2) / 4000;
    // небольшой бонус за движение (масляный след)
    score += 0.02;
    if (score > bestScore) { bestScore = score; best = { x: dx, y: dy }; }
  }
  return best;
}

const GOOD: Partial<Record<StatKey, number>> = {
  damage: 1.2, attackSpeed: 1.2, reactionDamage: 1.1, aoe: 1, maxHp: 0.5, armor: 0.7, hpRegen: 0.6, moveSpeed: 0.5,
  critChance: 0.5, critDamage: 0.4, effectDuration: 0.5, pierce: 0.8, range: 0.3, pickupRange: 0.2, xpGain: 0.3, creditGain: 0.3, luck: 0.2,
};

function modScore(run: Run, mods: readonly { stat: StatKey; op: 'add' | 'pct'; value: number }[]): number {
  const owned = new Set<Element>(run.sim.weapons.map((w) => WEAPONS[w.id].element));
  let s = 0;
  for (const m of mods) {
    let w = GOOD[m.stat] ?? 0;
    for (const el of Object.keys(ELEMENT_STAT) as Element[]) {
      if (ELEMENT_STAT[el] === m.stat) w = owned.has(el) ? 1.5 : 0.15;
    }
    const norm = m.stat === 'maxHp' ? 0.1 : m.stat === 'hpRegen' ? 12 : m.stat === 'armor' ? 6 : m.stat === 'pierce' ? 10 : m.stat === 'luck' ? 0.5 : 1;
    s += w * m.value * norm * (m.op === 'pct' && m.stat === 'moveSpeed' ? 1 : 1);
  }
  return s;
}

export function botChooseCard(run: Run, strategy: BotStrategy): void {
  if (strategy === 'random') { run.pickCard(run.rng.int(run.cards.length)); return; }
  let best = 0, bs = -Infinity;
  run.cards.forEach((c, i) => {
    const s = modScore(run, c.mods);
    if (s > bs) { bs = s; best = i; }
  });
  run.pickCard(best);
}

export function botShop(run: Run, strategy: BotStrategy): void {
  // слить всё, что можно
  for (let guard = 0; guard < 20; guard++) {
    const pairs = run.mergeablePairs();
    if (pairs.length === 0) break;
    run.merge(pairs[0][0], pairs[0][1]);
  }
  for (let guard = 0; guard < 12; guard++) {
    let bi = -1, bs = -Infinity;
    run.offers.forEach((o, i) => {
      if (!run.canBuy(i)) return;
      let s: number;
      if (strategy === 'random') s = Math.random();
      else if (o.kind === 'weapon') {
        const dup = run.sim.weapons.filter((w) => w.id === o.id).length;
        s = 40 + dup * 25 - run.sim.weapons.length * 3;
      } else {
        const item = run.items.find((x) => x.def.id === o.id);
        const def = item?.def ?? require_item(o.id);
        s = modScore(run, def.mods) * 2 + 5;
      }
      s -= run.price(o) * 0.05;
      if (s > bs) { bs = s; bi = i; }
    });
    if (bi < 0) break;
    run.buy(bi);
    for (const [a, b] of run.mergeablePairs().slice(0, 1)) run.merge(a, b);
  }
}

import { ITEMS } from './data';
function require_item(id: string) {
  return ITEMS.find((i) => i.id === id)!;
}

/** Полностью отыгрывает забег ботом. Возвращает итог. */
export function playRun(run: Run, strategy: BotStrategy, maxSeconds = 1200, dt = 1 / 60): { phase: string; wave: number; time: number } {
  let t = 0;
  let guard = 0;
  while (t < maxSeconds && guard++ < 5_000_000) {
    switch (run.phase) {
      case 'wave': {
        const m = botMove(run);
        run.update(dt, m.x, m.y);
        t += dt;
        break;
      }
      case 'levelup': botChooseCard(run, strategy); break;
      case 'shop': botShop(run, strategy); run.nextWave(); break;
      default: return { phase: run.phase, wave: run.wave, time: t };
    }
  }
  return { phase: run.phase, wave: run.wave, time: t };
}
