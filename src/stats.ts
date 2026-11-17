/**
 * Система статов — основа «прозрачной математики».
 *
 * Итоговое значение = (base + Σ add) × (1 + Σ pct / 100)
 *  - kind 'pct'  : сам стат — это процентный бонус (напр. Fire Damage +35%), base = 0, модификаторы только 'add'.
 *  - kind 'flat' : числовой стат (Max HP, Move Speed...), модификаторы 'add' (плоско) или 'pct' (процент от суммы).
 */
export type StatKey =
  | 'maxHp' | 'hpRegen' | 'armor' | 'moveSpeed'
  | 'damage' | 'kineticDamage' | 'fireDamage' | 'waterDamage' | 'iceDamage' | 'electricDamage'
  | 'reactionDamage' | 'attackSpeed' | 'aoe' | 'range' | 'critChance' | 'critDamage' | 'pierce'
  | 'effectDuration' | 'pickupRange' | 'xpGain' | 'creditGain' | 'luck';

export type StatGroup = 'Defense' | 'Offense' | 'Elements' | 'Utility';

export interface StatDef {
  key: StatKey;
  label: string;
  base: number;
  kind: 'flat' | 'pct';
  decimals: number;
  min?: number;
  max?: number;
  group: StatGroup;
}

const D = (
  key: StatKey, label: string, base: number, kind: 'flat' | 'pct', decimals: number, group: StatGroup,
  min?: number, max?: number,
): StatDef => ({ key, label, base, kind, decimals, group, min, max });

export const STAT_DEFS: Record<StatKey, StatDef> = {
  maxHp: D('maxHp', 'Max HP', 100, 'flat', 0, 'Defense', 1),
  hpRegen: D('hpRegen', 'HP Regen', 0.5, 'flat', 1, 'Defense', 0),
  armor: D('armor', 'Armor', 0, 'flat', 0, 'Defense', 0),
  moveSpeed: D('moveSpeed', 'Movement Speed', 250, 'flat', 0, 'Defense', 80, 520),

  damage: D('damage', 'Damage', 0, 'pct', 0, 'Offense', -90),
  attackSpeed: D('attackSpeed', 'Attack Speed', 0, 'pct', 0, 'Offense', -80, 400),
  critChance: D('critChance', 'Crit Chance', 5, 'pct', 0, 'Offense', 0, 100),
  critDamage: D('critDamage', 'Crit Damage', 150, 'pct', 0, 'Offense', 100),
  aoe: D('aoe', 'AOE', 0, 'pct', 0, 'Offense', -60, 300),
  range: D('range', 'Range', 0, 'pct', 0, 'Offense', -50, 200),
  pierce: D('pierce', 'Pierce', 0, 'flat', 0, 'Offense', 0, 8),

  kineticDamage: D('kineticDamage', 'Kinetic Damage', 0, 'pct', 0, 'Elements', -90),
  fireDamage: D('fireDamage', 'Fire Damage', 0, 'pct', 0, 'Elements', -90),
  waterDamage: D('waterDamage', 'Water Damage', 0, 'pct', 0, 'Elements', -90),
  iceDamage: D('iceDamage', 'Ice Damage', 0, 'pct', 0, 'Elements', -90),
  electricDamage: D('electricDamage', 'Electric Damage', 0, 'pct', 0, 'Elements', -90),
  reactionDamage: D('reactionDamage', 'Reaction Damage', 0, 'pct', 0, 'Elements', -90),
  effectDuration: D('effectDuration', 'Effect Duration', 0, 'pct', 0, 'Elements', -60, 300),

  pickupRange: D('pickupRange', 'Pickup Range', 70, 'flat', 0, 'Utility', 20, 600),
  xpGain: D('xpGain', 'XP Gain', 0, 'pct', 0, 'Utility', -50),
  creditGain: D('creditGain', 'Credit Gain', 0, 'pct', 0, 'Utility', -50),
  luck: D('luck', 'Luck', 0, 'flat', 0, 'Utility', -50, 200),
};

