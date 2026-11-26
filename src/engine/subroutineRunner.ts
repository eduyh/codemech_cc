import {
  getResolvedWeaponGroups,
  getWeaponMaxRange,
  getWeaponSpec,
  isPassiveModuleSpec,
} from '../data/parts';
import {
  GridDir,
  JumpDirectionMode,
  MechControlInput,
  MechRuntimeState,
  MechSensorState,
  MechSubroutine,
  MechSubroutineCell,
  MechSubroutineSlotId,
  PilotDebugTrace,
  SIM_TPS,
  SimState,
  VisibleEnemyInfo,
  WeaponGroupId,
  WeaponReadyReason,
  WeaponSlotId,
} from '../types/mech';
import {
  angleToVector2D,
  clamp,
  normalizeAngle180,
  normalizeAngle360,
  vectorToAngle2D,
} from './math';
import { getMechCenterZ, getMechEyeZ } from './hitbox';
import { getMechTorsoWorldYaw, isTargetEcmProtectedFor } from './mechSim';
import { getSurfaceHeight, hasLineOfSight3D, isInsideObstacleSolid } from './terrain';

export type LatchedLegMode =
  | {
      op:
        | 'move_approach'
        | 'move_maintain'
        | 'move_circle'
        | 'move_evade'
        | 'move_retreat'
        | 'move_high_ground'
        | 'move_stop';
      param?: number;
      direction?: 'left' | 'right' | 'auto';
    }
  | null;

export type LatchedTorsoMode =
  | {
      op:
        | 'torso_track'
        | 'torso_twist_auto'
        | 'torso_twist_angle'
        | 'torso_twist_r'
        | 'torso_twist_l'
        | 'torso_center';
      param?: number;
    }
  | null;

export interface FiringWaitState {
  row: number;
  col: number;
  op:
    | 'fire_group_1'
    | 'fire_group_2'
    | 'fire_group_3'
    | 'fire_group_4'
    | 'fire_right_arm'
    | 'fire_left_arm'
    | 'fire_right_shoulder'
    | 'fire_left_shoulder'
    | 'fire_alpha';
  dir: GridDir;
  ticksRemaining: number;
  watchedSlots: WeaponSlotId[];
  prevCooldowns: Partial<Record<WeaponSlotId, number>>;
}

export interface SubroutineExecState {
  slotId: MechSubroutineSlotId | null;
  row: number;
  col: number;
  stepTicksRemaining: number;
  stepsExecuted: number;
  completed: boolean;
  latchedLeg: LatchedLegMode;
  latchedTorso: LatchedTorsoMode;
  overrideLatched: boolean;
  callArg?: number;
  emergencyCoolTicks: number;
  firingWait: FiringWaitState | null;
}

export function createEmptySubroutineExecState(): SubroutineExecState {
  return {
    slotId: null,
    row: 0,
    col: 0,
    stepTicksRemaining: 0,
    stepsExecuted: 0,
    completed: true,
    latchedLeg: null,
    latchedTorso: null,
    overrideLatched: false,
    callArg: undefined,
    emergencyCoolTicks: 0,
    firingWait: null,
  };
}

export function startSubroutineExec(
  sub: MechSubroutine,
  inheritedOverride = false,
  effectiveGridSize?: 4 | 6,
  inheritedLatches?: {
    latchedLeg?: LatchedLegMode;
    latchedTorso?: LatchedTorsoMode;
    callArg?: number;
  }
): SubroutineExecState {
  const gridSize = effectiveGridSize ?? sub.gridSize;
  const startCell = sub.cells.find(
    (c) => c.op === 'start' && isInsideGrid(c.row, c.col, gridSize)
  );
  return {
    slotId: sub.slotId,
    row: startCell?.row ?? 0,
    col: startCell?.col ?? 0,
    stepTicksRemaining: 0,
    stepsExecuted: 0,
    completed: false,
    latchedLeg: inheritedLatches?.latchedLeg ?? null,
    latchedTorso: inheritedLatches?.latchedTorso ?? null,
    overrideLatched: inheritedOverride,
    callArg: inheritedLatches?.callArg,
    emergencyCoolTicks: 0,
    firingWait: null,
  };
}

function resolveCellParam(
  cell: MechSubroutineCell,
  callArg: number | undefined
): number | undefined {
  if (cell.useArg && callArg !== undefined && Number.isFinite(callArg)) {
    return callArg;
  }
  return cell.param;
}

export function advanceGridCoords(
  row: number,
  col: number,
  dir: GridDir
): { row: number; col: number } {
  switch (dir) {
    case 'N':
      return { row: row - 1, col };
    case 'E':
      return { row, col: col + 1 };
    case 'S':
      return { row: row + 1, col };
    case 'W':
      return { row, col: col - 1 };
  }
}

export function isInsideGrid(row: number, col: number, gridSize: number): boolean {
  return row >= 0 && row < gridSize && col >= 0 && col < gridSize;
}

