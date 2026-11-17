import { describe, expect, it } from 'vitest';
import { botMove, playRun } from '../src/bot';
import { CHARACTERS, ITEMS, TOTAL_WAVES } from '../src/data';
import { Run } from '../src/run';
import { MAX_ENEMIES } from '../src/sim';

function tick(run: Run, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) {
    const m = botMove(run);
    run.update(1 / 60, m.x, m.y);
    if (run.phase !== 'wave') break;
  }
}

describe('Run: поток игры', () => {
  it('старт: волна 1, оружие персонажа и статы применены', () => {
    const r = new Run('pyro', 1);
    expect(r.phase).toBe('wave');
    expect(r.sim.weapons.map((w) => w.id)).toEqual(['oilTrail', 'fireball']);
    expect(r.sim.stats.get("fireDamage")).toBe(15);
    expect(r.sim.stats.get('moveSpeed')).toBeCloseTo(250 * 0.95);
  });

  it('набор XP открывает выбор из 3 карточек и ставит игру на паузу', () => {
    const r = new Run('vanguard', 1);
    (r as any).gainFromCrystal(r.xpNeeded + 1);
    expect(r.phase).toBe('levelup');
    expect(r.cards.length).toBe(3);
    const t = r.waveTime;
    r.update(1 / 60, 0, 0);
    expect(r.waveTime).toBe(t); // пауза
  });

  it('карточки в одном предложении не повторяются', () => {
    const r = new Run('vanguard', 5);
    for (let i = 0; i < 200; i++) {
      const ids = r.rollCards(3).map((c) => c.id);
      expect(new Set(ids).size).toBe(3);
    }
  });

  it('выбор карточки меняет статы и возвращает в бой', () => {
    const r = new Run('vanguard', 1);
    (r as any).gainFromCrystal(r.xpNeeded + 1);
    const card = r.cards[0];
    const before = card.mods.map((m) => r.sim.stats.get(m.stat));
    expect(r.pickCard(0)).toBe(true);
    card.mods.forEach((m, i) => expect(r.sim.stats.get(m.stat)).not.toBe(before[i]));
    expect(r.phase).toBe('wave');
  });

  it('несколько повышений уровня подряд показываются по очереди', () => {
    const r = new Run('vanguard', 1);
    (r as any).gainFromCrystal(500);
    const n = r.pendingLevelUps;
    expect(n).toBeGreaterThan(2);
    for (let i = 0; i < n; i++) { expect(r.phase).toBe('levelup'); r.pickCard(0); }
    expect(r.phase).toBe('wave');
    expect(r.pendingLevelUps).toBe(0);
  });

  it('+Max HP из карточки лечит на прибавку, но не выше максимума', () => {
    const r = new Run('vanguard', 1);
    r.sim.player.hp = 50;
    r.sim.applyMods('t', 't', [{ stat: 'maxHp', op: 'add', value: 30 }]);
    expect(r.sim.player.hp).toBe(80);
    r.sim.applyMods('t2', 't', [{ stat: 'maxHp', op: 'add', value: -200 }]);
    expect(r.sim.player.hp).toBeLessThanOrEqual(r.sim.maxHp);
  });

  it('конец волны → магазин; цены растут, покупка списывает кредиты и применяет статы', () => {
    const r = new Run('vanguard', 3);
    tick(r, r.waveDur + 1);
    expect(['shop', 'levelup']).toContain(r.phase);
    while (r.phase === 'levelup') r.pickCard(0);
    expect(r.phase).toBe('shop');
    expect(r.offers.length).toBe(4);
    r.credits = 10_000;
    const idx = r.offers.findIndex((o) => o.kind === 'item');
    const o = r.offers[idx];
    const price = r.price(o);
    const mods = ITEMS.find((i) => i.id === o.id)!.mods;
    const before = r.sim.stats.get(mods[0].stat);
    expect(r.buy(idx)).toBe(true);
    expect(r.credits).toBe(10_000 - price);
    expect(r.sim.stats.get(mods[0].stat)).not.toBe(before);
    expect(r.offers[idx].sold).toBe(true);
    expect(r.buy(idx)).toBe(false); // уже куплено
  });

  it('нельзя купить без денег; реролл стоит денег', () => {
    const r = new Run('vanguard', 3);
    r.openShop();
    r.credits = 0;
    expect(r.canBuy(0)).toBe(false);
    expect(r.reroll()).toBe(false);
    r.credits = 100;
    const cost = r.rerollCost;
    expect(r.reroll()).toBe(true);
    expect(r.credits).toBe(100 - cost);
    expect(r.rerollCost).toBeGreaterThan(cost);
  });

  it('слияние: два одинаковых оружия 1-го тира → тир 2; разные не сливаются', () => {
    const r = new Run('vanguard', 3);
    r.openShop();
    r.sim.addWeapon('pulse');
    r.sim.addWeapon('nova');
    expect(r.mergeablePairs()).toEqual([[0, 1]]);
    expect(r.merge(0, 2)).toBe(false);
    expect(r.merge(0, 1)).toBe(true);
    expect(r.sim.weapons.length).toBe(2);
    expect(r.sim.weapons[0].tier).toBe(2);
    // тир 2 + тир 1 — нельзя
    r.sim.addWeapon('pulse');
    expect(r.merge(0, 2)).toBe(false);
  });

  it('слот оружия ограничен 6', () => {
    const r = new Run('vanguard', 3);
    r.openShop();
    for (let i = 0; i < 5; i++) r.sim.addWeapon('nova');
    expect(r.sim.weapons.length).toBe(6);
    r.offers[0] = { kind: 'weapon', id: 'arc', name: 'Arc', rarity: 'common', basePrice: 1, sold: false };
    r.credits = 999;
    expect(r.canBuy(0)).toBe(false);
  });

  it('следующая волна: полное лечение, зоны/враги очищены, сложность выросла', () => {
    const r = new Run('vanguard', 3);
    r.openShop();
    r.sim.player.hp = 10;
    r.sim.addZone('oil', 100, 100, 30, 5);
    const hpMult = r.sim.scale.hp;
    r.nextWave();
    expect(r.wave).toBe(2);
    expect(r.phase).toBe('wave');
    expect(r.sim.player.hp).toBe(r.sim.maxHp);
    expect(r.sim.zones.length).toBe(0);
    expect(r.sim.scale.hp).toBeGreaterThan(hpMult);
  });

  it('смерть игрока → gameover', () => {
    const r = new Run('vanguard', 1);
    r.sim.player.hp = 0.1;
    r.sim.hurtPlayer(50);
    r.update(1 / 60, 0, 0);
    expect(r.phase).toBe('gameover');
  });
});