export const STAT_KEYS = Object.keys(STAT_DEFS) as StatKey[];

export interface Modifier {
  stat: StatKey;
  op: 'add' | 'pct';
  value: number;
}

export function fmtNum(v: number, decimals = 1): string {
  return String(Number(v.toFixed(decimals)));
}

/** Строгий формат без художественного текста: «+15% Fire Damage», «-5% Movement Speed», «+20 Max HP». */
export function formatMod(m: Modifier): string {
  const def = STAT_DEFS[m.stat];
  const sign = m.value >= 0 ? '+' : '-';
  const abs = fmtNum(Math.abs(m.value), def.decimals === 0 ? 0 : 1);
  const isPct = def.kind === 'pct' || m.op === 'pct';
  return `${sign}${abs}${isPct ? '%' : ''} ${def.label}`;
}

export interface BreakdownLine {
  source: string;
  text: string;
}

interface Entry {
  source: string;
  label: string;
  mod: Modifier;
}

export class StatBlock {
  private entries: Entry[] = [];
  private cache = new Map<StatKey, number>();

  add(source: string, label: string, mods: readonly Modifier[]): void {
    for (const mod of mods) this.entries.push({ source, label, mod });
    this.cache.clear();
  }

  removeSource(source: string): void {
    this.entries = this.entries.filter((e) => e.source !== source);
    this.cache.clear();
  }

  clear(): void {
    this.entries = [];
    this.cache.clear();
  }

  get(key: StatKey): number {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const def = STAT_DEFS[key];
    let add = 0;
    let pct = 0;
    for (const e of this.entries) {
      if (e.mod.stat !== key) continue;
      if (e.mod.op === 'add') add += e.mod.value;
      else pct += e.mod.value;
    }
    let v = def.kind === 'pct' ? def.base + add : (def.base + add) * (1 + pct / 100);
    if (def.min !== undefined) v = Math.max(def.min, v);
    if (def.max !== undefined) v = Math.min(def.max, v);
    this.cache.set(key, v);
    return v;
  }

  /** Множитель для процентных статов: +35% → 1.35 */
  mult(key: StatKey): number {
    return 1 + this.get(key) / 100;
  }

  breakdown(key: StatKey): BreakdownLine[] {
    const def = STAT_DEFS[key];
    const lines: BreakdownLine[] = [{ source: 'Base', text: fmtNum(def.base, def.decimals) + (def.kind === 'pct' ? '%' : '') }];
    const merged = new Map<string, { label: string; mods: Modifier[] }>();
    for (const e of this.entries) {
      if (e.mod.stat !== key) continue;
      const m = merged.get(e.source) ?? { label: e.label, mods: [] };
      m.mods.push(e.mod);
      merged.set(e.source, m);
    }
    for (const [, m] of merged) {
      let add = 0;
      let pct = 0;
      for (const mod of m.mods) {
        if (mod.op === 'add') add += mod.value;
        else pct += mod.value;
      }
      const parts: string[] = [];
      if (add !== 0) parts.push(formatMod({ stat: key, op: 'add', value: add }).replace(` ${def.label}`, ''));
      if (pct !== 0) parts.push(formatMod({ stat: key, op: 'pct', value: pct }).replace(` ${def.label}`, ''));
      lines.push({ source: m.label, text: parts.join(' ') });
    }
    return lines;
  }

  /** Сколько значений-источников действует (для UI). */
  get size(): number {
    return this.entries.length;
  }
}

export function fmtStat(key: StatKey, v: number): string {
  const def = STAT_DEFS[key];
  const s = fmtNum(v, def.decimals);
  return def.kind === 'pct' ? `${v >= 0 && key !== 'critChance' && key !== 'critDamage' ? '+' : ''}${s}%` : s;
}
