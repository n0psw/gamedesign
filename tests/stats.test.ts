import { describe, expect, it } from 'vitest';
import { STAT_DEFS, StatBlock, formatMod } from '../src/stats';

describe('StatBlock', () => {
  it('flat stat: (base + add) * (1 + pct)', () => {
    const s = new StatBlock();
    s.add('a', 'A', [{ stat: 'maxHp', op: 'add', value: 20 }, { stat: 'maxHp', op: 'pct', value: 10 }]);
    expect(s.get('maxHp')).toBeCloseTo((100 + 20) * 1.1);
  });
  it('pct stat accumulates additively', () => {
    const s = new StatBlock();
    s.add('a', 'A', [{ stat: 'fireDamage', op: 'add', value: 15 }]);
    s.add('b', 'B', [{ stat: 'fireDamage', op: 'add', value: 10 }]);
    expect(s.get('fireDamage')).toBe(25);
    expect(s.mult('fireDamage')).toBeCloseTo(1.25);
  });
  it('removeSource undoes modifiers and cache refreshes', () => {
    const s = new StatBlock();
    s.add('a', 'A', [{ stat: 'armor', op: 'add', value: 3 }]);
    expect(s.get('armor')).toBe(3);
    s.removeSource('a');
    expect(s.get('armor')).toBe(0);
  });
  it('respects min/max clamps', () => {
    const s = new StatBlock();
    s.add('a', 'A', [{ stat: 'moveSpeed', op: 'pct', value: -500 }]);
    expect(s.get('moveSpeed')).toBe(STAT_DEFS.moveSpeed.min);
    s.add('b', 'B', [{ stat: 'critChance', op: 'add', value: 500 }]);
    expect(s.get('critChance')).toBe(100);
  });
  it('defaults: crit 5% / 150%, pickup 70', () => {
    const s = new StatBlock();
    expect(s.get('critChance')).toBe(5);
    expect(s.get('critDamage')).toBe(150);
    expect(s.get('pickupRange')).toBe(70);
  });
  it('breakdown lists base and sources', () => {
    const s = new StatBlock();
    s.add('x', 'Pyro Core', [{ stat: 'fireDamage', op: 'add', value: 25 }]);
    const b = s.breakdown('fireDamage');
    expect(b[0].source).toBe('Base');
    expect(b[1]).toEqual({ source: 'Pyro Core', text: '+25%' });
  });
});

describe('formatMod — строгий формат без художественного текста', () => {
  it('formats percent-stat', () => expect(formatMod({ stat: 'fireDamage', op: 'add', value: 15 })).toBe('+15% Fire Damage'));
  it('formats negative pct on flat stat', () => expect(formatMod({ stat: 'moveSpeed', op: 'pct', value: -5 })).toBe('-5% Movement Speed'));
  it('formats flat add', () => expect(formatMod({ stat: 'maxHp', op: 'add', value: 20 })).toBe('+20 Max HP'));
  it('formats decimals', () => expect(formatMod({ stat: 'hpRegen', op: 'add', value: 0.6 })).toBe('+0.6 HP Regen'));
  it('formats negative flat', () => expect(formatMod({ stat: 'maxHp', op: 'add', value: -15 })).toBe('-15 Max HP'));
});
