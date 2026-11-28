import { getArmWeaponSpec, getShoulderWeaponSpec } from '../data/parts';
import { MechRuntimeState, SimCombatEvent, WeaponSlotId } from '../types/mech';

type SoundCategory = 'fire' | 'hit' | 'ricochet' | 'ams' | 'part' | 'kill' | 'heat';

const CATEGORY_MIN_INTERVAL_MS: Record<SoundCategory, number> = {
  fire: 60,
  hit: 70,
  ricochet: 85,
  ams: 45,
  part: 130,
  kill: 200,
  heat: 250,
};

const MAX_CONCURRENT_VOICES = 12;

function resolveWeaponKindForFireEvent(
  ev: SimCombatEvent,
  mechs: MechRuntimeState[]
): { kind: string; weaponId: string } {
  if (ev.detail === 'laser') {
    return { kind: 'laser', weaponId: ev.weaponId ?? 'medium_laser' };
  }
  const actor = mechs.find((m) => m.id === ev.actorId);
  const slot = ev.detail as WeaponSlotId | undefined;
  if (actor && (slot === 'rightArm' || slot === 'leftArm')) {
    const id = actor.blueprint.parts[`${slot}Weapon`];
    const spec = getArmWeaponSpec(id);
    return { kind: spec.kind, weaponId: spec.id };
  }
  if (actor && (slot === 'rightShoulder' || slot === 'leftShoulder')) {
    const id = actor.blueprint.parts[`${slot}Weapon`];
    const spec = getShoulderWeaponSpec(id);
    return { kind: spec.kind, weaponId: spec.id };
  }
  return { kind: 'ballistic', weaponId: 'ac5' };
}

/**
 * Lightweight 8-bit Famicom (NES 2A03) chiptune SFX synthesizer using Web Audio API:
 * - 25% duty cycle pulse wave via PeriodicWave
 * - Triangle channel kicks
 * - Stepped staircase pitch arpeggios (setValueAtTime) instead of smooth ramps
 * - Sample-and-hold quantized LFSR-style noise buffers
 */
export class BattleAudioEngine {
  private ctx: AudioContext | null = null;
  private pulse25Wave: PeriodicWave | null = null;
  private crispNoiseBuffer: AudioBuffer | null = null;
  private boomNoiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private lastTickPlayed = -1;
  private activeVoices = 0;
  private lastCategoryTime: Record<SoundCategory, number> = {
    fire: 0,
    hit: 0,
    ricochet: 0,
    ams: 0,
    part: 0,
    kill: 0,
    heat: 0,
  };

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  private getReadyContext(): AudioContext | null {
    if (!this.enabled || !this.ctx) return null;
    if (this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private canTrigger(category: SoundCategory): boolean {
    if (this.activeVoices >= MAX_CONCURRENT_VOICES) return false;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastCategoryTime[category] < CATEGORY_MIN_INTERVAL_MS[category]) {
      return false;
    }
    this.lastCategoryTime[category] = nowMs;
    return true;
  }

  private trackVoice(durationSec: number): void {
    this.activeVoices += 1;
    setTimeout(() => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }, Math.ceil(durationSec * 1000) + 30);
  }

  private getPulse25Wave(ctx: AudioContext): PeriodicWave | null {
    if (this.pulse25Wave) return this.pulse25Wave;
    if (typeof ctx.createPeriodicWave !== 'function') return null;
    const harmonics = 24;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    const duty = 0.25;
    for (let n = 1; n < harmonics; n++) {
      // Fourier coefficients for pulse wave of duty cycle d
      imag[n] = (2 / (n * Math.PI)) * Math.sin(Math.PI * n * duty);
    }
    this.pulse25Wave = ctx.createPeriodicWave(real, imag);
    return this.pulse25Wave;
  }

  private buildSteppedNoiseBuffer(ctx: AudioContext, sampleHold: number, durationSec: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * durationSec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let held = 0;
    for (let i = 0; i < len; i++) {
      if (i % sampleHold === 0) {
        // Quantized 4-level NES-like noise amplitude
        const q = Math.floor(Math.random() * 4);
        held = q === 0 ? -0.9 : q === 1 ? -0.3 : q === 2 ? 0.3 : 0.9;
      }
      data[i] = held;
    }
    return buf;
  }

