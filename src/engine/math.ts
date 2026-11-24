/**
 * Angle and 2D/3D math utilities + deterministic seeded PRNG.
 * Pure TypeScript: zero dependencies on React, Three.js, DOM, or Math.random().
 *
 * Angle convention:
 *   0 deg   = North (2D: -Y, 3D: -Z)
 *   90 deg  = East  (2D: +X, 3D: +X)
 *   180 deg = South (2D: +Y, 3D: +Z)
 *   270 deg = West  (2D: -X, 3D: -X)
 */

export function normalizeAngle360(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

export function normalizeAngle180(deg: number): number {
  let a = normalizeAngle360(deg);
  if (a > 180) a -= 360;
  return a;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function angleToVector2D(deg: number): { dx: number; dy: number } {
  const rad = degToRad(deg);
  return {
    dx: Math.sin(rad),
    dy: -Math.cos(rad),
  };
}

export function vectorToAngle2D(dx: number, dy: number): number {
  return normalizeAngle360(radToDeg(Math.atan2(dx, -dy)));
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function distance2D(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function distance3D(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number
): number {
  return Math.hypot(x2 - x1, y2 - y1, z2 - z1);
}

export function normalizeMatchSeed(seed?: number): number {
  if (seed !== undefined && Number.isFinite(seed)) {
    return Math.trunc(seed) >>> 0;
  }
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return Math.imul(Date.now() >>> 0, 0x9e3779b1) >>> 0;
}

export function deriveEntityRngSeed(matchSeed: number, slotIndex: number): number {
  let h = ((matchSeed >>> 0) ^ Math.imul((slotIndex + 1) >>> 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function nextMulberry32(state: number): { value: number; nextState: number } {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(nextState ^ (nextState >>> 15), 1 | nextState);
  r = (r ^ (r + Math.imul(r ^ (r >>> 7), 61 | r))) >>> 0;
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}
