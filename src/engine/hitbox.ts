import {
  ArmorFace,
  MatchRules,
  MechPartId,
  MechPartsRuntimeState,
  MechRuntimeState,
  Vec3,
} from '../types/mech';
import { clamp, degToRad, radToDeg } from './math';

export interface LocalBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export const BASE_MECH_HEIGHT = 10.0;
export const BASE_MECH_EYE_Z = 9.0;
export const BASE_MECH_CENTER_Z = 6.7;
export const BASE_MECH_COLLISION_RADIUS = 2.6;

export function getMechCollisionRadius(sizeScale = 1.0): number {
  return BASE_MECH_COLLISION_RADIUS * Math.max(0.25, sizeScale);
}

export function getMechEyeZ(sizeScale = 1.0): number {
  return BASE_MECH_EYE_Z * Math.max(0.25, sizeScale);
}

export function getMechCenterZ(sizeScale = 1.0): number {
  return BASE_MECH_CENTER_Z * Math.max(0.25, sizeScale);
}

export const MECH_BOUNDING_SPHERE = {
  zOffset: 5.0,
  radius: 6.4,
};

export const HEAD_HITBOX_SPHERE = {
  center: { x: 0, y: 0.1, z: 9.35 },
  radius: 0.65,
};

export const MECH_PART_BOXES: Record<Exclude<MechPartId, 'head'>, LocalBox> = {
  // BattleMech 3-section torso (中央胴 + 右胴 + 左胴) + outboard arms + legs
  torso: { minX: -0.95, maxX: 0.95, minY: -1.05, maxY: 1.05, minZ: 4.6, maxZ: 8.7 },
  rightShoulder: { minX: 0.95, maxX: 1.92, minY: -0.98, maxY: 0.98, minZ: 5.2, maxZ: 8.85 },
  leftShoulder: { minX: -1.92, maxX: -0.95, minY: -0.98, maxY: 0.98, minZ: 5.2, maxZ: 8.85 },
  rightArm: { minX: 1.92, maxX: 2.75, minY: -0.75, maxY: 1.1, minZ: 4.4, maxZ: 7.5 },
  leftArm: { minX: -2.75, maxX: -1.92, minY: -0.75, maxY: 1.1, minZ: 4.4, maxZ: 7.5 },
  rightLeg: { minX: 0.25, maxX: 1.45, minY: -0.9, maxY: 0.9, minZ: 0.0, maxZ: 4.6 },
  leftLeg: { minX: -1.45, maxX: -0.25, minY: -0.9, maxY: 0.9, minZ: 0.0, maxZ: 4.6 },
};

export function worldToMechLocal(point: Vec3, mechPos: Vec3, mechYawDeg: number): Vec3 {
  const rad = degToRad(mechYawDeg);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = point.x - mechPos.x;
  const dy = point.y - mechPos.y;
  const dz = point.z - mechPos.z;

  // 0 deg = North (0, -1): +localX = Right, +localY = Front, +localZ = Up
  return {
    x: dx * c + dy * s,
    y: dx * s - dy * c,
    z: dz,
  };
}

export function mechLocalToWorld(local: Vec3, mechPos: Vec3, mechYawDeg: number): Vec3 {
  const rad = degToRad(mechYawDeg);
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  return {
    x: mechPos.x + local.x * c + local.y * s,
    y: mechPos.y + local.x * s - local.y * c,
    z: mechPos.z + local.z,
  };
}

