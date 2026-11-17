/** Визуальные эффекты (частицы, кольца, молнии, всплывающие числа). Не влияют на геймплей. */
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
export interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; width: number }
export interface Bolt { pts: number[]; life: number; max: number; color: string; width: number }
export interface FloatText { x: number; y: number; vy: number; life: number; max: number; text: string; color: string; size: number }

export class Fx {
  enabled = true;
  parts: Particle[] = [];
  rings: Ring[] = [];
  bolts: Bolt[] = [];
  texts: FloatText[] = [];

  burst(x: number, y: number, color: string, n: number, speed: number, life: number, size = 2.5): void {
    if (!this.enabled) return;
    for (let i = 0; i < n && this.parts.length < 700; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.4), max: life, color, size });
    }
  }
  ring(x: number, y: number, r0: number, r1: number, life: number, color: string, width = 3): void {
    if (!this.enabled || this.rings.length > 80) return;
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  }
  bolt(pts: number[], color: string, life = 0.18, width = 2.5): void {
    if (!this.enabled || this.bolts.length > 40) return;
    this.bolts.push({ pts, life, max: life, color, width });
  }
  text(x: number, y: number, text: string, color: string, size = 13, life = 0.7): void {
    if (!this.enabled || this.texts.length > 60) return;
    this.texts.push({ x, y, vy: -38, life, max: life, text, color, size });
  }
  update(dt: number): void {
    const p = this.parts;
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      q.life -= dt;
      if (q.life <= 0) { p[i] = p[p.length - 1]; p.pop(); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      const d = Math.exp(-3 * dt);
      q.vx *= d; q.vy *= d;
    }
    this.rings = this.rings.filter((r) => (r.life -= dt) > 0);
    this.bolts = this.bolts.filter((b) => (b.life -= dt) > 0);
    for (const t of this.texts) { t.life -= dt; t.y += t.vy * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }
  clear(): void {
    this.parts.length = 0; this.rings.length = 0; this.bolts.length = 0; this.texts.length = 0;
  }
}
