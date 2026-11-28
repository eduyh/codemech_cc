import {
  clampArmorAllocationToChassis,
  computeMechStats,
  computeRangeFalloffMultiplier,
  getArmWeaponSpec,
  getBoosterSpec,
  getChassisSpec,
  getShoulderWeaponSpec,
  getWeaponMaxRange,
  getWeaponSlotLrmFireMode,
  getWeaponSlotMaxAmmo,
  getWeaponSlotMountCount,
  getWeaponSpec,
  isPassiveModuleSpec,
} from '../data/parts';
import {
  ActiveBeamState,
  AimPointMode,
  JumpDirectionMode,
  MAX_MECHS,
  MatchConfig,
  MatchRules,
  MechBlueprint,
  MechControlInput,
  MechPartId,
  MechPartsRuntimeState,
  MechRuntimeState,
  MechSensorState,
  ProjectileState,
  SIM_DT,
  SIM_TPS,
  SimCombatEvent,
  SimState,
  Vec3,
  VisibleEnemyInfo,
  WeaponPartSpec,
  WeaponSlotId,
} from '../types/mech';
import {
  applyDamageToMechParts,
  computeArmorDamageResult,
  getMechCenterZ,
  getMechCollisionRadius,
  getMechEyeZ,
  getMechMobilityMultipliers,
  getTargetArmorRemaining,
  mechLocalToWorld,
  PartHitResult,
  testProjectileHitMech,
} from './hitbox';
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
} from './math';
import {
  computeRecommendedArenaSize,
  createTerrain,
  generateSpawnPositions,
  getSurfaceHeight,
  hasLineOfSight3D,
  isInsideObstacleSolid,
  raycastTerrain3D,
} from './terrain';

const GRAVITY_Z = 22;
const MAX_STORED_EVENTS = 2500;
const SHUTDOWN_RECOVERY_RATIO = 0.7;
const JUMP_TAKEOFF_HEAT_COST = 4;

function getJumpDirectionVectors(dirMode: JumpDirectionMode): {
  sinP: number;
  cosP: number;
  horizSign: number;
} {
  if (dirMode === 'vertical') {
    const rad = degToRad(82);
    return { sinP: Math.sin(rad), cosP: Math.cos(rad), horizSign: 1 };
  }
  if (dirMode === 'backward') {
    const rad = degToRad(55);
    return { sinP: Math.sin(rad), cosP: Math.cos(rad), horizSign: -1 };
  }
  return { sinP: 0.8660254, cosP: 0.5, horizSign: 1 };
}

export const ECM_BUBBLE_RADIUS = 130;
export const ECM_PROXIMITY_BREAK = 120;
export const BAP_COUNTER_RADIUS = 240;
export const AMS_DEFAULT_RANGE = 105;
export const PPC_ECM_DISRUPT_TICKS = 120; // 4.0s at 30 TPS

export const DEFAULT_MATCH_RULES: MatchRules = {
  maxSeconds: 240,
  friendlyFire: false,
  headDestructionKills: true,
  arenaPreset: 'plains_ridge',
  arenaWidth: 1000,
  arenaDepth: 1000,
};

export const EMPTY_CONTROL_INPUT: MechControlInput = {
  moveForward: 0,
  moveStrafe: 0,
  turnYaw: 0,
  boost: false,
  jump: false,
  fireRightArm: false,
  fireLeftArm: false,
  fireRightShoulder: false,
  fireLeftShoulder: false,
  emergencyCool: false,
  lockTargetId: null,
};

function createInitialPartsState(bp: MechBlueprint): MechPartsRuntimeState {
  const chassis = getChassisSpec(bp.chassisId);
  const a = clampArmorAllocationToChassis(chassis, bp.armor);
  const s = chassis.structureHp;

  return {
    head: {
      kind: 'single',
      armor: a.head,
      maxArmor: a.head,
      structure: s.head,
      maxStructure: s.head,
      destroyed: false,
    },
    torso: {
      kind: 'dual',
      frontArmor: a.torsoFront,
      maxFrontArmor: a.torsoFront,
      rearArmor: a.torsoRear,
      maxRearArmor: a.torsoRear,
      structure: s.torso,
      maxStructure: s.torso,
      destroyed: false,
    },
    rightShoulder: {
      kind: 'dual',
      frontArmor: a.rightShoulderFront,
      maxFrontArmor: a.rightShoulderFront,
      rearArmor: a.rightShoulderRear,
      maxRearArmor: a.rightShoulderRear,
      structure: s.rightShoulder,
      maxStructure: s.rightShoulder,
      destroyed: false,
    },
    leftShoulder: {
      kind: 'dual',
      frontArmor: a.leftShoulderFront,
      maxFrontArmor: a.leftShoulderFront,
      rearArmor: a.leftShoulderRear,
      maxRearArmor: a.leftShoulderRear,
      structure: s.leftShoulder,
      maxStructure: s.leftShoulder,
      destroyed: false,
    },
    rightArm: {
      kind: 'single',
      armor: a.rightArm,
      maxArmor: a.rightArm,
      structure: s.rightArm,
      maxStructure: s.rightArm,
      destroyed: false,
    },
    leftArm: {
      kind: 'single',
      armor: a.leftArm,
      maxArmor: a.leftArm,
      structure: s.leftArm,
      maxStructure: s.leftArm,
      destroyed: false,
    },
    rightLeg: {
      kind: 'single',
      armor: a.rightLeg,
      maxArmor: a.rightLeg,
      structure: s.rightLeg,
      maxStructure: s.rightLeg,
      destroyed: false,
    },
    leftLeg: {
      kind: 'single',
      armor: a.leftLeg,
      maxArmor: a.leftLeg,
      structure: s.leftLeg,
      maxStructure: s.leftLeg,
      destroyed: false,
    },
  };
}

export function getMechTotalIntegrity(mech: MechRuntimeState): {
  current: number;
  max: number;
  ratio: number;
} {
  const p = mech.parts;
  const singles = [p.head, p.rightArm, p.leftArm, p.rightLeg, p.leftLeg];
  const duals = [p.torso, p.rightShoulder, p.leftShoulder];

  let current = 0;
  let max = 0;
  for (const s of singles) {
    current += s.armor + s.structure;
    max += s.maxArmor + s.maxStructure;
  }
  for (const d of duals) {
    current += d.frontArmor + d.rearArmor + d.structure;
    max += d.maxFrontArmor + d.maxRearArmor + d.maxStructure;
  }
  return {
    current,
    max,
    ratio: max > 0 ? clamp(current / max, 0, 1) : 0,
  };
}

export function createSimulation(config: MatchConfig): SimState {
  if (config.entries.length === 0) {
    throw new Error('At least 1 mech entry is required to create a simulation.');
  }
  if (config.entries.length > MAX_MECHS) {
    throw new Error(`CodeMech supports at most ${MAX_MECHS} mechs (got ${config.entries.length}).`);
  }

  const matchSeed = normalizeMatchSeed(config.seed);
  const recommendedSize = computeRecommendedArenaSize(config.entries.length);
  const rules: MatchRules = {
    ...DEFAULT_MATCH_RULES,
    arenaWidth: recommendedSize,
    arenaDepth: recommendedSize,
    ...(config.rules ?? {}),
  };

  const terrain = createTerrain(
    rules.arenaPreset,
    rules.arenaWidth,
    rules.arenaDepth,
    matchSeed
  );
  const spawns = generateSpawnPositions(terrain, config.entries, matchSeed);

  const mechs: MechRuntimeState[] = config.entries.map((entry, slotIndex) => {
    const bp = entry.blueprint;
    const stats = computeMechStats(bp);
    const spawn = spawns.get(entry.id) ?? { x: rules.arenaWidth * 0.5, y: rules.arenaDepth * 0.5, z: 0, yaw: 0 };

    const rArm = getArmWeaponSpec(bp.parts.rightArmWeapon);
    const lArm = getArmWeaponSpec(bp.parts.leftArmWeapon);
    const rShd = getShoulderWeaponSpec(bp.parts.rightShoulderWeapon);
    const lShd = getShoulderWeaponSpec(bp.parts.leftShoulderWeapon);

    return {
      id: entry.id,
      name: entry.name,
      teamId: entry.teamId,
      slotIndex,
      color: bp.color,
      blueprint: bp,
      stats,
      pos: { x: spawn.x, y: spawn.y, z: spawn.z },
      vel: { x: 0, y: 0, z: 0 },
      yawDeg: spawn.yaw,
      torsoYawOffsetDeg: 0,
      pitchDeg: 0,
      grounded: true,
      alive: true,
      destroyedReason: null,
      en: stats.maxHeat,
      maxEn: stats.maxHeat,
      enOverheated: false,
      heat: 0,
      maxHeat: stats.maxHeat,
      heatDissipationPerSec: stats.heatDissipationPerSec,
      thermalShutdown: false,
      overrideShutdownActive: false,
      overheatDamageTaken: 0,
      parts: createInitialPartsState(bp),
      weapons: {
        rightArm: {
          slot: 'rightArm',
          weaponId: rArm.id,
          cooldownRemaining: 0,
          ammoRemaining: getWeaponSlotMaxAmmo(bp, 'rightArm'),
        },
        leftArm: {
          slot: 'leftArm',
          weaponId: lArm.id,
          cooldownRemaining: 0,
          ammoRemaining: getWeaponSlotMaxAmmo(bp, 'leftArm'),
        },
        rightShoulder: {
          slot: 'rightShoulder',
          weaponId: rShd.id,
          cooldownRemaining: 0,
          ammoRemaining: getWeaponSlotMaxAmmo(bp, 'rightShoulder'),
        },
        leftShoulder: {
          slot: 'leftShoulder',
          weaponId: lShd.id,
          cooldownRemaining: 0,
          ammoRemaining: getWeaponSlotMaxAmmo(bp, 'leftShoulder'),
        },
      },
      rngState: deriveEntityRngSeed(matchSeed, slotIndex),
      lastHitTick: -999,
      lastAttackerId: null,
      lastHitRelBearingDeg: null,
      lockTargetId: null,
      lockProgressSec: 0,
      lockRequiredSec: 1.2,
      lockDecayGraceSec: 0,
      lockComplete: false,
      ecmDisruptedTicks: 0,
      jumpBurnRemainingSec: 0,
      jumpDir: 'forward',
      salvoQueue: [],
      damageDealt: 0,
      damageTaken: 0,
      kills: 0,
    };
  });

  return {
    tick: 0,
    time: 0,
    matchSeed,
    rules,
    terrain,
    mechs,
    projectiles: [],
    nextProjectileId: 1,
    activeBeams: [],
    nextBeamId: 1,
    events: [],
    lastTickEvents: [],
    finished: false,
    winnerTeamId: null,
  };
}

export function getMechTorsoWorldYaw(
  mech: Pick<MechRuntimeState, 'yawDeg' | 'torsoYawOffsetDeg'>
): number {
  return normalizeAngle360(mech.yawDeg + mech.torsoYawOffsetDeg);
}

function hasIntactEcmModule(mech: MechRuntimeState): boolean {
  const ecmSlots = (['rightShoulder', 'leftShoulder'] as WeaponSlotId[]).filter((s) =>
    Boolean(getWeaponSpec(mech.weapons[s].weaponId).providesEcm)
  );
  if (ecmSlots.length > 0) {
    return mech.stats.hasEcmMount && ecmSlots.some((s) => !mech.parts[s].destroyed);
  }
  return mech.stats.ecmActive;
}

export function isMechEcmActive(mech: MechRuntimeState): boolean {
  return (
    mech.alive &&
    !mech.thermalShutdown &&
    mech.ecmDisruptedTicks <= 0 &&
    hasIntactEcmModule(mech)
  );
}