function intersectSegmentSphere(
  a: Vec3,
  b: Vec3,
  center: Vec3,
  radius: number
): { t: number; normal: Vec3 } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const fx = a.x - center.x;
  const fy = a.y - center.y;
  const fz = a.z - center.z;

  const qa = dx * dx + dy * dy + dz * dz;
  if (qa < 1e-10) {
    const distSq = fx * fx + fy * fy + fz * fz;
    if (distSq <= radius * radius) {
      const len = Math.sqrt(distSq) || 1;
      return { t: 0, normal: { x: fx / len, y: fy / len, z: fz / len } };
    }
    return null;
  }

  const qb = 2 * (fx * dx + fy * dy + fz * dz);
  const qc = fx * fx + fy * fy + fz * fz - radius * radius;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return null;

  const sqrtD = Math.sqrt(disc);
  const t1 = (-qb - sqrtD) / (2 * qa);
  const t2 = (-qb + sqrtD) / (2 * qa);

  let hitT: number | null = null;
  if (t1 >= 0 && t1 <= 1) hitT = t1;
  else if (t2 >= 0 && t2 <= 1) hitT = t2;
  else if (t1 < 0 && t2 > 1) hitT = 0;

  if (hitT === null) return null;

  const hx = a.x + dx * hitT - center.x;
  const hy = a.y + dy * hitT - center.y;
  const hz = a.z + dz * hitT - center.z;
  const nLen = Math.hypot(hx, hy, hz) || 1;
  return {
    t: hitT,
    normal: { x: hx / nLen, y: hy / nLen, z: hz / nLen },
  };
}

function intersectSegmentBox(
  a: Vec3,
  b: Vec3,
  box: LocalBox
): { t: number; normal: Vec3 } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;

  const mins = [box.minX, box.minY, box.minZ];
  const maxs = [box.maxX, box.maxY, box.maxZ];
  const origins = [a.x, a.y, a.z];
  const dirs = [dx, dy, dz];

  let tMin = 0;
  let tMax = 1;
  let hitAxis = 1;
  let hitSign = 1;

  for (let i = 0; i < 3; i++) {
    if (Math.abs(dirs[i]) < 1e-8) {
      if (origins[i] < mins[i] || origins[i] > maxs[i]) {
        return null;
      }
    } else {
      const invD = 1 / dirs[i];
      let t1 = (mins[i] - origins[i]) * invD;
      let t2 = (maxs[i] - origins[i]) * invD;
      let sign = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        sign = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitAxis = i;
        hitSign = sign;
      }
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) {
        return null;
      }
    }
  }

  if (tMin < 0 || tMin > 1) return null;

  const normal: Vec3 = {
    x: hitAxis === 0 ? hitSign : 0,
    y: hitAxis === 1 ? hitSign : 0,
    z: hitAxis === 2 ? hitSign : 0,
  };
  return { t: tMin, normal };
}

export interface PartHitResult {
  partId: MechPartId;
  t: number;
  hitWorldPos: Vec3;
  hitLocalPos: Vec3;
  localNormal: Vec3;
  incidenceAngleDeg: number;
  face: ArmorFace;
  fromFrontArc: boolean;
}

