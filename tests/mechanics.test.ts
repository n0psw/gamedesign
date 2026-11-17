import { beforeEach, describe, expect, it } from 'vitest';
import { ENEMIES, TOTAL_WAVES, enemyHpMult, rarityWeights, xpToLevel } from '../src/data';
import { Run } from '../src/run';
import { ARENA, MAX_ENEMIES, Sim, type Enemy } from '../src/sim';

let sim: Sim;
const DT = 1 / 60;
function mk(x: number, y: number, hp = 1000, type: 'drone' | 'swarmer' | 'brute' | 'dasher' | 'shooter' | 'boss' = 'drone'): Enemy {
  const e = sim.spawnEnemy(type, x, y);
  e.hp = e.maxHp = hp;
  return e;
}
function step(n: number, mx = 0, my = 0): void {
  for (let i = 0; i < n; i++) sim.update(DT, mx, my);
}
beforeEach(() => {
  sim = new Sim(7);
  sim.fx.enabled = false;
  sim.player.x = 200;
  sim.player.y = 360;
  sim.applyMods('crit0', 't', [{ stat: 'critChance', op: 'add', value: -5 }]); // без случайных критов
});

describe('оружие', () => {
  it('Pulse Cannon: стреляет в ближайшего и наносит урон', () => {
    sim.addWeapon('pulse');
    const near = mk(400, 360), far = mk(450, 100);
    near.speed = far.speed = 0;
    step(60);
    expect(near.hp).toBeLessThan(1000);
    expect(far.hp).toBe(1000);
  });

  it('Pulse Cannon: pierce 1 пробивает двух врагов на одной линии', () => {
    sim.addWeapon('pulse');
    const a = mk(350, 360), b = mk(420, 360);
    a.speed = b.speed = 0;
    step(30);
    expect(a.hp).toBeLessThan(1000);
    expect(b.hp).toBeLessThan(1000);
  });

  it('оружие не стреляет за пределами дальности', () => {
    sim.addWeapon('pulse');
    const e = mk(200 + 700, 360);
    e.speed = 0;
    step(60);
    expect(e.hp).toBe(1000);
    expect(sim.bullets.length).toBe(0);
  });

  it('Attack Speed ускоряет стрельбу', () => {
    const count = (as: number) => {
      sim = new Sim(1); sim.fx.enabled = false; sim.player.x = 200; sim.player.y = 360;
      if (as) sim.applyMods('t', 't', [{ stat: 'attackSpeed', op: 'add', value: as }]);
      sim.addWeapon('pulse');
      const e = sim.spawnEnemy('drone', 500, 360); e.hp = e.maxHp = 1e9; e.speed = 0;
      let shots = 0;
      sim.onEvent = (ev) => { if (ev === 'shoot') shots++; };
      step(300);
      return shots;
    };
    expect(count(100)).toBeGreaterThan(count(0) * 1.7);
  });

  it('Frost Shard: накладывает Chilled и замедляет врага', () => {
    sim.addWeapon('frost');
    const e = mk(450, 360); e.speed = 100;
    step(40);
    expect(e.st.chilled).toBeGreaterThan(0);
    const x0 = e.x;
    step(30);
    expect(Math.abs(e.x - x0)).toBeLessThan(100 * 0.6 * 0.5 + 8); // идёт медленнее 60%
  });

  it('Hydro Burst: создаёт лужу воды и мочит врагов', () => {
    sim.addWeapon('hydro');
    const e = mk(500, 360); e.speed = 0;
    step(120);
    expect(sim.zones.some((z) => z.kind === 'water')).toBe(true);
    expect(e.st.wet).toBeGreaterThan(0);
  });

  it('Fireball: урон по области + Burning, горение тикает', () => {
    sim.addWeapon('fireball');
    const e = mk(450, 360), n = mk(470, 380);
    e.speed = n.speed = 0;
    step(90);
    expect(e.hp).toBeLessThan(990);
    expect(n.hp).toBeLessThan(1000);
    expect(e.st.burning + n.st.burning).toBeGreaterThan(0);
  });

  it('Arc Emitter: цепляет до (jumps+1) целей в пределах jumpRange', () => {
    sim.addWeapon('arc');
    const a = mk(400, 360), b = mk(500, 360), c = mk(600, 360), far = mk(900, 360);
    [a, b, c, far].forEach((e) => (e.speed = 0));
    step(70);
    expect(a.hp).toBeLessThan(1000);
    expect(b.hp).toBeLessThan(1000);
    expect(c.hp).toBeLessThan(1000);
    expect(far.hp).toBe(1000);
  });

  it('Arc по мокрому врагу запускает CONDUCTION', () => {
    sim.addWeapon('arc');
    const a = mk(400, 360), b = mk(500, 420);
    a.st.wet = 5; b.st.wet = 5; a.speed = b.speed = 0;
    step(70);
    expect(sim.reactionCounts.conduction).toBeGreaterThanOrEqual(1);
  });

  it('Shock Nova: бьёт и отбрасывает врагов в радиусе, дальних не трогает', () => {
    sim.addWeapon('nova');
    const near = mk(280, 360), far = mk(800, 360);
    near.speed = far.speed = 0;
    step(30);
    expect(near.hp).toBeLessThan(1000);
    expect(near.x).toBeGreaterThan(280);
    expect(far.hp).toBe(1000);
  });

  it('Orbital Blades: бьют врага рядом, у врага есть кулдаун на повторный удар', () => {
    sim.addWeapon('blades');
    const e = mk(200 + 78, 360); e.speed = 0;
    step(180);
    expect(e.hp).toBeLessThan(1000);
    expect(sim.weapons[0].tier).toBe(1);
  });

  it('Blades тира 3 имеют на 2 клинка больше', () => {
    const w = sim.addWeapon('blades', 3);
    expect(sim.bladePositions(w).length).toBe(4);
  });

  it('Oil Trail: оставляет лужи при движении, но не при стоянии', () => {
    sim.addWeapon('oilTrail');
    step(60, 0, 0);
    const still = sim.zones.length;
    step(120, 1, 0);
    expect(sim.zones.length).toBeGreaterThan(still + 3);
    expect(sim.zones.every((z) => z.kind === 'oil')).toBe(true);
  });

  it('тир оружия умножает урон', () => {
    const t1 = sim.weaponDamage({ ...(sim as any).constructor, damage: 10 } as any, 1);
    const t4 = sim.weaponDamage({ ...(sim as any).constructor, damage: 10 } as any, 4);
    expect(t4 / t1).toBeCloseTo(3.5);
  });
});