export function isMechBapActive(mech: MechRuntimeState): boolean {
  if (!mech.alive || mech.thermalShutdown) return false;
  return (['rightShoulder', 'leftShoulder'] as WeaponSlotId[]).some(
    (s) => !mech.parts[s].destroyed && Boolean(getWeaponSpec(mech.weapons[s].weaponId).providesBap)
  );
}

export function isMechAmsActive(mech: MechRuntimeState): boolean {
  if (!mech.alive || mech.thermalShutdown) return false;
  return (['rightShoulder', 'leftShoulder'] as WeaponSlotId[]).some((s) => {
    if (mech.parts[s].destroyed) return false;
    const w = mech.weapons[s];
    const spec = getWeaponSpec(w.weaponId);
    return Boolean(spec.providesAms) && w.ammoRemaining !== 0;
  });
}

export function isTargetEcmProtectedFor(
  state: SimState,
  observer: MechRuntimeState,
  target: MechRuntimeState
): boolean {
  const obsDist = distance3D(
    observer.pos.x,
    observer.pos.y,
    observer.pos.z,
    target.pos.x,
    target.pos.y,
    target.pos.z
  );
  if (obsDist <= ECM_PROXIMITY_BREAK) return false;

  const hasFriendlyBap = state.mechs.some(
    (ally) =>
      ally.teamId === observer.teamId &&
      isMechBapActive(ally) &&
      distance3D(ally.pos.x, ally.pos.y, ally.pos.z, target.pos.x, target.pos.y, target.pos.z) <=
        BAP_COUNTER_RADIUS
  );
  if (hasFriendlyBap) return false;

  return state.mechs.some(
    (ally) =>
      ally.teamId === target.teamId &&
      isMechEcmActive(ally) &&
      distance3D(ally.pos.x, ally.pos.y, ally.pos.z, target.pos.x, target.pos.y, target.pos.z) <=
        ECM_BUBBLE_RADIUS
  );
}

export function isObserverEcmJammed(state: SimState, observer: MechRuntimeState): boolean {
  for (const foe of state.mechs) {
    if (foe.teamId === observer.teamId || !isMechEcmActive(foe)) continue;
    const dist = distance3D(
      observer.pos.x,
      observer.pos.y,
      observer.pos.z,
      foe.pos.x,
      foe.pos.y,
      foe.pos.z
    );
    if (dist > ECM_BUBBLE_RADIUS) continue;
    const counteredByBap = state.mechs.some(
      (ally) =>
        ally.teamId === observer.teamId &&
        isMechBapActive(ally) &&
        distance3D(ally.pos.x, ally.pos.y, ally.pos.z, foe.pos.x, foe.pos.y, foe.pos.z) <=
          BAP_COUNTER_RADIUS
    );
    if (!counteredByBap) return true;
  }
  return false;
}

function isAllySpottingTarget(
  state: SimState,
  observer: MechRuntimeState,
  target: MechRuntimeState,
  targetCenter: Vec3
): boolean {
  for (const ally of state.mechs) {
    if (!ally.alive || ally.id === observer.id || ally.teamId !== observer.teamId) continue;
    const allyRadar = ally.stats.radarRange * (ally.parts.head.destroyed ? 0.4 : 1.0);
    const allyDist = distance3D(
      ally.pos.x,
      ally.pos.y,
      ally.pos.z,
      target.pos.x,
      target.pos.y,
      target.pos.z
    );
    if (allyDist > allyRadar) continue;
    const allyTorsoYaw = getMechTorsoWorldYaw(ally);
    const allyBearing = vectorToAngle2D(target.pos.x - ally.pos.x, target.pos.y - ally.pos.y);
    const allyFov = ally.stats.visionFovHalfDeg * (ally.parts.head.destroyed ? 0.55 : 1.0);
    if (Math.abs(normalizeAngle180(allyBearing - allyTorsoYaw)) > allyFov) continue;
    if (
      hasLineOfSight3D(
        state.terrain,
        { x: ally.pos.x, y: ally.pos.y, z: ally.pos.z + getMechEyeZ(ally.stats.sizeScale) },
        targetCenter
      )
    ) {
      return true;
    }
  }
  return false;
}

interface TargetDetectionEval {
  dist: number;
  bearingDeg: number;
  relBearingDeg: number;
  torsoRelBearingDeg: number;
  inVisualFov: boolean;
  hasLineOfSight: boolean;
  detectedByVision: boolean;
  withinOmniRadar: boolean;
  targetProtectedByEcm: boolean;
  effectiveAllySpotted: boolean;
}

function evaluateTargetDetection(
  state: SimState,
  observer: MechRuntimeState,
  target: MechRuntimeState
): TargetDetectionEval {
  const headDestroyed = observer.parts.head.destroyed;
  const headRadarMult = headDestroyed ? 0.4 : 1.0;
  const effectiveRadarRange = observer.stats.radarRange * headRadarMult;
  const effectiveVisionFovHalfDeg = observer.stats.visionFovHalfDeg * (headDestroyed ? 0.55 : 1.0);
  const torsoYawDeg = getMechTorsoWorldYaw(observer);
  const eyePos: Vec3 = {
    x: observer.pos.x,
    y: observer.pos.y,
    z: observer.pos.z + getMechEyeZ(observer.stats.sizeScale),
  };
  const targetCenter: Vec3 = {
    x: target.pos.x,
    y: target.pos.y,
    z: target.pos.z + getMechCenterZ(target.stats.sizeScale),
  };

  const dist = distance3D(
    observer.pos.x,
    observer.pos.y,
    observer.pos.z,
    target.pos.x,
    target.pos.y,
    target.pos.z
  );
  const targetProtectedByEcm = isTargetEcmProtectedFor(state, observer, target);
  const targetOmniRange =
    target.stats.radarSignatureRange * headRadarMult * (targetProtectedByEcm ? 0.5 : 1.0);
  const withinOmniRadar = dist <= targetOmniRange;

  const bearingDeg = vectorToAngle2D(target.pos.x - observer.pos.x, target.pos.y - observer.pos.y);
  const relBearingDeg = normalizeAngle180(bearingDeg - observer.yawDeg);
  const torsoRelBearingDeg = normalizeAngle180(bearingDeg - torsoYawDeg);
  const inVisualFov = Math.abs(torsoRelBearingDeg) <= effectiveVisionFovHalfDeg;
  const withinVisualRange = inVisualFov && dist <= effectiveRadarRange;

  const hasLineOfSight =
    withinVisualRange || withinOmniRadar || dist <= 950
      ? hasLineOfSight3D(state.terrain, eyePos, targetCenter)
      : false;
  const detectedByVision = withinVisualRange && hasLineOfSight;

  const rawAllySpotted =
    dist <= 950 && !targetProtectedByEcm
      ? isAllySpottingTarget(state, observer, target, targetCenter)
      : false;

  return {
    dist,
    bearingDeg,
    relBearingDeg,
    torsoRelBearingDeg,
    inVisualFov,
    hasLineOfSight,
    detectedByVision,
    withinOmniRadar,
    targetProtectedByEcm,
    effectiveAllySpotted: rawAllySpotted,
  };
}

export function buildMechSensorState(state: SimState, mechId: string): MechSensorState {
  const mech = state.mechs.find((m) => m.id === mechId);
  if (!mech) {
    throw new Error(`Mech not found: ${mechId}`);
  }

  const headDestroyed = mech.parts.head.destroyed;
  const headRadarMult = headDestroyed ? 0.4 : 1.0;
  const effectiveRadarRange = mech.stats.radarRange * headRadarMult;
  const effectiveOmniRadarScale = headRadarMult;
  const effectiveVisionFovHalfDeg = mech.stats.visionFovHalfDeg * (headDestroyed ? 0.55 : 1.0);
  const torsoYawDeg = getMechTorsoWorldYaw(mech);
  const ecmActive = isMechEcmActive(mech);
  const bapActive = isMechBapActive(mech);
  const ecmJammed = isObserverEcmJammed(state, mech);

  const radarContacts: VisibleEnemyInfo[] = [];
  for (const other of state.mechs) {
    if (!other.alive || other.id === mech.id || other.teamId === mech.teamId) continue;

    const det = evaluateTargetDetection(state, mech, other);
    if (!det.detectedByVision && !det.withinOmniRadar && !det.effectiveAllySpotted) continue;

    const absRel = Math.abs(det.relBearingDeg);
    const isFlank = absRel >= 50 && absRel <= 135;

    radarContacts.push({
      id: other.id,
      teamId: other.teamId,
      distance: det.dist,
      bearingDeg: det.bearingDeg,
      relBearingDeg: det.relBearingDeg,
      torsoRelBearingDeg: det.torsoRelBearingDeg,
      elevationDiff: other.pos.z - mech.pos.z,
      isFlank,
      totalHpRatio: getMechTotalIntegrity(other).ratio,
      inVisualFov: det.inVisualFov,
      hasLineOfSight: det.hasLineOfSight,
      allySpotted: det.effectiveAllySpotted,
    });
  }

  radarContacts.sort((a, b) => a.distance - b.distance);
  const visibleEnemies = radarContacts.filter(
    (e) => e.inVisualFov && e.hasLineOfSight && e.distance <= effectiveRadarRange
  );
  const nearestEnemy = visibleEnemies[0] ?? null;
  const nearestRadarEnemy = radarContacts[0] ?? null;
  const nearestFlankEnemy =
    visibleEnemies.find((e) => e.isFlank) ??
    radarContacts.find((e) => e.isFlank) ??
    null;

  let incomingFire = state.tick - mech.lastHitTick <= 15;
  let incomingRelBearing = incomingFire ? mech.lastHitRelBearingDeg : null;
  let incomingMissile = false;

  for (const proj of state.projectiles) {
    if (proj.teamId === mech.teamId) continue;
    const dx = mech.pos.x - proj.pos.x;
    const dy = mech.pos.y - proj.pos.y;
    const d = Math.hypot(dx, dy);
    const dot = dx * proj.vel.x + dy * proj.vel.y;
    if (dot <= 0) continue;

    if (proj.hp > 0 && d <= 180) {
      incomingMissile = true;
    }
    if (!incomingFire && d <= 85) {
      incomingFire = true;
      const fromBearing = vectorToAngle2D(proj.pos.x - mech.pos.x, proj.pos.y - mech.pos.y);
      incomingRelBearing = normalizeAngle180(fromBearing - mech.yawDeg);
    }
  }

  const destroyedParts: MechPartId[] = [];
  const partEntries: Array<[MechPartId, { destroyed: boolean }]> = [
    ['head', mech.parts.head],
    ['torso', mech.parts.torso],
    ['rightShoulder', mech.parts.rightShoulder],
    ['rightArm', mech.parts.rightArm],
    ['leftShoulder', mech.parts.leftShoulder],
    ['leftArm', mech.parts.leftArm],
    ['rightLeg', mech.parts.rightLeg],
    ['leftLeg', mech.parts.leftLeg],
  ];
  for (const [partId, statePart] of partEntries) {
    if (statePart.destroyed) destroyedParts.push(partId);
  }

  const torsoMax =
    mech.parts.torso.maxFrontArmor +
    mech.parts.torso.maxRearArmor +
    mech.parts.torso.maxStructure;
  const torsoCur =
    mech.parts.torso.frontArmor +
    mech.parts.torso.rearArmor +
    mech.parts.torso.structure;

  const slots: WeaponSlotId[] = ['rightArm', 'leftArm', 'rightShoulder', 'leftShoulder'];
  const emptyAmmoSlots: WeaponSlotId[] = [];
  for (const sId of slots) {
    if (mech.parts[sId].destroyed) continue;
    const spec = getWeaponSpec(mech.weapons[sId].weaponId);
    if (spec.maxAmmo > 0 && mech.weapons[sId].ammoRemaining <= 0) {
      emptyAmmoSlots.push(sId);
    }
  }

  const heatRatio = mech.maxHeat > 0 ? clamp(mech.heat / mech.maxHeat, 0, 1.35) : 0;
  const fwdLook = angleToVector2D(mech.yawDeg);
  const obstacleProbeRadius = getMechCollisionRadius(mech.stats.sizeScale) * 0.75;
  let obstacleAhead = false;
  for (const probeDist of [12, 22, 34]) {
    const px = clamp(mech.pos.x + fwdLook.dx * probeDist, 1, state.terrain.width - 1);
    const py = clamp(mech.pos.y + fwdLook.dy * probeDist, 1, state.terrain.depth - 1);
    if (
      isInsideObstacleSolid(state.terrain, px, py, mech.pos.z + 1.5, obstacleProbeRadius) ||
      getSurfaceHeight(state.terrain, px, py) > mech.pos.z + 6.0
    ) {
      obstacleAhead = true;
      break;
    }
  }

  return {
    mechId: mech.id,
    teamId: mech.teamId,
    tick: state.tick,
    time: state.time,
    position: { ...mech.pos },
    yawDeg: mech.yawDeg,
    torsoYawDeg,
    torsoYawOffsetDeg: mech.torsoYawOffsetDeg,
    effectiveRadarRange,
    effectiveOmniRadarScale,
    effectiveVisionFovHalfDeg,
    grounded: mech.grounded,
    enRatio: clamp(1 - heatRatio, 0, 1),
    enOverheated: mech.thermalShutdown,
    heatRatio,
    thermalShutdown: mech.thermalShutdown,
    overrideShutdownActive: mech.overrideShutdownActive,
    emptyAmmoSlots,
    anyAmmoEmpty: emptyAmmoSlots.length > 0,
    torsoHpRatio: torsoMax > 0 ? clamp(torsoCur / torsoMax, 0, 1) : 0,
    totalHpRatio: getMechTotalIntegrity(mech).ratio,
    incomingFire,
    incomingFireRelBearingDeg: incomingRelBearing,
    incomingMissile,
    lockTargetId: mech.lockTargetId,
    lockProgressRatio:
      mech.lockRequiredSec > 0 ? clamp(mech.lockProgressSec / mech.lockRequiredSec, 0, 1) : 0,
    targetLocked: mech.lockComplete,
    ecmActive,
    ecmJammed,
    bapActive,
    obstacleAhead,
    destroyedParts,
    visibleEnemies,
    radarContacts,
    nearestEnemy,
    nearestRadarEnemy,
    nearestFlankEnemy,
  };
}

