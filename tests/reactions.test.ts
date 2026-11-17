import { beforeEach, describe, expect, it } from 'vitest';
import { Sim, type Enemy } from '../src/sim';

let sim: Sim;
function mk(x: number, y: number, hp = 1000): Enemy {
  const e = sim.spawnEnemy('drone', x, y);
  e.hp = e.maxHp = hp;
  return e;
}
function refresh(): void {
  sim.grid.rebuild(sim.enemies);
}
function hit(e: Enemy, element: 'fire' | 'electric' | 'ice' | 'kinetic' | 'water', amount = 10): void {
  refresh();
  sim.hitEnemy(e, { amount, element, canReact: true });
}

beforeEach(() => {
  sim = new Sim(42);
  sim.fx.enabled = false;
  sim.player.x = 100;
  sim.player.y = 100;
});

describe('реакции на целях', () => {
  it('INFERNO: Oiled + Fire → взрыв по области, Burning, снимает Oiled', () => {
    const a = mk(600, 300), b = mk(640, 300), far = mk(900, 600);
    a.st.oiled = 5; b.st.oiled = 5; far.st.oiled = 5;
    hit(a, 'fire', 10);
    expect(sim.reactionCounts.inferno).toBe(1);
    expect(a.st.oiled).toBe(0);
    expect(b.st.oiled).toBe(0); // consumeAll
    expect(b.hp).toBeLessThan(1000 - 40);
    expect(b.st.burning).toBeGreaterThan(0);
    expect(far.hp).toBe(1000);
    expect(far.st.oiled).toBe(5);
  });

  it('INFERNO срабатывает один раз на кластер, а не по разу на каждого врага', () => {
    const es = [0, 1, 2, 3, 4].map((i) => mk(600 + i * 15, 300));
    es.forEach((e) => (e.st.oiled = 5));
    hit(es[0], 'fire');
    expect(sim.reactionCounts.inferno).toBe(1);
  });

  it('без Oiled огонь не даёт реакцию', () => {
    const a = mk(600, 300);
    hit(a, 'fire', 10);
    expect(sim.reactionCounts.inferno).toBeUndefined();
    expect(a.hp).toBe(990);
  });

  it('OVERLOAD: Oiled + Electric → станит', () => {
    const a = mk(600, 300), b = mk(630, 300);
    a.st.oiled = 5; b.st.oiled = 5;
    hit(a, 'electric');
    expect(sim.reactionCounts.overload).toBe(1);
    expect(b.st.stunned).toBeGreaterThan(1);
  });

  it('CONDUCTION: Wet + Electric → цепь только по мокрым', () => {
    const a = mk(600, 300), b = mk(700, 300), c = mk(800, 300), dry = mk(650, 340);
    a.st.wet = 5; b.st.wet = 5; c.st.wet = 5;
    hit(a, 'electric');
    expect(sim.reactionCounts.conduction).toBe(1);
    expect(b.hp).toBeLessThan(1000);
    expect(c.hp).toBeLessThan(1000);
    expect(b.st.wet).toBe(0);
    expect(dry.hp).toBe(1000);
  });

  it('STEAM: Wet + Fire', () => {
    const a = mk(600, 300), b = mk(640, 300);
    a.st.wet = 5; b.st.wet = 5;
    hit(a, 'fire');
    expect(sim.reactionCounts.steam).toBe(1);
    expect(b.hp).toBeLessThan(1000);
    expect(b.st.chilled).toBeGreaterThan(0);
  });

  it('FLASH FREEZE: Wet + Ice замораживает только мокрых рядом', () => {
    const a = mk(600, 300), b = mk(640, 300), dry = mk(620, 330);
    a.st.wet = 5; b.st.wet = 5;
    hit(a, 'ice');
    expect(sim.reactionCounts.flashfreeze).toBe(1);
    expect(a.st.frozen).toBeGreaterThan(1);
    expect(b.st.frozen).toBeGreaterThan(1);
    expect(dry.st.frozen).toBe(0);
  });

  it('SHATTER: Frozen + Kinetic → урон по области и снимает заморозку', () => {
    const a = mk(600, 300), b = mk(640, 300);
    a.st.frozen = 5;
    hit(a, 'kinetic', 10);
    expect(sim.reactionCounts.shatter).toBe(1);
    expect(a.st.frozen).toBe(0);
    expect(b.hp).toBeLessThan(1000 - 30);
  });

  it('THERMAL SHOCK: Burning + Ice', () => {
    const a = mk(600, 300);
    a.st.burning = 3; a.burnDps = 5;
    hit(a, 'ice');
    expect(sim.reactionCounts.thermal).toBe(1);
    expect(a.st.burning).toBe(0);
  });

  it('реакция убивает цель и всех рядом — без падений и дубликатов', () => {
    const es = [0, 1, 2].map((i) => mk(600 + i * 20, 300, 5));
    es.forEach((e) => (e.st.oiled = 5));
    hit(es[0], 'fire', 1);
    expect(es.every((e) => !e.alive)).toBe(true);
    expect(sim.kills).toBe(3);
    expect(sim.crystals.length).toBeGreaterThan(0);
  });
});