function isHeadingBlockedByObstacle(
  state: SimState,
  mech: MechRuntimeState,
  yawDeg: number
): boolean {
  const vec = angleToVector2D(yawDeg);
  for (const dist of [7, 15, 24]) {
    const px = clamp(mech.pos.x + vec.dx * dist, 12, state.terrain.width - 12);
    const py = clamp(mech.pos.y + vec.dy * dist, 12, state.terrain.depth - 12);
    if (isInsideObstacleSolid(state.terrain, px, py, mech.pos.z + 2.0, 3.2)) {
      return true;
    }
  }
  return false;
}

export function steerAroundObstacles(
  state: SimState,
  mech: MechRuntimeState,
  desiredYaw: number
): number {
  if (!isHeadingBlockedByObstacle(state, mech, desiredYaw)) {
    return desiredYaw;
  }
  const sideSign = mech.slotIndex % 2 === 0 ? 1 : -1;
  const offsets = [45, -45, 75, -75, 110, -110].map((d) => d * sideSign);
  for (const off of offsets) {
    const candidateYaw = normalizeAngle360(desiredYaw + off);
    if (!isHeadingBlockedByObstacle(state, mech, candidateYaw)) {
      return candidateYaw;
    }
  }
  return desiredYaw;
}

export function findHighGroundDirection(
  state: SimState,
  mech: MechRuntimeState
): { yaw: number; climbJump: boolean } {
  const cx = state.terrain.width * 0.5;
  const cy = state.terrain.depth * 0.5;
  const maxInteriorRadius = Math.min(state.terrain.width, state.terrain.depth) * 0.34;
  const selfH = getSurfaceHeight(state.terrain, mech.pos.x, mech.pos.y);

  let bestX = cx;
  let bestY = cy;
  let bestH = getSurfaceHeight(state.terrain, bestX, bestY);

  const sampleRadius = Math.max(45, state.terrain.width * 0.065);
  const climbTolerance = mech.stats.boosterActive ? 15.5 : 1.5;
  for (let i = 0; i < 8; i++) {
    const angleDeg = i * 45;
    const vec = angleToVector2D(angleDeg);
    const sx = clamp(mech.pos.x + vec.dx * sampleRadius, 40, state.terrain.width - 40);
    const sy = clamp(mech.pos.y + vec.dy * sampleRadius, 40, state.terrain.depth - 40);
    if (Math.hypot(sx - cx, sy - cy) > maxInteriorRadius) continue;
    if (isInsideObstacleSolid(state.terrain, sx, sy, selfH + climbTolerance, 3.0)) continue;
    const h = getSurfaceHeight(state.terrain, sx, sy);
    if (h > bestH + 0.5) {
      bestH = h;
      bestX = sx;
      bestY = sy;
    }
  }

  const rawBearing = vectorToAngle2D(bestX - mech.pos.x, bestY - mech.pos.y);
  const needsClimbJump =
    mech.stats.boosterActive &&
    bestH > selfH + 4.0 &&
    mech.grounded &&
    !mech.thermalShutdown &&
    mech.heat < mech.maxHeat * 0.78;
  const yaw = needsClimbJump ? rawBearing : steerAroundObstacles(state, mech, rawBearing);

  return {
    yaw,
    climbJump: needsClimbJump,
  };
}

export function getWeaponReadyStatuses(
  state: SimState,
  mech: MechRuntimeState,
  target: VisibleEnemyInfo | null
): Record<WeaponSlotId, WeaponReadyReason> {
  const slots: WeaponSlotId[] = ['rightArm', 'leftArm', 'rightShoulder', 'leftShoulder'];
  const torsoWorldYaw = getMechTorsoWorldYaw(mech);
  const eyePos = {
    x: mech.pos.x,
    y: mech.pos.y,
    z: mech.pos.z + getMechEyeZ(mech.stats.sizeScale),
  };
  const targetEntity = target ? state.mechs.find((m) => m.id === target.id && m.alive) : undefined;
  const hasLos = targetEntity
    ? hasLineOfSight3D(state.terrain, eyePos, {
        x: targetEntity.pos.x,
        y: targetEntity.pos.y,
        z: targetEntity.pos.z + getMechCenterZ(targetEntity.stats.sizeScale),
      })
    : false;
  const headRadarMult = mech.parts.head.destroyed ? 0.4 : 1.0;
  const targetOmniRange = targetEntity ? targetEntity.stats.radarSignatureRange * headRadarMult : 0;

  const result = {} as Record<WeaponSlotId, WeaponReadyReason>;
  for (const slot of slots) {
    const slotRt = mech.weapons[slot];
    const spec = getWeaponSpec(slotRt.weaponId);
    if (isPassiveModuleSpec(spec) || spec.burstCount <= 0 || spec.damage <= 0) {
      result[slot] = 'none';
      continue;
    }
    if (mech.parts[slot].destroyed) {
      result[slot] = 'destroyed';
      continue;
    }
    if (slotRt.ammoRemaining === 0) {
      result[slot] = 'no_ammo';
      continue;
    }
    if (mech.thermalShutdown && !mech.overrideShutdownActive) {
      result[slot] = 'shutdown';
      continue;
    }
    if (slotRt.cooldownRemaining > 0) {
      result[slot] = 'cooldown';
      continue;
    }
    if (target) {
      const maxRange = getWeaponMaxRange(spec);
      const inRange =
        maxRange > spec.range ? target.distance < maxRange : target.distance <= spec.range;
      const belowMinRange = Boolean(spec.minRange && target.distance < spec.minRange);
      if (!inRange || belowMinRange) {
        result[slot] = 'out_of_range';
        continue;
      }
      const maxArcHalfDeg =
        spec.kind === 'melee'
          ? 55
          : slot === 'rightArm' || slot === 'leftArm'
            ? 45
            : spec.kind === 'lrm_homing'
              ? 40
              : 30;
      const absTorsoRel = Math.abs(normalizeAngle180(target.bearingDeg - torsoWorldYaw));
      if (absTorsoRel > maxArcHalfDeg) {
        result[slot] = 'out_of_arc';
        continue;
      }
      const hasIndirectLink = target.allySpotted || target.distance <= targetOmniRange;
      if (!hasLos && !(spec.kind === 'lrm_homing' && hasIndirectLink)) {
        result[slot] = 'blocked_los';
        continue;
      }
    }
    result[slot] = 'ready';
  }
  return result;
}

