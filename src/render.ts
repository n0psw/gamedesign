import { ELEMENT_COLOR, STATUS_COLOR, STATUS_IDS, type StatusId } from './data';
import { ARENA, PLAYER_R, type Enemy, type Sim } from './sim';

export const FONT = '"SF Mono", Menlo, Consolas, "Courier New", monospace';
export const C = {
  bg: '#000000',
  player: '#00e5ff',
  enemy: '#ff2d3d',
  hud: '#7fdfff',
  dim: '#2a5560',
  dimmer: '#12282e',
  good: '#5dff9a',
  bad: '#ff5d6a',
  warn: '#ffd24a',
  white: '#ffffff',
};

function tri(ctx: CanvasRenderingContext2D, e: Enemy, grow = 1): void {
  const s = e.r * 1.2 * grow;
  const a = e.angle;
  ctx.moveTo(e.x + Math.cos(a) * s, e.y + Math.sin(a) * s);
  ctx.lineTo(e.x + Math.cos(a + 2.4) * s * 0.95, e.y + Math.sin(a + 2.4) * s * 0.95);
  ctx.lineTo(e.x + Math.cos(a - 2.4) * s * 0.95, e.y + Math.sin(a - 2.4) * s * 0.95);
  ctx.closePath();
}

export function renderWorld(ctx: CanvasRenderingContext2D, sim: Sim, time: number): void {
  ctx.save();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  if (sim.shake > 0.2) ctx.translate((Math.random() - 0.5) * sim.shake, (Math.random() - 0.5) * sim.shake);

  // очень тихая сетка + рамка арены
  ctx.strokeStyle = 'rgba(0,229,255,0.035)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 80; x < ARENA.w; x += 80) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, ARENA.h); }
  for (let y = 80; y < ARENA.h; y += 80) { ctx.moveTo(0, y + 0.5); ctx.lineTo(ARENA.w, y + 0.5); }
  ctx.stroke();
  ctx.strokeStyle = C.dim;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, ARENA.w - 2, ARENA.h - 2);

  drawZones(ctx, sim, time);
  drawCrystals(ctx, sim);
  drawEnemies(ctx, sim, time);
  drawWeapons(ctx, sim);
  drawBullets(ctx, sim);
  drawPlayer(ctx, sim);
  drawFx(ctx, sim);
  ctx.restore();
}

