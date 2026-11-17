import {
  ELEMENT_COLOR, ELEMENT_STAT, ENEMIES, MAX_TIER, STATUS_IDS, TIER_MULT, WEAPONS,
  type Element, type EnemyType, type StatusId, type WeaponDef, type WeaponId,
} from './data';
import { Fx } from './fx';
import { Rng } from './rng';
import { REACTIONS, type Reaction } from './reactions';
import { Grid } from './spatial';
import { StatBlock, type Modifier } from './stats';

export const ARENA = { w: 1280, h: 720 };
export const PLAYER_R = 11;
export const MAX_ENEMIES = 340;

export type SimEvent = 'shoot' | 'hit' | 'explode' | 'reaction' | 'kill' | 'pickup' | 'hurt' | 'zone' | 'boss';

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  r: number; speed: number; dmg: number; xp: number;
  st: Record<StatusId, number>;
  burnDps: number;
  ccImm: number;
  bladeCd: number;
  t: number; t2: number; mode: number;
  dx: number; dy: number;
  angle: number; flash: number;
  alive: boolean;
  age: number;
}

interface Bullet {
  x: number; y: number; vx: number; vy: number;
  r: number; dmg: number; element: Element;
  life: number; pierce: number;
  kind: 'pulse' | 'fireball' | 'frost' | 'hydro';
  hit: number[];
  tier: number;
  tx: number; ty: number;
}
export interface EBullet { x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number }
export interface Zone { id: number; kind: 'oil' | 'water'; x: number; y: number; r: number; life: number; max: number; cd: number; dead: boolean }
export interface Crystal { x: number; y: number; v: number; vel: number; mag: boolean; rot: number }
export interface WeaponInst { id: WeaponId; tier: number; timer: number; angle: number; lastX: number; lastY: number }

interface Apply { status: StatusId; dur: number; dps?: number }
interface HitSpec {
  amount: number;
  element: Element;
  canReact: boolean;
  applies?: Apply[];
  crit?: boolean;
  knock?: number;
  kx?: number; ky?: number;
  silent?: boolean;
}

const newStatus = (): Record<StatusId, number> => ({ oiled: 0, wet: 0, chilled: 0, frozen: 0, burning: 0, stunned: 0 });

export class Sim {
  rng: Rng;
  stats = new StatBlock();
  player = { x: ARENA.w / 2, y: ARENA.h / 2, hp: 100, invuln: 0 };
  weapons: WeaponInst[] = [];
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  ebullets: EBullet[] = [];
  zones: Zone[] = [];
  crystals: Crystal[] = [];
  fx = new Fx();
  grid = new Grid<Enemy>(ARENA.w, ARENA.h);

  time = 0;
  kills = 0;
  damageDealt = 0;
  damageTaken = 0;
  reactionCounts: Record<string, number> = {};
  shake = 0;
  showNumbers = true;
  bossKilled = false;
  /** множители сложности текущей волны (задаёт Run) */
  scale = { hp: 1, dmg: 1, speed: 1 };

  onCrystal: (v: number) => void = () => {};
  onEvent: (ev: SimEvent, data?: string) => void = () => {};

  private nextId = 1;

  constructor(seed = 1) {
    this.rng = new Rng(seed);
    this.player.hp = this.stats.get('maxHp');
  }

  // ───────────────────────── Публичное API ─────────────────────────
  get maxHp(): number {
    return this.stats.get('maxHp');
  }

  applyMods(source: string, label: string, mods: readonly Modifier[]): void {
    const before = this.stats.get('maxHp');
    this.stats.add(source, label, mods);
    const after = this.stats.get('maxHp');
    if (after > before) this.player.hp += after - before;
    this.player.hp = Math.min(this.player.hp, after);
  }

  addWeapon(id: WeaponId, tier = 1): WeaponInst {
    const w: WeaponInst = { id, tier, timer: 0.2, angle: 0, lastX: -9999, lastY: -9999 };
    this.weapons.push(w);
    return w;
  }

  spawnEnemy(type: EnemyType, x: number, y: number): Enemy {
    const d = ENEMIES[type];
    const hp = d.hp * this.scale.hp;
    const e: Enemy = {
      id: this.nextId++, type, x, y, vx: 0, vy: 0, hp, maxHp: hp,
      r: d.r, speed: d.speed * this.scale.speed, dmg: d.dmg * this.scale.dmg, xp: d.xp,
      st: newStatus(), burnDps: 0, ccImm: 0, bladeCd: 0,
      t: type === 'dasher' ? 1 + this.rng.next() * 1.5 : type === 'shooter' ? 1 + this.rng.next() : type === 'boss' ? 3 : 0,
      t2: type === 'boss' ? 6 : 0, mode: 0, dx: 0, dy: 0, angle: 0, flash: 0, alive: true, age: 0,
    };
    this.enemies.push(e);
    return e;
  }

