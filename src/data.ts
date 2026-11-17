import type { Modifier, StatKey } from './stats';

// ───────────────────────── Базовые типы ─────────────────────────
export type Element = 'kinetic' | 'fire' | 'water' | 'ice' | 'electric' | 'oil';
export type StatusId = 'oiled' | 'wet' | 'chilled' | 'frozen' | 'burning' | 'stunned';
export const STATUS_IDS: StatusId[] = ['oiled', 'wet', 'chilled', 'frozen', 'burning', 'stunned'];

export const ELEMENT_COLOR: Record<Element, string> = {
  kinetic: '#e8f6ff',
  fire: '#ff8a1f',
  water: '#2f9bff',
  ice: '#9be8ff',
  electric: '#ffe933',
  oil: '#b266ff',
};
export const ELEMENT_LABEL: Record<Element, string> = {
  kinetic: 'Kinetic', fire: 'Fire', water: 'Water', ice: 'Ice', electric: 'Electric', oil: 'Oil',
};
export const STATUS_COLOR: Record<StatusId, string> = {
  oiled: '#b266ff', wet: '#2f9bff', chilled: '#9be8ff', frozen: '#ffffff', burning: '#ff8a1f', stunned: '#ffe933',
};
export const ELEMENT_STAT: Partial<Record<Element, StatKey>> = {
  kinetic: 'kineticDamage', fire: 'fireDamage', water: 'waterDamage', ice: 'iceDamage', electric: 'electricDamage',
};

// ───────────────────────── Оружие ─────────────────────────
export type WeaponId = 'pulse' | 'fireball' | 'oilTrail' | 'hydro' | 'arc' | 'frost' | 'blades' | 'nova';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  element: Element;
  price: number;
  damage: number; // базовый урон за попадание (0 для не-урона)
  cooldown: number; // секунд
  range: number; // дальность наведения, px
  speed?: number; // скорость снаряда
  aoe?: number; // радиус взрыва / зоны / кольца
  pierce?: number;
  count?: number; // клинки
  jumps?: number; // цепь Arc
  jumpRange?: number;
  spacing?: number; // расстояние между лужами
  life?: number; // время жизни зоны, сек
  statusDur?: number; // длительность накладываемого статуса
  burnDps?: number; // % от урона в секунду для Burning
}

export const TIER_MULT = [0, 1, 1.6, 2.4, 3.5];
export const MAX_TIER = 4;
export const MAX_WEAPONS = 6;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pulse: { id: 'pulse', name: 'Pulse Cannon', element: 'kinetic', price: 35, damage: 14, cooldown: 0.36, range: 520, speed: 720, pierce: 1 },
  fireball: { id: 'fireball', name: 'Fireball', element: 'fire', price: 55, damage: 18, cooldown: 1.15, range: 520, speed: 430, aoe: 52, statusDur: 3, burnDps: 0.3 },
  oilTrail: { id: 'oilTrail', name: 'Oil Trail', element: 'oil', price: 40, damage: 0, cooldown: 0, range: 0, aoe: 36, life: 10, spacing: 36 },
  hydro: { id: 'hydro', name: 'Hydro Burst', element: 'water', price: 50, damage: 6, cooldown: 1.7, range: 480, speed: 380, aoe: 58, life: 6, statusDur: 6 },
  arc: { id: 'arc', name: 'Arc Emitter', element: 'electric', price: 60, damage: 15, cooldown: 1.0, range: 360, jumps: 2, jumpRange: 140 },
  frost: { id: 'frost', name: 'Frost Shard', element: 'ice', price: 50, damage: 13, cooldown: 0.62, range: 480, speed: 520, pierce: 2, statusDur: 4 },
  blades: { id: 'blades', name: 'Orbital Blades', element: 'kinetic', price: 55, damage: 9, cooldown: 0, range: 0, aoe: 78, count: 2 },
  nova: { id: 'nova', name: 'Shock Nova', element: 'kinetic', price: 50, damage: 26, cooldown: 3.2, range: 0, aoe: 130 },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