function drawZones(ctx: CanvasRenderingContext2D, sim: Sim, time: number): void {
  for (const z of sim.zones) {
    if (z.dead) continue;
    const fade = Math.min(1, z.life / 1.5);
    const col = z.kind === 'oil' ? ELEMENT_COLOR.oil : ELEMENT_COLOR.water;
    ctx.globalAlpha = 0.17 * fade;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = (0.45 + 0.15 * Math.sin(time * 4 + z.id)) * fade;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(z.kind === 'oil' ? [5, 4] : [2, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
}

function drawCrystals(ctx: CanvasRenderingContext2D, sim: Sim): void {
  if (sim.crystals.length === 0) return;
  ctx.save();
  ctx.fillStyle = '#4dffd0';
  ctx.shadowColor = '#4dffd0';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (const c of sim.crystals) {
    const s = 3.5 + Math.min(4, c.v * 0.6);
    ctx.moveTo(c.x, c.y - s);
    ctx.lineTo(c.x + s * 0.7, c.y);
    ctx.lineTo(c.x, c.y + s);
    ctx.lineTo(c.x - s * 0.7, c.y);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

function drawEnemies(ctx: CanvasRenderingContext2D, sim: Sim, time: number): void {
  const es = sim.enemies;
  if (es.length === 0) return;
  ctx.save();
  // телеграф даш-врагов
  ctx.strokeStyle = 'rgba(255,45,61,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const e of es) {
    if (e.type === 'dasher' && e.mode === 1 && e.alive) { ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dx * 190, e.y + e.dy * 190); }
  }
  ctx.stroke();

  // тела: обычные / вспышка / заморожены — три батча
  ctx.shadowBlur = 11;
  const normal = es.filter((e) => e.alive && e.flash <= 0 && e.st.frozen <= 0);
  ctx.fillStyle = C.enemy;
  ctx.shadowColor = C.enemy;
  ctx.beginPath();
  for (const e of normal) tri(ctx, e);
  ctx.fill();

  const flashing = es.filter((e) => e.alive && e.flash > 0 && e.st.frozen <= 0);
  if (flashing.length) {
    ctx.fillStyle = '#ffd6d9';
    ctx.shadowColor = '#ffffff';
    ctx.beginPath();
    for (const e of flashing) tri(ctx, e);
    ctx.fill();
  }
  const frozen = es.filter((e) => e.alive && e.st.frozen > 0);
  if (frozen.length) {
    ctx.fillStyle = '#bff3ff';
    ctx.shadowColor = '#7fe8ff';
    ctx.beginPath();
    for (const e of frozen) tri(ctx, e);
    ctx.fill();
  }

  // телеграф удара по статусам (кольца)
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.8;
  for (const s of STATUS_IDS) {
    if (s === 'frozen') continue;
    ctx.strokeStyle = STATUS_COLOR[s as StatusId];
    ctx.beginPath();
    let any = false;
    for (const e of es) {
      if (!e.alive || e.st[s] <= 0) continue;
      const rr = e.r * 1.2 + 3 + (s === 'burning' ? Math.sin(time * 14 + e.id) * 1.5 : 0) + STATUS_IDS.indexOf(s) * 0.0;
      if (s === 'stunned') {
        ctx.moveTo(e.x - 6, e.y - e.r - 8); ctx.lineTo(e.x + 6, e.y - e.r - 8);
        ctx.moveTo(e.x - 3, e.y - e.r - 12); ctx.lineTo(e.x + 3, e.y - e.r - 12);
      } else {
        ctx.moveTo(e.x + rr, e.y);
        ctx.arc(e.x, e.y, rr, 0, Math.PI * 2);
      }
      any = true;
    }
    if (any) ctx.stroke();
  }

  // полоски HP у крупных
  for (const e of es) {
    if (!e.alive || e.r < 20 || e.type === 'boss' || e.hp >= e.maxHp) continue;
    ctx.fillStyle = C.dimmer;
    ctx.fillRect(e.x - 16, e.y - e.r - 10, 32, 3);
    ctx.fillStyle = C.enemy;
    ctx.fillRect(e.x - 16, e.y - e.r - 10, 32 * Math.max(0, e.hp / e.maxHp), 3);
  }
  // босс: внутренний контур
  for (const e of es) {
    if (e.type !== 'boss' || !e.alive) continue;
    ctx.strokeStyle = '#ffd6d9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    tri(ctx, e, 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWeapons(ctx: CanvasRenderingContext2D, sim: Sim): void {
  ctx.save();
  ctx.fillStyle = ELEMENT_COLOR.kinetic;
  ctx.shadowColor = ELEMENT_COLOR.kinetic;
  ctx.shadowBlur = 10;
  for (const w of sim.weapons) {
    if (w.id !== 'blades') continue;
    for (const p of sim.bladePositions(w)) ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
  }
  ctx.restore();
}

function drawBullets(ctx: CanvasRenderingContext2D, sim: Sim): void {
  ctx.save();
  ctx.shadowBlur = 10;
  for (const el of ['kinetic', 'fire', 'ice', 'water'] as const) {
    const bs = sim.bullets.filter((b) => b.element === el);
    if (!bs.length) continue;
    ctx.fillStyle = ELEMENT_COLOR[el];
    ctx.shadowColor = ELEMENT_COLOR[el];
    ctx.beginPath();
    for (const b of bs) { ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); }
    ctx.fill();
  }
  if (sim.ebullets.length) {
    ctx.fillStyle = '#ff6a75';
    ctx.shadowColor = C.enemy;
    ctx.beginPath();
    for (const b of sim.ebullets) { ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); }
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, sim: Sim): void {
  const p = sim.player;
  if (p.invuln > 0 && Math.floor(p.invuln * 24) % 2 === 0) return;
  ctx.save();
  ctx.fillStyle = C.player;
  ctx.shadowColor = C.player;
  ctx.shadowBlur = 20;
  ctx.fillRect(p.x - PLAYER_R, p.y - PLAYER_R, PLAYER_R * 2, PLAYER_R * 2);
  ctx.restore();
}

function drawFx(ctx: CanvasRenderingContext2D, sim: Sim): void {
  const fx = sim.fx;
  ctx.save();
  for (const r of fx.rings) {
    const k = 1 - r.life / r.max;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * (1 - k * 0.6);
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * Math.min(1, k * 1.4), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.shadowBlur = 12;
  for (const b of fx.bolts) {
    ctx.globalAlpha = Math.max(0, b.life / b.max);
    ctx.strokeStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.lineWidth = b.width;
    ctx.beginPath();
    ctx.moveTo(b.pts[0], b.pts[1]);
    for (let i = 2; i < b.pts.length; i += 2) {
      // зигзаг между узлами
      const x0 = b.pts[i - 2], y0 = b.pts[i - 1], x1 = b.pts[i], y1 = b.pts[i + 1];
      const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 18, my = (y0 + y1) / 2 + (Math.random() - 0.5) * 18;
      ctx.lineTo(mx, my);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  for (const q of fx.parts) {
    ctx.globalAlpha = Math.max(0, q.life / q.max);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of fx.texts) {
    ctx.globalAlpha = Math.min(1, (t.life / t.max) * 1.6);
    ctx.fillStyle = t.color;
    ctx.font = `bold ${t.size}px ${FONT}`;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
}
