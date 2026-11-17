import {
  ENEMIES, TOTAL_WAVES, enemyDmgMult, enemyHpMult, enemySpeedMult, waveDuration, waveSpawnRate,
  type EnemyType,
} from './data';
import { ARENA, MAX_ENEMIES, type Sim } from './sim';

/** Директор волны: решает, кого и когда спавнить. */
export class Director {
  wave = 1;
  private acc = 0;
  private ringDone = false;
  private bossDone = false;

  constructor(private sim: Sim) {}

  start(wave: number): void {
    this.wave = wave;
    this.acc = 0.6;
    this.ringDone = false;
    this.bossDone = false;
    this.sim.scale = { hp: enemyHpMult(wave), dmg: enemyDmgMult(wave), speed: enemySpeedMult(wave) };
  }

  update(dt: number, waveTime: number): void {
    const sim = this.sim;
    const dur = waveDuration(this.wave);
    const overtime = waveTime > dur;
    this.acc += waveSpawnRate(this.wave) * (overtime ? 1.8 : 1) * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.spawnEvent();
    }
    if (this.wave >= 3 && !this.ringDone && waveTime > dur * 0.55) {
      this.ringDone = true;
      this.spawnRing(8 + this.wave * 2);
    }
    if (this.wave === TOTAL_WAVES && !this.bossDone && waveTime > 1) {
      this.bossDone = true;
      const p = sim.edgeSpawnPos();
      sim.spawnEnemy('boss', p.x, p.y);
      sim.onEvent('boss', 'spawn');
    }
  }

  private pickType(): EnemyType {
    const pool = (Object.keys(ENEMIES) as EnemyType[]).filter((t) => ENEMIES[t].minWave <= this.wave && t !== 'boss');
    return this.sim.rng.weighted(pool, (t) => ENEMIES[t].weight(this.wave));
  }

  private spawnEvent(): void {
    const sim = this.sim;
    if (sim.enemies.length >= MAX_ENEMIES) return;
    const type = this.pickType();
    const [lo, hi] = ENEMIES[type].group;
    const n = lo + sim.rng.int(hi - lo + 1);
    const base = sim.edgeSpawnPos();
    for (let i = 0; i < n && sim.enemies.length < MAX_ENEMIES; i++) {
      sim.spawnEnemy(type, base.x + (sim.rng.next() - 0.5) * 50, base.y + (sim.rng.next() - 0.5) * 50);
    }
  }

  /** Кольцо роя вокруг игрока — «ловушка» в середине волны. */
  private spawnRing(n: number): void {
    const sim = this.sim;
    const R = 430;
    for (let i = 0; i < n && sim.enemies.length < MAX_ENEMIES; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.min(ARENA.w + 20, Math.max(-20, sim.player.x + Math.cos(a) * R));
      const y = Math.min(ARENA.h + 20, Math.max(-20, sim.player.y + Math.sin(a) * R));
      sim.spawnEnemy('swarmer', x, y);
    }
  }
}