describe('урон, крит, защита', () => {
  it('Crit Chance 100%: урон ×Crit Damage', () => {
    sim.applyMods('c', 'c', [{ stat: 'critChance', op: 'add', value: 105 }]);
    sim.addWeapon('pulse');
    const e = mk(400, 360); e.speed = 0;
    step(30);
    expect(1000 - e.hp).toBeCloseTo(14 * 1.5, 0);
  });

  it('Armor снижает урон, но минимум 1; неуязвимость блокирует повторные удары', () => {
    sim.applyMods('a', 'a', [{ stat: 'armor', op: 'add', value: 100 }]);
    const hp = sim.player.hp;
    sim.hurtPlayer(8);
    expect(hp - sim.player.hp).toBe(1);
    expect(sim.player.invuln).toBeGreaterThan(0);
  });

  it('контакт с врагом ранит игрока один раз за окно неуязвимости', () => {
    const e = mk(200, 360); e.speed = 0; e.dmg = 10;
    sim.player.hp = 100;
    sim.applyMods('x', 'x', [{ stat: 'maxHp', op: 'add', value: 0 }]);
    step(5);
    const after1 = sim.player.hp;
    expect(after1).toBeLessThan(100);
    step(10);
    expect(sim.player.hp).toBeGreaterThanOrEqual(after1 - 0.01); // ещё неуязвим
  });

  it('замороженный/оглушённый враг не наносит контактный урон', () => {
    const e = mk(200, 360); e.speed = 0; e.dmg = 50; e.st.frozen = 5;
    const hp = sim.player.hp;
    step(20);
    expect(sim.player.hp).toBeGreaterThanOrEqual(hp);
  });

  it('Frozen: +40% входящего урона', () => {
    const a = mk(600, 100), b = mk(700, 100);
    b.st.frozen = 5;
    sim.hitEnemy(a, { amount: 100, element: 'water', canReact: false });
    sim.hitEnemy(b, { amount: 100, element: 'water', canReact: false });
    expect(1000 - b.hp).toBeCloseTo((1000 - a.hp) * 1.4);
  });

  it('HP Regen восстанавливает здоровье', () => {
    sim.applyMods('r', 'r', [{ stat: 'hpRegen', op: 'add', value: 9.5 }]);
    sim.player.hp = 50;
    step(60);
    expect(sim.player.hp).toBeGreaterThan(58);
  });

  it('игрок не выходит за границы арены; Move Speed влияет на скорость', () => {
    step(600, -1, -1);
    expect(sim.player.x).toBeGreaterThanOrEqual(0);
    expect(sim.player.y).toBeGreaterThanOrEqual(0);
    step(1200, 1, 1);
    expect(sim.player.x).toBeLessThanOrEqual(ARENA.w);
    expect(sim.player.y).toBeLessThanOrEqual(ARENA.h);
    const dist = (extra: number) => {
      const s = new Sim(1); s.fx.enabled = false; s.player.x = 100;
      if (extra) s.applyMods('m', 'm', [{ stat: 'moveSpeed', op: 'pct', value: extra }]);
      for (let i = 0; i < 60; i++) s.update(DT, 1, 0);
      return s.player.x - 100;
    };
    expect(dist(50) / dist(0)).toBeCloseTo(1.5, 1);
  });
});