function isWeaponSlotReadyForBranch(
  state: SimState,
  mech: MechRuntimeState,
  slot: WeaponSlotId,
  target: VisibleEnemyInfo | null,
  overrideLatched: boolean
): boolean {
  if (mech.parts[slot].destroyed) return false;
  const w = mech.weapons[slot];
  const spec = getWeaponSpec(w.weaponId);
  if (isPassiveModuleSpec(spec)) return false;
  if (spec.burstCount <= 0 || spec.damage <= 0) return false;
  if (w.ammoRemaining === 0) return false;
  if (mech.thermalShutdown && !overrideLatched) return false;
  if (w.cooldownRemaining > 0) return false;
  if (target) {
    const maxRange = getWeaponMaxRange(spec);
    const inRange =
      maxRange > spec.range ? target.distance < maxRange : target.distance <= spec.range;
    if (!inRange) return false;
    if (spec.minRange && target.distance < spec.minRange) return false;

    const targetEntity = state.mechs.find((m) => m.id === target.id && m.alive);
    if (targetEntity) {
      const eyePos = {
        x: mech.pos.x,
        y: mech.pos.y,
        z: mech.pos.z + getMechEyeZ(mech.stats.sizeScale),
      };
      const targetCenter = {
        x: targetEntity.pos.x,
        y: targetEntity.pos.y,
        z: targetEntity.pos.z + getMechCenterZ(targetEntity.stats.sizeScale),
      };
      const hasLos = hasLineOfSight3D(state.terrain, eyePos, targetCenter);
      if (!hasLos) {
        if (spec.kind !== 'lrm_homing') return false;
        const headRadarMult = mech.parts.head.destroyed ? 0.4 : 1.0;
        const ecmProt = isTargetEcmProtectedFor(state, mech, targetEntity);
        const targetOmniRange =
          targetEntity.stats.radarSignatureRange * headRadarMult * (ecmProt ? 0.5 : 1.0);
        const hasIndirectLink =
          target.distance <= targetOmniRange ||
          (target.allySpotted && !(ecmProt && target.distance > 400));
        if (!hasIndirectLink) return false;
        if (!mech.lockComplete || mech.lockTargetId !== target.id) return false;
      } else if (spec.kind === 'lrm_homing') {
        if (!mech.lockComplete || mech.lockTargetId !== target.id) return false;
      }
    }
  }
  return true;
}

function groupIdFromSubOp(op: string): WeaponGroupId | null {
  if (op === 'fire_group_1' || op === 'if_group_1_ready') return 'G1';
  if (op === 'fire_group_2' || op === 'if_group_2_ready') return 'G2';
  if (op === 'fire_group_3' || op === 'if_group_3_ready') return 'G3';
  if (op === 'fire_group_4' || op === 'if_group_4_ready') return 'G4';
  return null;
}

