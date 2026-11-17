import {
  CARD_TEMPLATES, CHARACTERS, ITEMS, MAX_WEAPONS, RARITIES, RARITY_INFO, TOTAL_WAVES, WEAPONS, WEAPON_IDS,
  rarityWeights, waveDuration, xpToLevel,
  type CardTemplate, type ItemDef, type Rarity, type WeaponId,
} from './data';
import { Director } from './director';
import { Rng } from './rng';
import { Sim } from './sim';
import { STAT_DEFS, formatMod, type Modifier } from './stats';

export type Phase = 'wave' | 'levelup' | 'shop' | 'gameover' | 'victory';

export interface Card {
  id: string;
  name: string;
  rarity: Rarity;
  mods: Modifier[];
}

export interface Offer {
  kind: 'item' | 'weapon';
  id: string;
  name: string;
  rarity: Rarity;
  basePrice: number;
  sold: boolean;
}

export function makeCard(t: CardTemplate, rarity: Rarity): Card {
  const mult = RARITY_INFO[rarity].mult;
  const mods = t.mods.map((m): Modifier => {
    const def = STAT_DEFS[m.stat];
    let v = m.value > 0 ? m.value * mult : m.value * Math.pow(mult, 0.6);
    if (m.stat === 'pierce') v = Math.min(Math.round(m.value * (rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : 1)), 3);
    v = def.decimals === 0 ? Math.round(v) : Math.round(v * 10) / 10;
    if (v === 0) v = m.value > 0 ? 1 : -1;
    return { stat: m.stat, op: m.op, value: v };
  });
  return { id: t.id, name: t.name, rarity, mods };
}

export class Run {
  sim: Sim;
  director: Director;
  rng: Rng; // решения вне боя (карты, магазин) — отдельный поток
  phase: Phase = 'wave';
  wave = 1;
  waveTime = 0;
  level = 1;
  xp = 0;
  credits = 0;
  pendingLevelUps = 0;
  cards: Card[] = [];
  offers: Offer[] = [];
  rerollCount = 0;
  items: { def: ItemDef; count: number }[] = [];
  picked: Card[] = [];
  returnTo: 'wave' | 'shop' = 'wave';
  waveBonus = 0;
  totalCreditsEarned = 0;
  private endingWave = false;

  constructor(public characterId: string, seed = 1) {
    this.sim = new Sim(seed);
    this.rng = new Rng(seed * 7919 + 13);
    this.director = new Director(this.sim);
    const ch = CHARACTERS.find((c) => c.id === characterId) ?? CHARACTERS[0];
    this.sim.applyMods('char', ch.name, ch.mods);
    this.sim.player.hp = this.sim.maxHp;
    for (const w of ch.weapons) this.sim.addWeapon(w);
    this.sim.onCrystal = (v) => this.gainFromCrystal(v);
    this.director.start(1);
  }

  get waveDur(): number {
    return waveDuration(this.wave);
  }
  get xpNeeded(): number {
    return xpToLevel(this.level);
  }

  // ───────────────────────── Ход боя ─────────────────────────
  update(dt: number, mx: number, my: number): void {
    if (this.phase !== 'wave') return;
    this.waveTime += dt;
    this.director.update(dt, this.waveTime);
    this.sim.update(dt, mx, my);
    if (this.phase !== 'wave') return; // (level-up мог открыться из onCrystal)
    if (this.sim.player.hp <= 0) { this.phase = 'gameover'; return; }
    if (this.wave >= TOTAL_WAVES) {
      if (this.sim.bossKilled) this.endWave();
    } else if (this.waveTime >= this.waveDur) {
      this.endWave();
    }
  }