  /** Случайная точка за краем арены, не слишком близко к игроку. */
  edgeSpawnPos(): { x: number; y: number } {
    const m = 24;
    let best = { x: -m, y: ARENA.h / 2 };
    for (let i = 0; i < 8; i++) {
      const side = this.rng.int(4);
      const x = side === 0 ? this.rng.range(0, ARENA.w) : side === 2 ? this.rng.range(0, ARENA.w) : side === 1 ? ARENA.w + m : -m;
      const y = side === 1 ? this.rng.range(0, ARENA.h) : side === 3 ? this.rng.range(0, ARENA.h) : side === 0 ? -m : ARENA.h + m;
      best = { x, y };
      if (Math.hypot(x - this.player.x, y - this.player.y) > 170) break;
    }
    return best;
  }

  clearEnemies(): void {
    this.enemies.length = 0;
    this.ebullets.length = 0;
  }

  collectAllCrystals(): number {
    let n = 0;
    for (const c of this.crystals) { this.onCrystal(c.v); n += c.v; }
    this.crystals.length = 0;
    return n;
  }

  resetWaveState(): void {
    this.bullets.length = 0;
    this.ebullets.length = 0;
    this.zones.length = 0;
    this.enemies.length = 0;
    this.fx.clear();
    this.player.hp = this.stats.get('maxHp');
    this.player.invuln = 0.8;
    for (const w of this.weapons) { w.timer = 0.3; w.lastX = -9999; w.lastY = -9999; }
  }