describe('масштабирование статами', () => {
  it('Reaction Damage увеличивает урон реакции', () => {
    const run = (rd: number) => {
      sim = new Sim(1); sim.fx.enabled = false; sim.player.x = 50;
      if (rd) sim.applyMods('t', 't', [{ stat: 'reactionDamage', op: 'add', value: rd }]);
      const a = mk(600, 300), b = mk(640, 300);
      a.st.oiled = 5; b.st.oiled = 5;
      hit(a, 'fire', 0);
      return 1000 - b.hp;
    };
    const base = run(0), buffed = run(100);
    expect(buffed / base).toBeGreaterThan(1.9);
    expect(buffed / base).toBeLessThan(2.1);
  });
  it('AOE увеличивает радиус реакции', () => {
    const run = (aoe: number) => {
      sim = new Sim(1); sim.fx.enabled = false; sim.player.x = 50;
      if (aoe) sim.applyMods('t', 't', [{ stat: 'aoe', op: 'add', value: aoe }]);
      const a = mk(600, 300), b = mk(600 + 140, 300);
      a.st.oiled = 5;
      hit(a, 'fire', 0);
      return b.hp;
    };
    expect(run(0)).toBe(1000);
    expect(run(50)).toBeLessThan(1000);
  });
  it('Fire Damage увеличивает урон Inferno (стихия реакции)', () => {
    const run = (fd: number) => {
      sim = new Sim(1); sim.fx.enabled = false; sim.player.x = 50;
      if (fd) sim.applyMods('t', 't', [{ stat: 'fireDamage', op: 'add', value: fd }]);
      const a = mk(600, 300), b = mk(640, 300);
      a.st.oiled = 5; b.st.oiled = 5;
      hit(a, 'fire', 0);
      return 1000 - b.hp;
    };
    expect(run(50) / run(0)).toBeGreaterThan(1.4);
  });
});

