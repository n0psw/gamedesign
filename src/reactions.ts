import type { Element, StatusId } from './data';
import { ELEMENT_LABEL } from './data';

export type ReactionEffect =
  | { type: 'aoe'; radius: number; damage: number; element: Element; applies?: { status: StatusId; dur: number; dps?: number }[]; stun?: number; consumeAll?: boolean }
  | { type: 'chain'; jumps: number; range: number; damage: number; stun?: number }
  | { type: 'freeze'; radius: number; duration: number; only?: StatusId };

export interface Reaction {
  id: string;
  name: string;
  color: string;
  scope: 'target' | 'zone';
  trigger: Element; // стихия удара
  requires: StatusId | 'oil' | 'water'; // статус цели или тип зоны
  consumes: boolean; // снимает статус с цели / убирает зону
  cooldown?: number; // только для зон, которые остаются
  effect: ReactionEffect;
  element: Element; // стихия урона реакции (для масштабирования статами)
}

/**
 * Таблица реакций (порядок = приоритет). Новая реакция = одна строка в данных.
 */
export const REACTIONS: Reaction[] = [
  { id: 'inferno', name: 'INFERNO', color: '#ff8a1f', scope: 'target', trigger: 'fire', requires: 'oiled', consumes: true, element: 'fire',
    effect: { type: 'aoe', radius: 95, damage: 45, element: 'fire', applies: [{ status: 'burning', dur: 3, dps: 6 }], consumeAll: true } },
  { id: 'overload', name: 'OVERLOAD', color: '#ffe933', scope: 'target', trigger: 'electric', requires: 'oiled', consumes: true, element: 'electric',
    effect: { type: 'aoe', radius: 80, damage: 20, element: 'electric', stun: 1.2, consumeAll: true } },
  { id: 'conduction', name: 'CONDUCTION', color: '#fff27a', scope: 'target', trigger: 'electric', requires: 'wet', consumes: true, element: 'electric',
    effect: { type: 'chain', jumps: 4, range: 130, damage: 22, stun: 0.3 } },
  { id: 'steam', name: 'STEAM BURST', color: '#cfe9ff', scope: 'target', trigger: 'fire', requires: 'wet', consumes: true, element: 'fire',
    effect: { type: 'aoe', radius: 85, damage: 20, element: 'fire', applies: [{ status: 'chilled', dur: 2.5 }], consumeAll: true } },
  { id: 'flashfreeze', name: 'FLASH FREEZE', color: '#aef1ff', scope: 'target', trigger: 'ice', requires: 'wet', consumes: true, element: 'ice',
    effect: { type: 'freeze', radius: 70, duration: 2, only: 'wet' } },
  { id: 'deepfreeze', name: 'DEEP FREEZE', color: '#d6f7ff', scope: 'target', trigger: 'ice', requires: 'chilled', consumes: true, element: 'ice',
    effect: { type: 'freeze', radius: 55, duration: 1.5, only: 'chilled' } },
  { id: 'thermal', name: 'THERMAL SHOCK', color: '#ffb3a0', scope: 'target', trigger: 'ice', requires: 'burning', consumes: true, element: 'ice',
    effect: { type: 'aoe', radius: 70, damage: 30, element: 'ice', applies: [{ status: 'chilled', dur: 3 }] } },
  { id: 'shatter', name: 'SHATTER', color: '#ffffff', scope: 'target', trigger: 'kinetic', requires: 'frozen', consumes: true, element: 'kinetic',
    effect: { type: 'aoe', radius: 75, damage: 40, element: 'kinetic', applies: [{ status: 'chilled', dur: 2 }], consumeAll: false } },
  // зоны (лужи)
  { id: 'oilblast', name: 'OIL BLAST', color: '#ff6a00', scope: 'zone', trigger: 'fire', requires: 'oil', consumes: true, element: 'fire',
    effect: { type: 'aoe', radius: 115, damage: 60, element: 'fire', applies: [{ status: 'burning', dur: 3.5, dps: 8 }] } },
  { id: 'oilshock', name: 'OIL SHOCK', color: '#ffd400', scope: 'zone', trigger: 'electric', requires: 'oil', consumes: true, element: 'electric',
    effect: { type: 'aoe', radius: 70, damage: 22, element: 'electric', stun: 1 } },
  { id: 'pondshock', name: 'POND SHOCK', color: '#fff27a', scope: 'zone', trigger: 'electric', requires: 'water', consumes: false, cooldown: 0.9, element: 'electric',
    effect: { type: 'aoe', radius: 60, damage: 20, element: 'electric', stun: 0.5 } },
  { id: 'pondfreeze', name: 'POND FREEZE', color: '#aef1ff', scope: 'zone', trigger: 'ice', requires: 'water', consumes: true, element: 'ice',
    effect: { type: 'freeze', radius: 62, duration: 1.8 } },
  { id: 'pondsteam', name: 'POND STEAM', color: '#cfe9ff', scope: 'zone', trigger: 'fire', requires: 'water', consumes: true, element: 'fire',
    effect: { type: 'aoe', radius: 75, damage: 18, element: 'fire' } },
];

export const REACTION_BY_ID: Record<string, Reaction> = Object.fromEntries(REACTIONS.map((r) => [r.id, r]));

export function reactionFormula(r: Reaction): string {
  const trig = ELEMENT_LABEL[r.trigger];
  const req = r.scope === 'zone' ? `${r.requires === 'oil' ? 'Oil' : 'Water'} Puddle` : cap(r.requires);
  return `${req} + ${trig}`;
}

export function reactionDetail(r: Reaction): string {
  const e = r.effect;
  if (e.type === 'aoe') {
    let s = `${e.damage} ${ELEMENT_LABEL[e.element]} dmg, radius ${e.radius}`;
    for (const a of e.applies ?? []) s += `, ${cap(a.status)} ${a.dur}s`;
    if (e.stun) s += `, Stun ${e.stun}s`;
    return s;
  }
  if (e.type === 'chain') {
    return `${e.damage} Electric dmg x${e.jumps} jumps (Wet only, range ${e.range})` + (e.stun ? `, Stun ${e.stun}s` : '');
  }
  return `Freeze ${e.duration}s, radius ${e.radius}` + (e.only ? ` (${cap(e.only)} only)` : '');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