// ───────────────────────── Персонажи ─────────────────────────
export interface CharacterDef {
  id: string;
  name: string;
  weapons: WeaponId[];
  mods: Modifier[];
  tagline: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'vanguard', name: 'VANGUARD', weapons: ['pulse'], tagline: 'Simple. Solid. No setup.', difficulty: 'Easy',
    mods: [{ stat: 'maxHp', op: 'add', value: 30 }, { stat: 'armor', op: 'add', value: 2 }, { stat: 'damage', op: 'add', value: 12 }, { stat: 'attackSpeed', op: 'add', value: 10 }],
  },
  {
    id: 'pyro', name: 'PYROMANCER', weapons: ['oilTrail', 'fireball'], tagline: 'Lay oil. Light it up.', difficulty: 'Medium',
    mods: [{ stat: 'fireDamage', op: 'add', value: 15 }, { stat: 'moveSpeed', op: 'pct', value: -5 }],
  },
  {
    id: 'storm', name: 'STORMCALLER', weapons: ['hydro', 'arc'], tagline: 'Soak them. Shock them.', difficulty: 'Medium',
    mods: [{ stat: 'electricDamage', op: 'add', value: 15 }, { stat: 'effectDuration', op: 'add', value: 10 }],
  },
  {
    id: 'cryo', name: 'CRYOMANCER', weapons: ['frost', 'pulse'], tagline: 'Freeze. Then shatter.', difficulty: 'Hard',
    mods: [{ stat: 'iceDamage', op: 'add', value: 25 }, { stat: 'aoe', op: 'add', value: 10 }, { stat: 'attackSpeed', op: 'add', value: 10 }],
  },
];

// ───────────────────────── Редкость ─────────────────────────
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_INFO: Record<Rarity, { label: string; color: string; mult: number; priceMult: number }> = {
  common: { label: 'COMMON', color: '#9fb4bd', mult: 1, priceMult: 1 },
  rare: { label: 'RARE', color: '#38a8ff', mult: 1.75, priceMult: 2.2 },
  epic: { label: 'EPIC', color: '#c05cff', mult: 3, priceMult: 4.2 },
  legendary: { label: 'LEGENDARY', color: '#ffb02e', mult: 5, priceMult: 7 },
};

export function rarityWeights(luck: number, wave: number): Record<Rarity, number> {
  return {
    common: Math.max(25, 100 - wave * 2 - luck * 0.4),
    rare: 28 + wave * 1.6 + luck * 0.7,
    epic: Math.max(0, wave - 2) * 1.7 + luck * 0.45,
    legendary: Math.max(0, wave - 5) * 0.55 + luck * 0.18,
  };
}

// ───────────────────────── Карточки level-up ─────────────────────────
export interface CardTemplate {
  id: string;
  name: string;
  mods: Modifier[];
  minRarity?: Rarity;
  weight: number;
}
const A = (stat: StatKey, value: number): Modifier => ({ stat, op: 'add', value });
const P = (stat: StatKey, value: number): Modifier => ({ stat, op: 'pct', value });

export const CARD_TEMPLATES: CardTemplate[] = [
  { id: 'fire', name: 'Ember Surge', mods: [A('fireDamage', 12)], weight: 10 },
  { id: 'water', name: 'Tidal Surge', mods: [A('waterDamage', 12)], weight: 6 },
  { id: 'ice', name: 'Cryo Surge', mods: [A('iceDamage', 12)], weight: 8 },
  { id: 'electric', name: 'Volt Surge', mods: [A('electricDamage', 12)], weight: 9 },
  { id: 'kinetic', name: 'Impact Surge', mods: [A('kineticDamage', 12)], weight: 8 },
  { id: 'damage', name: 'Power Cell', mods: [A('damage', 8)], weight: 10 },
  { id: 'atkspd', name: 'Rapid Fire', mods: [A('attackSpeed', 8)], weight: 10 },
  { id: 'aoe', name: 'Wide Field', mods: [A('aoe', 10)], weight: 8 },
  { id: 'range', name: 'Long Barrel', mods: [A('range', 10)], weight: 4 },
  { id: 'hp', name: 'Hull Plating', mods: [A('maxHp', 15)], weight: 9 },
  { id: 'regen', name: 'Nano Repair', mods: [A('hpRegen', 0.6)], weight: 5 },
  { id: 'armor', name: 'Reactive Armor', mods: [A('armor', 1)], weight: 5 },
  { id: 'speed', name: 'Thrusters', mods: [P('moveSpeed', 6)], weight: 7 },
  { id: 'crit', name: 'Targeting Lens', mods: [A('critChance', 5)], weight: 6 },
  { id: 'critdmg', name: 'Overcharge', mods: [A('critDamage', 15)], weight: 5 },
  { id: 'reaction', name: 'Catalyst', mods: [A('reactionDamage', 15)], weight: 9 },
  { id: 'duration', name: 'Lingering Agent', mods: [A('effectDuration', 12)], weight: 6 },
  { id: 'pickup', name: 'Magnet Coil', mods: [P('pickupRange', 15)], weight: 4 },
  { id: 'xp', name: 'Data Miner', mods: [A('xpGain', 10)], weight: 4 },
  { id: 'credit', name: 'Broker', mods: [A('creditGain', 10)], weight: 4 },
  { id: 'pierce', name: 'Piercing Rounds', mods: [A('pierce', 1)], weight: 3, minRarity: 'rare' },
  { id: 'luck', name: 'Lucky Bit', mods: [A('luck', 6)], weight: 3 },
  // с компромиссом (rare+)
  { id: 'glass', name: 'Glass Cannon', mods: [A('damage', 18), A('maxHp', -15)], weight: 6, minRarity: 'rare' },
  { id: 'overclock', name: 'Overclock', mods: [A('attackSpeed', 18), P('moveSpeed', -6)], weight: 6, minRarity: 'rare' },
  { id: 'heavy', name: 'Heavy Rounds', mods: [A('kineticDamage', 25), A('attackSpeed', -10)], weight: 5, minRarity: 'rare' },
  { id: 'thermal', name: 'Thermal Core', mods: [A('fireDamage', 28), P('moveSpeed', -8)], weight: 5, minRarity: 'rare' },
  { id: 'volatile', name: 'Volatile Mix', mods: [A('reactionDamage', 28), A('maxHp', -12)], weight: 5, minRarity: 'rare' },
  { id: 'storm', name: 'Storm Capacitor', mods: [A('electricDamage', 28), A('range', -10)], weight: 5, minRarity: 'rare' },
  { id: 'deepfreeze', name: 'Deep Freeze', mods: [A('iceDamage', 28), A('attackSpeed', -8)], weight: 5, minRarity: 'rare' },
];