function recordEvent(state: SimState, tickEvents: SimCombatEvent[], ev: SimCombatEvent): void {
  tickEvents.push(ev);
  state.events.push(ev);
  if (state.events.length > MAX_STORED_EVENTS) {
    state.events.splice(0, state.events.length - MAX_STORED_EVENTS);
  }
}

function nextMechRand(mech: MechRuntimeState): number {
  const { value, nextState } = nextMulberry32(mech.rngState);
  mech.rngState = nextState;
  return value;
}

const WEAPON_MUZZLE_LOCAL: Record<WeaponSlotId, Vec3> = {
  rightArm: { x: 2.0, y: 1.5, z: 6.2 },
  leftArm: { x: -2.0, y: 1.5, z: 6.2 },
  rightShoulder: { x: 1.8, y: 0.9, z: 8.6 },
  leftShoulder: { x: -1.8, y: 0.9, z: 8.6 },
};

function getScaledMuzzleLocal(slot: WeaponSlotId, sizeScale: number): Vec3 {
  const base = WEAPON_MUZZLE_LOCAL[slot];
  return {
    x: base.x * sizeScale,
    y: base.y * sizeScale,
    z: base.z * sizeScale,
  };
}

function resolveTargetAimPointWorld(
  target: MechRuntimeState,
  shooterPos: Vec3,
  aimPoint: AimPointMode = 'torso'
): Vec3 {
  const scale = target.stats.sizeScale;
  const torsoPos: Vec3 = {
    x: target.pos.x,
    y: target.pos.y,
    z: target.pos.z + getMechCenterZ(scale),
  };
  if (aimPoint === 'torso') {
    return torsoPos;
  }

  if (aimPoint === 'legs') {
    const legDefs: Array<{ slot: 'rightLeg' | 'leftLeg'; local: Vec3 }> = [
      { slot: 'rightLeg', local: { x: 0.85 * scale, y: 0, z: 2.35 * scale } },
      { slot: 'leftLeg', local: { x: -0.85 * scale, y: 0, z: 2.35 * scale } },
    ];
    const intact = legDefs
      .filter((d) => !target.parts[d.slot].destroyed)
      .map((d) => {
        const worldPos = mechLocalToWorld(d.local, target.pos, target.yawDeg);
        const dist = distance3D(shooterPos.x, shooterPos.y, shooterPos.z, worldPos.x, worldPos.y, worldPos.z);
        const hp = target.parts[d.slot].armor + target.parts[d.slot].structure;
        return { worldPos, dist, hp };
      });
    if (intact.length === 0) return torsoPos;
    if (intact.length === 1) return intact[0].worldPos;
    if (Math.abs(intact[0].dist - intact[1].dist) <= 0.5) {
      return intact[0].hp <= intact[1].hp ? intact[0].worldPos : intact[1].worldPos;
    }
    return intact[0].dist <= intact[1].dist ? intact[0].worldPos : intact[1].worldPos;
  }

  // 'arms': prioritize intact weapon-bearing arms, then intact arms, then intact shoulders
  const torsoYaw = getMechTorsoWorldYaw(target);
  const pickBestUpperLimb = (
    defs: Array<{ slot: WeaponSlotId; local: Vec3 }>
  ): Vec3 | null => {
    const intact = defs
      .filter((d) => !target.parts[d.slot].destroyed)
      .map((d) => {
        const spec = getWeaponSpec(target.weapons[d.slot].weaponId);
        const hasWeapon = !isPassiveModuleSpec(spec) && spec.burstCount > 0 && spec.damage > 0;
        const worldPos = mechLocalToWorld(d.local, target.pos, torsoYaw);
        const dist = distance3D(shooterPos.x, shooterPos.y, shooterPos.z, worldPos.x, worldPos.y, worldPos.z);
        return { worldPos, dist, hasWeapon };
      });
    if (intact.length === 0) return null;
    const armed = intact.filter((c) => c.hasWeapon);
    const pool = armed.length > 0 ? armed : intact;
    pool.sort((a, b) => a.dist - b.dist);
    return pool[0].worldPos;
  };

  const armHit = pickBestUpperLimb([
    { slot: 'rightArm', local: { x: 2.25 * scale, y: 0.15 * scale, z: 6.0 * scale } },
    { slot: 'leftArm', local: { x: -2.25 * scale, y: 0.15 * scale, z: 6.0 * scale } },
  ]);
  if (armHit) return armHit;

  const shoulderHit = pickBestUpperLimb([
    { slot: 'rightShoulder', local: { x: 1.45 * scale, y: 0, z: 7.0 * scale } },
    { slot: 'leftShoulder', local: { x: -1.45 * scale, y: 0, z: 7.0 * scale } },
  ]);
  return shoulderHit ?? torsoPos;
}

function computeTargetTransversalSpeed(
  shooterPos: Vec3,
  target: MechRuntimeState | undefined
): number {
  if (!target) return 0;
  const dx = target.pos.x - shooterPos.x;
  const dy = target.pos.y - shooterPos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4) return 0;
  const ux = dx / dist;
  const uy = dy / dist;
  // Cross product gives perpendicular horizontal velocity component
  return Math.abs(target.vel.x * -uy + target.vel.y * ux);
}

function computeDynamicSpreadDeg(
  shooter: MechRuntimeState,
  target: MechRuntimeState | undefined,
  spec: WeaponPartSpec
): number {
  const shooterSpeedRatio = clamp(
    Math.hypot(shooter.vel.x, shooter.vel.y) / Math.max(1, shooter.stats.walkSpeed),
    0,
    1.4
  );
  const movePenalty = shooterSpeedRatio * 0.48;
  const airPenalty = shooter.grounded ? 0 : 0.85;
  const transversalSpeed = computeTargetTransversalSpeed(shooter.pos, target);
  const transversalPenalty = clamp(transversalSpeed / 22, 0, 1.0) * 0.45;
  const classMult =
    spec.id === 'gauss_rifle'
      ? 0.65
      : spec.kind === 'laser'
        ? 0.85
        : spec.kind === 'lrm_homing' || spec.kind === 'srm_homing' || spec.kind === 'srm_rocket'
          ? 0.5
          : 1.0;
  return (movePenalty + airPenalty + transversalPenalty) * classMult;
}

function spawnSingleProjectile(params: {
  state: SimState;
  mech: MechRuntimeState;
  slot: WeaponSlotId;
  spec: ReturnType<typeof getWeaponSpec>;
  muzzlePos: Vec3;
  aimYaw: number;
  aimPitch: number;
  totalSpread: number;
  effectiveDamage: number;
  targetId: string | null;
  homingTurnDegPerSec: number;
  hp: number;
  loftTicksRemaining: number;
  isIndirect?: boolean;
  aimPoint?: AimPointMode;
}): void {
  const {
    state,
    mech,
    slot,
    spec,
    muzzlePos,
    aimYaw,
    aimPitch,
    totalSpread,
    effectiveDamage,
    targetId,
    homingTurnDegPerSec,
    hp,
    loftTicksRemaining,
    isIndirect,
    aimPoint,
  } = params;
  // Triangular distribution clusters naturally over torso/adjacent parts rather than box-uniform edges
  const spreadYaw = (nextMechRand(mech) + nextMechRand(mech) - 1) * totalSpread;
  const spreadPitch = (nextMechRand(mech) + nextMechRand(mech) - 1) * totalSpread;
  const finalYaw = normalizeAngle360(aimYaw + spreadYaw);
  const finalPitch = clamp(aimPitch + spreadPitch, -60, 75);

  const pitchRad = degToRad(finalPitch);
  const cosPitch = Math.cos(pitchRad);
  const horiz = angleToVector2D(finalYaw);

  const vel: Vec3 = {
    x: horiz.dx * cosPitch * spec.projectileSpeed,
    y: horiz.dy * cosPitch * spec.projectileSpeed,
    z: Math.sin(pitchRad) * spec.projectileSpeed,
  };

  const maxRange = getWeaponMaxRange(spec);
  const ttlTicks = Math.max(
    10,
    Math.ceil(((maxRange / Math.max(1, spec.projectileSpeed)) * 1.65) / SIM_DT)
  );

  state.projectiles.push({
    id: state.nextProjectileId++,
    ownerId: mech.id,
    teamId: mech.teamId,
    slot,
    weaponId: spec.id,
    kind: spec.kind,
    pos: { ...muzzlePos },
    vel,
    gravity: spec.projectileGravity,
    damage: effectiveDamage,
    canRicochet: spec.canRicochet,
    ricochetAngleDeg: spec.ricochetAngleDeg,
    homingTurnDegPerSec,
    targetId,
    distanceTraveled: 0,
    optimalRange: spec.range,
    maxRange,
    minRange: spec.minRange,
    isIndirect: Boolean(isIndirect),
    ttlTicks,
    hp,
    loftTicksRemaining,
    ...(aimPoint ? { aimPoint } : {}),
  });
}