function evaluateSubroutineBranch(
  cell: MechSubroutineCell,
  sensor: MechSensorState,
  mech: MechRuntimeState,
  state: SimState,
  target: VisibleEnemyInfo | null,
  overrideLatched: boolean,
  callArg?: number
): boolean {
  const ref = target ?? sensor.nearestEnemy ?? sensor.nearestRadarEnemy;
  const gid = groupIdFromSubOp(cell.op);
  if (gid) {
    const slots = getResolvedWeaponGroups(mech.blueprint)[gid];
    return slots.some((s) => isWeaponSlotReadyForBranch(state, mech, s, ref, overrideLatched));
  }
  const param = resolveCellParam(cell, callArg);
  switch (cell.op) {
    case 'if_right_arm_ready':
      return isWeaponSlotReadyForBranch(state, mech, 'rightArm', ref, overrideLatched);
    case 'if_left_arm_ready':
      return isWeaponSlotReadyForBranch(state, mech, 'leftArm', ref, overrideLatched);
    case 'if_right_shoulder_ready':
      return isWeaponSlotReadyForBranch(state, mech, 'rightShoulder', ref, overrideLatched);
    case 'if_left_shoulder_ready':
      return isWeaponSlotReadyForBranch(state, mech, 'leftShoulder', ref, overrideLatched);
    case 'if_enemy_in_sight':
      return sensor.visibleEnemies.length > 0;
    case 'if_enemy_dist_lt':
      return ref !== null && ref.distance < (param ?? 150);
    case 'if_enemy_dist_gt':
      return ref !== null && ref.distance > (param ?? 180);
    case 'if_heat_above':
      return sensor.heatRatio * 100 > (param ?? 80);
    case 'if_heat_below':
      return sensor.heatRatio * 100 < (param ?? 50);
    case 'if_right_armor_weaker': {
      const rightSide =
        (mech.parts.rightShoulder.destroyed
          ? 0
          : mech.parts.rightShoulder.frontArmor + mech.parts.rightShoulder.structure * 0.5) +
        (mech.parts.rightArm.destroyed ? 0 : mech.parts.rightArm.armor);
      const leftSide =
        (mech.parts.leftShoulder.destroyed
          ? 0
          : mech.parts.leftShoulder.frontArmor + mech.parts.leftShoulder.structure * 0.5) +
        (mech.parts.leftArm.destroyed ? 0 : mech.parts.leftArm.armor);
      return rightSide < leftSide;
    }
    case 'if_ammo_empty':
      return cell.weaponSlot
        ? sensor.emptyAmmoSlots.includes(cell.weaponSlot)
        : sensor.anyAmmoEmpty;
    case 'if_airborne':
      return !mech.grounded;
    case 'if_incoming_fire':
      return sensor.incomingFire;
    case 'if_target_locked':
      return sensor.targetLocked;
    case 'if_incoming_missile':
      return sensor.incomingMissile;
    case 'if_ecm_jammed':
      return sensor.ecmJammed;
    case 'if_obstacle_ahead':
      return sensor.obstacleAhead;
    default:
      return false;
  }
}

function isBranchOp(op: MechSubroutineCell['op']): boolean {
  return op.startsWith('if_');
}

function isLegLatchOp(op: MechSubroutineCell['op']): op is NonNullable<LatchedLegMode>['op'] {
  return op.startsWith('move_') && op !== 'move_jump';
}

function isTorsoLatchOp(
  op: MechSubroutineCell['op']
): op is NonNullable<LatchedTorsoMode>['op'] {
  return op.startsWith('torso_');
}

function isFireOp(op: MechSubroutineCell['op']): op is FiringWaitState['op'] {
  return op.startsWith('fire_');
}

function getFireSlots(op: FiringWaitState['op'], mech: MechRuntimeState): WeaponSlotId[] {
  const gid = groupIdFromSubOp(op);
  if (gid) {
    return getResolvedWeaponGroups(mech.blueprint)[gid];
  }
  switch (op) {
    case 'fire_right_arm':
      return ['rightArm'];
    case 'fire_left_arm':
      return ['leftArm'];
    case 'fire_right_shoulder':
      return ['rightShoulder'];
    case 'fire_left_shoulder':
      return ['leftShoulder'];
    case 'fire_alpha':
      return ['rightArm', 'leftArm', 'rightShoulder', 'leftShoulder'];
    default:
      return [];
  }
}