export function testProjectileHitMech(
  segStart: Vec3,
  segEnd: Vec3,
  mechPos: Vec3,
  mechYawDeg: number,
  torsoYawDeg = mechYawDeg,
  sizeScale = 1.0
): PartHitResult | null {
  const safeScale = Math.max(0.25, sizeScale);
  const invScale = 1 / safeScale;

  // Stage 1: Broad-phase mech bounding sphere (scaled by chassis sizeScale)
  const sphereCenter: Vec3 = {
    x: mechPos.x,
    y: mechPos.y,
    z: mechPos.z + MECH_BOUNDING_SPHERE.zOffset * safeScale,
  };
  if (
    !intersectSegmentSphere(
      segStart,
      segEnd,
      sphereCenter,
      MECH_BOUNDING_SPHERE.radius * safeScale
    )
  ) {
    return null;
  }

  // Stage 2: Narrow-phase 8-part split local space check (scaled uniformly around feet)
  const rawUpperA = worldToMechLocal(segStart, mechPos, torsoYawDeg);
  const rawUpperB = worldToMechLocal(segEnd, mechPos, torsoYawDeg);
  const rawLowerA = worldToMechLocal(segStart, mechPos, mechYawDeg);
  const rawLowerB = worldToMechLocal(segEnd, mechPos, mechYawDeg);

  const upperA: Vec3 = {
    x: rawUpperA.x * invScale,
    y: rawUpperA.y * invScale,
    z: rawUpperA.z * invScale,
  };
  const upperB: Vec3 = {
    x: rawUpperB.x * invScale,
    y: rawUpperB.y * invScale,
    z: rawUpperB.z * invScale,
  };
  const lowerA: Vec3 = {
    x: rawLowerA.x * invScale,
    y: rawLowerA.y * invScale,
    z: rawLowerA.z * invScale,
  };
  const lowerB: Vec3 = {
    x: rawLowerB.x * invScale,
    y: rawLowerB.y * invScale,
    z: rawLowerB.z * invScale,
  };

  let bestPart: MechPartId | null = null;
  let bestT = Infinity;
  let bestNormal: Vec3 = { x: 0, y: 1, z: 0 };
  let bestIsUpper = true;

  const headHit = intersectSegmentSphere(
    upperA,
    upperB,
    HEAD_HITBOX_SPHERE.center,
    HEAD_HITBOX_SPHERE.radius
  );
  if (headHit && headHit.t < bestT) {
    bestT = headHit.t;
    bestPart = 'head';
    bestNormal = headHit.normal;
    bestIsUpper = true;
  }

  const upperBoxParts: Array<'torso' | 'rightShoulder' | 'leftShoulder' | 'rightArm' | 'leftArm'> = [
    'torso',
    'rightShoulder',
    'leftShoulder',
    'rightArm',
    'leftArm',
  ];
  for (const partId of upperBoxParts) {
    const hit = intersectSegmentBox(upperA, upperB, MECH_PART_BOXES[partId]);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      bestPart = partId;
      bestNormal = hit.normal;
      bestIsUpper = true;
    }
  }

  const lowerBoxParts: Array<'rightLeg' | 'leftLeg'> = ['rightLeg', 'leftLeg'];
  for (const partId of lowerBoxParts) {
    const hit = intersectSegmentBox(lowerA, lowerB, MECH_PART_BOXES[partId]);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      bestPart = partId;
      bestNormal = hit.normal;
      bestIsUpper = false;
    }
  }

  if (!bestPart) return null;

  const localA = bestIsUpper ? upperA : lowerA;
  const localB = bestIsUpper ? upperB : lowerB;
  const rdx = localB.x - localA.x;
  const rdy = localB.y - localA.y;
  const rdz = localB.z - localA.z;
  const rayLen = Math.hypot(rdx, rdy, rdz) || 1;
  const unitRay: Vec3 = { x: rdx / rayLen, y: rdy / rayLen, z: rdz / rayLen };

  const hitLocalPos: Vec3 = {
    x: (localA.x + rdx * bestT) * safeScale,
    y: (localA.y + rdy * bestT) * safeScale,
    z: (localA.z + rdz * bestT) * safeScale,
  };

  const hitWorldPos: Vec3 = {
    x: segStart.x + (segEnd.x - segStart.x) * bestT,
    y: segStart.y + (segEnd.y - segStart.y) * bestT,
    z: segStart.z + (segEnd.z - segStart.z) * bestT,
  };

  const cosTheta = clamp(
    Math.abs(unitRay.x * bestNormal.x + unitRay.y * bestNormal.y + unitRay.z * bestNormal.z),
    0,
    1
  );
  const incidenceAngleDeg = radToDeg(Math.acos(cosTheta));
  const fromFrontArc = localA.y >= 0;

  let face: ArmorFace = 'all';
  if (bestPart === 'torso' || bestPart === 'rightShoulder' || bestPart === 'leftShoulder') {
    if (bestNormal.y > 0.5) face = 'front';
    else if (bestNormal.y < -0.5) face = 'rear';
    else face = fromFrontArc ? 'front' : 'rear';
  }

  return {
    partId: bestPart,
    t: bestT,
    hitWorldPos,
    hitLocalPos,
    localNormal: bestNormal,
    incidenceAngleDeg,
    face,
    fromFrontArc,
  };
}