function updateMechLockState(
  state: SimState,
  mech: MechRuntimeState,
  control: MechControlInput
): void {
  if (mech.thermalShutdown && !control.overrideShutdown) {
    mech.lockProgressSec = Math.max(0, mech.lockProgressSec - SIM_DT * 2.0);
    mech.lockComplete = false;
    if (mech.lockProgressSec <= 0) mech.lockTargetId = null;
    return;
  }

  const candidate = control.lockTargetId
    ? state.mechs.find((m) => m.id === control.lockTargetId && m.alive && m.teamId !== mech.teamId)
    : undefined;

  if (candidate) {
    const det = evaluateTargetDetection(state, mech, candidate);
    const indirectLinkAllowed =
      det.withinOmniRadar || (det.effectiveAllySpotted && !(det.targetProtectedByEcm && det.dist > 400));
    const trackable = det.detectedByVision || indirectLinkAllowed;

    if (trackable) {
      const baseSec = det.detectedByVision ? 1.2 : 1.8;
      const ecmMult = det.targetProtectedByEcm ? 2.0 : 1.0;
      const bapMult = isMechBapActive(mech) ? 0.75 : 1.0;
      const reqSec = baseSec * ecmMult * bapMult;

      if (mech.lockTargetId !== candidate.id) {
        mech.lockTargetId = candidate.id;
        mech.lockProgressSec = SIM_DT;
      } else {
        mech.lockProgressSec = Math.min(reqSec, mech.lockProgressSec + SIM_DT);
      }
      mech.lockRequiredSec = reqSec;
      mech.lockDecayGraceSec = 0.8;
      mech.lockComplete = mech.lockProgressSec >= reqSec - 1e-4;
      return;
    }
  }

  if (mech.lockDecayGraceSec > 0) {
    mech.lockDecayGraceSec = Math.max(0, mech.lockDecayGraceSec - SIM_DT);
  } else if (mech.lockProgressSec > 0) {
    mech.lockProgressSec = Math.max(0, mech.lockProgressSec - 1.5 * SIM_DT);
    if (mech.lockProgressSec <= 0) {
      mech.lockTargetId = null;
    }
  }
  mech.lockComplete =
    mech.lockTargetId !== null && mech.lockProgressSec >= mech.lockRequiredSec - 1e-4;
}

function computeLrmLoftParams(
  rawHoriz: number,
  isIndirect: boolean,
  guided: boolean
): { loftPitchDeg: number | null; loftTicks: number } {
  if (!guided) {
    return { loftPitchDeg: null, loftTicks: 0 };
  }
  if (isIndirect) {
    return {
      loftPitchDeg: clamp(26 + rawHoriz * 0.04, 30, 48),
      loftTicks: Math.round(clamp(rawHoriz / 35, 6, 14)),
    };
  }
  return {
    loftPitchDeg: clamp(8 + rawHoriz * 0.025, 10, 22),
    loftTicks: Math.round(clamp(rawHoriz / 65, 3, 8)),
  };
}