function applyLatchedLegToControl(
  leg: LatchedLegMode,
  control: MechControlInput,
  sensor: MechSensorState,
  mech: MechRuntimeState,
  state: SimState,
  target: VisibleEnemyInfo | null,
  _evadeSign: 1 | -1
): void {
  if (!leg) return;
  control.moveStrafe = 0;

  const airborne = mech.jumpBurnRemainingSec > 0;

  switch (leg.op) {
    case 'move_stop':
      control.moveForward = 0;
      control.boost = false;
      control.jump = false;
      if (target) {
        control.targetYaw = target.bearingDeg;
      }
      break;

    case 'move_approach':
      control.boost = false;
      if (target) {
        const heading = target.hasLineOfSight
          ? target.bearingDeg
          : normalizeAngle360(target.bearingDeg + (mech.slotIndex % 2 === 0 ? 45 : -45));
        control.targetYaw = airborne ? heading : steerAroundObstacles(state, mech, heading);
        control.moveForward = 1;
      } else {
        const patrol = findHighGroundDirection(state, mech);
        control.targetYaw = patrol.yaw;
        control.moveForward = 0.85;
        if (patrol.climbJump) {
          control.jump = true;
          control.boost = true;
          control.jumpDir = 'forward';
          control.jumpBurnSec = 0.9;
        }
      }
      break;

    case 'move_maintain': {
      const desired = leg.param ?? 165;
      if (target) {
        if (!target.hasLineOfSight) {
          const flankDeg = normalizeAngle360(
            target.bearingDeg + (mech.slotIndex % 2 === 0 ? 50 : -50)
          );
          control.targetYaw = airborne ? flankDeg : steerAroundObstacles(state, mech, flankDeg);
          control.moveForward = 0.9;
        } else if (target.distance > desired + 25) {
          control.targetYaw = airborne
            ? target.bearingDeg
            : steerAroundObstacles(state, mech, target.bearingDeg);
          control.moveForward = 0.9;
        } else if (target.distance < desired - 25) {
          control.targetYaw = target.bearingDeg;
          control.moveForward = -0.8;
        } else {
          control.targetYaw = target.bearingDeg;
          control.moveForward = 0;
        }
      } else {
        const patrol = findHighGroundDirection(state, mech);
        control.targetYaw = patrol.yaw;
        control.moveForward = 0.8;
        if (patrol.climbJump) {
          control.jump = true;
          control.boost = true;
          control.jumpDir = 'forward';
          control.jumpBurnSec = 0.9;
        }
      }
      break;
    }

    case 'move_circle': {
      const desired = leg.param ?? 135;
      const orbitDir = leg.direction === 'left' ? -1 : 1;
      if (target) {
        const angleOffset =
          target.distance > desired + 25 ? 48 : target.distance < desired - 25 ? 100 : 72;
        const desiredHeading = normalizeAngle360(target.bearingDeg + orbitDir * angleOffset);
        control.targetYaw = airborne
          ? desiredHeading
          : steerAroundObstacles(state, mech, desiredHeading);
        control.moveForward = 0.95;
      } else {
        const patrol = findHighGroundDirection(state, mech);
        control.targetYaw = patrol.yaw;
        control.moveForward = 0.85;
        if (patrol.climbJump) {
          control.jump = true;
          control.boost = true;
          control.jumpDir = 'forward';
          control.jumpBurnSec = 0.9;
        }
      }
      break;
    }

    case 'move_evade': {
      const sign = leg.direction === 'left' ? -1 : 1;
      const baseBearing = target ? target.bearingDeg : mech.yawDeg;
      control.moveForward = 0.88;
      control.boost = false;
      control.jump = false;
      const desiredHeading = normalizeAngle360(baseBearing + sign * 38);
      control.targetYaw = airborne
        ? desiredHeading
        : steerAroundObstacles(state, mech, desiredHeading);
      break;
    }

    case 'move_retreat':
      if (target) {
        control.targetYaw = target.bearingDeg;
      }
      control.moveForward = -1;
      control.boost = false;
      control.jump = false;
      break;

    case 'move_high_ground': {
      const hg = findHighGroundDirection(state, mech);
      control.targetYaw = hg.yaw;
      control.moveForward = 0.9;
      if (hg.climbJump) {
        control.jump = true;
        control.boost = true;
        control.jumpDir = 'forward';
        control.jumpBurnSec = 0.9;
      } else if (sensor.nearestRadarEnemy && sensor.visibleEnemies.length === 0) {
        const desiredHeading = sensor.nearestRadarEnemy.hasLineOfSight
          ? sensor.nearestRadarEnemy.bearingDeg
          : normalizeAngle360(
              sensor.nearestRadarEnemy.bearingDeg + (mech.slotIndex % 2 === 0 ? 50 : -50)
            );
        control.targetYaw = airborne
          ? desiredHeading
          : steerAroundObstacles(state, mech, desiredHeading);
      }
      break;
    }
  }
}

function resolveThreatBearing(
  target: VisibleEnemyInfo | null,
  sensor: MechSensorState,
  mech: MechRuntimeState
): number | null {
  if (target) return target.bearingDeg;
  if (sensor.incomingFireRelBearingDeg !== null) {
    return normalizeAngle360(mech.yawDeg + sensor.incomingFireRelBearingDeg);
  }
  return sensor.nearestRadarEnemy?.bearingDeg ?? null;
}