export interface ArmorDamageEval {
  finalDamage: number;
  ricocheted: boolean;
}

export function getTargetArmorRemaining(
  parts: MechPartsRuntimeState,
  partId: MechPartId,
  face: ArmorFace
): number {
  const part = parts[partId];
  if (part.kind === 'dual') {
    return face === 'rear' ? part.rearArmor : part.frontArmor;
  }
  return part.armor;
}

export function computeArmorDamageResult(params: {
  rawDamage: number;
  canRicochet: boolean;
  ricochetAngleDeg: number;
  hit: PartHitResult;
  targetParts: MechPartsRuntimeState;
}): ArmorDamageEval {
  const {
    rawDamage,
    canRicochet,
    ricochetAngleDeg,
    hit,
    targetParts,
  } = params;

  const intactArmor = getTargetArmorRemaining(targetParts, hit.partId, hit.face);

  if (canRicochet && intactArmor > 0 && hit.incidenceAngleDeg > ricochetAngleDeg) {
    return {
      finalDamage: 0,
      ricocheted: true,
    };
  }

  let damage = rawDamage;

  if (hit.incidenceAngleDeg > 35) {
    const slopeFactor = clamp(1 - ((hit.incidenceAngleDeg - 35) / 55) * 0.35, 0.65, 1);
    damage *= slopeFactor;
  }

  return {
    finalDamage: Math.max(0, damage),
    ricocheted: false,
  };
}

export interface DamageApplicationResult {
  appliedDamage: number;
  newlyDestroyedParts: MechPartId[];
  mechKilled: boolean;
}

const ADJACENT_SPLASH_PARTS: Record<MechPartId, readonly MechPartId[]> = {
  torso: ['leftShoulder', 'rightShoulder'],
  rightShoulder: ['torso', 'rightArm'],
  leftShoulder: ['torso', 'leftArm'],
  rightArm: ['rightShoulder'],
  leftArm: ['leftShoulder'],
  rightLeg: ['torso'],
  leftLeg: ['torso'],
  head: ['torso'],
};

function applyDamageToSinglePart(
  parts: MechPartsRuntimeState,
  partId: MechPartId,
  face: ArmorFace,
  damage: number,
  newlyDestroyed: MechPartId[]
): number {
  if (damage <= 0) return 0;
  const part = parts[partId];

  if (part.destroyed) {
    return damage; // Full damage becomes overflow/transfer for already destroyed part
  }

  let rem = damage;
  if (part.kind === 'dual') {
    if (face === 'rear') {
      const absorbed = Math.min(part.rearArmor, rem);
      part.rearArmor -= absorbed;
      rem -= absorbed;
    } else {
      const absorbed = Math.min(part.frontArmor, rem);
      part.frontArmor -= absorbed;
      rem -= absorbed;
    }
  } else {
    const absorbed = Math.min(part.armor, rem);
    part.armor -= absorbed;
    rem -= absorbed;
  }

  let overflow = 0;
  if (rem > 0) {
    if (rem >= part.structure) {
      overflow = rem - part.structure;
      part.structure = 0;
      part.destroyed = true;
      newlyDestroyed.push(partId);
    } else {
      part.structure -= rem;
    }
  }

  return overflow;
}