describe('лужи и цепные реакции', () => {
  it('враг в луже масла получает Oiled, в воде — Wet', () => {
    const a = mk(500, 300), b = mk(800, 300);
    sim.addZone('oil', 500, 300, 40, 10);
    sim.addZone('water', 800, 300, 40, 10);
    sim.update(1 / 60, 0, 0);
    expect(a.st.oiled).toBeGreaterThan(0);
    expect(b.st.wet).toBeGreaterThan(0);
  });

  it('огонь в луже масла → OIL BLAST и цепь по соседним лужам', () => {
    const z1 = sim.addZone('oil', 500, 300, 40, 10);
    const z2 = sim.addZone('oil', 600, 300, 40, 10);
    const z3 = sim.addZone('oil', 700, 300, 40, 10);
    const zFar = sim.addZone('oil', 1200, 650, 40, 10);
    const victim = mk(720, 320);
    refresh();
    expect(sim.zoneReact(z1, 'fire')).toBe(true);
    expect(z1.dead && z2.dead && z3.dead).toBe(true);
    expect(zFar.dead).toBe(false);
    expect(sim.reactionCounts.oilblast).toBe(3);
    expect(victim.hp).toBeLessThan(1000);
    expect(victim.st.burning).toBeGreaterThan(0);
  });

  it('снаряд-фаербол, пролетая над маслом, взрывает его', () => {
    sim.addWeapon('fireball');
    const z = sim.addZone('oil', 400, 100, 45, 10);
    const target = mk(520, 100);
    target.speed = 0;
    for (let i = 0; i < 90; i++) sim.update(1 / 60, 0, 0);
    expect(z.dead).toBe(true);
    expect(sim.reactionCounts.oilblast).toBeGreaterThanOrEqual(1);
  });

  it('горящий враг, зашедший в масло, поджигает его', () => {
    const z = sim.addZone('oil', 500, 300, 50, 10);
    const e = mk(500, 300);
    e.st.burning = 3; e.burnDps = 1; e.speed = 0;
    sim.update(1 / 60, 0, 0);
    expect(z.dead).toBe(true);
    expect(sim.reactionCounts.oilblast).toBe(1);
  });

  it('молния по воде: POND SHOCK бьёт всех в луже и остаётся на кулдауне', () => {
    const z = sim.addZone('water', 500, 300, 55, 10);
    const a = mk(500, 300), b = mk(530, 310);
    a.speed = 0; b.speed = 0;
    sim.update(1 / 60, 0, 0);
    expect(sim.zoneReact(z, 'electric')).toBe(true);
    expect(a.hp).toBeLessThan(1000);
    expect(b.hp).toBeLessThan(1000);
    expect(z.dead).toBe(false);
    expect(sim.zoneReact(z, 'electric')).toBe(false); // кулдаун
  });

  it('лёд по воде замораживает всех в луже и расходует её', () => {
    const z = sim.addZone('water', 500, 300, 55, 10);
    const a = mk(500, 300);
    refresh();
    sim.zoneReact(z, 'ice');
    expect(a.st.frozen).toBeGreaterThan(1);
    expect(z.dead).toBe(true);
  });

  it('взрыв Inferno поджигает масляную лужу рядом (цепная реакция)', () => {
    const a = mk(600, 300);
    a.st.oiled = 5;
    const z = sim.addZone('oil', 680, 300, 40, 10);
    hit(a, 'fire');
    expect(z.dead).toBe(true);
    expect(sim.reactionCounts.oilblast).toBe(1);
  });

  it('вода гасит горящего врага в луже', () => {
    sim.addZone('water', 500, 300, 50, 10);
    const e = mk(500, 300);
    e.st.burning = 3; e.burnDps = 1; e.speed = 0;
    sim.update(1 / 60, 0, 0);
    expect(e.st.burning).toBe(0);
  });
});

describe('статусы', () => {
  it('Frozen/Stunned: иммунитет после окончания (нет стан-лока)', () => {
    const e = mk(600, 300);
    e.speed = 0;
    sim.applyStatus(e, 'stunned', 0.1);
    for (let i = 0; i < 20; i++) sim.update(1 / 60, 0, 0);
    expect(e.st.stunned).toBe(0);
    sim.applyStatus(e, 'stunned', 1);
    expect(e.st.stunned).toBe(0);
  });
  it('заморозка тушит горение; замороженного нельзя поджечь', () => {
    const e = mk(600, 300);
    e.st.burning = 3;
    sim.applyStatus(e, 'frozen', 2);
    expect(e.st.burning).toBe(0);
    sim.applyStatus(e, 'burning', 3, 5);
    expect(e.st.burning).toBe(0);
  });
  it('босс сопротивляется контролю', () => {
    const b = sim.spawnEnemy('boss', 600, 300);
    const d = sim.spawnEnemy('drone', 700, 300);
    sim.applyStatus(b, 'frozen', 2);
    sim.applyStatus(d, 'frozen', 2);
    expect(b.st.frozen).toBeLessThan(d.st.frozen * 0.5);
  });
  it('Effect Duration удлиняет статусы', () => {
    const e = mk(600, 300);
    sim.applyMods('t', 't', [{ stat: 'effectDuration', op: 'add', value: 100 }]);
    sim.applyStatus(e, 'wet', 3);
    expect(e.st.wet).toBeCloseTo(6);
  });
  it('горение наносит урон со временем', () => {
    const e = mk(600, 300, 100);
    e.speed = 0;
    sim.applyStatus(e, 'burning', 3, 10);
    for (let i = 0; i < 60; i++) sim.update(1 / 60, 0, 0);
    expect(e.hp).toBeLessThan(95);
  });
});