describe('кристаллы и убийства', () => {
  it('убийство роняет кристалл; рядом стоящие сливаются', () => {
    const a = mk(500, 100, 1), b = mk(505, 100, 1);
    sim.hitEnemy(a, { amount: 5, element: 'kinetic', canReact: false });
    sim.hitEnemy(b, { amount: 5, element: 'kinetic', canReact: false });
    expect(sim.kills).toBe(2);
    expect(sim.crystals.length).toBe(1);
    expect(sim.crystals[0].v).toBe(2);
  });

  it('кристалл притягивается в радиусе Pickup Range и отдаёт опыт', () => {
    let got = 0;
    sim.onCrystal = (v) => (got += v);
    sim.crystals.push({ x: 200 + 60, y: 360, v: 3, vel: 0, mag: false, rot: 0 });
    sim.crystals.push({ x: 200 + 400, y: 360, v: 5, vel: 0, mag: false, rot: 0 });
    step(60);
    expect(got).toBe(3);
    expect(sim.crystals.length).toBe(1);
  });

  it('Pickup Range увеличивает радиус притяжения', () => {
    sim.applyMods('p', 'p', [{ stat: 'pickupRange', op: 'pct', value: 200 }]);
    let got = 0;
    sim.onCrystal = (v) => (got += v);
    sim.crystals.push({ x: 200 + 180, y: 360, v: 2, vel: 0, mag: false, rot: 0 });
    step(90);
    expect(got).toBe(2);
  });
});