export function applyDamageToMechParts(
  mech: MechRuntimeState,
  hit: PartHitResult,
  damage: number,
  rules: Pick<MatchRules, 'headDestructionKills'>,
  splashRatio = 0
): DamageApplicationResult {
  const newlyDestroyed: MechPartId[] = [];
  if (!mech.alive || damage <= 0) {
    return { appliedDamage: 0, newlyDestroyedParts: [], mechKilled: false };
  }

  const clampedSplash = clamp(splashRatio, 0, 0.5);
  const intactAdjacent =
    clampedSplash > 0
      ? ADJACENT_SPLASH_PARTS[hit.partId].filter((p) => !mech.parts[p].destroyed)
      : [];
  const directDamage = intactAdjacent.length > 0 ? damage * (1 - clampedSplash) : damage;
  const splashDamage = intactAdjacent.length > 0 ? damage - directDamage : 0;

  const overflow = applyDamageToSinglePart(
    mech.parts,
    hit.partId,
    hit.face,
    directDamage,
    newlyDestroyed
  );

  if (splashDamage > 0 && intactAdjacent.length > 0) {
    const splashEach = splashDamage / intactAdjacent.length;
    const adjDualFace: ArmorFace = hit.face === 'rear' ? 'rear' : 'front';
    for (const adjPart of intactAdjacent) {
      const partState = mech.parts[adjPart];
      const adjFace: ArmorFace = partState.kind === 'dual' ? adjDualFace : 'all';
      applyDamageToSinglePart(mech.parts, adjPart, adjFace, splashEach, newlyDestroyed);
    }
  }

  // Part overflow transfer rules
  if (overflow > 0) {
    if (hit.partId === 'rightShoulder' || hit.partId === 'leftShoulder') {
      const transferFace: ArmorFace = hit.face === 'rear' ? 'rear' : 'front';
      applyDamageToSinglePart(mech.parts, 'torso', transferFace, overflow * 0.5, newlyDestroyed);
    } else if (hit.partId === 'rightArm') {
      const shoulderOverflow = applyDamageToSinglePart(
        mech.parts,
        'rightShoulder',
        'front',
        overflow * 0.35,
        newlyDestroyed
      );
      if (shoulderOverflow > 0) {
        applyDamageToSinglePart(mech.parts, 'torso', 'front', shoulderOverflow * 0.5, newlyDestroyed);
      }
    } else if (hit.partId === 'leftArm') {
      const shoulderOverflow = applyDamageToSinglePart(
        mech.parts,
        'leftShoulder',
        'front',
        overflow * 0.35,
        newlyDestroyed
      );
      if (shoulderOverflow > 0) {
        applyDamageToSinglePart(mech.parts, 'torso', 'front', shoulderOverflow * 0.5, newlyDestroyed);
      }
    } else if (hit.partId === 'rightLeg' || hit.partId === 'leftLeg') {
      applyDamageToSinglePart(mech.parts, 'torso', 'front', overflow * 0.35, newlyDestroyed);
    }
  }

  mech.damageTaken += damage;

  let mechKilled = false;
  if (mech.parts.torso.destroyed) {
    mech.alive = false;
    mech.destroyedReason = 'torso_destroyed';
    mechKilled = true;
  } else if (mech.parts.head.destroyed && rules.headDestructionKills) {
    mech.alive = false;
    mech.destroyedReason = 'head_destroyed';
    mechKilled = true;
  }

  return {
    appliedDamage: damage,
    newlyDestroyedParts: newlyDestroyed,
    mechKilled,
  };
}

export function getMechMobilityMultipliers(parts: MechPartsRuntimeState): {
  walkMult: number;
  boostMult: number;
  jumpMult: number;
  turnMult: number;
} {
  const brokenLegs =
    (parts.rightLeg.destroyed ? 1 : 0) + (parts.leftLeg.destroyed ? 1 : 0);

  if (brokenLegs === 0) {
    return { walkMult: 1, boostMult: 1, jumpMult: 1, turnMult: 1 };
  }
  if (brokenLegs === 1) {
    return { walkMult: 0.45, boostMult: 0.75, jumpMult: 0.45, turnMult: 0.65 };
  }
  return { walkMult: 0, boostMult: 0, jumpMult: 0, turnMult: 0.35 };
}
