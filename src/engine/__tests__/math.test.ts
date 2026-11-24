import { describe, expect, it } from 'vitest';
import {
  angleToVector2D,
  clamp,
  degToRad,
  deriveEntityRngSeed,
  distance2D,
  distance3D,
  nextMulberry32,
  normalizeAngle180,
  normalizeAngle360,
  normalizeMatchSeed,
  radToDeg,
  vectorToAngle2D,
} from '../math';

describe('math & deterministic PRNG', () => {
  it('produces deterministic sequences in [0, 1) from nextMulberry32', () => {
    const seqA: number[] = [];
    const seqB: number[] = [];

    let stateA = normalizeMatchSeed(123456);
    let stateB = normalizeMatchSeed(123456);

    for (let i = 0; i < 20; i++) {
      const a = nextMulberry32(stateA);
      const b = nextMulberry32(stateB);
      stateA = a.nextState;
      stateB = b.nextState;
      seqA.push(a.value);
      seqB.push(b.value);
      expect(a.value).toBeGreaterThanOrEqual(0);
      expect(a.value).toBeLessThan(1);
    }

    expect(seqA).toEqual(seqB);

    const diffFirst = nextMulberry32(normalizeMatchSeed(123457)).value;
    expect(diffFirst).not.toBe(seqA[0]);
  });

  it('derives distinct deterministic entity seeds per slot index', () => {
    const matchSeed = 424242;
    const seeds = Array.from({ length: 9 }, (_, i) => deriveEntityRngSeed(matchSeed, i));
    const unique = new Set(seeds);
    expect(unique.size).toBe(9);
    expect(deriveEntityRngSeed(matchSeed, 4)).toBe(seeds[4]);
  });

  it('normalizes explicit match seeds to uint32', () => {
    expect(normalizeMatchSeed(0)).toBe(0);
    expect(normalizeMatchSeed(-1)).toBe(0xffffffff);
    expect(normalizeMatchSeed(99.8)).toBe(99);
    expect(normalizeMatchSeed(4294967297)).toBe(1);
  });

  it('normalizes angles and converts between angles and 2D vectors', () => {
    expect(normalizeAngle360(-90)).toBe(270);
    expect(normalizeAngle360(450)).toBe(90);
    expect(normalizeAngle180(270)).toBe(-90);
    expect(normalizeAngle180(-270)).toBe(90);
    expect(radToDeg(degToRad(135))).toBeCloseTo(135, 10);

    const north = angleToVector2D(0);
    expect(north.dx).toBeCloseTo(0, 10);
    expect(north.dy).toBeCloseTo(-1, 10);
    expect(vectorToAngle2D(north.dx, north.dy)).toBeCloseTo(0, 10);

    const east = angleToVector2D(90);
    expect(east.dx).toBeCloseTo(1, 10);
    expect(east.dy).toBeCloseTo(0, 10);
    expect(vectorToAngle2D(east.dx, east.dy)).toBeCloseTo(90, 10);

    expect(vectorToAngle2D(-1, 0)).toBeCloseTo(270, 10);
  });

  it('clamps values and computes 2D/3D distances', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);

    expect(distance2D(0, 0, 3, 4)).toBe(5);
    expect(distance3D(1, 2, 3, 3, 5, 9)).toBe(7);
  });
});