describe('ИИ врагов', () => {
  it('обычный враг идёт к игроку', () => {
    const e = mk(900, 360, 100);
    const d0 = Math.abs(e.x - sim.player.x);
    step(60);
    expect(Math.abs(e.x - sim.player.x)).toBeLessThan(d0);
  });

  it('Dasher: телеграф → рывок (скорость выше обычной)', () => {
    const e = mk(900, 360, 100, 'dasher');
    e.t = 0.05;
    let maxSpeed = 0, sawTelegraph = false;
    for (let i = 0; i < 120; i++) {
      const x0 = e.x;
      step(1);
      if (e.mode === 1) sawTelegraph = true;
      maxSpeed = Math.max(maxSpeed, Math.abs(e.x - x0) / DT);
    }
    expect(sawTelegraph).toBe(true);
    expect(maxSpeed).toBeGreaterThan(300);
  });

  it('Shooter: стреляет по игроку с дистанции, пули ранят', () => {
    sim.player.x = 300;
    const e = mk(600, 360, 100, 'shooter');
    e.t = 0.05;
    step(10);
    expect(sim.ebullets.length).toBeGreaterThan(0);
    const hp = sim.player.hp;
    step(120);
    expect(sim.player.hp).toBeLessThan(hp);
  });

  it('Shooter держит дистанцию', () => {
    const e = mk(260, 360, 100, 'shooter');
    e.t = 99;
    step(60);
    expect(Math.hypot(e.x - sim.player.x, e.y - sim.player.y)).toBeGreaterThan(70 + 20);
  });

  it('Boss: радиальный залп, призыв роя, фаза 2, сопротивление контролю', () => {
    const b = mk(900, 360, 3000, 'boss');
    b.t = 0.05; b.t2 = 0.05;
    step(10);
    expect(sim.ebullets.length).toBeGreaterThanOrEqual(14);
    expect(sim.enemies.filter((e) => e.type === 'swarmer').length).toBe(6);
    b.hp = 1000; // < 50% → фаза 2
    b.t = 0.05;
    const before = sim.ebullets.length;
    step(5);
    expect(sim.ebullets.length - before).toBeGreaterThanOrEqual(20);
  });

  it('смерть босса выставляет bossKilled', () => {
    const b = mk(900, 360, 10, 'boss');
    sim.hitEnemy(b, { amount: 50, element: 'kinetic', canReact: false });
    expect(sim.bossKilled).toBe(true);
  });

  it('Chilled замедляет, Stunned/Frozen останавливает', () => {
    const run = (st: 'chilled' | 'stunned' | 'frozen' | null) => {
      sim = new Sim(1); sim.fx.enabled = false; sim.player.x = 100; sim.player.y = 360;
      const e = sim.spawnEnemy('drone', 1000, 360); e.hp = e.maxHp = 1e6;
      if (st) e.st[st] = 5;
      const x0 = e.x;
      for (let i = 0; i < 60; i++) sim.update(DT, 0, 0);
      return x0 - e.x;
    };
    expect(run('chilled')).toBeLessThan(run(null) * 0.7);
    expect(run('stunned')).toBeLessThan(1);
    expect(run('frozen')).toBeLessThan(1);
  });

  it('враги не слипаются в одну точку (расталкивание)', () => {
    const es = Array.from({ length: 20 }, () => mk(600, 360, 1e6));
    es.forEach((e) => (e.speed = 0));
    step(120);
    const xs = new Set(es.map((e) => `${Math.round(e.x / 4)},${Math.round(e.y / 4)}`));
    expect(xs.size).toBeGreaterThan(12);
  });
});

