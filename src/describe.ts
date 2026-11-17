import { ELEMENT_LABEL, MAX_TIER, TIER_MULT, WEAPONS, type WeaponId } from './data';
import type { Sim } from './sim';
import { fmtNum } from './stats';

/** Описание оружия — только числа, посчитанные из текущих статов (никакого художественного текста). */
export function weaponLines(sim: Sim, id: WeaponId, tier = 1): string[] {
  const d = WEAPONS[id];
  const as = sim.stats.mult('attackSpeed');
  const rng = sim.stats.mult('range');
  const aoe = sim.stats.mult('aoe');
  const lines: string[] = [`Element: ${ELEMENT_LABEL[d.element]}`];
  if (d.damage > 0) lines.push(`Damage: ${fmtNum(sim.weaponDamage(d, tier), 1)}`);
  if (id === 'blades') {
    lines.push(`Blades: ${(d.count ?? 2) + tier - 1}`, `Hit every: ${fmtNum(0.4 / as, 2)}s`);
  } else if (d.cooldown > 0) {
    lines.push(`Cooldown: ${fmtNum(d.cooldown / as, 2)}s`);
  }
  if (id === 'oilTrail') {
    lines.push(`Puddle: r${Math.round(d.aoe! * aoe * (1 + 0.2 * (tier - 1)))}, ${fmtNum(d.life! * sim.stats.mult('effectDuration') * (1 + 0.15 * (tier - 1)), 1)}s`, 'Applies: Oiled');
  } else if (id === 'hydro') {
    lines.push(`Pond: r${Math.round(d.aoe! * aoe * (1 + 0.1 * (tier - 1)))}, ${fmtNum(d.life! * sim.stats.mult('effectDuration'), 1)}s`, 'Applies: Wet');
  } else if (id === 'fireball') {
    lines.push(`Blast: r${Math.round(d.aoe! * aoe)}`, `Burning: ${fmtNum(d.burnDps! * sim.weaponDamage(d, tier), 1)}/s`);
  } else if (id === 'arc') {
    lines.push(`Jumps: ${(d.jumps ?? 0) + tier - 1}, r${Math.round((d.jumpRange ?? 0) * aoe)}`);
  } else if (id === 'frost') {
    lines.push(`Pierce: ${(d.pierce ?? 0) + tier - 1 + Math.floor(sim.stats.get('pierce'))}`, 'Applies: Chilled');
  } else if (id === 'pulse') {
    lines.push(`Pierce: ${(d.pierce ?? 0) + Math.floor(sim.stats.get('pierce'))}`);
  } else if (id === 'nova') {
    lines.push(`Radius: ${Math.round(d.aoe! * aoe * (1 + 0.12 * (tier - 1)))}`, 'Knockback');
  }
  if (d.range > 0) lines.push(`Range: ${Math.round(d.range * rng)}`);
  if (tier > 1) lines.push(`Tier ${tier}: x${TIER_MULT[tier]} damage`);
  return lines;
}

export function tierLabel(tier: number): string {
  return tier >= MAX_TIER ? 'MAX' : `T${tier}`;
}
