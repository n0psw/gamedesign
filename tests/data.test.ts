import { describe, expect, it } from 'vitest';
import {
  CARD_TEMPLATES, CHARACTERS, ENEMIES, ITEMS, RARITIES, TOTAL_WAVES, WEAPONS, WAVE_DURATIONS, xpToLevel,
} from '../src/data';
import { REACTIONS, reactionDetail, reactionFormula } from '../src/reactions';
import { makeCard } from '../src/run';
import { STAT_DEFS, formatMod } from '../src/stats';

describe('данные', () => {
  it('все модификаторы ссылаются на существующие статы', () => {
    const all = [...CARD_TEMPLATES.flatMap((c) => c.mods), ...ITEMS.flatMap((i) => i.mods), ...CHARACTERS.flatMap((c) => c.mods)];
    for (const m of all) expect(STAT_DEFS[m.stat], m.stat).toBeDefined();
  });
  it('id карточек и предметов уникальны', () => {
    const ids = [...CARD_TEMPLATES.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const iids = ITEMS.map((i) => i.id);
    expect(new Set(iids).size).toBe(iids.length);
  });
  it('в каждой редкости есть предметы', () => {
    for (const r of RARITIES) expect(ITEMS.filter((i) => i.rarity === r).length, r).toBeGreaterThan(0);
  });
  it('описания предметов — строго статы, без художественного текста', () => {
    for (const it of ITEMS) for (const m of it.mods) expect(formatMod(m)).toMatch(/^[+-]\d+(\.\d)?%? [A-Za-z ]+$/);
  });
  it('у персонажей стартовое оружие существует', () => {
    for (const c of CHARACTERS) for (const w of c.weapons) expect(WEAPONS[w]).toBeDefined();
  });
  it('таблица волн корректна', () => {
    expect(WAVE_DURATIONS.length).toBe(TOTAL_WAVES);
    for (const d of WAVE_DURATIONS) { expect(d).toBeGreaterThanOrEqual(20); expect(d).toBeLessThanOrEqual(60); }
  });
  it('враги имеют положительные параметры', () => {
    for (const e of Object.values(ENEMIES)) { expect(e.hp).toBeGreaterThan(0); expect(e.speed).toBeGreaterThan(0); expect(e.r).toBeGreaterThan(0); }
  });
  it('кривая XP возрастает', () => {
    for (let l = 1; l < 40; l++) expect(xpToLevel(l + 1)).toBeGreaterThan(xpToLevel(l));
  });
  it('реакции: уникальные id, есть описание, покрыты Oil/Water зоны', () => {
    const ids = REACTIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of REACTIONS) { expect(reactionFormula(r)).toContain('+'); expect(reactionDetail(r).length).toBeGreaterThan(3); }
    expect(REACTIONS.filter((r) => r.scope === 'zone' && r.requires === 'oil').length).toBeGreaterThanOrEqual(2);
    expect(REACTIONS.filter((r) => r.scope === 'zone' && r.requires === 'water').length).toBeGreaterThanOrEqual(3);
  });
});

describe('makeCard', () => {
  it('масштабирует значения по редкости и не даёт нулей', () => {
    for (const t of CARD_TEMPLATES) {
      for (const r of RARITIES) {
        const c = makeCard(t, r);
        for (const m of c.mods) { expect(Number.isFinite(m.value)).toBe(true); expect(m.value).not.toBe(0); }
      }
    }
  });
  it('legendary сильнее common', () => {
    const t = CARD_TEMPLATES.find((c) => c.id === 'fire')!;
    expect(makeCard(t, 'legendary').mods[0].value).toBeGreaterThan(makeCard(t, 'common').mods[0].value);
  });
  it('pierce ограничен', () => {
    const t = CARD_TEMPLATES.find((c) => c.id === 'pierce')!;
    expect(makeCard(t, 'legendary').mods[0].value).toBeLessThanOrEqual(3);
  });
});