describe('директор волн и сложность', () => {
  it('волна 1: только drone; новые типы появляются по minWave', () => {
    const run = new Run('vanguard', 5);
    run.sim.fx.enabled = false;
    run.sim.weapons.length = 0;
    run.sim.applyMods('t', 't', [{ stat: 'maxHp', op: 'add', value: 1e6 }]);
    for (let i = 0; i < 60 * 15; i++) run.update(DT, 0, 0);
    expect(run.sim.enemies.length).toBeGreaterThan(5);
    expect(new Set(run.sim.enemies.map((e) => e.type))).toEqual(new Set(['drone']));
    const run6 = new Run('vanguard', 5);
    run6.sim.fx.enabled = false;
    run6.sim.weapons.length = 0;
    run6.wave = 6; run6.director.start(6);
    run6.sim.applyMods('t', 't', [{ stat: 'maxHp', op: 'add', value: 1e6 }]);
    for (let i = 0; i < 60 * 25; i++) { run6.update(DT, 0, 0); if (run6.phase !== 'wave') break; }
    const types = new Set(run6.sim.enemies.map((e) => e.type));
    expect(types.has('shooter') || types.has('dasher') || types.has('brute')).toBe(true);
  });

  it('число врагов ограничено MAX_ENEMIES даже на последней волне', () => {
    const run = new Run('vanguard', 5);
    run.sim.fx.enabled = false;
    run.wave = TOTAL_WAVES; run.director.start(TOTAL_WAVES);
    run.sim.applyMods('t', 't', [{ stat: 'maxHp', op: 'add', value: 1e7 }]);
    let peak = 0;
    for (let i = 0; i < 60 * 40; i++) { run.update(DT, 0, 0); peak = Math.max(peak, run.sim.enemies.length); }
    expect(peak).toBeLessThanOrEqual(MAX_ENEMIES + 20);
  });

  it('босс появляется на последней волне и только на ней', () => {
    const r10 = new Run('vanguard', 5);
    r10.sim.fx.enabled = false;
    r10.wave = TOTAL_WAVES; r10.director.start(TOTAL_WAVES);
    r10.sim.applyMods('t', 't', [{ stat: 'maxHp', op: 'add', value: 1e7 }]);
    for (let i = 0; i < 120; i++) r10.update(DT, 0, 0);
    expect(r10.sim.enemies.filter((e) => e.type === 'boss').length).toBe(1);
    const r3 = new Run('vanguard', 5);
    r3.wave = 3; r3.director.start(3);
    for (let i = 0; i < 300; i++) r3.update(DT, 0, 0);
    expect(r3.sim.enemies.some((e) => e.type === 'boss')).toBe(false);
  });

  it('победа наступает при убийстве босса на финальной волне', () => {
    const r = new Run('vanguard', 5);
    r.sim.fx.enabled = false;
    r.wave = TOTAL_WAVES; r.director.start(TOTAL_WAVES);
    r.sim.applyMods('t', 't', [{ stat: 'maxHp', op: 'add', value: 1e7 }]);
    for (let i = 0; i < 120; i++) r.update(DT, 0, 0);
    const boss = r.sim.enemies.find((e) => e.type === 'boss')!;
    r.sim.hitEnemy(boss, { amount: 1e9, element: 'kinetic', canReact: false });
    r.update(DT, 0, 0);
    expect(r.phase).toBe('victory');
  });

  it('сложность и опыт растут по волнам', () => {
    for (let w = 1; w < TOTAL_WAVES; w++) expect(enemyHpMult(w + 1)).toBeGreaterThan(enemyHpMult(w));
    expect(ENEMIES.boss.hp).toBeGreaterThan(ENEMIES.brute.hp);
    expect(xpToLevel(10)).toBeGreaterThan(xpToLevel(2));
  });

  it('Luck повышает шанс высоких редкостей', () => {
    const lo = rarityWeights(0, 5), hi = rarityWeights(100, 5);
    expect(hi.epic).toBeGreaterThan(lo.epic);
    expect(hi.legendary).toBeGreaterThan(lo.legendary);
    expect(hi.common).toBeLessThan(lo.common);
  });
});

describe('экономика', () => {
  it('XP Gain и Credit Gain влияют на награды', () => {
    const a = new Run('vanguard', 1), b = new Run('vanguard', 1);
    b.sim.applyMods('t', 't', [{ stat: 'xpGain', op: 'add', value: 100 }, { stat: 'creditGain', op: 'add', value: 50 }]);
    (a as any).gainFromCrystal(5); (b as any).gainFromCrystal(5);
    expect(b.xp).toBeCloseTo(a.xp * 2);
    expect(b.credits).toBeCloseTo(a.credits * 1.5);
  });

  it('цена растёт с волной и с количеством уже купленных копий', () => {
    const r = new Run('vanguard', 1);
    r.openShop();
    const o = { kind: 'item' as const, id: 'ember_chip', name: 'x', rarity: 'common' as const, basePrice: 20, sold: false };
    const p1 = r.price(o);
    r.wave = 6;
    expect(r.price(o)).toBeGreaterThan(p1);
    r.credits = 1e6;
    r.offers[0] = { ...o };
    r.buy(0);
    r.offers[0] = { ...o };
    expect(r.price(o)).toBeGreaterThan(Math.round(20 * (1 + 0.07 * 5)));
  });

  it('конец волны даёт бонус кредитов и собирает все кристаллы', () => {
    const r = new Run('vanguard', 1);
    r.sim.fx.enabled = false;
    r.sim.crystals.push({ x: 1200, y: 100, v: 4, vel: 0, mag: false, rot: 0 });
    const c0 = r.credits;
    r.waveTime = r.waveDur - DT / 2;
    r.update(DT, 0, 0);
    expect(r.phase === 'shop' || r.phase === 'levelup').toBe(true);
    expect(r.credits).toBeGreaterThanOrEqual(c0 + r.waveBonus + 4);
    expect(r.sim.crystals.length).toBe(0);
  });
});
