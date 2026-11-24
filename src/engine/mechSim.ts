import {
  computeMechStats,
  computeRangeFalloffMultiplier,
  getArmWeaponSpec,
  getBoosterSpec,
  getChassisSpec,
  getShoulderWeaponSpec,
  getWeaponMaxRange,
  getWeaponSlotMaxAmmo,
  getWeaponSpec,
} from '../data/parts';
import {
  ActiveBeamState,
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
  WeaponSlotId,
} from '../types/mech';
import {
  applyDamageToMechParts,
  computeArmorDamageResult,
  getMechMobilityMultipliers,
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
  vectorToAngle2D,
} from './math';
import {
  createTerrain,
  generateSpawnPositions,
  getSurfaceHeight,
  hasLineOfSight3D,
  isInsideObstacleSolid,
  raycastTerrain3D,
} from './terrain';

const GRAVITY_Z = 22;
const MECH_COLLISION_RADIUS = 2.6;
const MAX_STORED_EVENTS = 2500;
const SHUTDOWN_RECOVERY_RATIO = 0.7;
const JUMP_TAKEOFF_HEAT_COST = 12;
const COS60 = 0.5;
const SIN60 = 0.8660254;

export const DEFAULT_MATCH_RULES: MatchRules = {
  maxSeconds: 240,
  friendlyFire: false,
  headDestructionKills: true,
  arenaPreset: 'plains_ridge',
  arenaWidth: 600,
  arenaDepth: 600,
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
  const a = bp.armor;
  const maxA = chassis.maxArmor;
  const s = chassis.structureHp;

  return {
    head: {
      kind: 'single',
      armor: clamp(a.head, 0, maxA.head),
      maxArmor: clamp(a.head, 0, maxA.head),
      structure: s.head,
      maxStructure: s.head,
      destroyed: false,
    },
    torso: {
      kind: 'dual',
      frontArmor: clamp(a.torsoFront, 0, maxA.torsoFront),
      maxFrontArmor: clamp(a.torsoFront, 0, maxA.torsoFront),
      rearArmor: clamp(a.torsoRear, 0, maxA.torsoRear),
      maxRearArmor: clamp(a.torsoRear, 0, maxA.torsoRear),
      structure: s.torso,
      maxStructure: s.torso,
      destroyed: false,
    },
    rightShoulder: {
      kind: 'dual',
      frontArmor: clamp(a.rightShoulderFront, 0, maxA.rightShoulderFront),
      maxFrontArmor: clamp(a.rightShoulderFront, 0, maxA.rightShoulderFront),
      rearArmor: clamp(a.rightShoulderRear, 0, maxA.rightShoulderRear),
      maxRearArmor: clamp(a.rightShoulderRear, 0, maxA.rightShoulderRear),
      structure: s.rightShoulder,
      maxStructure: s.rightShoulder,
      destroyed: false,
    },
    leftShoulder: {
      kind: 'dual',
      frontArmor: clamp(a.leftShoulderFront, 0, maxA.leftShoulderFront),
      maxFrontArmor: clamp(a.leftShoulderFront, 0, maxA.leftShoulderFront),
      rearArmor: clamp(a.leftShoulderRear, 0, maxA.leftShoulderRear),
      maxRearArmor: clamp(a.leftShoulderRear, 0, maxA.leftShoulderRear),
      structure: s.leftShoulder,
      maxStructure: s.leftShoulder,
      destroyed: false,
    },
    rightArm: {
      kind: 'single',
      armor: clamp(a.rightArm, 0, maxA.rightArm),
      maxArmor: clamp(a.rightArm, 0, maxA.rightArm),
      structure: s.rightArm,
      maxStructure: s.rightArm,
      destroyed: false,
    },
    leftArm: {
      kind: 'single',
      armor: clamp(a.leftArm, 0, maxA.leftArm),
      maxArmor: clamp(a.leftArm, 0, maxA.leftArm),
      structure: s.leftArm,
      maxStructure: s.leftArm,
      destroyed: false,
    },
    rightLeg: {
      kind: 'single',
      armor: clamp(a.rightLeg, 0, maxA.rightLeg),
      maxArmor: clamp(a.rightLeg, 0, maxA.rightLeg),
      structure: s.rightLeg,
      maxStructure: s.rightLeg,
      destroyed: false,
    },
    leftLeg: {
      kind: 'single',
      armor: clamp(a.leftLeg, 0, maxA.leftLeg),
      maxArmor: clamp(a.leftLeg, 0, maxA.leftLeg),
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
  const rules: MatchRules = {
    ...DEFAULT_MATCH_RULES,
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

export function buildMechSensorState(state: SimState, mechId: string): MechSensorState {
  const mech = state.mechs.find((m) => m.id === mechId);
  if (!mech) {
    throw new Error(`Mech not found: ${mechId}`);
  }

  const headDestroyed = mech.parts.head.destroyed;
  const effectiveRadarRange = mech.stats.radarRange * (headDestroyed ? 0.4 : 1.0);
  const effectiveVisionFovHalfDeg = mech.stats.visionFovHalfDeg * (headDestroyed ? 0.55 : 1.0);
  const torsoYawDeg = getMechTorsoWorldYaw(mech);
  const eyePos: Vec3 = { x: mech.pos.x, y: mech.pos.y, z: mech.pos.z + 9.0 };

  const radarContacts: VisibleEnemyInfo[] = [];
  for (const other of state.mechs) {
    if (!other.alive || other.id === mech.id || other.teamId === mech.teamId) continue;

    const dist = distance3D(mech.pos.x, mech.pos.y, mech.pos.z, other.pos.x, other.pos.y, other.pos.z);
    if (dist > effectiveRadarRange) continue;

    const targetCenter: Vec3 = { x: other.pos.x, y: other.pos.y, z: other.pos.z + 6.7 };
    const bearingDeg = vectorToAngle2D(other.pos.x - mech.pos.x, other.pos.y - mech.pos.y);
    const relBearingDeg = normalizeAngle180(bearingDeg - mech.yawDeg);
    const torsoRelBearingDeg = normalizeAngle180(bearingDeg - torsoYawDeg);
    const inVisualFov = Math.abs(torsoRelBearingDeg) <= effectiveVisionFovHalfDeg;
    const hasLineOfSight = hasLineOfSight3D(state.terrain, eyePos, targetCenter);
    const absRel = Math.abs(relBearingDeg);
    const isFlank = absRel >= 50 && absRel <= 135;

    let allySpotted = false;
    for (const ally of state.mechs) {
      if (!ally.alive || ally.id === mech.id || ally.teamId !== mech.teamId) continue;
      const allyRadar = ally.stats.radarRange * (ally.parts.head.destroyed ? 0.4 : 1.0);
      const allyDist = distance3D(ally.pos.x, ally.pos.y, ally.pos.z, other.pos.x, other.pos.y, other.pos.z);
      if (allyDist > allyRadar) continue;
      const allyTorsoYaw = getMechTorsoWorldYaw(ally);
      const allyBearing = vectorToAngle2D(other.pos.x - ally.pos.x, other.pos.y - ally.pos.y);
      const allyFov = ally.stats.visionFovHalfDeg * (ally.parts.head.destroyed ? 0.55 : 1.0);
      if (Math.abs(normalizeAngle180(allyBearing - allyTorsoYaw)) > allyFov) continue;
      if (
        hasLineOfSight3D(
          state.terrain,
          { x: ally.pos.x, y: ally.pos.y, z: ally.pos.z + 9.0 },
          targetCenter
        )
      ) {
        allySpotted = true;
        break;
      }
    }

    radarContacts.push({
      id: other.id,
      teamId: other.teamId,
      distance: dist,
      bearingDeg,
      relBearingDeg,
      torsoRelBearingDeg,
      elevationDiff: other.pos.z - mech.pos.z,
      isFlank,
      totalHpRatio: getMechTotalIntegrity(other).ratio,
      inVisualFov,
      hasLineOfSight,
      allySpotted,
    });
  }

  radarContacts.sort((a, b) => a.distance - b.distance);
  const visibleEnemies = radarContacts.filter((e) => e.inVisualFov && e.hasLineOfSight);
  const nearestEnemy = visibleEnemies[0] ?? null;
  const nearestRadarEnemy = radarContacts[0] ?? null;
  const nearestFlankEnemy =
    visibleEnemies.find((e) => e.isFlank) ??
    radarContacts.find((e) => e.isFlank) ??
    null;

  let incomingFire = state.tick - mech.lastHitTick <= 15;
  let incomingRelBearing = incomingFire ? mech.lastHitRelBearingDeg : null;

  if (!incomingFire) {
    for (const proj of state.projectiles) {
      if (proj.teamId === mech.teamId) continue;
      const dx = mech.pos.x - proj.pos.x;
      const dy = mech.pos.y - proj.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 85) continue;
      const dot = dx * proj.vel.x + dy * proj.vel.y;
      if (dot > 0) {
        incomingFire = true;
        const fromBearing = vectorToAngle2D(proj.pos.x - mech.pos.x, proj.pos.y - mech.pos.y);
        incomingRelBearing = normalizeAngle180(fromBearing - mech.yawDeg);
        break;
      }
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
  if (spec.burstCount <= 0 || spec.damage <= 0) return;
  if (slotRuntime.ammoRemaining === 0) return;

  const override = Boolean(control.overrideShutdown);
  if (mech.thermalShutdown && !override) return;

  // Determine aim direction relative to upper-body torso facing
  const target = control.lockTargetId
    ? state.mechs.find((m) => m.id === control.lockTargetId && m.alive && m.teamId !== mech.teamId)
    : undefined;

  const torsoWorldYaw = getMechTorsoWorldYaw(mech);
  const muzzlePos = mechLocalToWorld(WEAPON_MUZZLE_LOCAL[slot], mech.pos, torsoWorldYaw);
  const maxArcHalfDeg =
    spec.kind === 'melee'
      ? 55
      : slot === 'rightArm' || slot === 'leftArm'
        ? 45
        : spec.kind === 'lrm_homing'
          ? 40
          : 30;

  let aimYaw = torsoWorldYaw;
  let aimPitch = control.targetPitch ?? mech.pitchDeg;
  let rawHoriz = 999;
  let indirectExtraSpread = 0;

  if (target) {
    const rawDx = target.pos.x - muzzlePos.x;
    const rawDy = target.pos.y - muzzlePos.y;
    rawHoriz = Math.hypot(rawDx, rawDy);
    const isInstantBeam = spec.kind === 'laser' || spec.kind === 'melee';
    const flightTime =
      !isInstantBeam && spec.projectileSpeed > 0
        ? clamp(rawHoriz / spec.projectileSpeed, 0, 1.8)
        : 0;
    const leadWeight = !isInstantBeam && spec.projectileSpeed > 0 ? 1.0 : 0;
    const aimTarget: Vec3 = {
      x: target.pos.x + target.vel.x * flightTime * leadWeight,
      y: target.pos.y + target.vel.y * flightTime * leadWeight,
      z:
        target.pos.z +
        6.5 +
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

    // Direct LOS vs radar-guided indirect LRM fire
    const eyePos: Vec3 = { x: mech.pos.x, y: mech.pos.y, z: mech.pos.z + 9.0 };
    const targetCenter: Vec3 = { x: target.pos.x, y: target.pos.y, z: target.pos.z + 6.7 };
    const hasDirectLos = hasLineOfSight3D(state.terrain, eyePos, targetCenter);
    if (!hasDirectLos) {
      const effectiveRadarRange = mech.stats.radarRange * (mech.parts.head.destroyed ? 0.4 : 1.0);
      if (spec.kind === 'lrm_homing' && rawHoriz <= effectiveRadarRange) {
        aimPitch = Math.max(aimPitch, 26);
        indirectExtraSpread = 2.5;
      } else {
        return;
      }
    }
  }

  if (spec.kind === 'laser' && state.activeBeams.some((b) => b.ownerId === mech.id && b.slot === slot)) {
    return;
  }

  // Consume cooldown, ammo, and accumulate BattleTech Heat
  slotRuntime.cooldownRemaining = spec.cooldownSec;
  if (slotRuntime.ammoRemaining > 0) {
    slotRuntime.ammoRemaining = Math.max(0, slotRuntime.ammoRemaining - 1);
  }
  if (spec.heatCost > 0) {
    mech.heat = Math.min(mech.maxHeat * 1.35, mech.heat + spec.heatCost);
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

  // Continuous burn beam weapon (Laser): spawns an ActiveBeamState stepped per tick
  if (spec.kind === 'laser') {
    const headPenaltySpread = mech.parts.head.destroyed ? 3.5 : 0;
    const totalSpread = spec.spreadDeg + headPenaltySpread;
    const spreadYawOffset = (nextMechRand(mech) - 0.5) * 2 * totalSpread;
    const spreadPitchOffset = (nextMechRand(mech) - 0.5) * 2 * totalSpread;
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

    state.activeBeams.push({
      id: state.nextBeamId++,
      ownerId: mech.id,
      teamId: mech.teamId,
      slot,
      weaponId: spec.id,
      targetId: target?.id ?? null,
      originPos: { ...muzzlePos },
      endPos: { ...muzzlePos },
      damagePerTick: spec.damage / burnTicks,
      optimalRange: spec.range,
      maxRange,
      ticksRemaining: burnTicks,
      totalTicks: burnTicks,
      spreadYawOffset,
      spreadPitchOffset,
      color: beamColor,
    });
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
      const dist = distance3D(muzzlePos.x, muzzlePos.y, muzzlePos.z, other.pos.x, other.pos.y, other.pos.z + 6.5);
      if (dist > spec.range) continue;
      const toOtherX = other.pos.x - mech.pos.x;
      const toOtherY = other.pos.y - mech.pos.y;
      const hDist = Math.hypot(toOtherX, toOtherY) || 1;
      const dot = (fwd.dx * toOtherX + fwd.dy * toOtherY) / hDist;
      if (dot < 0.573) continue;

      const hit = testProjectileHitMech(
        muzzlePos,
        { x: other.pos.x, y: other.pos.y, z: other.pos.z + 6.5 },
        other.pos,
        other.yawDeg,
        getMechTorsoWorldYaw(other)
      );
      if (hit) {
        resolveHitOnMech(state, mech, other, hit, spec.damage, false, 89, tickEvents);
        break;
      }
    }
    return;
  }

  // Spawn projectile(s)
  const headPenaltySpread = mech.parts.head.destroyed ? 3.5 : 0;
  const totalSpread = spec.spreadDeg + headPenaltySpread + indirectExtraSpread;
  const effectiveDamage =
    spec.minRange && rawHoriz < spec.minRange ? spec.damage * 0.5 : spec.damage;

  for (let b = 0; b < spec.burstCount; b++) {
    const spreadYaw = (nextMechRand(mech) - 0.5) * 2 * totalSpread;
    const spreadPitch = (nextMechRand(mech) - 0.5) * 2 * totalSpread;
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
      Math.ceil((maxRange / Math.max(1, spec.projectileSpeed)) * 1.4 / SIM_DT)
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
      homingTurnDegPerSec: spec.homingTurnDegPerSec,
      targetId: target?.id ?? null,
      distanceTraveled: 0,
      optimalRange: spec.range,
      maxRange,
      ttlTicks,
    });
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
  tickEvents: SimCombatEvent[]
): void {
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
    });
    return;
  }

  const dmgResult = applyDamageToMechParts(target, hit, evalResult.finalDamage, state.rules);

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
  });

  for (const brokenPart of dmgResult.newlyDestroyedParts) {
    recordEvent(state, tickEvents, {
      tick: state.tick,
      type: 'part_destroyed',
      actorId: attacker?.id ?? '',
      targetId: target.id,
      partId: brokenPart,
      pos: { ...target.pos },
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
      pos: { ...target.pos },
      detail: target.destroyedReason ?? undefined,
    });
  }
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

  // 1. Update mechs (EN, movement, terrain/obstacles, firing)
  for (const mech of state.mechs) {
    if (!mech.alive) continue;

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

    const wantsJetThrust = Boolean(
      boosterActive &&
        (control.jump || control.boost) &&
        canOperate &&
        !control.emergencyCool &&
        mobility.jumpMult > 0 &&
        mobility.boostMult > 0
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
      clamp(1.0 - speedRatio * 0.58, 0.35, 1.0) * (mech.grounded ? 1.0 : 0.55);
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

    // Unified ~60° oblique-forward lifting boost-jump (adds jump heat; blocked on thermal shutdown unless overridden)
    if (wantsJetThrust && (!mech.thermalShutdown || override)) {
      const lightness = clamp((100 - mech.stats.totalWeight) / 65, 0.25, 1.0);
      const forwardSpeed = Math.max(0, mech.vel.x * fwdVec.dx + mech.vel.y * fwdVec.dy);
      const runupRatio = clamp(forwardSpeed / Math.max(1, mech.stats.walkSpeed), 0, 1.2);

      if (mech.grounded && (mech.heat < mech.maxHeat || override)) {
        const leapFactor = 0.45 + 0.35 * lightness + 0.35 * runupRatio * lightness;
        const takeoffMag = mech.stats.jumpImpulse * mobility.jumpMult * leapFactor;
        mech.vel.z = takeoffMag * SIN60;
        mech.vel.x += fwdVec.dx * takeoffMag * COS60;
        mech.vel.y += fwdVec.dy * takeoffMag * COS60;
        mech.grounded = false;
        mech.heat = Math.min(mech.maxHeat * 1.35, mech.heat + JUMP_TAKEOFF_HEAT_COST);
        if (mech.heat >= mech.maxHeat && !override) {
          mech.thermalShutdown = true;
          mech.enOverheated = true;
        }
      } else if (!mech.grounded && (!mech.thermalShutdown || override)) {
        const thrustAccel = booster.airLiftAccel * mobility.jumpMult * (0.7 + 0.3 * lightness);
        mech.vel.z = Math.min(18, mech.vel.z + thrustAccel * SIN60 * SIM_DT);
        mech.vel.x += fwdVec.dx * thrustAccel * COS60 * SIM_DT;
        mech.vel.y += fwdVec.dy * thrustAccel * COS60 * SIM_DT;

        const maxAirHoriz = Math.max(mech.stats.walkSpeed * 1.45, mech.stats.boostSpeed);
        const airHoriz = Math.hypot(mech.vel.x, mech.vel.y);
        if (airHoriz > maxAirHoriz && airHoriz > 1e-4) {
          mech.vel.x = (mech.vel.x / airHoriz) * maxAirHoriz;
          mech.vel.y = (mech.vel.y / airHoriz) * maxAirHoriz;
        }
      }
    }

    mech.vel.z -= GRAVITY_Z * SIM_DT;

    // Integrate X, Y with obstacle & arena boundary clamping
    const nextX = clamp(
      mech.pos.x + mech.vel.x * SIM_DT,
      MECH_COLLISION_RADIUS,
      state.terrain.width - MECH_COLLISION_RADIUS
    );
    const nextY = clamp(
      mech.pos.y + mech.vel.y * SIM_DT,
      MECH_COLLISION_RADIUS,
      state.terrain.depth - MECH_COLLISION_RADIUS
    );

    const stepUpHeight = mech.pos.z + 1.5;
    const blockX = isInsideObstacleSolid(
      state.terrain,
      nextX,
      mech.pos.y,
      stepUpHeight,
      MECH_COLLISION_RADIUS * 0.75
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
      MECH_COLLISION_RADIUS * 0.75
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
    } else {
      mech.grounded = false;
    }

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
    const muzzlePos = mechLocalToWorld(WEAPON_MUZZLE_LOCAL[beam.slot], shooter.pos, torsoWorldYaw);
    const maxArcHalfDeg = beam.slot === 'rightArm' || beam.slot === 'leftArm' ? 45 : 30;

    let desiredYaw = torsoWorldYaw;
    let desiredPitch = shooter.pitchDeg;
    const target = beam.targetId
      ? state.mechs.find((m) => m.id === beam.targetId && m.alive && m.teamId !== shooter.teamId)
      : undefined;
    if (target) {
      const dx = target.pos.x - muzzlePos.x;
      const dy = target.pos.y - muzzlePos.y;
      const dz = target.pos.z + 6.5 - muzzlePos.z;
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
        getMechTorsoWorldYaw(candidate)
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
          tickEvents
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
        pos: { ...muzzlePos },
        endPos: { ...visualEnd },
        detail: 'laser',
      });
    }

    beam.ticksRemaining -= 1;
    if (beam.ticksRemaining > 0) {
      remainingBeams.push(beam);
    }
  }
  state.activeBeams = remainingBeams;

  // 2. Mech-to-mech horizontal separation
  for (let i = 0; i < state.mechs.length; i++) {
    const a = state.mechs[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < state.mechs.length; j++) {
      const b = state.mechs[j];
      if (!b.alive) continue;
      if (Math.abs(a.pos.z - b.pos.z) > 9.5) continue;

      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      const minSep = MECH_COLLISION_RADIUS * 2;
      if (d < minSep) {
        const nx = d > 1e-4 ? dx / d : 1;
        const ny = d > 1e-4 ? dy / d : 0;
        const push = (minSep - d) * 0.5;
        a.pos.x = clamp(a.pos.x - nx * push, MECH_COLLISION_RADIUS, state.terrain.width - MECH_COLLISION_RADIUS);
        a.pos.y = clamp(a.pos.y - ny * push, MECH_COLLISION_RADIUS, state.terrain.depth - MECH_COLLISION_RADIUS);
        b.pos.x = clamp(b.pos.x + nx * push, MECH_COLLISION_RADIUS, state.terrain.width - MECH_COLLISION_RADIUS);
        b.pos.y = clamp(b.pos.y + ny * push, MECH_COLLISION_RADIUS, state.terrain.depth - MECH_COLLISION_RADIUS);
      }
    }
  }

  // 3. Step projectiles & resolve terrain vs 8-part mech collisions
  const remainingProjectiles: ProjectileState[] = [];
  for (const proj of state.projectiles) {
    proj.ttlTicks -= 1;
    if (proj.ttlTicks <= 0) continue;

    // Gentle missile homing
    if (proj.homingTurnDegPerSec > 0 && proj.targetId) {
      const tgt = state.mechs.find((m) => m.id === proj.targetId && m.alive);
      if (tgt) {
        const desired = {
          x: tgt.pos.x - proj.pos.x,
          y: tgt.pos.y - proj.pos.y,
          z: tgt.pos.z + 6.5 - proj.pos.z,
        };
        const dLen = Math.hypot(desired.x, desired.y, desired.z) || 1;
        const speed = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z) || 1;
        const curDir = {
          x: proj.vel.x / speed,
          y: proj.vel.y / speed,
          z: proj.vel.z / speed,
        };
        const maxTurnRad = degToRad(proj.homingTurnDegPerSec * SIM_DT);
        const blend = clamp(maxTurnRad, 0, 1);
        const nx = curDir.x + (desired.x / dLen - curDir.x) * blend;
        const ny = curDir.y + (desired.y / dLen - curDir.y) * blend;
        const nz = curDir.z + (desired.z / dLen - curDir.z) * blend;
        const nLen = Math.hypot(nx, ny, nz) || 1;
        proj.vel.x = (nx / nLen) * speed;
        proj.vel.y = (ny / nLen) * speed;
        proj.vel.z = (nz / nLen) * speed;
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
        getMechTorsoWorldYaw(candidate)
      );
      if (hit) {
        if (!earliestMechHit || hit.t < earliestMechHit.hit.t) {
          earliestMechHit = { mech: candidate, hit };
        }
      }
    }

    if (
      earliestMechHit &&
      (!terrainHit.hit || earliestMechHit.hit.t <= terrainHit.t)
    ) {
      const attacker = state.mechs.find((m) => m.id === proj.ownerId);
      const rangeMult = computeRangeFalloffMultiplier(
        proj.distanceTraveled,
        proj.optimalRange,
        proj.maxRange
      );
      if (rangeMult > 0.01) {
        resolveHitOnMech(
          state,
          attacker,
          earliestMechHit.mech,
          earliestMechHit.hit,
          proj.damage * rangeMult,
          proj.canRicochet,
          proj.ricochetAngleDeg,
          tickEvents
        );
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
      proj.distanceTraveled >= proj.maxRange
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