function rotateUnitVecToward(cur: Vec3, target: Vec3, maxTurnRad: number): Vec3 {
  const dot = clamp(cur.x * target.x + cur.y * target.y + cur.z * target.z, -1, 1);
  const ang = Math.acos(dot);
  if (ang <= maxTurnRad || ang < 1e-6) {
    return target;
  }
  const f = maxTurnRad / ang;
  const sinAng = Math.sin(ang);
  const a = Math.sin((1 - f) * ang) / sinAng;
  const b = Math.sin(f * ang) / sinAng;
  const nx = a * cur.x + b * target.x;
  const ny = a * cur.y + b * target.y;
  const nz = a * cur.z + b * target.z;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

function stepSalvoQueue(
  state: SimState,
  mech: MechRuntimeState,
  control: MechControlInput
): void {
  if (mech.salvoQueue.length === 0) return;
  const override = Boolean(control.overrideShutdown);
  if (mech.thermalShutdown && !override) {
    mech.salvoQueue = [];
    return;
  }

  const nextQueue = [];
  for (const item of mech.salvoQueue) {
    if (mech.parts[item.slot].destroyed || item.remainingShots <= 0) continue;
    item.ticksUntilNext -= 1;
    if (item.ticksUntilNext > 0) {
      nextQueue.push(item);
      continue;
    }

    const spec = getWeaponSpec(item.weaponId);
    const torsoWorldYaw = getMechTorsoWorldYaw(mech);
    const muzzlePos = mechLocalToWorld(
      getScaledMuzzleLocal(item.slot, mech.stats.sizeScale),
      mech.pos,
      torsoWorldYaw
    );
    const target = item.targetId
      ? state.mechs.find((m) => m.id === item.targetId && m.alive && m.teamId !== mech.teamId)
      : undefined;

    const hasLiveLock = Boolean(target && mech.lockComplete && mech.lockTargetId === target.id);
    const guided = Boolean(item.guided && hasLiveLock);
    const aimPoint: AimPointMode = item.aimPoint ?? 'torso';
    let aimYaw = torsoWorldYaw;
    let aimPitch = clamp(control.targetPitch ?? mech.pitchDeg, -60, 75);
    let rawHoriz = 600;
    let aimZ = muzzlePos.z;
    if (target) {
      const aimPos = resolveTargetAimPointWorld(target, muzzlePos, aimPoint);
      const dx = aimPos.x - muzzlePos.x;
      const dy = aimPos.y - muzzlePos.y;
      rawHoriz = Math.hypot(dx, dy);
      aimZ = aimPos.z;
      if (rawHoriz > 1e-4) {
        aimYaw = vectorToAngle2D(dx, dy);
      }
    }
    const loft = computeLrmLoftParams(rawHoriz, item.isIndirect, guided);
    if (target && !guided) {
      const dz = aimZ - muzzlePos.z;
      const hDist = Math.max(1e-4, rawHoriz);
      aimPitch = (Math.atan2(dz, hDist) * 180) / Math.PI;
    } else if (guided && loft.loftPitchDeg !== null) {
      aimPitch = loft.loftPitchDeg;
    }

    const minRangeMult = spec.minRange && rawHoriz < spec.minRange ? 0 : 1.0;
    const headPenaltySpread = mech.parts.head.destroyed ? 3.5 : 0;
    const totalSpread = (spec.spreadDeg + headPenaltySpread + (item.isIndirect ? 2.0 : 0)) * 0.75;

    spawnSingleProjectile({
      state,
      mech,
      slot: item.slot,
      spec,
      muzzlePos,
      aimYaw,
      aimPitch,
      totalSpread,
      effectiveDamage: spec.damage * minRangeMult,
      targetId: target?.id ?? null,
      homingTurnDegPerSec: guided ? spec.homingTurnDegPerSec : 0,
      hp: 1,
      loftTicksRemaining: loft.loftTicks,
      isIndirect: item.isIndirect,
      aimPoint,
    });

    item.remainingShots -= 1;
    if (item.remainingShots > 0) {
      item.ticksUntilNext = spec.streamIntervalTicks ?? 2;
      nextQueue.push(item);
    }
  }
  mech.salvoQueue = nextQueue;
}

function tryFireWeaponSlot(
  state: SimState,
  mech: MechRuntimeState,
  slot: WeaponSlotId,
  control: MechControlInput,
  tickEvents: SimCombatEvent[]
): void {
  if (mech.parts[slot].destroyed) return;

  const slotRuntime = mech.weapons[slot];
  if (slotRuntime.cooldownRemaining > 0) return;

  const spec = getWeaponSpec(slotRuntime.weaponId);
  if (isPassiveModuleSpec(spec)) return;
  if (spec.burstCount <= 0 || spec.damage <= 0) return;
  if (slotRuntime.ammoRemaining === 0) return;

  const mountCount = getWeaponSlotMountCount(mech.blueprint, slot);
  const actualCount =
    slotRuntime.ammoRemaining > 0
      ? Math.min(mountCount, slotRuntime.ammoRemaining)
      : mountCount;
  if (actualCount <= 0) return;

  const override = Boolean(control.overrideShutdown);
  if (mech.thermalShutdown && !override) return;

  // Determine aim direction relative to upper-body torso facing
  const target = control.lockTargetId
    ? state.mechs.find((m) => m.id === control.lockTargetId && m.alive && m.teamId !== mech.teamId)
    : undefined;

  const torsoWorldYaw = getMechTorsoWorldYaw(mech);
  const muzzlePos = mechLocalToWorld(
    getScaledMuzzleLocal(slot, mech.stats.sizeScale),
    mech.pos,
    torsoWorldYaw
  );
  const maxArcHalfDeg =
    spec.kind === 'melee'
      ? 55
      : slot === 'rightArm' || slot === 'leftArm'
        ? 45
        : spec.kind === 'lrm_homing'
          ? 40
          : 30;

  const aimPoint: AimPointMode = control.aimPoint ?? 'torso';
  let aimYaw = torsoWorldYaw;
  let aimPitch = control.targetPitch ?? mech.pitchDeg;
  let rawHoriz = 999;
  let indirectExtraSpread = 0;
  let hasDirectLos = true;

  if (target) {
    const baseAimPos = resolveTargetAimPointWorld(target, muzzlePos, aimPoint);
    const rawDx = baseAimPos.x - muzzlePos.x;
    const rawDy = baseAimPos.y - muzzlePos.y;
    rawHoriz = Math.hypot(rawDx, rawDy);
    const isInstantBeam = spec.kind === 'laser' || spec.kind === 'melee';
    const flightTime =
      !isInstantBeam && spec.projectileSpeed > 0
        ? clamp(rawHoriz / spec.projectileSpeed, 0, 1.8)
        : 0;
    const leadWeight = !isInstantBeam && spec.projectileSpeed > 0 ? 1.0 : 0;
    const aimTarget: Vec3 = {
      x: baseAimPos.x + target.vel.x * flightTime * leadWeight,
      y: baseAimPos.y + target.vel.y * flightTime * leadWeight,
      z:
        baseAimPos.z +
        target.vel.z * flightTime * 0.5 +
        0.5 * spec.projectileGravity * flightTime * flightTime,
    };
    const dx = aimTarget.x - muzzlePos.x;
    const dy = aimTarget.y - muzzlePos.y;
    const dz = aimTarget.z - muzzlePos.z;
    const horizDist = Math.hypot(dx, dy);
    if (horizDist > 1e-4) {
      aimYaw = vectorToAngle2D(dx, dy);
      aimPitch = (Math.atan2(dz, horizDist) * 180) / Math.PI;
    }

    // Firing-arc restriction relative to upper-body waist orientation
    if (Math.abs(normalizeAngle180(aimYaw - torsoWorldYaw)) > maxArcHalfDeg) {
      return;
    }

    const det = evaluateTargetDetection(state, mech, target);
    hasDirectLos = det.hasLineOfSight;
    const lrmGuided =
      spec.kind === 'lrm_homing' && mech.lockComplete && mech.lockTargetId === target.id;
    if (!hasDirectLos) {
      const indirectValid =
        lrmGuided &&
        (det.withinOmniRadar ||
          (det.effectiveAllySpotted && !(det.targetProtectedByEcm && det.dist > 400)));
      if (indirectValid) {
        const loft = computeLrmLoftParams(rawHoriz, true, true);
        if (loft.loftPitchDeg !== null) {
          aimPitch = Math.max(aimPitch, loft.loftPitchDeg);
        }
        indirectExtraSpread = 2.0;
      } else {
        return;
      }
    } else if (lrmGuided) {
      const loft = computeLrmLoftParams(rawHoriz, false, true);
      if (loft.loftPitchDeg !== null) {
        aimPitch = Math.max(aimPitch, loft.loftPitchDeg);
      }
    }
  }

  if (spec.kind === 'laser' && state.activeBeams.some((b) => b.ownerId === mech.id && b.slot === slot)) {
    return;
  }

  // Consume cooldown, ammo, and accumulate BattleTech Heat
  slotRuntime.cooldownRemaining = spec.cooldownSec;
  if (slotRuntime.ammoRemaining > 0) {
    slotRuntime.ammoRemaining = Math.max(0, slotRuntime.ammoRemaining - actualCount);
  }
  const totalHeatCost = spec.heatCost * actualCount;
  if (totalHeatCost > 0) {
    mech.heat = Math.min(mech.maxHeat * 1.35, mech.heat + totalHeatCost);
    if (mech.heat >= mech.maxHeat) {
      if (override) {
        mech.overrideShutdownActive = true;
        mech.thermalShutdown = false;
      } else if (!mech.thermalShutdown) {
        mech.thermalShutdown = true;
        mech.enOverheated = true;
        recordEvent(state, tickEvents, {
          tick: state.tick,
          type: 'thermal_shutdown',
          actorId: mech.id,
          pos: { ...mech.pos },
        });
        recordEvent(state, tickEvents, {
          tick: state.tick,
          type: 'en_overheat',
          actorId: mech.id,
          pos: { ...mech.pos },
        });
      }
    }
  }

  const dynamicSpread = computeDynamicSpreadDeg(mech, target, spec);

  // Continuous burn beam weapon (Laser): spawns ActiveBeamState(s) with in-burn sweep drift
  if (spec.kind === 'laser') {
    const headPenaltySpread = mech.parts.head.destroyed ? 3.5 : 0;
    const totalSpread = spec.spreadDeg + dynamicSpread + headPenaltySpread;
    const burnTicks = Math.max(1, Math.round((spec.burnDurationSec ?? 0.6) * SIM_TPS));
    const maxRange = getWeaponMaxRange(spec);
    const beamColor =
      spec.id === 'small_laser'
        ? '#f87171'
        : spec.id === 'medium_laser'
          ? '#4ade80'
          : spec.id === 'large_laser'
            ? '#38bdf8'
            : '#22d3ee';

    const targetDist = clamp(rawHoriz, 45, 450);
    const shooterSpeedRatio = clamp(
      Math.hypot(mech.vel.x, mech.vel.y) / Math.max(1, mech.stats.walkSpeed),
      0,
      1.4
    );
    const targetTransversal = computeTargetTransversalSpeed(muzzlePos, target);
    const sweepMeters =
      (1.5 + (spec.burnDurationSec ?? 0.6) * 1.4) *
      (1 + shooterSpeedRatio * 0.45 + (mech.grounded ? 0 : 0.55) + clamp(targetTransversal / 20, 0, 1) * 0.4);
    const totalSweepDeg = clamp(radToDeg(Math.atan2(sweepMeters, targetDist)), 0.25, 2.4);

    for (let m = 0; m < actualCount; m++) {
      const mountYawOffset = actualCount > 1 ? (m - (actualCount - 1) * 0.5) * 0.28 : 0;
      const driftAngle = nextMechRand(mech) * Math.PI * 2;
      const sweepYaw = Math.cos(driftAngle) * totalSweepDeg;
      const sweepPitch = Math.sin(driftAngle) * totalSweepDeg * 0.45;
      const spreadYawOffset =
        (nextMechRand(mech) + nextMechRand(mech) - 1) * totalSpread + mountYawOffset - sweepYaw * 0.5;
      const spreadPitchOffset =
        (nextMechRand(mech) + nextMechRand(mech) - 1) * totalSpread * 0.7 - sweepPitch * 0.5;

      state.activeBeams.push({
        id: state.nextBeamId++,
        ownerId: mech.id,
        teamId: mech.teamId,
        slot,
        weaponId: spec.id,
        targetId: target?.id ?? null,
        aimPoint,
        originPos: { ...muzzlePos },
        endPos: { ...muzzlePos },
        damagePerTick: spec.damage / burnTicks,
        optimalRange: spec.range,
        maxRange,
        ticksRemaining: burnTicks,
        totalTicks: burnTicks,
        spreadYawOffset,
        spreadPitchOffset,
        driftYawPerTick: sweepYaw / burnTicks,
        driftPitchPerTick: sweepPitch / burnTicks,
        color: beamColor,
      });
    }
    return;
  }

  recordEvent(state, tickEvents, {
    tick: state.tick,
    type: 'fire',
    actorId: mech.id,
    pos: { ...muzzlePos },
    detail: slot,
  });

  // Melee attack
  if (spec.kind === 'melee') {
    const fwd = angleToVector2D(torsoWorldYaw);
    for (const other of state.mechs) {
      if (!other.alive || other.id === mech.id) continue;
      if (!state.rules.friendlyFire && other.teamId === mech.teamId) continue;
      const meleeAimPos = resolveTargetAimPointWorld(other, muzzlePos, aimPoint);
      const dist = distance3D(muzzlePos.x, muzzlePos.y, muzzlePos.z, meleeAimPos.x, meleeAimPos.y, meleeAimPos.z);
      if (dist > spec.range) continue;
      const toOtherX = other.pos.x - mech.pos.x;
      const toOtherY = other.pos.y - mech.pos.y;
      const hDist = Math.hypot(toOtherX, toOtherY) || 1;
      const dot = (fwd.dx * toOtherX + fwd.dy * toOtherY) / hDist;
      if (dot < 0.573) continue;

      const hit = testProjectileHitMech(
        muzzlePos,
        meleeAimPos,
        other.pos,
        other.yawDeg,
        getMechTorsoWorldYaw(other),
        other.stats.sizeScale
      );
      if (hit) {
        resolveHitOnMech(state, mech, other, hit, spec.damage * actualCount, false, 89, tickEvents, spec.id);
        break;
      }
    }
    return;
  }

  // Spawn projectile(s)
  const headPenaltySpread = mech.parts.head.destroyed ? 3.5 : 0;
  const totalSpread = spec.spreadDeg + dynamicSpread + headPenaltySpread + indirectExtraSpread;
  const isMissileKind =
    spec.kind === 'lrm_homing' || spec.kind === 'srm_homing' || spec.kind === 'srm_rocket';
  const minRangeMult = spec.minRange && rawHoriz < spec.minRange ? 0 : 1.0;
  const effectiveDamage = spec.damage * minRangeMult;

  if (spec.kind === 'lrm_homing') {
    const guided = Boolean(target && mech.lockComplete && mech.lockTargetId === target.id);
    const isIndirect = Boolean(target && !hasDirectLos);
    const loft = computeLrmLoftParams(rawHoriz, isIndirect, guided);
    const totalBurst = spec.burstCount * actualCount;
    const isStream = getWeaponSlotLrmFireMode(mech.blueprint, slot) === 'stream' && totalBurst > 1;
    const initialCount = isStream ? Math.min(actualCount, totalBurst) : totalBurst;
    const lrmSpread = isStream ? totalSpread * 0.75 : totalSpread;

    for (let b = 0; b < initialCount; b++) {
      spawnSingleProjectile({
        state,
        mech,
        slot,
        spec,
        muzzlePos,
        aimYaw,
        aimPitch,
        totalSpread: lrmSpread,
        effectiveDamage,
        targetId: target?.id ?? null,
        homingTurnDegPerSec: guided ? spec.homingTurnDegPerSec : 0,
        hp: 1,
        loftTicksRemaining: loft.loftTicks,
        isIndirect,
        aimPoint,
      });
    }

    if (isStream && totalBurst > initialCount) {
      mech.salvoQueue.push({
        slot,
        weaponId: spec.id,
        remainingShots: totalBurst - initialCount,
        ticksUntilNext: spec.streamIntervalTicks ?? 2,
        targetId: target?.id ?? null,
        isIndirect,
        guided,
        aimPoint,
      });
    }
    return;
  }

  const missileHp = isMissileKind ? 2 : 0;
  const srmHoming =
    spec.kind === 'srm_homing' && target
      ? spec.homingTurnDegPerSec
      : 0;

  const torsoRight = angleToVector2D(normalizeAngle360(torsoWorldYaw + 90));
  for (let m = 0; m < actualCount; m++) {
    const latOff = actualCount > 1 ? (m - (actualCount - 1) * 0.5) * 0.35 * mech.stats.sizeScale : 0;
    const barrelPos: Vec3 =
      latOff !== 0
        ? {
            x: muzzlePos.x + torsoRight.dx * latOff,
            y: muzzlePos.y + torsoRight.dy * latOff,
            z: muzzlePos.z,
          }
        : muzzlePos;
    for (let b = 0; b < spec.burstCount; b++) {
      spawnSingleProjectile({
        state,
        mech,
        slot,
        spec,
        muzzlePos: barrelPos,
        aimYaw,
        aimPitch,
        totalSpread,
        effectiveDamage,
        targetId: target?.id ?? null,
        homingTurnDegPerSec: srmHoming,
        hp: missileHp,
        loftTicksRemaining: 0,
        aimPoint,
      });
    }
  }
}

function resolveHitOnMech(
  state: SimState,
  attacker: MechRuntimeState | undefined,
  target: MechRuntimeState,
  hit: PartHitResult,
  rawDamage: number,
  canRicochet: boolean,
  ricochetAngleDeg: number,
  tickEvents: SimCombatEvent[],
  weaponId?: string
): boolean {
  const evalResult = computeArmorDamageResult({
    rawDamage,
    canRicochet,
    ricochetAngleDeg,
    hit,
    targetParts: target.parts,
  });

  if (evalResult.ricocheted) {
    recordEvent(state, tickEvents, {
      tick: state.tick,
      type: 'ricochet',
      actorId: attacker?.id ?? '',
      targetId: target.id,
      partId: hit.partId,
      face: hit.face,
      damage: 0,
      pos: { ...hit.hitWorldPos },
      ...(weaponId ? { weaponId } : {}),
    });
    return false;
  }

  const splashRatio = weaponId === 'ac10' || weaponId === 'ac20' || weaponId === 'ppc' ? 0.15 : 0;
  let structureCritMult = 1;
  if (weaponId && !target.parts[hit.partId].destroyed) {
    const spec = getWeaponSpec(weaponId);
    const critChance = spec.structureCritChance ?? 0;
    const critMult = spec.structureCritMultiplier ?? 1;
    const intactArmor = getTargetArmorRemaining(target.parts, hit.partId, hit.face);
    if (critChance > 0 && critMult > 1 && evalResult.finalDamage > intactArmor) {
      if (nextMechRand(attacker ?? target) < critChance) {
        structureCritMult = critMult;
      }
    }
  }
  const dmgResult = applyDamageToMechParts(
    target,
    hit,
    evalResult.finalDamage,
    state.rules,
    splashRatio,
    structureCritMult
  );

  target.lastHitTick = state.tick;
  if (attacker) {
    target.lastAttackerId = attacker.id;
    const hitFromBearing = vectorToAngle2D(attacker.pos.x - target.pos.x, attacker.pos.y - target.pos.y);
    target.lastHitRelBearingDeg = normalizeAngle180(hitFromBearing - target.yawDeg);
    attacker.damageDealt += dmgResult.appliedDamage;
  }

  recordEvent(state, tickEvents, {
    tick: state.tick,
    type: 'hit',
    actorId: attacker?.id ?? '',
    targetId: target.id,
    partId: hit.partId,
    face: hit.face,
    damage: dmgResult.appliedDamage,
    pos: { ...hit.hitWorldPos },
    ...(weaponId ? { weaponId } : {}),
    ...(dmgResult.criticalHit ? { detail: 'critical' } : {}),
  });

  for (const brokenPart of dmgResult.newlyDestroyedParts) {
    recordEvent(state, tickEvents, {
      tick: state.tick,
      type: 'part_destroyed',
      actorId: attacker?.id ?? '',
      targetId: target.id,
      partId: brokenPart,
      pos: { ...target.pos },
      ...(weaponId ? { weaponId } : {}),
    });
  }

  if (dmgResult.mechKilled) {
    if (attacker && attacker.teamId !== target.teamId) {
      attacker.kills += 1;
    }
    recordEvent(state, tickEvents, {
      tick: state.tick,
      type: 'mech_destroyed',
      actorId: attacker?.id ?? '',
      targetId: target.id,
      partId: hit.partId,
      face: hit.face,
      pos: { ...target.pos },
      ...(weaponId ? { weaponId } : {}),
      detail: target.destroyedReason ?? undefined,
    });
  }
  return true;
}

export function stepSimulation(
  state: SimState,
  controlsByMechId: Record<string, MechControlInput>
): SimState {
  if (state.finished) {
    state.lastTickEvents = [];
    return state;
  }

  state.tick += 1;
  state.time = state.tick * SIM_DT;
  const tickEvents: SimCombatEvent[] = [];

  // 1. Update mechs (EN, movement, terrain/obstacles, lock-on, firing)
  for (const mech of state.mechs) {
    if (!mech.alive) continue;

    if (mech.ecmDisruptedTicks > 0) {
      mech.ecmDisruptedTicks = Math.max(0, mech.ecmDisruptedTicks - 1);
    }
    const control = controlsByMechId[mech.id] ?? EMPTY_CONTROL_INPUT;
    const mobility = getMechMobilityMultipliers(mech.parts);
    const chassis = getChassisSpec(mech.blueprint.chassisId);
    const boosterActive = mech.stats.boosterActive;
    const booster =
      boosterActive && chassis.boosterSpecId
        ? getBoosterSpec(chassis.boosterSpecId)
        : getBoosterSpec('boost_none');

    // Weapon cooldowns
    const slots: WeaponSlotId[] = ['rightArm', 'leftArm', 'rightShoulder', 'leftShoulder'];
    for (const slot of slots) {
      if (mech.weapons[slot].cooldownRemaining > 0) {
        mech.weapons[slot].cooldownRemaining = Math.max(
          0,
          mech.weapons[slot].cooldownRemaining - SIM_DT
        );
      }
    }

    const override = Boolean(control.overrideShutdown);
    const canOperate = !mech.thermalShutdown || override;

    // BattleTech Heat Sink Cooling + Jet Thrust Heat + Thermal / Override Shutdown
    const coolMult = control.emergencyCool ? 1.4 : 1.0;
    mech.heat = Math.max(0, mech.heat - mech.heatDissipationPerSec * coolMult * SIM_DT);

    const jumpAllowed =
      boosterActive &&
      canOperate &&
      !control.emergencyCool &&
      mobility.jumpMult > 0 &&
      mobility.boostMult > 0;
    if (jumpAllowed) {
      if (control.jump && mech.grounded && control.jumpBurnSec && control.jumpBurnSec > 0) {
        mech.jumpBurnRemainingSec = clamp(control.jumpBurnSec, 0.2, 1.5);
        mech.jumpDir = control.jumpDir ?? 'forward';
      } else if (control.jump && control.jumpDir) {
        mech.jumpDir = control.jumpDir;
      }
    } else {
      mech.jumpBurnRemainingSec = 0;
    }

    const wantsJetThrust = Boolean(
      jumpAllowed && (control.jump || control.boost || mech.jumpBurnRemainingSec > 0)
    );

    if (wantsJetThrust && !mech.grounded) {
      mech.heat = Math.min(mech.maxHeat * 1.35, mech.heat + booster.airEnPerSec * SIM_DT);
    }

    if (override) {
      mech.overrideShutdownActive = mech.heat >= mech.maxHeat * 0.95;
      mech.thermalShutdown = false;
    } else {
      mech.overrideShutdownActive = false;
      if (mech.heat >= mech.maxHeat && !mech.thermalShutdown) {
        mech.thermalShutdown = true;
        recordEvent(state, tickEvents, {
          tick: state.tick,
          type: 'thermal_shutdown',
          actorId: mech.id,
          pos: { ...mech.pos },
        });
        recordEvent(state, tickEvents, {
          tick: state.tick,
          type: 'en_overheat',
          actorId: mech.id,
          pos: { ...mech.pos },
        });
      } else if (mech.thermalShutdown && mech.heat <= mech.maxHeat * SHUTDOWN_RECOVERY_RATIO) {
        mech.thermalShutdown = false;
      }
    }

    // Override heat damage directly to internal torso structure
    if (mech.heat > mech.maxHeat && !mech.thermalShutdown) {
      const excess = mech.heat - mech.maxHeat;
      const heatDmg = (6 + (excess / 35) * 14) * SIM_DT;
      mech.parts.torso.structure = Math.max(0, mech.parts.torso.structure - heatDmg);
      mech.damageTaken += heatDmg;
      mech.overheatDamageTaken += heatDmg;
      if (state.tick % 15 === 0 || excess < 2) {
        recordEvent(state, tickEvents, {
          tick: state.tick,
          type: 'heat_damage',
          actorId: mech.id,
          targetId: mech.id,
          partId: 'torso',
          damage: heatDmg * 15,
          pos: { ...mech.pos, z: mech.pos.z + 7 },
        });
      }
      if (mech.parts.torso.structure <= 0) {
        mech.parts.torso.destroyed = true;
        mech.alive = false;
        mech.destroyedReason = 'heat_meltdown';
        recordEvent(state, tickEvents, {
          tick: state.tick,
          type: 'part_destroyed',
          actorId: mech.id,
          targetId: mech.id,
          partId: 'torso',
          pos: { ...mech.pos },
        });
        recordEvent(state, tickEvents, {
          tick: state.tick,
          type: 'mech_destroyed',
          actorId: mech.id,
          targetId: mech.id,
          pos: { ...mech.pos },
          detail: 'heat_meltdown',
        });
      }
    }

    // Sync legacy EN mirror fields from Heat
    mech.maxEn = mech.maxHeat;
    mech.en = Math.max(0, mech.maxHeat - mech.heat);
    mech.enOverheated = mech.thermalShutdown;

    if (!mech.alive) continue;

    // Speed-dependent yaw turning (disabled during thermal shutdown)
    const currentHorizSpeed = Math.hypot(mech.vel.x, mech.vel.y);
    const refWalk = Math.max(1, mech.stats.walkSpeed * Math.max(0.25, mobility.walkMult));
    const speedRatio = clamp(currentHorizSpeed / refWalk, 0, 1.3);
    const speedTurnFactor =
      clamp(1.0 - speedRatio * 0.58, 0.35, 1.0) *
      (mech.grounded ? 1.0 : wantsJetThrust ? 1.3 : 0.55);
    const maxTurnStep = mech.stats.turnDegPerSec * mobility.turnMult * speedTurnFactor * SIM_DT;
    if (!mech.thermalShutdown) {
      if (control.targetYaw !== undefined && Number.isFinite(control.targetYaw)) {
        const diff = normalizeAngle180(control.targetYaw - mech.yawDeg);
        mech.yawDeg = normalizeAngle360(mech.yawDeg + clamp(diff, -maxTurnStep, maxTurnStep));
      } else if (control.turnYaw !== 0) {
        mech.yawDeg = normalizeAngle360(
          mech.yawDeg + clamp(control.turnYaw, -1, 1) * maxTurnStep
        );
      }

      // Independent upper-body torso twist (clamped to chassis max twist)
      const maxTwist = mech.stats.torsoTwistMaxDeg;
      const maxTwistStep = mech.stats.torsoTwistRateDegPerSec * SIM_DT;
      let desiredOffset: number | null = null;
      if (control.torsoTwistOffsetDeg !== undefined && Number.isFinite(control.torsoTwistOffsetDeg)) {
        desiredOffset = clamp(control.torsoTwistOffsetDeg, -maxTwist, maxTwist);
      } else if (control.torsoTargetYaw !== undefined && Number.isFinite(control.torsoTargetYaw)) {
        desiredOffset = clamp(normalizeAngle180(control.torsoTargetYaw - mech.yawDeg), -maxTwist, maxTwist);
      }

      if (desiredOffset !== null) {
        const delta = desiredOffset - mech.torsoYawOffsetDeg;
        mech.torsoYawOffsetDeg = clamp(
          mech.torsoYawOffsetDeg + clamp(delta, -maxTwistStep, maxTwistStep),
          -maxTwist,
          maxTwist
        );
      } else if (Math.abs(mech.torsoYawOffsetDeg) > 1e-4) {
        const returnStep = maxTwistStep * 0.45;
        mech.torsoYawOffsetDeg = clamp(
          mech.torsoYawOffsetDeg + clamp(-mech.torsoYawOffsetDeg, -returnStep, returnStep),
          -maxTwist,
          maxTwist
        );
      }
    }

    if (control.targetPitch !== undefined && Number.isFinite(control.targetPitch)) {
      mech.pitchDeg = clamp(control.targetPitch, -60, 75);
    }

    // MechWarrior / BattleTech horizontal locomotion: forward / reverse only (halted on thermal shutdown)
    const moveFwd =
      control.emergencyCool || mech.thermalShutdown ? 0 : clamp(control.moveForward, -1, 1);
    const fwdVec = angleToVector2D(mech.yawDeg);
    const rightVec = { dx: -fwdVec.dy, dy: fwdVec.dx };

    if (mech.grounded) {
      const maxDirSpeed =
        (moveFwd >= 0 ? mech.stats.walkSpeed : mech.stats.walkSpeed * 0.65) * mobility.walkMult;
      const targetForwardSpeed = moveFwd * maxDirSpeed;
      const curFwd = mech.vel.x * fwdVec.dx + mech.vel.y * fwdVec.dy;
      const curLat = mech.vel.x * rightVec.dx + mech.vel.y * rightVec.dy;
      const nextFwd = curFwd + (targetForwardSpeed - curFwd) * clamp(3.4 * SIM_DT, 0, 1);
      const nextLat = curLat * Math.max(0, 1 - clamp(8.5 * SIM_DT, 0, 1));
      mech.vel.x = fwdVec.dx * nextFwd + rightVec.dx * nextLat;
      mech.vel.y = fwdVec.dy * nextFwd + rightVec.dy * nextLat;
    } else {
      const airDrag = Math.max(0, 1 - clamp(0.35 * SIM_DT, 0, 1));
      mech.vel.x *= airDrag;
      mech.vel.y *= airDrag;
    }

    // Unified 3-direction lifting boost-jump (forward 60° / vertical 82° / backward 55°)
    if (wantsJetThrust && (!mech.thermalShutdown || override)) {
      const lightness = clamp((100 - mech.stats.totalWeight) / 65, 0.25, 1.0);
      const forwardSpeed = Math.max(0, mech.vel.x * fwdVec.dx + mech.vel.y * fwdVec.dy);
      const runupRatio = clamp(forwardSpeed / Math.max(1, mech.stats.walkSpeed), 0, 1.2);
      const activeJumpDir: JumpDirectionMode =
        mech.jumpBurnRemainingSec > 0 ? mech.jumpDir : control.jumpDir ?? 'forward';
      const { sinP, cosP, horizSign } = getJumpDirectionVectors(activeJumpDir);

      if (mech.grounded && (mech.heat < mech.maxHeat || override)) {
        const leapFactor = 0.62 + 0.25 * lightness + 0.18 * runupRatio * lightness;
        const takeoffMag = mech.stats.jumpImpulse * mobility.jumpMult * leapFactor;
        mech.vel.z = takeoffMag * sinP;
        mech.vel.x += fwdVec.dx * horizSign * takeoffMag * cosP;
        mech.vel.y += fwdVec.dy * horizSign * takeoffMag * cosP;
        mech.grounded = false;
        mech.heat = Math.min(mech.maxHeat * 1.35, mech.heat + JUMP_TAKEOFF_HEAT_COST);
        if (mech.heat >= mech.maxHeat && !override) {
          mech.thermalShutdown = true;
          mech.enOverheated = true;
        }
      } else if (!mech.grounded && (!mech.thermalShutdown || override)) {
        const thrustAccel = booster.airLiftAccel * mobility.jumpMult * (0.82 + 0.22 * lightness);
        mech.vel.z = Math.min(20, mech.vel.z + thrustAccel * sinP * SIM_DT);
        mech.vel.x += fwdVec.dx * horizSign * thrustAccel * cosP * SIM_DT;
        mech.vel.y += fwdVec.dy * horizSign * thrustAccel * cosP * SIM_DT;

        const maxAirHoriz = Math.max(mech.stats.walkSpeed * 1.45, mech.stats.boostSpeed);
        const airHoriz = Math.hypot(mech.vel.x, mech.vel.y);
        if (airHoriz > maxAirHoriz && airHoriz > 1e-4) {
          mech.vel.x = (mech.vel.x / airHoriz) * maxAirHoriz;
          mech.vel.y = (mech.vel.y / airHoriz) * maxAirHoriz;
        }
      }
      if (mech.jumpBurnRemainingSec > 0) {
        mech.jumpBurnRemainingSec = Math.max(0, mech.jumpBurnRemainingSec - SIM_DT);
      }
    }

    mech.vel.z -= GRAVITY_Z * SIM_DT;

    // Integrate X, Y with obstacle & arena boundary clamping
    const colRadius = getMechCollisionRadius(mech.stats.sizeScale);
    const nextX = clamp(
      mech.pos.x + mech.vel.x * SIM_DT,
      colRadius,
      state.terrain.width - colRadius
    );
    const nextY = clamp(
      mech.pos.y + mech.vel.y * SIM_DT,
      colRadius,
      state.terrain.depth - colRadius
    );

    const stepUpHeight = mech.pos.z + 1.5;
    const blockX = isInsideObstacleSolid(
      state.terrain,
      nextX,
      mech.pos.y,
      stepUpHeight,
      colRadius * 0.75
    );
    if (blockX) {
      mech.vel.x = 0;
    } else {
      mech.pos.x = nextX;
    }

    const blockY = isInsideObstacleSolid(
      state.terrain,
      mech.pos.x,
      nextY,
      stepUpHeight,
      colRadius * 0.75
    );
    if (blockY) {
      mech.vel.y = 0;
    } else {
      mech.pos.y = nextY;
    }

    // Integrate Z & clamp to terrain surface
    mech.pos.z += mech.vel.z * SIM_DT;
    const surfaceZ = getSurfaceHeight(state.terrain, mech.pos.x, mech.pos.y);
    if (mech.pos.z <= surfaceZ) {
      mech.pos.z = surfaceZ;
      if (mech.vel.z < 0) mech.vel.z = 0;
      mech.grounded = true;
      mech.jumpBurnRemainingSec = 0;
    } else {
      mech.grounded = false;
    }

    // Lock-on computer & queued stream salvo update
    updateMechLockState(state, mech, control);
    stepSalvoQueue(state, mech, control);

    // Weapon firing (blocked while emergencyCool or non-overridden thermalShutdown is active)
    if (!control.emergencyCool && (!mech.thermalShutdown || override)) {
      if (control.fireRightArm) tryFireWeaponSlot(state, mech, 'rightArm', control, tickEvents);
      if (control.fireLeftArm) tryFireWeaponSlot(state, mech, 'leftArm', control, tickEvents);
      if (control.fireRightShoulder)
        tryFireWeaponSlot(state, mech, 'rightShoulder', control, tickEvents);
      if (control.fireLeftShoulder)
        tryFireWeaponSlot(state, mech, 'leftShoulder', control, tickEvents);
    }
  }

  // 1b. Step active laser burn beams (live torso tracking, target twist spread, optimal->max falloff)
  const remainingBeams: ActiveBeamState[] = [];
  for (const beam of state.activeBeams) {
    const shooter = state.mechs.find((m) => m.id === beam.ownerId);
    if (!shooter || !shooter.alive || shooter.parts[beam.slot].destroyed) continue;
    const control = controlsByMechId[shooter.id] ?? EMPTY_CONTROL_INPUT;
    const override = Boolean(control.overrideShutdown);
    if (shooter.thermalShutdown && !override) continue;

    const torsoWorldYaw = getMechTorsoWorldYaw(shooter);
    const muzzlePos = mechLocalToWorld(
      getScaledMuzzleLocal(beam.slot, shooter.stats.sizeScale),
      shooter.pos,
      torsoWorldYaw
    );
    const maxArcHalfDeg = beam.slot === 'rightArm' || beam.slot === 'leftArm' ? 45 : 30;

    let desiredYaw = torsoWorldYaw;
    let desiredPitch = shooter.pitchDeg;
    const target = beam.targetId
      ? state.mechs.find((m) => m.id === beam.targetId && m.alive && m.teamId !== shooter.teamId)
      : undefined;
    if (target) {
      const beamTargetPos = resolveTargetAimPointWorld(target, muzzlePos, beam.aimPoint ?? 'torso');
      const dx = beamTargetPos.x - muzzlePos.x;
      const dy = beamTargetPos.y - muzzlePos.y;
      const dz = beamTargetPos.z - muzzlePos.z;
      const horizDist = Math.hypot(dx, dy);
      if (horizDist > 1e-4) {
        desiredYaw = vectorToAngle2D(dx, dy);
        desiredPitch = (Math.atan2(dz, horizDist) * 180) / Math.PI;
      }
    }

    const relYaw = clamp(normalizeAngle180(desiredYaw - torsoWorldYaw), -maxArcHalfDeg, maxArcHalfDeg);
    const finalYaw = normalizeAngle360(torsoWorldYaw + relYaw + beam.spreadYawOffset);
    const finalPitch = clamp(desiredPitch + beam.spreadPitchOffset, -60, 75);

    const pitchRad = degToRad(finalPitch);
    const cosPitch = Math.cos(pitchRad);
    const horiz = angleToVector2D(finalYaw);
    const beamEnd: Vec3 = {
      x: muzzlePos.x + horiz.dx * cosPitch * beam.maxRange,
      y: muzzlePos.y + horiz.dy * cosPitch * beam.maxRange,
      z: muzzlePos.z + Math.sin(pitchRad) * beam.maxRange,
    };

    const terrainHit = raycastTerrain3D(state.terrain, muzzlePos, beamEnd, 1.5);
    let earliestMechHit: { mech: MechRuntimeState; hit: PartHitResult } | null = null;
    for (const candidate of state.mechs) {
      if (!candidate.alive || candidate.id === shooter.id) continue;
      if (!state.rules.friendlyFire && candidate.teamId === shooter.teamId) continue;
      const hit = testProjectileHitMech(
        muzzlePos,
        beamEnd,
        candidate.pos,
        candidate.yawDeg,
        getMechTorsoWorldYaw(candidate),
        candidate.stats.sizeScale
      );
      if (hit && (!earliestMechHit || hit.t < earliestMechHit.hit.t)) {
        earliestMechHit = { mech: candidate, hit };
      }
    }

    let visualEnd = beamEnd;
    if (earliestMechHit && (!terrainHit.hit || earliestMechHit.hit.t <= terrainHit.t)) {
      visualEnd = earliestMechHit.hit.hitWorldPos;
      const hitDist = distance3D(
        muzzlePos.x,
        muzzlePos.y,
        muzzlePos.z,
        visualEnd.x,
        visualEnd.y,
        visualEnd.z
      );
      const mult = computeRangeFalloffMultiplier(hitDist, beam.optimalRange, beam.maxRange);
      const tickDmg = beam.damagePerTick * mult;
      if (tickDmg > 0.01) {
        resolveHitOnMech(
          state,
          shooter,
          earliestMechHit.mech,
          earliestMechHit.hit,
          tickDmg,
          false,
          89,
          tickEvents,
          beam.weaponId
        );
      }
    } else if (terrainHit.hit && terrainHit.hitPos) {
      visualEnd = terrainHit.hitPos;
    }

    beam.originPos = { ...muzzlePos };
    beam.endPos = { ...visualEnd };

    if (beam.ticksRemaining === beam.totalTicks) {
      recordEvent(state, tickEvents, {
        tick: state.tick,
        type: 'fire',
        actorId: shooter.id,
        weaponId: beam.weaponId,
        pos: { ...muzzlePos },
        endPos: { ...visualEnd },
        detail: 'laser',
      });
    }

    beam.ticksRemaining -= 1;
    if (beam.ticksRemaining > 0) {
      beam.spreadYawOffset += beam.driftYawPerTick ?? 0;
      beam.spreadPitchOffset += beam.driftPitchPerTick ?? 0;
      remainingBeams.push(beam);
    }
  }
  state.activeBeams = remainingBeams;

  // 2. Mech-to-mech horizontal separation
  for (let i = 0; i < state.mechs.length; i++) {
    const a = state.mechs[i];
    if (!a.alive) continue;
    const radA = getMechCollisionRadius(a.stats.sizeScale);
    for (let j = i + 1; j < state.mechs.length; j++) {
      const b = state.mechs[j];
      if (!b.alive) continue;
      const maxScale = Math.max(a.stats.sizeScale, b.stats.sizeScale);
      if (Math.abs(a.pos.z - b.pos.z) > 9.5 * maxScale) continue;

      const radB = getMechCollisionRadius(b.stats.sizeScale);
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      const minSep = radA + radB;
      if (d < minSep) {
        const nx = d > 1e-4 ? dx / d : 1;
        const ny = d > 1e-4 ? dy / d : 0;
        const push = (minSep - d) * 0.5;
        a.pos.x = clamp(a.pos.x - nx * push, radA, state.terrain.width - radA);
        a.pos.y = clamp(a.pos.y - ny * push, radA, state.terrain.depth - radA);
        b.pos.x = clamp(b.pos.x + nx * push, radB, state.terrain.width - radB);
        b.pos.y = clamp(b.pos.y + ny * push, radB, state.terrain.depth - radB);
      }
    }
  }

  // 2b. Step AMS (Anti-Missile System) interception
  for (const mech of state.mechs) {
    if (!mech.alive) continue;
    const override = Boolean(controlsByMechId[mech.id]?.overrideShutdown);
    if (mech.thermalShutdown && !override) continue;

    const torsoCenter: Vec3 = {
      x: mech.pos.x,
      y: mech.pos.y,
      z: mech.pos.z + getMechCenterZ(mech.stats.sizeScale),
    };
    const torsoWorldYaw = getMechTorsoWorldYaw(mech);

    for (const slot of ['rightShoulder', 'leftShoulder'] as WeaponSlotId[]) {
      if (mech.parts[slot].destroyed) continue;
      const slotRt = mech.weapons[slot];
      const spec = getWeaponSpec(slotRt.weaponId);
      if (!spec.providesAms) continue;
      if (slotRt.cooldownRemaining > 0 || slotRt.ammoRemaining === 0) continue;

      let bestProj: ProjectileState | null = null;
      let bestDist = spec.range > 0 ? spec.range : AMS_DEFAULT_RANGE;
      for (const proj of state.projectiles) {
        if (proj.hp <= 0 || proj.teamId === mech.teamId) continue;
        const d = distance3D(
          torsoCenter.x,
          torsoCenter.y,
          torsoCenter.z,
          proj.pos.x,
          proj.pos.y,
          proj.pos.z
        );
        if (d <= bestDist) {
          bestDist = d;
          bestProj = proj;
        }
      }

      if (bestProj) {
        slotRt.cooldownRemaining = spec.cooldownSec;
        if (slotRt.ammoRemaining > 0) {
          slotRt.ammoRemaining = Math.max(0, slotRt.ammoRemaining - 1);
        }
        if (spec.heatCost > 0) {
          mech.heat = Math.min(mech.maxHeat * 1.35, mech.heat + spec.heatCost);
          if (mech.heat >= mech.maxHeat && !override && !mech.thermalShutdown) {
            mech.thermalShutdown = true;
            mech.enOverheated = true;
            recordEvent(state, tickEvents, {
              tick: state.tick,
              type: 'thermal_shutdown',
              actorId: mech.id,
              pos: { ...mech.pos },
            });
          }
        }
        bestProj.hp -= spec.damage;
        const muzzlePos = mechLocalToWorld(
          getScaledMuzzleLocal(slot, mech.stats.sizeScale),
          mech.pos,
          torsoWorldYaw
        );
        recordEvent(state, tickEvents, {
          tick: state.tick,
          type: 'missile_intercepted',
          actorId: mech.id,
          targetId: bestProj.ownerId,
          pos: muzzlePos,
          endPos: { ...bestProj.pos },
          detail: spec.amsIsLaser ? 'ams_laser' : 'ams_ballistic',
        });
      }
    }
  }
  state.projectiles = state.projectiles.filter(
    (p) =>
      !(
        p.hp <= 0 &&
        (p.kind === 'lrm_homing' || p.kind === 'srm_homing' || p.kind === 'srm_rocket')
      )
  );

  // 3. Step projectiles & resolve terrain vs 8-part mech collisions
  const remainingProjectiles: ProjectileState[] = [];
  for (const proj of state.projectiles) {
    proj.ttlTicks -= 1;
    if (proj.ttlTicks <= 0) continue;

    // C. Lock-loss cuts in-flight LRM guidance (synced with shooter's 0.8s lock decay grace)
    if (proj.kind === 'lrm_homing' && proj.homingTurnDegPerSec > 0 && proj.targetId) {
      const owner = state.mechs.find((m) => m.id === proj.ownerId);
      const ownerOverride = Boolean(controlsByMechId[proj.ownerId]?.overrideShutdown);
      const ownerOperational = Boolean(
        owner && owner.alive && (!owner.thermalShutdown || ownerOverride)
      );
      const ownerMaintainsLock = Boolean(
        ownerOperational && owner!.lockComplete && owner!.lockTargetId === proj.targetId
      );
      if (!ownerMaintainsLock) {
        proj.homingTurnDegPerSec = 0;
        proj.loftTicksRemaining = 0;
      }
    }

    // Two-stage missile guidance (Stage 1: loft climb, Stage 2: terminal SLERP + lead homing)
    if (proj.loftTicksRemaining > 0) {
      proj.loftTicksRemaining -= 1;
      if (proj.homingTurnDegPerSec > 0 && proj.targetId) {
        const tgt = state.mechs.find((m) => m.id === proj.targetId && m.alive);
        if (tgt) {
          const dx = tgt.pos.x - proj.pos.x;
          const dy = tgt.pos.y - proj.pos.y;
          const hSpeed = Math.hypot(proj.vel.x, proj.vel.y) || 1;
          const curYawRad = Math.atan2(proj.vel.y, proj.vel.x);
          const tgtYawRad = Math.atan2(dy, dx);
          let dYaw = tgtYawRad - curYawRad;
          while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
          while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
          const stepYaw = clamp(dYaw, -0.08, 0.08);
          const newYawRad = curYawRad + stepYaw;
          proj.vel.x = Math.cos(newYawRad) * hSpeed;
          proj.vel.y = Math.sin(newYawRad) * hSpeed;
        }
      }
    } else if (proj.homingTurnDegPerSec > 0 && proj.targetId) {
      const tgt = state.mechs.find((m) => m.id === proj.targetId && m.alive);
      if (tgt) {
        const distToTgt = distance3D(
          proj.pos.x,
          proj.pos.y,
          proj.pos.z,
          tgt.pos.x,
          tgt.pos.y,
          tgt.pos.z + getMechCenterZ(tgt.stats.sizeScale)
        );
        const speed = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z) || 1;
        const tGo = clamp(distToTgt / speed, 0, 1.5);

        let lateralX = 0;
        let lateralY = 0;
        let scatterZ = 0;
        if (proj.kind === 'lrm_homing') {
          const h1 = (((proj.id * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
          const h2 = (((proj.id * 1597334677) >>> 0) % 1000) / 1000 - 0.5;
          const indirectMult = proj.isIndirect ? 1.35 : 1.0;
          const toX = tgt.pos.x - proj.pos.x;
          const toY = tgt.pos.y - proj.pos.y;
          const hLen = Math.hypot(toX, toY) || 1;
          const perpX = -toY / hLen;
          const perpY = toX / hLen;
          lateralX = perpX * h1 * 4.4 * indirectMult;
          lateralY = perpY * h1 * 4.4 * indirectMult;
          scatterZ = (h2 * 3.6 - 0.2) * indirectMult;
        }

        const baseAim = resolveTargetAimPointWorld(tgt, proj.pos, proj.aimPoint ?? 'torso');
        const aimX = baseAim.x + tgt.vel.x * tGo * 0.55 + lateralX;
        const aimY = baseAim.y + tgt.vel.y * tGo * 0.55 + lateralY;
        const rawAimZ =
          baseAim.z +
          tgt.vel.z * tGo * 0.5 +
          scatterZ +
          0.5 * proj.gravity * tGo * tGo;
        const aimZ = Math.max(tgt.pos.z + 1.0 * tgt.stats.sizeScale, rawAimZ);

        const desired = {
          x: aimX - proj.pos.x,
          y: aimY - proj.pos.y,
          z: aimZ - proj.pos.z,
        };
        const dLen = Math.hypot(desired.x, desired.y, desired.z) || 1;
        const curDir: Vec3 = {
          x: proj.vel.x / speed,
          y: proj.vel.y / speed,
          z: proj.vel.z / speed,
        };
        const desiredDir: Vec3 = {
          x: desired.x / dLen,
          y: desired.y / dLen,
          z: desired.z / dLen,
        };
        const newDir = rotateUnitVecToward(
          curDir,
          desiredDir,
          degToRad(proj.homingTurnDegPerSec * SIM_DT)
        );
        proj.vel.x = newDir.x * speed;
        proj.vel.y = newDir.y * speed;
        proj.vel.z = newDir.z * speed;
      }
    }

    const prevPos: Vec3 = { ...proj.pos };
    proj.vel.z -= proj.gravity * SIM_DT;
    const nextPos: Vec3 = {
      x: prevPos.x + proj.vel.x * SIM_DT,
      y: prevPos.y + proj.vel.y * SIM_DT,
      z: prevPos.z + proj.vel.z * SIM_DT,
    };

    const stepDist = distance3D(prevPos.x, prevPos.y, prevPos.z, nextPos.x, nextPos.y, nextPos.z);
    proj.distanceTraveled += stepDist;

    // Check terrain / obstacle hit along segment
    const terrainHit = raycastTerrain3D(state.terrain, prevPos, nextPos, 1.5);

    // Check mechs along segment
    let earliestMechHit: { mech: MechRuntimeState; hit: PartHitResult } | null = null;
    for (const candidate of state.mechs) {
      if (!candidate.alive || candidate.id === proj.ownerId) continue;
      if (!state.rules.friendlyFire && candidate.teamId === proj.teamId) continue;

      const hit = testProjectileHitMech(
        prevPos,
        nextPos,
        candidate.pos,
        candidate.yawDeg,
        getMechTorsoWorldYaw(candidate),
        candidate.stats.sizeScale
      );
      if (hit) {
        if (!earliestMechHit || hit.t < earliestMechHit.hit.t) {
          earliestMechHit = { mech: candidate, hit };
        }
      }
    }

    const effectiveMaxRange = proj.kind === 'lrm_homing' ? proj.maxRange * 1.18 : proj.maxRange;

    if (
      earliestMechHit &&
      (!terrainHit.hit || earliestMechHit.hit.t <= terrainHit.t)
    ) {
      const attacker = state.mechs.find((m) => m.id === proj.ownerId);
      const rangeMult = computeRangeFalloffMultiplier(
        proj.distanceTraveled,
        proj.optimalRange,
        effectiveMaxRange
      );
      const isUnarmedMinRange = Boolean(proj.minRange && proj.distanceTraveled < proj.minRange);
      if (!isUnarmedMinRange && proj.damage > 0 && rangeMult > 0.01) {
        const landed = resolveHitOnMech(
          state,
          attacker,
          earliestMechHit.mech,
          earliestMechHit.hit,
          proj.damage * rangeMult,
          proj.canRicochet,
          proj.ricochetAngleDeg,
          tickEvents,
          proj.weaponId
        );
        if (
          landed &&
          proj.weaponId === 'ppc' &&
          earliestMechHit.mech.alive &&
          hasIntactEcmModule(earliestMechHit.mech)
        ) {
          earliestMechHit.mech.ecmDisruptedTicks = PPC_ECM_DISRUPT_TICKS;
          recordEvent(state, tickEvents, {
            tick: state.tick,
            type: 'ecm_disrupted',
            actorId: attacker?.id ?? '',
            targetId: earliestMechHit.mech.id,
            pos: { ...earliestMechHit.hit.hitWorldPos },
          });
        }
      }
      continue;
    }

    if (terrainHit.hit) {
      recordEvent(state, tickEvents, {
        tick: state.tick,
        type: 'terrain_hit',
        actorId: proj.ownerId,
        pos: terrainHit.hitPos ?? nextPos,
        detail: terrainHit.hitType ?? undefined,
      });
      continue;
    }

    if (
      nextPos.x < -20 ||
      nextPos.x > state.terrain.width + 20 ||
      nextPos.y < -20 ||
      nextPos.y > state.terrain.depth + 20 ||
      nextPos.z < -20 ||
      proj.distanceTraveled >= effectiveMaxRange
    ) {
      continue;
    }

    proj.pos = nextPos;
    remainingProjectiles.push(proj);
  }
  state.projectiles = remainingProjectiles;
  state.lastTickEvents = tickEvents;

  // 4. Check victory / timeout
  const aliveTeams = new Set<string>();
  for (const m of state.mechs) {
    if (m.alive) aliveTeams.add(m.teamId);
  }

  if (aliveTeams.size <= 1) {
    state.finished = true;
    state.winnerTeamId = aliveTeams.size === 1 ? Array.from(aliveTeams)[0] : 'draw';
  } else if (state.time >= state.rules.maxSeconds) {
    state.finished = true;
    const teamTotals = new Map<string, { sumRatio: number; count: number }>();
    for (const m of state.mechs) {
      const entry = teamTotals.get(m.teamId) ?? { sumRatio: 0, count: 0 };
      entry.sumRatio += m.alive ? getMechTotalIntegrity(m).ratio : 0;
      entry.count += 1;
      teamTotals.set(m.teamId, entry);
    }
    let bestTeam = 'draw';
    let bestAvg = -1;
    let tied = false;
    for (const [tId, agg] of teamTotals.entries()) {
      const avg = agg.count > 0 ? agg.sumRatio / agg.count : 0;
      if (avg > bestAvg + 1e-6) {
        bestAvg = avg;
        bestTeam = tId;
        tied = false;
      } else if (Math.abs(avg - bestAvg) <= 1e-6) {
        tied = true;
      }
    }
    state.winnerTeamId = tied ? 'draw' : bestTeam;
  }

  return state;
}

export function getDistanceToNearestEnemy(state: SimState, mechId: string): number {
  const self = state.mechs.find((m) => m.id === mechId);
  if (!self) return Infinity;
  let best = Infinity;
  for (const other of state.mechs) {
    if (!other.alive || other.teamId === self.teamId) continue;
    const d = distance2D(self.pos.x, self.pos.y, other.pos.x, other.pos.y);
    if (d < best) best = d;
  }
  return best;
}