describe('детерминизм', () => {
  it('один и тот же seed даёт идентичный результат', () => {
    const a = new Run('pyro', 77), b = new Run('pyro', 77);
    a.sim.fx.enabled = false; b.sim.fx.enabled = false;
    for (let i = 0; i < 600; i++) { a.update(1 / 60, 0.5, 0.2); b.update(1 / 60, 0.5, 0.2); }
    expect(a.sim.kills).toBe(b.sim.kills);
    expect(a.sim.enemies.length).toBe(b.sim.enemies.length);
    expect(a.sim.player.hp).toBe(b.sim.player.hp);
  });
});

describe('полные забеги ботом (smoke + инварианты)', () => {
  for (const ch of CHARACTERS) {
    it(`${ch.name}: забег завершается без NaN и без превышения лимитов`, () => {
      const r = new Run(ch.id, 11);
      r.sim.fx.enabled = false;
      let maxEnemies = 0;
      let steps = 0;
      const orig = r.sim.update.bind(r.sim);
      r.sim.update = (dt, mx, my) => {
        orig(dt, mx, my);
        maxEnemies = Math.max(maxEnemies, r.sim.enemies.length);
        if (++steps % 120 === 0) {
          const p = r.sim.player;
          if (!Number.isFinite(p.x + p.y + p.hp)) throw new Error('player NaN');
          for (const e of r.sim.enemies) if (!Number.isFinite(e.x + e.y + e.hp)) throw new Error('enemy NaN');
        }
      };
      const res = playRun(r, 'smart', 900);
      expect(['gameover', 'victory']).toContain(res.phase);
      expect(maxEnemies).toBeLessThanOrEqual(MAX_ENEMIES + 40); // + босс/призыв
      expect(r.wave).toBeLessThanOrEqual(TOTAL_WAVES);
      expect(r.sim.kills).toBeGreaterThan(0);
    });
  }
});