function applyLatchedTorsoToControl(
  torso: LatchedTorsoMode,
  control: MechControlInput,
  sensor: MechSensorState,
  mech: MechRuntimeState,
  target: VisibleEnemyInfo | null
): void {
  if (!torso) return;

  switch (torso.op) {
    case 'torso_track':
      if (target) {
        control.torsoTargetYaw = target.bearingDeg;
      } else if (sensor.nearestRadarEnemy) {
        control.torsoTargetYaw = sensor.nearestRadarEnemy.bearingDeg;
      }
      break;

    case 'torso_center':
      control.torsoTargetYaw = undefined;
      control.torsoTwistOffsetDeg = 0;
      break;

    case 'torso_twist_angle':
    case 'torso_twist_r':
    case 'torso_twist_l': {
      const maxDeg = mech.stats.torsoTwistMaxDeg;
      const offset =
        torso.op === 'torso_twist_r'
          ? clamp(Math.abs(torso.param ?? 55), 0, maxDeg)
          : torso.op === 'torso_twist_l'
            ? -clamp(Math.abs(torso.param ?? 55), 0, maxDeg)
            : clamp(torso.param ?? 55, -maxDeg, maxDeg);
      const threatBearing = resolveThreatBearing(target, sensor, mech);
      if (threatBearing !== null) {
        control.torsoTargetYaw = normalizeAngle360(threatBearing + offset);
        control.torsoTwistOffsetDeg = undefined;
        if (control.targetYaw === undefined && control.turnYaw === 0) {
          control.targetYaw = threatBearing;
        }
      } else {
        control.torsoTargetYaw = undefined;
        control.torsoTwistOffsetDeg = offset;
      }
      break;
    }

    case 'torso_twist_auto': {
      const threatBearing = resolveThreatBearing(target, sensor, mech);
      const rightSideHealth =
        (mech.parts.rightShoulder.destroyed
          ? 0
          : mech.parts.rightShoulder.frontArmor + mech.parts.rightShoulder.structure * 0.5) +
        (mech.parts.rightArm.destroyed ? 0 : mech.parts.rightArm.armor);
      const leftSideHealth =
        (mech.parts.leftShoulder.destroyed
          ? 0
          : mech.parts.leftShoulder.frontArmor + mech.parts.leftShoulder.structure * 0.5) +
        (mech.parts.leftArm.destroyed ? 0 : mech.parts.leftArm.armor);
      const twistDir = rightSideHealth >= leftSideHealth ? -1 : 1;
      const twistOffset = Math.min(58, mech.stats.torsoTwistMaxDeg) * twistDir;
      if (threatBearing !== null) {
        control.torsoTargetYaw = normalizeAngle360(threatBearing + twistOffset);
        if (control.targetYaw === undefined && control.turnYaw === 0) {
          control.targetYaw = threatBearing;
        }
      } else {
        control.torsoTargetYaw = undefined;
        control.torsoTwistOffsetDeg = twistOffset;
      }
      break;
    }
  }
}

function applyFireSlotsToControl(
  slots: WeaponSlotId[],
  control: MechControlInput,
  target: VisibleEnemyInfo | null
): void {
  if (target) {
    control.lockTargetId = target.id;
    control.torsoTargetYaw = target.bearingDeg;
    if (control.targetYaw === undefined && control.turnYaw === 0) {
      control.targetYaw = target.bearingDeg;
    }
  }
  for (const s of slots) {
    if (s === 'rightArm') control.fireRightArm = true;
    else if (s === 'leftArm') control.fireLeftArm = true;
    else if (s === 'rightShoulder') control.fireRightShoulder = true;
    else if (s === 'leftShoulder') control.fireLeftShoulder = true;
  }
}

