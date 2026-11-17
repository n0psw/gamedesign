import { describe, expect, it } from 'vitest';
import { playRun } from '../src/bot';
import { CHARACTERS, MAX_TIER, WEAPON_IDS } from '../src/data';
import { tierLabel, weaponLines } from '../src/describe';
import { Grid } from '../src/spatial';
import { Rng } from '../src/rng';
import { Run } from '../src/run';
import { Sim } from '../src/sim';

describe('weaponLines (прозрачные числа)', () => {
  it('для всех оружий и тиров даёт конечные числа без NaN', () => {
    const sim = new Sim(1);
    for (const id of WEAPON_IDS) {
      for (let t = 1; t <= MAX_TIER; t++) {
        const lines = weaponLines(sim, id, t);
        expect(lines.length).toBeGreaterThan(1);
        for (const l of lines) { expect(l).not.toMatch(/NaN|undefined|Infinity/); }
      }
    }
  });
  it('урон в описании растёт от статов', () => {
    const sim = new Sim(1);
    const before = weaponLines(sim, 'fireball').find((l) => l.startsWith('Damage'))!;
    sim.applyMods('t', 't', [{ stat: 'fireDamage', op: 'add', value: 100 }]);
    const after = weaponLines(sim, 'fireball').find((l) => l.startsWith('Damage'))!;
    expect(parseFloat(after.split(': ')[1])).toBeCloseTo(parseFloat(before.split(': ')[1]) * 2, 0);
  });
  it('tierLabel', () => { expect(tierLabel(1)).toBe('T1'); expect(tierLabel(MAX_TIER)).toBe('MAX'); });
});

describe('Grid', () => {
  it('находит соседей в радиусе и не находит далёких', () => {
    const g = new Grid<{ x: number; y: number }>(1280, 720);
    const items = [{ x: 100, y: 100 }, { x: 130, y: 100 }, { x: 900, y: 600 }, { x: -50, y: -50 }, { x: 1400, y: 900 }];
    g.rebuild(items);
    const found: unknown[] = [];
    g.forEachNear(110, 100, 40, (t) => found.push(t));
    expect(found).toContain(items[0]);
    expect(found).toContain(items[1]);
    expect(found).not.toContain(items[2]);
    const edge: unknown[] = [];
    g.forEachNear(-40, -40, 60, (t) => edge.push(t));
    expect(edge).toContain(items[3]); // объекты за краем арены не теряются
  });
});

describe('Rng', () => {
  it('детерминирован и в диапазоне', () => {
    const a = new Rng(5), b = new Rng(5);
    for (let i = 0; i < 100; i++) { const v = a.next(); expect(v).toBe(b.next()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('weighted уважает нулевые веса', () => {
    const r = new Rng(1);
    for (let i = 0; i < 200; i++) expect(r.weighted(['a', 'b'], (x) => (x === 'a' ? 0 : 1))).toBe('b');
  });
});

describe('производительность', () => {
  it('340 врагов + лужи + реакции: средний тик симуляции < 6 мс', () => {
    const sim = new Sim(3);
    sim.fx.enabled = false;
    sim.addWeapon('fireball'); sim.addWeapon('arc'); sim.addWeapon('nova'); sim.addWeapon('blades'); sim.addWeapon('oilTrail'); sim.addWeapon('hydro');
    sim.applyMods('t', 't', [{ stat: 'attackSpeed', op: 'add', value: 100 }, { stat: 'maxHp', op: 'add', value: 1e6 }]);
    for (let i = 0; i < 340; i++) {
      const e = sim.spawnEnemy((['drone', 'swarmer', 'brute', 'dasher', 'shooter'] as const)[i % 5], 100 + sim.rng.next() * 1000, 80 + sim.rng.next() * 560);
      e.hp = e.maxHp = 1e9;
    }
    for (let i = 0; i < 40; i++) sim.addZone(i % 2 ? 'oil' : 'water', 100 + sim.rng.next() * 1000, 80 + sim.rng.next() * 560, 50, 100);
    for (let i = 0; i < 60; i++) sim.update(1 / 60, 1, 0); // прогрев
    const t0 = performance.now();
    const N = 300;
    for (let i = 0; i < N; i++) sim.update(1 / 60, Math.sin(i / 30), Math.cos(i / 30));
    const avg = (performance.now() - t0) / N;
    console.log(`avg sim tick with 340 enemies: ${avg.toFixed(2)} ms`);
    expect(avg).toBeLessThan(6);
  });
});

describe('фаззинг: случайные забеги не падают и сохраняют инварианты', () => {
  it('24 забега случайной стратегией', () => {
    for (let s = 1; s <= 24; s++) {
      const ch = CHARACTERS[s % CHARACTERS.length];
      const r = new Run(ch.id, s * 997);
      r.sim.fx.enabled = false;
      const res = playRun(r, s % 2 ? 'random' : 'smart', 700);
      expect(['gameover', 'victory']).toContain(res.phase);
      const p = r.sim.player;
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.hp)).toBe(true);
      expect(r.credits).toBeGreaterThanOrEqual(0);
      expect(r.sim.weapons.length).toBeLessThanOrEqual(6);
      expect(r.pendingLevelUps).toBeGreaterThanOrEqual(0);
    }
  }, 60_000);
});