// ───────────────────────── Предметы магазина ─────────────────────────
export interface ItemDef {
  id: string;
  name: string;
  rarity: Rarity;
  price: number;
  mods: Modifier[];
}
export const ITEMS: ItemDef[] = [
  // common
  { id: 'ember_chip', name: 'Ember Chip', rarity: 'common', price: 22, mods: [A('fireDamage', 12)] },
  { id: 'hydro_chip', name: 'Hydro Chip', rarity: 'common', price: 22, mods: [A('waterDamage', 12)] },
  { id: 'cryo_chip', name: 'Cryo Chip', rarity: 'common', price: 22, mods: [A('iceDamage', 12)] },
  { id: 'spark_chip', name: 'Spark Chip', rarity: 'common', price: 22, mods: [A('electricDamage', 12)] },
  { id: 'kinetic_chip', name: 'Impact Chip', rarity: 'common', price: 22, mods: [A('kineticDamage', 12)] },
  { id: 'alloy', name: 'Alloy Plating', rarity: 'common', price: 24, mods: [A('armor', 1), A('maxHp', 10)] },
  { id: 'nano', name: 'Nano Swarm', rarity: 'common', price: 22, mods: [A('hpRegen', 0.8)] },
  { id: 'servo', name: 'Servo Boots', rarity: 'common', price: 20, mods: [P('moveSpeed', 8)] },
  // rare
  { id: 'pyro_core', name: 'Pyro Core', rarity: 'rare', price: 52, mods: [A('fireDamage', 25), A('reactionDamage', 15), P('moveSpeed', -6)] },
  { id: 'cryo_coil', name: 'Cryo Coil', rarity: 'rare', price: 52, mods: [A('iceDamage', 25), A('effectDuration', 15), A('attackSpeed', -5)] },
  { id: 'tesla_coil', name: 'Tesla Coil', rarity: 'rare', price: 52, mods: [A('electricDamage', 25), A('aoe', 10), A('maxHp', -10)] },
  { id: 'tide_pump', name: 'Tide Pump', rarity: 'rare', price: 50, mods: [A('waterDamage', 25), A('aoe', 12), P('moveSpeed', -4)] },
  { id: 'slick', name: 'Slick Lubricant', rarity: 'rare', price: 48, mods: [A('effectDuration', 30), A('aoe', 15)] },
  { id: 'reactor_rod', name: 'Reactor Rod', rarity: 'rare', price: 55, mods: [A('reactionDamage', 28), A('damage', -4)] },
  { id: 'magnet', name: 'Magnet Array', rarity: 'rare', price: 42, mods: [P('pickupRange', 40), A('xpGain', 15)] },
  { id: 'gambler', name: 'Gambler Core', rarity: 'rare', price: 46, mods: [A('luck', 12), A('creditGain', 15), A('maxHp', -10)] },
  { id: 'lens', name: 'Crit Lens', rarity: 'rare', price: 50, mods: [A('critChance', 10), A('critDamage', 20)] },
  { id: 'piercer', name: 'Piercer Coil', rarity: 'rare', price: 55, mods: [A('pierce', 1), A('range', 10), A('damage', -3)] },
  // epic
  { id: 'chain_reactor', name: 'Chain Reactor', rarity: 'epic', price: 105, mods: [A('reactionDamage', 45), A('aoe', 20), A('attackSpeed', -10)] },
  { id: 'overdrive', name: 'Overdrive Engine', rarity: 'epic', price: 100, mods: [A('attackSpeed', 30), P('moveSpeed', 10), A('maxHp', -25)] },
  { id: 'prism', name: 'Prism Lens', rarity: 'epic', price: 110, mods: [A('fireDamage', 14), A('waterDamage', 14), A('iceDamage', 14), A('electricDamage', 14)] },
  { id: 'hammer', name: 'Kinetic Hammer', rarity: 'epic', price: 100, mods: [A('kineticDamage', 40), A('critDamage', 25), P('moveSpeed', -6)] },
  { id: 'bulwark', name: 'Bulwark Frame', rarity: 'epic', price: 100, mods: [A('maxHp', 45), A('armor', 3), P('moveSpeed', -8)] },
  { id: 'catalyst_engine', name: 'Catalyst Engine', rarity: 'epic', price: 115, mods: [A('reactionDamage', 35), A('effectDuration', 25), A('damage', -8)] },
  // legendary
  { id: 'singularity', name: 'Singularity Core', rarity: 'legendary', price: 190, mods: [A('damage', 25), A('aoe', 25), A('attackSpeed', -15)] },
  { id: 'elemental_heart', name: 'Elemental Heart', rarity: 'legendary', price: 200, mods: [A('fireDamage', 25), A('waterDamage', 25), A('iceDamage', 25), A('electricDamage', 25), A('maxHp', -20)] },
  { id: 'paradox', name: 'Paradox Engine', rarity: 'legendary', price: 210, mods: [A('reactionDamage', 80), A('effectDuration', 40), A('attackSpeed', -15)] },
];

