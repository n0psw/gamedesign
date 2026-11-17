/** Минималистичный синтез звука через WebAudio — никаких ассетов. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last: Record<string, number> = {};

  /** Вызывать из обработчика пользовательского жеста. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  private ok(kind: string, minGap: number): boolean {
    if (!this.ctx || !this.master || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[kind] ?? -1) < minGap) return false;
    this.last[kind] = now;
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(kind: string, data?: string): void {
    switch (kind) {
      case 'shoot':
        if (!this.ok('shoot', 0.07)) return;
        if (data === 'arc') this.tone(900, 0.1, 'sawtooth', 0.05, 200);
        else this.tone(data === 'fireball' ? 220 : 520, 0.06, 'square', 0.04, 160);
        break;
      case 'hit': if (this.ok('hit', 0.05)) this.tone(160, 0.04, 'triangle', 0.05); break;
      case 'kill': if (this.ok('kill', 0.04)) this.tone(300, 0.07, 'triangle', 0.05, 90); break;
      case 'explode': if (this.ok('explode', 0.06)) this.burst(0.3, 0.35, 1800); break;
      case 'reaction':
        if (!this.ok('reaction', 0.08)) return;
        this.tone(440, 0.18, 'square', 0.07, 1100);
        this.burst(0.35, 0.3, 2400);
        break;
      case 'pickup': if (this.ok('pickup', 0.035)) this.tone(900 + Math.random() * 300, 0.05, 'sine', 0.05); break;
      case 'hurt': if (this.ok('hurt', 0.1)) { this.tone(110, 0.25, 'sawtooth', 0.12, 50); this.burst(0.2, 0.25, 900); } break;
      case 'levelup':
        if (!this.ok('levelup', 0.2)) return;
        [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.14, 'square', 0.07, undefined, i * 0.07));
        break;
      case 'buy': if (this.ok('buy', 0.05)) { this.tone(660, 0.07, 'square', 0.06); this.tone(990, 0.09, 'square', 0.06, undefined, 0.06); } break;
      case 'click': if (this.ok('click', 0.03)) this.tone(500, 0.04, 'square', 0.04); break;
      case 'deny': if (this.ok('deny', 0.1)) this.tone(130, 0.12, 'sawtooth', 0.07); break;
      case 'wave': if (this.ok('wave', 0.3)) { this.tone(200, 0.3, 'sawtooth', 0.09, 400); } break;
      case 'boss': if (this.ok('boss', 0.3)) { this.tone(70, 0.6, 'sawtooth', 0.15, 40); this.burst(0.5, 0.3, 700); } break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'square', 0.08, undefined, i * 0.12)); break;
      case 'lose': [330, 262, 196, 131].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.09, undefined, i * 0.15)); break;
    }
  }
}