  private getCrispNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.crispNoiseBuffer && this.crispNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.crispNoiseBuffer;
    }
    this.crispNoiseBuffer = this.buildSteppedNoiseBuffer(ctx, 8, 0.55);
    return this.crispNoiseBuffer;
  }

  private getBoomNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.boomNoiseBuffer && this.boomNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.boomNoiseBuffer;
    }
    this.boomNoiseBuffer = this.buildSteppedNoiseBuffer(ctx, 28, 0.55);
    return this.boomNoiseBuffer;
  }

  private playStepSequence(
    ctx: AudioContext,
    waveKind: 'pulse25' | 'square' | 'triangle',
    freqs: number[],
    stepSec: number,
    volume: number
  ): void {
    if (freqs.length === 0) return;
    const t0 = ctx.currentTime;
    const durationSec = freqs.length * stepSec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (waveKind === 'pulse25') {
      const wave = this.getPulse25Wave(ctx);
      if (wave) {
        osc.setPeriodicWave(wave);
      } else {
        osc.type = 'square';
      }
    } else {
      osc.type = waveKind;
    }

    for (let i = 0; i < freqs.length; i++) {
      osc.frequency.setValueAtTime(Math.max(30, freqs[i]), t0 + i * stepSec);
    }

    // Crisp 8-bit envelope (quick attack, stepped sustain/decay, clean release)
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.004);
    gain.gain.setValueAtTime(volume * 0.72, t0 + durationSec * 0.55);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.01);
    this.trackVoice(durationSec);
  }

  private playNesNoise(
    ctx: AudioContext,
    buffer: AudioBuffer,
    rateStart: number,
    rateEnd: number,
    durationSec: number,
    volume: number,
    bandpass?: { startHz: number; endHz: number; q?: number }
  ): void {
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    // 4 stepped playback rate transitions for classic Famicom noise decay
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const ratio = i / Math.max(1, steps - 1);
      const rate = rateStart + (rateEnd - rateStart) * ratio;
      src.playbackRate.setValueAtTime(Math.max(0.2, rate), t0 + (durationSec * i) / steps);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.004);
    gain.gain.setValueAtTime(volume * 0.65, t0 + durationSec * 0.45);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + durationSec);

    if (bandpass && typeof ctx.createBiquadFilter === 'function') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = bandpass.q ?? 1.4;
      for (let i = 0; i < steps; i++) {
        const ratio = i / Math.max(1, steps - 1);
        const freq = bandpass.startHz + (bandpass.endHz - bandpass.startHz) * ratio;
        filter.frequency.setValueAtTime(Math.max(80, freq), t0 + (durationSec * i) / steps);
      }
      src.connect(filter);
      filter.connect(gain);
    } else {
      src.connect(gain);
    }

    gain.connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + durationSec + 0.01);
    this.trackVoice(durationSec);
  }

  private playFireSound(ctx: AudioContext, kind: string, weaponId: string): void {
    if (!this.canTrigger('fire')) return;
    if (kind === 'laser') {
      // Heavy, resonant 8-bit beam scaled by laser class
      if (weaponId === 'large_laser') {
        this.playStepSequence(ctx, 'pulse25', [392, 330, 262, 220, 196, 165], 0.05, 0.06);
        this.playStepSequence(ctx, 'triangle', [196, 147, 110, 98], 0.075, 0.095);
        this.playNesNoise(ctx, this.getBoomNoiseBuffer(ctx), 1.1, 0.65, 0.14, 0.028);
      } else if (weaponId === 'small_laser') {
        this.playStepSequence(ctx, 'pulse25', [659, 523, 392, 330], 0.032, 0.048);
        this.playStepSequence(ctx, 'triangle', [330, 220], 0.064, 0.065);
      } else {
        this.playStepSequence(ctx, 'pulse25', [523, 440, 349, 294, 247], 0.042, 0.056);
        this.playStepSequence(ctx, 'triangle', [262, 196, 147], 0.07, 0.082);
      }
    } else if (kind === 'energy' || weaponId === 'ppc') {
      // Alternating electric chiptune zap
      this.playStepSequence(ctx, 'square', [1175, 587, 988, 494, 784, 392], 0.024, 0.05);
      this.playNesNoise(ctx, this.getCrispNoiseBuffer(ctx), 1.4, 0.7, 0.09, 0.03);
    } else if (kind === 'lrm_homing' || kind === 'srm_homing' || kind === 'srm_rocket') {
      // Missile ignition pop ("ば") + bandpass-swept 8-bit rocket exhaust whoosh ("しゅー")
      this.playStepSequence(ctx, 'triangle', [190, 95], 0.024, 0.085);
      this.playNesNoise(ctx, this.getCrispNoiseBuffer(ctx), 1.9, 0.72, 0.3, 0.078, {
        startHz: 1900,
        endHz: 520,
        q: 1.2,
      });
    } else if (kind === 'melee') {
      this.playStepSequence(ctx, 'pulse25', [523, 784, 1175, 1760], 0.02, 0.05);
    } else if (weaponId === 'gauss_rifle') {
      this.playStepSequence(ctx, 'pulse25', [1760, 1175, 659, 262], 0.024, 0.055);
      this.playNesNoise(ctx, this.getCrispNoiseBuffer(ctx), 1.7, 0.8, 0.1, 0.04);
    } else if (weaponId === 'ac20') {
      this.playStepSequence(ctx, 'triangle', [220, 147, 82, 55], 0.035, 0.11);
      this.playNesNoise(ctx, this.getBoomNoiseBuffer(ctx), 1.25, 0.65, 0.18, 0.06);
    } else {
      this.playStepSequence(ctx, 'pulse25', [440, 294, 165], 0.022, 0.045);
      this.playNesNoise(ctx, this.getCrispNoiseBuffer(ctx), 1.2, 0.75, 0.075, 0.035);
    }
  }

  public playSimEvents(
    events: SimCombatEvent[],
    mechs: MechRuntimeState[],
    simTick: number
  ): void {
    if (simTick < this.lastTickPlayed) {
      this.lastTickPlayed = simTick;
      return;
    }
    if (simTick === this.lastTickPlayed) return;
    this.lastTickPlayed = simTick;

    const ctx = this.getReadyContext();
    if (!ctx || events.length === 0) return;

    for (const ev of events) {
      if (ev.type === 'mech_destroyed') {
        if (this.canTrigger('kill')) {
          // Classic Famicom explosion: crunchy descending 8-bit noise + low pulse arpeggio
          this.playNesNoise(ctx, this.getBoomNoiseBuffer(ctx), 1.4, 0.55, 0.48, 0.11);
          this.playStepSequence(ctx, 'square', [392, 294, 196, 110, 65], 0.075, 0.075);
        }
      } else if (ev.type === 'part_destroyed') {
        if (this.canTrigger('part')) {
          this.playStepSequence(ctx, 'square', [587, 392, 262, 131], 0.04, 0.065);
          this.playNesNoise(ctx, this.getBoomNoiseBuffer(ctx), 1.3, 0.75, 0.2, 0.06);
        }
      } else if (ev.type === 'fire') {
        const { kind, weaponId } = resolveWeaponKindForFireEvent(ev, mechs);
        this.playFireSound(ctx, kind, weaponId);
      } else if (ev.type === 'ricochet') {
        if (this.canTrigger('ricochet')) {
          // Bright 8-bit metallic pi-ko-n!
          this.playStepSequence(ctx, 'pulse25', [1976, 2637, 1568], 0.028, 0.042);
        }
      } else if (ev.type === 'missile_intercepted') {
        if (this.canTrigger('ams')) {
          if (ev.detail === 'ams_laser') {
            this.playStepSequence(ctx, 'pulse25', [1568, 1175, 880], 0.02, 0.052);
          } else {
            this.playNesNoise(ctx, this.getCrispNoiseBuffer(ctx), 1.85, 1.1, 0.055, 0.058, {
              startHz: 2400,
              endHz: 1200,
              q: 1.0,
            });
            this.playStepSequence(ctx, 'square', [740, 370], 0.018, 0.05);
          }
        }
      } else if (ev.type === 'hit') {
        if (ev.detail === 'critical' && this.canTrigger('hit')) {
          this.playStepSequence(ctx, 'pulse25', [1318, 1760, 2093], 0.018, 0.048);
        } else if ((ev.damage ?? 0) >= 6 && this.canTrigger('hit')) {
          this.playStepSequence(ctx, 'square', [330, 220, 131], 0.02, 0.038);
        }
      } else if (ev.type === 'thermal_shutdown') {
        if (this.canTrigger('heat')) {
          // 2-tone 8-bit warning alarm
          this.playStepSequence(ctx, 'pulse25', [880, 659, 880, 523], 0.055, 0.045);
        }
      }
    }
  }
}

export const battleAudio = new BattleAudioEngine();