export function stepSubroutineExecution(
  sub: MechSubroutine,
  exec: SubroutineExecState,
  control: MechControlInput,
  sensor: MechSensorState,
  mech: MechRuntimeState,
  state: SimState,
  target: VisibleEnemyInfo | null,
  evadeSign: 1 | -1,
  effectiveGridSize?: 4 | 6
): {
  completed: boolean;
  activeCell: { row: number; col: number } | null;
  lastBranch: PilotDebugTrace['lastBranch'];
} {
  if (exec.completed) {
    return { completed: true, activeCell: null, lastBranch: null };
  }

  const gridSize = effectiveGridSize ?? sub.gridSize;

  if (target && !control.lockTargetId) {
    control.lockTargetId = target.id;
  }

  const findCell = (r: number, c: number) =>
    sub.cells.find((cell) => cell.row === r && cell.col === c);

  let lastBranch: PilotDebugTrace['lastBranch'] = null;

  const advanceOrFinish = (nextRow: number, nextCol: number): boolean => {
    exec.row = nextRow;
    exec.col = nextCol;
    const nextCell = isInsideGrid(nextRow, nextCol, gridSize)
      ? findCell(nextRow, nextCol)
      : undefined;
    if (!nextCell || nextCell.op === 'empty') {
      exec.completed = true;
      return true;
    }
    return false;
  };

  // 1. Continue active aim-and-fire wait if any watched weapon hasn't fired yet
  if (exec.firingWait) {
    const fw = exec.firingWait;
    const didFire = fw.watchedSlots.some((s) => {
      const prev = fw.prevCooldowns[s] ?? 0;
      return mech.weapons[s].cooldownRemaining > prev + 0.05;
    });

    if (didFire) {
      exec.firingWait = null;
      const next = advanceGridCoords(fw.row, fw.col, fw.dir);
      if (advanceOrFinish(next.row, next.col)) {
        applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
        applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
        control.overrideShutdown = exec.overrideLatched;
        return { completed: true, activeCell: { row: fw.row, col: fw.col }, lastBranch: null };
      }
    } else if (fw.ticksRemaining > 0) {
      fw.ticksRemaining -= 1;
      applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
      applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
      applyFireSlotsToControl(getFireSlots(fw.op, mech), control, target);
      control.overrideShutdown = exec.overrideLatched;
      if (fw.ticksRemaining <= 0) {
        exec.firingWait = null;
        const next = advanceGridCoords(fw.row, fw.col, fw.dir);
        advanceOrFinish(next.row, next.col);
      }
      return { completed: exec.completed, activeCell: { row: fw.row, col: fw.col }, lastBranch: null };
    } else {
      exec.firingWait = null;
      const next = advanceGridCoords(fw.row, fw.col, fw.dir);
      if (advanceOrFinish(next.row, next.col)) {
        return { completed: true, activeCell: { row: fw.row, col: fw.col }, lastBranch: null };
      }
    }
  }

  // 2. Continue multi-tick wait / emergency_cool chip
  if (exec.stepTicksRemaining > 0) {
    const curRow = exec.row;
    const curCol = exec.col;
    const cell = findCell(curRow, curCol);
    if (!cell || cell.op === 'empty') {
      exec.completed = true;
      return { completed: true, activeCell: null, lastBranch: null };
    }

    if (cell.op === 'emergency_cool') {
      control.emergencyCool = true;
      control.moveForward = 0;
      control.boost = false;
      control.jump = false;
    } else {
      applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
      applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
      control.overrideShutdown = exec.overrideLatched;
    }

    exec.stepTicksRemaining -= 1;
    if (exec.stepTicksRemaining <= 0) {
      const next = advanceGridCoords(curRow, curCol, cell.dir);
      advanceOrFinish(next.row, next.col);
    }

    return {
      completed: exec.completed,
      activeCell: { row: curRow, col: curCol },
      lastBranch: null,
    };
  }

  // 3. Advance through 0-tick flow / latch / branch chips until hitting a timed or firing chip
  let triggeredJump: { jumpDir: JumpDirectionMode; burnSec: number } | null = null;
  const applyTriggeredJump = () => {
    if (triggeredJump && mech.stats.boosterActive && !mech.thermalShutdown) {
      control.jump = true;
      control.boost = true;
      control.jumpDir = triggeredJump.jumpDir;
      control.jumpBurnSec = triggeredJump.burnSec;
      if (target) {
        control.targetYaw = target.bearingDeg;
      }
    }
  };

  for (let hop = 0; hop < 24; hop++) {
    if (!isInsideGrid(exec.row, exec.col, gridSize) || exec.stepsExecuted >= 48) {
      applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
      applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
      applyTriggeredJump();
      control.overrideShutdown = exec.overrideLatched;
      exec.completed = true;
      return { completed: true, activeCell: null, lastBranch };
    }

    const curRow = exec.row;
    const curCol = exec.col;
    const cell = findCell(curRow, curCol);
    if (!cell || cell.op === 'empty') {
      applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
      applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
      applyTriggeredJump();
      control.overrideShutdown = exec.overrideLatched;
      exec.completed = true;
      return { completed: true, activeCell: null, lastBranch };
    }

    exec.stepsExecuted += 1;

    if (cell.op === 'return') {
      applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
      applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
      applyTriggeredJump();
      control.overrideShutdown = exec.overrideLatched;
      exec.completed = true;
      return { completed: true, activeCell: { row: curRow, col: curCol }, lastBranch };
    }

    if (cell.op === 'start' || cell.op === 'wire') {
      const next = advanceGridCoords(curRow, curCol, cell.dir);
      if (advanceOrFinish(next.row, next.col)) {
        applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
        applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
        applyTriggeredJump();
        control.overrideShutdown = exec.overrideLatched;
        return { completed: true, activeCell: { row: curRow, col: curCol }, lastBranch };
      }
      continue;
    }

    if (isBranchOp(cell.op)) {
      const cond = evaluateSubroutineBranch(
        cell,
        sensor,
        mech,
        state,
        target,
        exec.overrideLatched,
        exec.callArg
      );
      lastBranch = {
        board: sub.slotId,
        label: cell.op,
        result: cond,
      };
      const branchDir = cond ? cell.dir : (cell.elseDir ?? cell.dir);
      const next = advanceGridCoords(curRow, curCol, branchDir);
      if (advanceOrFinish(next.row, next.col)) {
        applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
        applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
        applyTriggeredJump();
        control.overrideShutdown = exec.overrideLatched;
        return { completed: true, activeCell: { row: curRow, col: curCol }, lastBranch };
      }
      continue;
    }

    if (cell.op === 'move_jump') {
      const burnSec = clamp(
        cell.useArg && exec.callArg !== undefined
          ? exec.callArg
          : (cell.durationSec ?? 0.8),
        0.2,
        1.5
      );
      triggeredJump = {
        jumpDir: cell.jumpDir ?? 'forward',
        burnSec,
      };
      const next = advanceGridCoords(curRow, curCol, cell.dir);
      if (advanceOrFinish(next.row, next.col)) {
        applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
        applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
        applyTriggeredJump();
        control.overrideShutdown = exec.overrideLatched;
        return { completed: true, activeCell: { row: curRow, col: curCol }, lastBranch };
      }
      continue;
    }

    if (isLegLatchOp(cell.op)) {
      const dir =
        cell.op === 'move_circle' || cell.op === 'move_evade'
          ? cell.direction === 'left'
            ? 'left'
            : cell.direction === 'auto'
              ? 'auto'
              : 'right'
          : cell.direction;
      exec.latchedLeg = {
        op: cell.op,
        param: resolveCellParam(cell, exec.callArg),
        direction: dir,
      };
      const next = advanceGridCoords(curRow, curCol, cell.dir);
      if (advanceOrFinish(next.row, next.col)) {
        applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
        applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
        applyTriggeredJump();
        control.overrideShutdown = exec.overrideLatched;
        return { completed: true, activeCell: { row: curRow, col: curCol }, lastBranch };
      }
      continue;
    }

    if (isTorsoLatchOp(cell.op)) {
      exec.latchedTorso = { op: cell.op, param: resolveCellParam(cell, exec.callArg) };
      const next = advanceGridCoords(curRow, curCol, cell.dir);
      if (advanceOrFinish(next.row, next.col)) {
        applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
        applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
        applyTriggeredJump();
        control.overrideShutdown = exec.overrideLatched;
        return { completed: true, activeCell: { row: curRow, col: curCol }, lastBranch };
      }
      continue;
    }

    if (cell.op === 'override_on' || cell.op === 'override_off') {
      exec.overrideLatched = cell.op === 'override_on';
      const next = advanceGridCoords(curRow, curCol, cell.dir);
      if (advanceOrFinish(next.row, next.col)) {
        applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
        applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
        applyTriggeredJump();
        control.overrideShutdown = exec.overrideLatched;
        return { completed: true, activeCell: { row: curRow, col: curCol }, lastBranch };
      }
      continue;
    }

    if (isFireOp(cell.op)) {
      const candidateSlots = getFireSlots(cell.op, mech);
      const fireable = candidateSlots.filter((s) => {
        if (mech.parts[s].destroyed) return false;
        const spec = getWeaponSpec(mech.weapons[s].weaponId);
        if (spec.burstCount <= 0 || spec.damage <= 0) return false;
        if (mech.weapons[s].ammoRemaining === 0) return false;
        return mech.weapons[s].cooldownRemaining <= 0.15;
      });

      if (fireable.length === 0) {
        // Weapon unavailable or still on cooldown -> skip without stalling
        const next = advanceGridCoords(curRow, curCol, cell.dir);
        if (advanceOrFinish(next.row, next.col)) {
          applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
          applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
          applyTriggeredJump();
          control.overrideShutdown = exec.overrideLatched;
          return { completed: true, activeCell: { row: curRow, col: curCol }, lastBranch };
        }
        continue;
      }

      const prevCooldowns: Partial<Record<WeaponSlotId, number>> = {};
      for (const s of fireable) {
        prevCooldowns[s] = mech.weapons[s].cooldownRemaining;
      }
      const waitTicks = clamp(Math.round((cell.durationSec ?? 0.45) * SIM_TPS), 1, 30);
      exec.firingWait = {
        row: curRow,
        col: curCol,
        op: cell.op,
        dir: cell.dir,
        ticksRemaining: waitTicks,
        watchedSlots: fireable,
        prevCooldowns,
      };
      applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
      applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
      applyFireSlotsToControl(candidateSlots, control, target);
      applyTriggeredJump();
      control.overrideShutdown = exec.overrideLatched;
      return { completed: false, activeCell: { row: curRow, col: curCol }, lastBranch };
    }

    // Timed chip: wait or emergency_cool
    const ticks = clamp(Math.round((cell.durationSec ?? 0.4) * SIM_TPS), 1, 90);
    exec.stepTicksRemaining = ticks - 1;

    if (cell.op === 'emergency_cool') {
      control.emergencyCool = true;
      control.moveForward = 0;
      control.boost = false;
      control.jump = false;
    } else {
      applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
      applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
      applyTriggeredJump();
      control.overrideShutdown = exec.overrideLatched;
    }

    if (exec.stepTicksRemaining <= 0) {
      const next = advanceGridCoords(curRow, curCol, cell.dir);
      advanceOrFinish(next.row, next.col);
    }

    return {
      completed: exec.completed,
      activeCell: { row: curRow, col: curCol },
      lastBranch,
    };
  }

  // Hop limit safety guard
  applyLatchedLegToControl(exec.latchedLeg, control, sensor, mech, state, target, evadeSign);
  applyLatchedTorsoToControl(exec.latchedTorso, control, sensor, mech, target);
  applyTriggeredJump();
  control.overrideShutdown = exec.overrideLatched;
  exec.completed = true;
  return { completed: true, activeCell: null, lastBranch };
}