  private gainFromCrystal(v: number): void {
    const s = this.sim.stats;
    this.xp += v * s.mult('xpGain');
    const c = v * s.mult('creditGain');
    this.credits += c;
    this.totalCreditsEarned += c;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.pendingLevelUps++;
    }
    if (this.phase === 'wave' && !this.endingWave && this.pendingLevelUps > 0 && this.cards.length === 0) {
      this.openLevelUp('wave');
    }
  }

  private endWave(): void {
    this.endingWave = true;
    this.sim.clearEnemies();
    this.sim.collectAllCrystals();
    this.endingWave = false;
    this.waveBonus = 12 + this.wave * 5;
    this.credits += this.waveBonus;
    this.totalCreditsEarned += this.waveBonus;
    if (this.wave >= TOTAL_WAVES) { this.phase = 'victory'; return; }
    if (this.pendingLevelUps > 0) this.openLevelUp('shop');
    else this.openShop();
  }

  // ───────────────────────── Level-up ─────────────────────────
  rollRarity(): Rarity {
    const w = rarityWeights(this.sim.stats.get('luck'), this.wave);
    return this.rng.weighted(RARITIES, (r) => w[r]);
  }

  rollCards(n = 3): Card[] {
    const out: Card[] = [];
    const used = new Set<string>();
    while (out.length < n) {
      const rarity = this.rollRarity();
      const pool = CARD_TEMPLATES.filter((t) => !used.has(t.id) && (!t.minRarity || RARITIES.indexOf(rarity) >= RARITIES.indexOf(t.minRarity)));
      const tpl = this.rng.weighted(pool, (t) => t.weight);
      used.add(tpl.id);
      out.push(makeCard(tpl, rarity));
    }
    return out;
  }

  openLevelUp(returnTo: 'wave' | 'shop'): void {
    this.returnTo = returnTo;
    this.cards = this.rollCards(3);
    this.phase = 'levelup';
  }

  pickCard(i: number): boolean {
    if (this.phase !== 'levelup' || !this.cards[i]) return false;
    const c = this.cards[i];
    this.sim.applyMods(`card:${this.picked.length}`, c.name, c.mods);
    this.picked.push(c);
    this.pendingLevelUps--;
    this.cards = [];
    if (this.pendingLevelUps > 0) this.openLevelUp(this.returnTo);
    else if (this.returnTo === 'shop') this.openShop();
    else this.phase = 'wave';
    return true;
  }

  // ───────────────────────── Магазин ─────────────────────────
  price(o: Offer): number {
    const owned = o.kind === 'item'
      ? (this.items.find((i) => i.def.id === o.id)?.count ?? 0)
      : this.sim.weapons.filter((w) => w.id === o.id).length;
    const waveScale = 1 + 0.07 * (this.wave - 1);
    return Math.max(1, Math.round(o.basePrice * waveScale * (1 + 0.25 * owned)));
  }

  get rerollCost(): number {
    return 6 + this.rerollCount * 4 + this.wave * 2;
  }

  openShop(): void {
    this.rerollCount = 0;
    this.rollOffers();
    this.phase = 'shop';
  }

  rollOffers(): void {
    const offers: Offer[] = [];
    const usedItems = new Set<string>();
    const weaponCount = this.rng.chance(0.35) ? 1 : 0 + (this.rng.chance(0.15) ? 1 : 0);
    for (let i = 0; i < 4; i++) {
      if (i < weaponCount) {
        const id = this.rng.pick(WEAPON_IDS) as WeaponId;
        const d = WEAPONS[id];
        offers.push({ kind: 'weapon', id, name: d.name, rarity: 'common', basePrice: d.price, sold: false });
        continue;
      }
      let rarity = this.rollRarity();
      let pool = ITEMS.filter((it) => it.rarity === rarity && !usedItems.has(it.id));
      while (pool.length === 0) {
        rarity = RARITIES[Math.max(0, RARITIES.indexOf(rarity) - 1)];
        pool = ITEMS.filter((it) => it.rarity === rarity && !usedItems.has(it.id));
        if (rarity === 'common' && pool.length === 0) pool = ITEMS.filter((it) => !usedItems.has(it.id));
      }
      const it = this.rng.pick(pool);
      usedItems.add(it.id);
      offers.push({ kind: 'item', id: it.id, name: it.name, rarity: it.rarity, basePrice: it.price, sold: false });
    }
    this.offers = offers;
  }

  canBuy(i: number): boolean {
    const o = this.offers[i];
    if (!o || o.sold || this.phase !== 'shop') return false;
    if (this.credits < this.price(o)) return false;
    if (o.kind === 'weapon' && this.sim.weapons.length >= MAX_WEAPONS) return false;
    return true;
  }

  buy(i: number): boolean {
    if (!this.canBuy(i)) return false;
    const o = this.offers[i];
    this.credits -= this.price(o);
    o.sold = true;
    if (o.kind === 'weapon') {
      this.sim.addWeapon(o.id as WeaponId);
    } else {
      const def = ITEMS.find((x) => x.id === o.id)!;
      let entry = this.items.find((x) => x.def.id === def.id);
      if (!entry) { entry = { def, count: 0 }; this.items.push(entry); }
      entry.count++;
      this.sim.applyMods(`item:${def.id}#${entry.count}`, def.name, def.mods);
    }
    return true;
  }

  reroll(): boolean {
    if (this.phase !== 'shop') return false;
    const cost = this.rerollCost;
    if (this.credits < cost) return false;
    this.credits -= cost;
    this.rerollCount++;
    this.rollOffers();
    return true;
  }

  merge(a: number, b: number): boolean {
    if (this.phase !== 'shop') return false;
    return this.sim.mergeWeapons(a, b);
  }

  /** Список пар оружия, которые можно слить. */
  mergeablePairs(): [number, number][] {
    const out: [number, number][] = [];
    const ws = this.sim.weapons;
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < ws.length; j++) {
        if (ws[i].id === ws[j].id && ws[i].tier === ws[j].tier && ws[i].tier < 4) out.push([i, j]);
      }
    }
    return out;
  }

  nextWave(): void {
    if (this.phase !== 'shop') return;
    this.wave++;
    this.waveTime = 0;
    this.sim.resetWaveState();
    this.director.start(this.wave);
    this.phase = 'wave';
  }

  // ───────────────────────── Описания (генерируются из данных) ─────────────────────────
  static modLines(mods: readonly Modifier[]): string[] {
    return mods.map(formatMod);
  }
}
