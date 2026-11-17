import { playRun, type BotStrategy } from '../src/bot';
import { CHARACTERS } from '../src/data';
import { Run } from '../src/run';

const seeds = Number(process.argv[2] ?? 6);
const strategy = (process.argv[3] ?? 'smart') as BotStrategy;
console.log(`strategy=${strategy} seeds=${seeds}`);
for (const ch of CHARACTERS) {
  const waves: number[] = [];
  let wins = 0, kills = 0, lvl = 0;
  const reactions: Record<string, number> = {};
  const t0 = Date.now();
  for (let s = 1; s <= seeds; s++) {
    const r = new Run(ch.id, s * 101);
    r.sim.fx.enabled = false;
    const res = playRun(r, strategy, 900);
    waves.push(res.wave + (res.phase === 'victory' ? 1 : 0));
    if (res.phase === 'victory') wins++;
    kills += r.sim.kills; lvl += r.level;
    for (const [k, v] of Object.entries(r.sim.reactionCounts)) reactions[k] = (reactions[k] ?? 0) + v;
  }
  const top = Object.entries(reactions).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}:${Math.round(v / seeds)}`).join(' ');
  console.log(`${ch.name.padEnd(12)} died@wave ${waves.join(',')}  wins ${wins}/${seeds}  avgKills ${Math.round(kills / seeds)}  avgLvl ${(lvl / seeds).toFixed(1)}  [${top}]  ${Date.now() - t0}ms`);
}