  // ───────────────────────── Главный шаг ─────────────────────────
  update(dt: number, mx: number, my: number): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.updatePlayer(dt, mx, my);
    this.grid.rebuild(this.enemies);
    this.updateWeapons(dt);
    this.updateBullets(dt);
    this.updateZones(dt);
    this.updateEnemies(dt);
    this.updateEBullets(dt);
    this.updateCrystals(dt);
    this.fx.update(dt);
    this.enemies = this.enemies.filter((e) => e.alive);
    this.zones = this.zones.filter((z) => !z.dead && z.life > 0);
  }

  private updatePlayer(dt: number, mx: number, my: number): void {
    const p = this.player;
    const spd = this.stats.get('moveSpeed');
    p.x = Math.min(ARENA.w - PLAYER_R, Math.max(PLAYER_R, p.x + mx * spd * dt));
    p.y = Math.min(ARENA.h - PLAYER_R, Math.max(PLAYER_R, p.y + my * spd * dt));
    p.invuln = Math.max(0, p.invuln - dt);
    p.hp = Math.min(this.maxHp, p.hp + this.stats.get('hpRegen') * dt);
  }

  // ───────────────────────── Статы → числа ─────────────────────────
  private elemMult(el: Element): number {
    const k = ELEMENT_STAT[el];
    return k ? this.stats.mult(k) : 1;
  }
  weaponDamage(def: WeaponDef, tier: number): number {
    return def.damage * TIER_MULT[tier] * this.stats.mult('damage') * this.elemMult(def.element);
  }
  private reactionScale(el: Element): number {
    return this.stats.mult('damage') * this.elemMult(el) * this.stats.mult('reactionDamage');
  }
  private aoeMult(): number {
    return this.stats.mult('aoe');
  }
  private durMult(): number {
    return this.stats.mult('effectDuration');
  }
  private rollCrit(amount: number): { amount: number; crit: boolean } {
    if (this.rng.next() * 100 < this.stats.get('critChance')) return { amount: amount * (this.stats.get('critDamage') / 100), crit: true };
    return { amount, crit: false };
  }
  private attackSpeed(): number {
    return this.stats.mult('attackSpeed');
  }

  // ───────────────────────── Оружие ─────────────────────────
  private nearestEnemy(x: number, y: number, range: number, exclude?: number[]): Enemy | null {
    let best: Enemy | null = null;
    let bd = range * range;
    for (const e of this.enemies) {
      if (!e.alive || (exclude && exclude.includes(e.id))) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private updateWeapons(dt: number): void {
    const p = this.player;
    const as = this.attackSpeed();
    for (const w of this.weapons) {
      const def = WEAPONS[w.id];
      if (w.id === 'blades') { this.updateBlades(w, def, dt, as); continue; }
      if (w.id === 'oilTrail') {
        const spacing = def.spacing!;
        if (Math.hypot(p.x - w.lastX, p.y - w.lastY) >= spacing) {
          const r = def.aoe! * this.aoeMult() * (1 + 0.2 * (w.tier - 1));
          const life = def.life! * this.durMult() * (1 + 0.15 * (w.tier - 1));
          this.addZone('oil', p.x, p.y, r, life);
          w.lastX = p.x; w.lastY = p.y;
        }
        continue;
      }
      w.timer -= dt * as;
      if (w.timer > 0) continue;
      if (this.fireWeapon(w, def)) w.timer += def.cooldown;
      else w.timer = 0;
    }
  }

  private fireWeapon(w: WeaponInst, def: WeaponDef): boolean {
    const p = this.player;
    const range = def.range * this.stats.mult('range');
    switch (w.id) {
      case 'pulse':
      case 'fireball':
      case 'frost':
      case 'hydro': {
        const tgt = this.nearestEnemy(p.x, p.y, range);
        if (!tgt) return false;
        const dx = tgt.x - p.x, dy = tgt.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = def.speed!;
        const kind = w.id;
        const b: Bullet = {
          x: p.x, y: p.y, vx: (dx / d) * sp, vy: (dy / d) * sp,
          r: kind === 'fireball' ? 7 : kind === 'hydro' ? 8 : 4.5,
          dmg: this.weaponDamage(def, w.tier), element: def.element,
          life: (range / sp) * 1.25 + 0.2,
          pierce: kind === 'fireball' || kind === 'hydro' ? 0 : (def.pierce ?? 0) + Math.floor(this.stats.get('pierce')) + (kind === 'frost' ? w.tier - 1 : 0),
          kind, hit: [], tier: w.tier, tx: tgt.x, ty: tgt.y,
        };
        this.bullets.push(b);
        this.onEvent('shoot', kind);
        return true;
      }
      case 'arc': return this.fireArc(w, def, range);
      case 'nova': return this.fireNova(w, def);
      default: return false;
    }
  }

  private fireArc(w: WeaponInst, def: WeaponDef, range: number): boolean {
    const p = this.player;
    const first = this.nearestEnemy(p.x, p.y, range);
    if (!first) return false;
    const pts = [p.x, p.y];
    const visited: number[] = [];
    let cur: Enemy | null = first;
    const jumps = (def.jumps ?? 0) + (w.tier - 1);
    const dmg = this.weaponDamage(def, w.tier);
    for (let j = 0; j <= jumps && cur; j++) {
      visited.push(cur.id);
      pts.push(cur.x, cur.y);
      const c = this.rollCrit(dmg);
      this.hitEnemy(cur, { amount: c.amount, element: 'electric', canReact: true, crit: c.crit });
      this.igniteZones(cur.x, cur.y, 8, 'electric');
      const jr = (def.jumpRange ?? 140) * this.aoeMult();
      cur = this.nearestEnemy(cur.x, cur.y, jr, visited);
    }
    this.fx.bolt(pts, ELEMENT_COLOR.electric, 0.16, 2.5);
    this.onEvent('shoot', 'arc');
    return true;
  }

  private fireNova(w: WeaponInst, def: WeaponDef): boolean {
    const p = this.player;
    const R = def.aoe! * this.aoeMult() * (1 + 0.12 * (w.tier - 1));
    let any = false;
    for (const e of this.enemies) {
      if (e.alive && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (R * 0.9 + e.r) ** 2) { any = true; break; }
    }
    if (!any) return false;
    const dmg = this.weaponDamage(def, w.tier);
    this.fx.ring(p.x, p.y, 10, R, 0.35, ELEMENT_COLOR.kinetic, 4);
    this.onEvent('explode', 'nova');
    for (const e of this.enemiesNear(p.x, p.y, R)) {
      const c = this.rollCrit(dmg);
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      this.hitEnemy(e, { amount: c.amount, element: 'kinetic', canReact: true, crit: c.crit, knock: 300, kx: dx / d, ky: dy / d });
    }
    return true;
  }

  /** Позиции клинков (для коллизий и отрисовки). */
  bladePositions(w: WeaponInst): { x: number; y: number }[] {
    const def = WEAPONS.blades;
    const p = this.player;
    const count = (def.count ?? 2) + (w.tier - 1);
    const R = def.aoe! * (0.85 + 0.15 * this.aoeMult());
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const a = w.angle + (i * Math.PI * 2) / count;
      out.push({ x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R });
    }
    return out;
  }

  private updateBlades(w: WeaponInst, def: WeaponDef, dt: number, as: number): void {
    w.angle += dt * 3.0 * as;
    const dmg = this.weaponDamage(def, w.tier);
    const pos = this.bladePositions(w);
    for (let i = 0; i < pos.length; i++) {
      const { x: bx, y: by } = pos[i];
      const a = Math.atan2(by - this.player.y, bx - this.player.x);
      this.grid.forEachNear(bx, by, 9 + 50, (e) => {
        if (!e.alive || e.bladeCd > 0) return;
        if ((e.x - bx) ** 2 + (e.y - by) ** 2 > (e.r + 9) ** 2) return;
        e.bladeCd = 0.4 / as;
        const c = this.rollCrit(dmg);
        this.hitEnemy(e, { amount: c.amount, element: 'kinetic', canReact: true, crit: c.crit, knock: 90, kx: Math.cos(a), ky: Math.sin(a) });
      });
    }
  }

  // ───────────────────────── Снаряды ─────────────────────────
  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < -60 || b.x > ARENA.w + 60 || b.y < -60 || b.y > ARENA.h + 60) { b.life = 0; continue; }

      // реакция с лужами по пути (огонь / электричество / лёд)
      if (b.element === 'fire' || b.element === 'ice' || b.element === 'electric') {
        let triggered = false;
        for (const z of this.zones) {
          if (z.dead || (b.x - z.x) ** 2 + (b.y - z.y) ** 2 > (z.r + b.r) ** 2) continue;
          if (this.zoneReact(z, b.element)) triggered = true;
        }
        if (triggered && b.kind === 'fireball') { this.fireballImpact(b); b.life = 0; continue; }
      }

      if (b.kind === 'hydro' && (b.tx - b.x) * b.vx + (b.ty - b.y) * b.vy <= 0) { this.hydroBurst(b); b.life = 0; continue; }

      let done = false;
      this.grid.forEachNear(b.x, b.y, b.r + 50, (e) => {
        if (done || !e.alive || b.hit.includes(e.id)) return;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > (e.r + b.r) ** 2) return;
        if (b.kind === 'fireball') { this.fireballImpact(b); done = true; b.life = 0; return; }
        if (b.kind === 'hydro') { this.hydroBurst(b); done = true; b.life = 0; return; }
        b.hit.push(e.id);
        const c = this.rollCrit(b.dmg);
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const applies: Apply[] = b.kind === 'frost' ? [{ status: 'chilled', dur: WEAPONS.frost.statusDur! }] : [];
        this.hitEnemy(e, { amount: c.amount, element: b.element, canReact: true, crit: c.crit, applies, knock: 60, kx: b.vx / sp, ky: b.vy / sp });
        if (b.pierce > 0) b.pierce--;
        else { b.life = 0; done = true; }
      });
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  private fireballImpact(b: Bullet): void {
    const def = WEAPONS.fireball;
    const R = def.aoe! * this.aoeMult();
    this.fx.ring(b.x, b.y, 4, R, 0.25, ELEMENT_COLOR.fire, 3);
    this.fx.burst(b.x, b.y, ELEMENT_COLOR.fire, 10, 140, 0.4);
    this.onEvent('explode', 'fireball');
    const burn: Apply = { status: 'burning', dur: def.statusDur!, dps: b.dmg * def.burnDps! };
    for (const e of this.enemiesNear(b.x, b.y, R)) {
      const c = this.rollCrit(b.dmg);
      this.hitEnemy(e, { amount: c.amount, element: 'fire', canReact: true, crit: c.crit, applies: [burn], knock: 80, kx: (e.x - b.x) / (Math.hypot(e.x - b.x, e.y - b.y) || 1), ky: (e.y - b.y) / (Math.hypot(e.x - b.x, e.y - b.y) || 1) });
    }
    this.igniteZones(b.x, b.y, R, 'fire');
  }

  private hydroBurst(b: Bullet): void {
    const def = WEAPONS.hydro;
    const R = def.aoe! * this.aoeMult() * (1 + 0.1 * (b.tier - 1));
    this.addZone('water', b.x, b.y, R, def.life! * this.durMult());
    this.fx.ring(b.x, b.y, 4, R, 0.3, ELEMENT_COLOR.water, 3);
    this.fx.burst(b.x, b.y, ELEMENT_COLOR.water, 10, 120, 0.4);
    this.onEvent('explode', 'hydro');
    const wet: Apply = { status: 'wet', dur: def.statusDur! };
    for (const e of this.enemiesNear(b.x, b.y, R)) {
      const c = this.rollCrit(b.dmg);
      this.hitEnemy(e, { amount: c.amount, element: 'water', canReact: true, crit: c.crit, applies: [wet] });
    }
  }

  // ───────────────────────── Зоны (лужи) ─────────────────────────
  addZone(kind: 'oil' | 'water', x: number, y: number, r: number, life: number): Zone {
    const same = this.zones.filter((z) => z.kind === kind && !z.dead);
    if (same.length >= 40) same.sort((a, b) => a.life - b.life)[0].dead = true;
    const z: Zone = { id: this.nextId++, kind, x, y, r, life, max: life, cd: 0, dead: false };
    this.zones.push(z);
    return z;
  }

  private updateZones(dt: number): void {
    for (const z of this.zones) {
      if (z.dead) continue;
      z.life -= dt;
      z.cd = Math.max(0, z.cd - dt);
      const status: StatusId = z.kind === 'oil' ? 'oiled' : 'wet';
      let burning = false;
      this.grid.forEachNear(z.x, z.y, z.r + 50, (e) => {
        if (!e.alive || (e.x - z.x) ** 2 + (e.y - z.y) ** 2 > (z.r + e.r * 0.5) ** 2) return;
        e.st[status] = Math.max(e.st[status], 2);
        if (e.st.burning > 0) burning = true;
      });
      if (burning && z.kind === 'oil') this.zoneReact(z, 'fire');
      else if (burning && z.kind === 'water') {
        // горящий враг в воде тухнет
        this.grid.forEachNear(z.x, z.y, z.r + 50, (e) => {
          if (e.alive && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= (z.r + e.r * 0.5) ** 2) e.st.burning = 0;
        });
      }
    }
  }

  private zoneReaction(kind: 'oil' | 'water', element: Element): Reaction | undefined {
    return REACTIONS.find((r) => r.scope === 'zone' && r.requires === kind && r.trigger === element);
  }

  /** Возвращает true, если реакция сработала. */
  zoneReact(z: Zone, element: Element): boolean {
    if (z.dead || z.cd > 0) return false;
    const r = this.zoneReaction(z.kind, element);
    if (!r) return false;
    if (r.consumes) z.dead = true;
    else z.cd = r.cooldown ?? 1;
    this.execReaction(r, z.x, z.y, null, z.r);
    return true;
  }

  /** Любой взрыв/удар стихии поджигает/бьёт током лужи в радиусе — отсюда цепные реакции. */
  igniteZones(x: number, y: number, radius: number, element: Element): void {
    if (this.zones.length === 0) return;
    for (const z of this.zones.slice()) {
      if (z.dead) continue;
      if ((z.x - x) ** 2 + (z.y - y) ** 2 > (radius + z.r) ** 2) continue;
      this.zoneReact(z, element);
    }
  }

  // ───────────────────────── Урон и реакции ─────────────────────────
  private enemiesNear(x: number, y: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    this.grid.forEachNear(x, y, r + 50, (e) => {
      if (e.alive && (e.x - x) ** 2 + (e.y - y) ** 2 <= (r + e.r) ** 2) out.push(e);
    });
    return out;
  }

  hitEnemy(e: Enemy, h: HitSpec): void {
    if (!e.alive) return;
    if (h.canReact) {
      for (const r of REACTIONS) {
        if (r.scope === 'target' && r.trigger === h.element && e.st[r.requires as StatusId] > 0) {
          if (r.consumes) e.st[r.requires as StatusId] = 0;
          this.execReaction(r, e.x, e.y, e, 0);
          break;
        }
      }
      if (!e.alive) return;
    }
    // Frozen = хрупкий: +40% входящего урона (правило видно в кодексе)
    const amount = e.st.frozen > 0 ? h.amount * 1.4 : h.amount;
    e.hp -= amount;
    e.flash = 0.09;
    this.damageDealt += amount;
    if (h.knock && h.kx !== undefined && h.ky !== undefined && e.st.frozen <= 0) {
      const k = (h.knock * 12) / Math.max(12, e.r) / (e.type === 'boss' ? 4 : 1);
      e.vx += h.kx * k;
      e.vy += h.ky * k;
    }
    if (h.applies) for (const a of h.applies) this.applyStatus(e, a.status, a.dur, a.dps ?? 0);
    if (this.showNumbers && !h.silent && this.fx.enabled) {
      this.fx.text(e.x + (this.rng.next() - 0.5) * 10, e.y - e.r, String(Math.round(h.amount)), h.crit ? '#ffffff' : ELEMENT_COLOR[h.element], h.crit ? 17 : 12, 0.55);
    }
    this.onEvent('hit');
    if (e.hp <= 0) this.killEnemy(e);
  }

  /** Периодический/«тихий» урон без реакций (горение). */
  private dot(e: Enemy, amount: number): void {
    e.hp -= amount;
    this.damageDealt += amount;
    if (e.hp <= 0) this.killEnemy(e);
  }

  applyStatus(e: Enemy, id: StatusId, dur: number, dps = 0): void {
    const isCC = id === 'frozen' || id === 'stunned';
    if (isCC && e.ccImm > 0) return;
    let d = dur * this.durMult();
    if (isCC && e.type === 'boss') d *= 0.35;
    if (id === 'burning') {
      if (e.st.frozen > 0) return;
      e.burnDps = Math.max(e.burnDps, dps);
    }
    if (id === 'frozen') e.st.burning = 0;
    e.st[id] = Math.max(e.st[id], d);
  }

  private execReaction(r: Reaction, x: number, y: number, origin: Enemy | null, zoneR: number): void {
    this.reactionCounts[r.id] = (this.reactionCounts[r.id] ?? 0) + 1;
    this.onEvent('reaction', r.id);
    this.fx.text(x, y - 26, r.name, r.color, 15, 0.9);
    const scale = this.reactionScale(r.element);
    const ef = r.effect;
    if (ef.type === 'aoe') {
      const base = r.scope === 'zone' ? Math.max(ef.radius, zoneR + 30) : ef.radius;
      this.explode(x, y, base, ef.damage * scale, ef.element, r.color, ef.applies, ef.stun, ef.consumeAll ? (r.requires as StatusId) : undefined);
    } else if (ef.type === 'chain') {
      this.chainLightning(origin, x, y, ef.jumps, ef.range, ef.damage * scale, ef.stun ?? 0);
    } else {
      const R = ef.radius * this.aoeMult();
      this.fx.ring(x, y, 6, R, 0.4, r.color, 4);
      this.fx.burst(x, y, r.color, 16, 120, 0.5);
      this.onEvent('explode', r.id);
      for (const e of this.enemiesNear(x, y, R)) {
        if (ef.only && e.st[ef.only] <= 0 && e !== origin) continue;
        if (ef.only) e.st[ef.only] = 0;
        else e.st.wet = 0;
        this.applyStatus(e, 'frozen', ef.duration);
      }
    }
  }

  private explode(x: number, y: number, radius: number, damage: number, element: Element, color: string,
    applies?: Apply[], stun?: number, consume?: StatusId): void {
    const R = radius * this.aoeMult();
    this.fx.ring(x, y, 8, R, 0.35, color, 5);
    this.fx.ring(x, y, 4, R * 0.65, 0.25, '#ffffff', 2);
    this.fx.burst(x, y, color, Math.min(30, 8 + Math.floor(R / 6)), 220, 0.6, 3);
    this.shake = Math.min(14, this.shake + 3 + R / 40);
    this.onEvent('explode', element);
    for (const e of this.enemiesNear(x, y, R)) {
      if (consume) e.st[consume] = 0;
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy) || 1;
      this.hitEnemy(e, { amount: damage, element, canReact: false, applies, knock: 140, kx: dx / d, ky: dy / d });
      if (stun && e.alive) this.applyStatus(e, 'stunned', stun);
    }
    this.igniteZones(x, y, R, element);
  }

  private chainLightning(origin: Enemy | null, x: number, y: number, jumps: number, range: number, damage: number, stun: number): void {
    const visited: number[] = [];
    const pts = [x, y];
    let cur = origin;
    if (cur) { visited.push(cur.id); this.hitEnemy(cur, { amount: damage, element: 'electric', canReact: false }); }
    let cx = x, cy = y;
    for (let j = 0; j < jumps; j++) {
      let best: Enemy | null = null;
      let bd = (range * this.aoeMult()) ** 2;
      for (const e of this.enemies) {
        if (!e.alive || e.st.wet <= 0 || visited.includes(e.id)) continue;
        const d = (e.x - cx) ** 2 + (e.y - cy) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      visited.push(best.id);
      best.st.wet = 0;
      pts.push(best.x, best.y);
      this.hitEnemy(best, { amount: damage, element: 'electric', canReact: false });
      if (stun > 0 && best.alive) this.applyStatus(best, 'stunned', stun);
      this.igniteZones(best.x, best.y, 8, 'electric');
      cx = best.x; cy = best.y;
    }
    this.fx.bolt(pts, '#fff27a', 0.25, 3);
  }

  private killEnemy(e: Enemy): void {
    if (!e.alive) return;
    e.alive = false;
    this.kills++;
    this.dropCrystal(e.x, e.y, e.xp);
    this.fx.burst(e.x, e.y, '#ff2d3d', e.type === 'boss' ? 40 : 6, e.type === 'boss' ? 300 : 110, 0.45, 2.5);
    this.onEvent('kill');
    if (e.type === 'boss') { this.bossKilled = true; this.shake = 20; this.onEvent('boss', 'dead'); }
  }

  private dropCrystal(x: number, y: number, v: number): void {
    for (const c of this.crystals) {
      if ((c.x - x) ** 2 + (c.y - y) ** 2 < 18 * 18) { c.v += v; return; }
    }
    this.crystals.push({ x, y, v, vel: 0, mag: false, rot: this.rng.next() * 6 });
  }

  // ───────────────────────── Враги ─────────────────────────
  private updateEnemies(dt: number): void {
    const p = this.player;
    const arr = this.enemies;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (!e.alive) continue;
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.bladeCd = Math.max(0, e.bladeCd - dt);
      e.ccImm = Math.max(0, e.ccImm - dt);
      // статусы
      for (const s of STATUS_IDS) {
        if (e.st[s] > 0) {
          e.st[s] -= dt;
          if (e.st[s] <= 0) {
            e.st[s] = 0;
            if (s === 'frozen' || s === 'stunned') e.ccImm = 0.8;
            if (s === 'burning') e.burnDps = 0;
          }
        }
      }
      if (e.st.burning > 0) { this.dot(e, e.burnDps * dt); if (!e.alive) continue; }
      // нокбэк
      e.x += e.vx * dt; e.y += e.vy * dt;
      const damp = Math.exp(-9 * dt);
      e.vx *= damp; e.vy *= damp;
      if (e.st.frozen <= 0 && e.st.stunned <= 0) this.enemyAI(e, dt);
      else e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    }
    // мягкое расталкивание
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (!a.alive) continue;
      this.grid.forEachNear(a.x, a.y, a.r + 24, (b) => {
        if (b.id <= a.id || !b.alive) return;
        let dx = b.x - a.x, dy = b.y - a.y;
        const min = (a.r + b.r) * 0.8;
        if (dx === 0 && dy === 0) { dx = ((a.id + b.id) % 5) - 2 + 0.1; dy = ((a.id * 3 + b.id) % 5) - 2 + 0.1; } // совпавшие позиции
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) return;
        const d = Math.sqrt(d2);
        const push = Math.min(3, (min - d) * 0.5);
        const wa = b.type === 'boss' ? 0.1 : 0.5, wb = a.type === 'boss' ? 0.1 : 0.5;
        a.x -= (dx / d) * push * wa * 2; a.y -= (dy / d) * push * wa * 2;
        b.x += (dx / d) * push * wb * 2; b.y += (dy / d) * push * wb * 2;
      });
    }
    // контакт с игроком
    if (p.invuln <= 0) {
      for (const e of arr) {
        if (!e.alive || e.st.frozen > 0 || e.st.stunned > 0) continue;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.r * 0.85 + PLAYER_R) ** 2) {
          this.hurtPlayer(e.dmg);
          const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
          e.vx += ((e.x - p.x) / d) * 220;
          e.vy += ((e.y - p.y) / d) * 220;
          break;
        }
      }
    }
  }

  private enemyAI(e: Enemy, dt: number): void {
    const p = this.player;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    e.angle = Math.atan2(dy, dx);
    const spd = e.speed * (e.st.chilled > 0 ? 0.6 : 1);
    switch (e.type) {
      case 'dasher': {
        e.t -= dt;
        if (e.mode === 0) {
          e.x += ux * spd * dt; e.y += uy * spd * dt;
          if (e.t <= 0) { e.mode = 1; e.t = 0.55; }
        } else if (e.mode === 1) {
          e.dx = ux; e.dy = uy; // целится
          if (e.t <= 0) { e.mode = 2; e.t = 0.45; }
        } else {
          const k = e.st.chilled > 0 ? 0.6 : 1;
          e.x += e.dx * 400 * k * dt; e.y += e.dy * 400 * k * dt;
          if (e.t <= 0) { e.mode = 0; e.t = 2 + this.rng.next() * 1.2; }
        }
        break;
      }
      case 'shooter': {
        if (d > 300) { e.x += ux * spd * dt; e.y += uy * spd * dt; }
        else if (d < 210) { e.x -= ux * spd * dt; e.y -= uy * spd * dt; }
        else { e.x += -uy * spd * 0.6 * dt; e.y += ux * spd * 0.6 * dt; }
        e.t -= dt * (e.st.chilled > 0 ? 0.6 : 1);
        if (e.t <= 0 && d < 560) {
          e.t = 2.3;
          this.ebullets.push({ x: e.x, y: e.y, vx: ux * 230, vy: uy * 230, r: 5, dmg: e.dmg, life: 4 });
        }
        break;
      }
      case 'boss': {
        e.x += ux * spd * dt; e.y += uy * spd * dt;
        const phase2 = e.hp < e.maxHp * 0.5;
        e.t -= dt; e.t2 -= dt;
        if (e.t <= 0) {
          e.t = phase2 ? 3.6 : 5.5;
          const n = phase2 ? 20 : 14;
          const off = this.rng.next() * 6.28;
          for (let k = 0; k < n; k++) {
            const a = off + (k * Math.PI * 2) / n;
            this.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, r: 6, dmg: e.dmg * 0.45, life: 6 });
          }
          this.fx.ring(e.x, e.y, 20, 90, 0.4, '#ff2d3d', 3);
          this.onEvent('boss', 'burst');
        }
        if (e.t2 <= 0) {
          e.t2 = phase2 ? 6 : 9;
          for (let k = 0; k < 6 && this.enemies.length < MAX_ENEMIES; k++) {
            const a = (k * Math.PI * 2) / 6;
            this.spawnEnemy('swarmer', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60);
          }
        }
        break;
      }
      default:
        e.x += ux * spd * dt; e.y += uy * spd * dt;
    }
  }

  private updateEBullets(dt: number): void {
    const p = this.player;
    for (const b of this.ebullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < -40 || b.x > ARENA.w + 40 || b.y < -40 || b.y > ARENA.h + 40) b.life = 0;
      if (p.invuln <= 0 && b.life > 0 && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.r + PLAYER_R) ** 2) {
        this.hurtPlayer(b.dmg);
        b.life = 0;
      }
    }
    this.ebullets = this.ebullets.filter((b) => b.life > 0);
  }

  hurtPlayer(raw: number): void {
    const p = this.player;
    const dmg = Math.max(1, raw - this.stats.get('armor'));
    p.hp -= dmg;
    p.invuln = 0.6;
    this.damageTaken += dmg;
    this.shake = Math.max(this.shake, 7);
    this.fx.burst(p.x, p.y, '#00e5ff', 10, 160, 0.4);
    this.onEvent('hurt');
  }

  private updateCrystals(dt: number): void {
    const p = this.player;
    const range = this.stats.get('pickupRange');
    for (const c of this.crystals) {
      c.rot += dt * 3;
      const dx = p.x - c.x, dy = p.y - c.y;
      const d2 = dx * dx + dy * dy;
      if (!c.mag && d2 < range * range) c.mag = true;
      if (c.mag) {
        c.vel = Math.min(900, c.vel + 1800 * dt);
        const d = Math.sqrt(d2) || 1;
        c.x += (dx / d) * c.vel * dt;
        c.y += (dy / d) * c.vel * dt;
      }
    }
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i];
      if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 < 15 * 15) {
        this.crystals.splice(i, 1);
        this.onCrystal(c.v);
        this.onEvent('pickup');
      }
    }
  }

  // ───────────────────────── Хелперы для UI/тестов ─────────────────────────
  get playerAlive(): boolean {
    return this.player.hp > 0;
  }

  mergeWeapons(a: number, b: number): boolean {
    const wa = this.weapons[a], wb = this.weapons[b];
    if (!wa || !wb || a === b || wa.id !== wb.id || wa.tier !== wb.tier || wa.tier >= MAX_TIER) return false;
    wa.tier++;
    this.weapons.splice(b, 1);
    return true;
  }
}