// ───────────────────────── Враги ─────────────────────────
export type EnemyType = 'drone' | 'swarmer' | 'brute' | 'dasher' | 'shooter' | 'boss';
export interface EnemyDef {
  type: EnemyType;
  hp: number;
  speed: number;
  r: number;
  dmg: number;
  xp: number;
  minWave: number;
  weight: (wave: number) => number;
  group: [number, number]; // сколько штук за один спавн-ивент
}
export const ENEMIES: Record<EnemyType, EnemyDef> = {
  drone: { type: 'drone', hp: 20, speed: 85, r: 12, dmg: 8, xp: 1, minWave: 1, weight: () => 1, group: [1, 1] },
  swarmer: { type: 'swarmer', hp: 9, speed: 135, r: 9, dmg: 5, xp: 0.6, minWave: 2, weight: (w) => 0.25 + w * 0.05, group: [4, 6] },
  brute: { type: 'brute', hp: 95, speed: 55, r: 22, dmg: 16, xp: 6, minWave: 3, weight: (w) => 0.1 + w * 0.025, group: [1, 1] },
  dasher: { type: 'dasher', hp: 30, speed: 72, r: 12, dmg: 12, xp: 3, minWave: 4, weight: () => 0.18, group: [1, 2] },
  shooter: { type: 'shooter', hp: 32, speed: 70, r: 13, dmg: 8, xp: 4, minWave: 5, weight: () => 0.17, group: [1, 1] },
  boss: { type: 'boss', hp: 1500, speed: 42, r: 46, dmg: 22, xp: 80, minWave: 10, weight: () => 0, group: [1, 1] },
};

export const TOTAL_WAVES = 10;
export const WAVE_DURATIONS = [20, 25, 30, 30, 35, 40, 40, 45, 50, 60];
export function waveDuration(wave: number): number {
  return WAVE_DURATIONS[Math.min(wave, WAVE_DURATIONS.length) - 1];
}
export function waveSpawnRate(wave: number): number {
  return 0.85 + 0.45 * (wave - 1); // событий спавна в секунду
}
export function enemyHpMult(wave: number): number {
  return 1 + 0.24 * (wave - 1) + 0.01 * (wave - 1) ** 2;
}
export function enemyDmgMult(wave: number): number {
  return 1 + 0.08 * (wave - 1);
}
export function enemySpeedMult(wave: number): number {
  return 1 + 0.025 * (wave - 1);
}
export function xpToLevel(level: number): number {
  return Math.round(8 + 6 * level + 0.6 * level * level);
}
