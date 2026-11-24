import {
  GridDir,
  MechRuntimeState,
  MechSensorState,
  MechSubroutineSlotId,
  PilotDebugTrace,
  PilotGridCell,
  PilotGridProgram,
  PilotProfile,
  PilotTargetMode,
  SIM_TPS,
  SimState,
  VisibleEnemyInfo,
} from '../types/mech';
import { clamp } from './math';
import { EMPTY_CONTROL_INPUT } from './mechSim';
import {
  SubroutineExecState,
  advanceGridCoords,
  getWeaponReadyStatuses,
  isInsideGrid,
  startSubroutineExec,
  stepSubroutineExecution,
} from './subroutineRunner';

export interface ActiveSubroutineCallState {
  slotId: MechSubroutineSlotId;
  targetMode: PilotTargetMode;
  maxTicksRemaining: number;
  subExec: SubroutineExecState;
  callCellRow: number;
  callCellCol: number;
  callDir: GridDir;
}

export interface PilotRuntimeState {
  pilotRow: number;
  pilotCol: number;
  flagA: boolean;
  flagB: boolean;
  overrideLatched: boolean;
  pilotTimedTicksRemaining: number;
  pilotTimedRow: number;
  pilotTimedCol: number;
  pilotTimedDir: GridDir;
  activeCall: ActiveSubroutineCallState | null;
  evadeSideSign: 1 | -1;
  lastBranch: PilotDebugTrace['lastBranch'];
}

export interface PilotTickOutput {
  control: typeof EMPTY_CONTROL_INPUT;
  activePilotCell: { row: number; col: number } | null;
  activeSubroutineSlot: MechSubroutineSlotId | null;
  activeSubroutineCell: { row: number; col: number } | null;
  debugTrace: PilotDebugTrace;
}

function findPilotStart(grid: PilotGridProgram): { row: number; col: number } {
  const start = grid.cells.find((c) => c.op === 'start');
  return start ? { row: start.row, col: start.col } : { row: 0, col: 0 };
}

export function createPilotRuntimeState(profile: PilotProfile): PilotRuntimeState {
  const start = findPilotStart(profile.grid);
  return {
    pilotRow: start.row,
    pilotCol: start.col,
    flagA: false,
    flagB: false,
    overrideLatched: false,
    pilotTimedTicksRemaining: 0,
    pilotTimedRow: start.row,
    pilotTimedCol: start.col,
    pilotTimedDir: 'E',
    activeCall: null,
    evadeSideSign: 1,
    lastBranch: null,
  };
}

export function selectTarget(
  mode: PilotTargetMode | undefined,
  sensor: MechSensorState,
  mech: MechRuntimeState,
  allowRadarFallback = true
): VisibleEnemyInfo | null {
  const enemies =
    sensor.visibleEnemies.length > 0
      ? sensor.visibleEnemies
      : allowRadarFallback
        ? sensor.radarContacts
        : [];
  if (enemies.length === 0) return null;

  switch (mode ?? 'main') {
    case 'nearest':
      return sensor.nearestEnemy ?? (allowRadarFallback ? sensor.nearestRadarEnemy : null);
    case 'flank':
      return (
        sensor.nearestFlankEnemy ??
        sensor.nearestEnemy ??
        (allowRadarFallback ? sensor.nearestRadarEnemy : null)
      );
    case 'attacker': {
      if (mech.lastAttackerId) {
        const foundVisible = sensor.visibleEnemies.find((e) => e.id === mech.lastAttackerId);
        if (foundVisible) return foundVisible;
        if (allowRadarFallback) {
          const foundRadar = sensor.radarContacts.find((e) => e.id === mech.lastAttackerId);
          if (foundRadar) return foundRadar;
        }
      }
      return sensor.nearestEnemy ?? (allowRadarFallback ? sensor.nearestRadarEnemy : null);
    }
    case 'weakest': {
      let weakest = enemies[0];
      for (const e of enemies) {
        if (e.totalHpRatio < weakest.totalHpRatio) weakest = e;
      }
      return weakest;
    }
    case 'main':
    default: {
      let best = enemies[0];
      let bestScore = Math.abs(best.torsoRelBearingDeg) + best.distance * 0.15;
      for (let i = 1; i < enemies.length; i++) {
        const e = enemies[i];
        const score = Math.abs(e.torsoRelBearingDeg) + e.distance * 0.15;
        if (score < bestScore) {
          best = e;
          bestScore = score;
        }
      }
      return best;
    }
  }
}

function evaluatePilotBranch(
  cell: PilotGridCell,
  sensor: MechSensorState,
  mech: MechRuntimeState,
  runtime: PilotRuntimeState
): boolean {
  const ref = sensor.nearestEnemy ?? sensor.nearestRadarEnemy;
  switch (cell.op) {
    case 'if_enemy_in_sight':
      return sensor.visibleEnemies.length > 0;
    case 'if_enemy_on_radar':
      return sensor.radarContacts.length > 0;
    case 'if_enemy_dist_lt':
      return ref !== null && ref.distance < (cell.param ?? 150);
    case 'if_enemy_dist_gt':
      return ref !== null && ref.distance > (cell.param ?? 180);
    case 'if_enemy_flank':
      return (
        sensor.nearestFlankEnemy !== null &&
        sensor.nearestFlankEnemy.distance < (cell.param ?? 160)
      );
    case 'if_heat_above':
      return sensor.heatRatio * 100 > (cell.param ?? 85);
    case 'if_heat_below':
      return sensor.heatRatio * 100 < (cell.param ?? 45);
    case 'if_ammo_empty':
      return cell.weaponSlot
        ? sensor.emptyAmmoSlots.includes(cell.weaponSlot)
        : sensor.anyAmmoEmpty;
    case 'if_part_destroyed':
      return cell.partId
        ? mech.parts[cell.partId].destroyed
        : sensor.destroyedParts.length > 0;
    case 'if_torso_hp_below':
      return sensor.torsoHpRatio * 100 < (cell.param ?? 50);
    case 'if_incoming_fire':
      return sensor.incomingFire;
    case 'if_target_locked':
      return sensor.targetLocked;
    case 'if_incoming_missile':
      return sensor.incomingMissile;
    case 'if_ecm_jammed':
      return sensor.ecmJammed;
    case 'if_enemy_hp_below':
      return ref !== null && ref.totalHpRatio * 100 < (cell.param ?? 35);
    case 'if_flag_a':
      return runtime.flagA;
    case 'if_flag_b':
      return runtime.flagB;
    default:
      return false;
  }
}

function callOpToSlotId(op: PilotGridCell['op']): MechSubroutineSlotId | null {
  switch (op) {
    case 'call_s1':
      return 'S1';
    case 'call_s2':
      return 'S2';
    case 'call_s3':
      return 'S3';
    case 'call_s4':
      return 'S4';
    case 'call_s5':
      return 'S5';
    default:
      return null;
  }
}

function advancePilotCursor(
  grid: PilotGridProgram,
  row: number,
  col: number,
  dir: GridDir
): { row: number; col: number } {
  const next = advanceGridCoords(row, col, dir);
  if (!isInsideGrid(next.row, next.col, grid.gridSize)) {
    return findPilotStart(grid);
  }
  const cell = grid.cells.find((c) => c.row === next.row && c.col === next.col);
  if (!cell || cell.op === 'empty') {
    return findPilotStart(grid);
  }
  return next;
}

export function evaluatePilotTick(
  profile: PilotProfile,
  runtime: PilotRuntimeState,
  sensor: MechSensorState,
  mech: MechRuntimeState,
  state: SimState
): PilotTickOutput {
  const grid = profile.grid;
  const control = { ...EMPTY_CONTROL_INPUT, overrideShutdown: runtime.overrideLatched };
  const findCell = (r: number, c: number) =>
    grid.cells.find((cell) => cell.row === r && cell.col === c);

  if (sensor.incomingFire && sensor.incomingFireRelBearingDeg !== null) {
    runtime.evadeSideSign = sensor.incomingFireRelBearingDeg >= 0 ? -1 : 1;
  }

  const buildResult = (
    activePilotCell: { row: number; col: number } | null,
    activeSubroutineSlot: MechSubroutineSlotId | null,
    activeSubroutineCell: { row: number; col: number } | null,
    targetForStatus: VisibleEnemyInfo | null
  ): PilotTickOutput => ({
    control,
    activePilotCell,
    activeSubroutineSlot,
    activeSubroutineCell,
    debugTrace: {
      activePilotCell,
      activeSubroutineSlot,
      activeSubroutineCell,
      lastBranch: runtime.lastBranch,
      flagA: runtime.flagA,
      flagB: runtime.flagB,
      overrideLatched: runtime.overrideLatched,
      weaponStatuses: getWeaponReadyStatuses(state, mech, targetForStatus),
    },
  });

  // 1. Continue running an active subroutine CALL if present
  if (runtime.activeCall) {
    const call = runtime.activeCall;
    const sub =
      mech.blueprint.subroutines.find((s) => s.slotId === call.slotId) ??
      mech.blueprint.subroutines[0];
    const target = selectTarget(call.targetMode, sensor, mech);

    if (!sub) {
      const nextPos = advancePilotCursor(grid, call.callCellRow, call.callCellCol, call.callDir);
      runtime.pilotRow = nextPos.row;
      runtime.pilotCol = nextPos.col;
      runtime.activeCall = null;
      return buildResult({ row: call.callCellRow, col: call.callCellCol }, null, null, target);
    }

    const res = stepSubroutineExecution(
      sub,
      call.subExec,
      control,
      sensor,
      mech,
      state,
      target,
      runtime.evadeSideSign
    );
    if (res.lastBranch) {
      runtime.lastBranch = res.lastBranch;
    }
    runtime.overrideLatched = call.subExec.overrideLatched;
    call.maxTicksRemaining -= 1;

    const callCell = { row: call.callCellRow, col: call.callCellCol };
    const subSlot = call.slotId;
    const subCell = res.activeCell;

    if (res.completed || call.maxTicksRemaining <= 0) {
      const nextPos = advancePilotCursor(grid, call.callCellRow, call.callCellCol, call.callDir);
      runtime.pilotRow = nextPos.row;
      runtime.pilotCol = nextPos.col;
      runtime.activeCall = null;
    }

    return buildResult(callCell, subSlot, subCell, target);
  }

  // 2. Continue multi-tick emergency_cool directly on Pilot grid
  if (runtime.pilotTimedTicksRemaining > 0) {
    control.emergencyCool = true;
    control.moveForward = 0;
    control.boost = false;
    control.jump = false;
    control.overrideShutdown = false;
    runtime.pilotTimedTicksRemaining -= 1;

    const cellRef = { row: runtime.pilotTimedRow, col: runtime.pilotTimedCol };
    if (runtime.pilotTimedTicksRemaining <= 0) {
      const nextPos = advancePilotCursor(
        grid,
        runtime.pilotTimedRow,
        runtime.pilotTimedCol,
        runtime.pilotTimedDir
      );
      runtime.pilotRow = nextPos.row;
      runtime.pilotCol = nextPos.col;
    }
    return buildResult(cellRef, null, null, sensor.nearestEnemy ?? sensor.nearestRadarEnemy);
  }

  // 3. Advance through Pilot 6x6 instant flow/branch/flag chips until a CALL or timed emergency_cool
  let wrappedOnce = false;
  for (let hop = 0; hop < 28; hop++) {
    if (!isInsideGrid(runtime.pilotRow, runtime.pilotCol, grid.gridSize)) {
      if (wrappedOnce) break;
      const start = findPilotStart(grid);
      runtime.pilotRow = start.row;
      runtime.pilotCol = start.col;
      wrappedOnce = true;
      continue;
    }

    const r = runtime.pilotRow;
    const c = runtime.pilotCol;
    const cell = findCell(r, c);
    if (!cell || cell.op === 'empty') {
      if (wrappedOnce) break;
      const start = findPilotStart(grid);
      runtime.pilotRow = start.row;
      runtime.pilotCol = start.col;
      wrappedOnce = true;
      continue;
    }

    if (cell.op === 'start' || cell.op === 'wire') {
      const nextPos = advancePilotCursor(grid, r, c, cell.dir);
      runtime.pilotRow = nextPos.row;
      runtime.pilotCol = nextPos.col;
      continue;
    }

    if (cell.op === 'flag_a_on' || cell.op === 'flag_a_off') {
      runtime.flagA = cell.op === 'flag_a_on';
      const nextPos = advancePilotCursor(grid, r, c, cell.dir);
      runtime.pilotRow = nextPos.row;
      runtime.pilotCol = nextPos.col;
      continue;
    }

    if (cell.op === 'flag_b_on' || cell.op === 'flag_b_off') {
      runtime.flagB = cell.op === 'flag_b_on';
      const nextPos = advancePilotCursor(grid, r, c, cell.dir);
      runtime.pilotRow = nextPos.row;
      runtime.pilotCol = nextPos.col;
      continue;
    }

    if (cell.op === 'override_on' || cell.op === 'override_off') {
      runtime.overrideLatched = cell.op === 'override_on';
      control.overrideShutdown = runtime.overrideLatched;
      const nextPos = advancePilotCursor(grid, r, c, cell.dir);
      runtime.pilotRow = nextPos.row;
      runtime.pilotCol = nextPos.col;
      continue;
    }

    if (cell.op.startsWith('if_')) {
      const result = evaluatePilotBranch(cell, sensor, mech, runtime);
      runtime.lastBranch = {
        board: 'MAIN',
        label: cell.op,
        result,
      };
      const branchDir = result ? cell.dir : (cell.elseDir ?? cell.dir);
      const nextPos = advancePilotCursor(grid, r, c, branchDir);
      runtime.pilotRow = nextPos.row;
      runtime.pilotCol = nextPos.col;
      continue;
    }

    if (cell.op === 'emergency_cool') {
      const ticks = clamp(Math.round((cell.durationSec ?? 0.6) * SIM_TPS), 1, 90);
      control.emergencyCool = true;
      control.moveForward = 0;
      control.boost = false;
      control.jump = false;
      control.overrideShutdown = false;
      if (ticks > 1) {
        runtime.pilotTimedTicksRemaining = ticks - 1;
        runtime.pilotTimedRow = r;
        runtime.pilotTimedCol = c;
        runtime.pilotTimedDir = cell.dir;
      } else {
        const nextPos = advancePilotCursor(grid, r, c, cell.dir);
        runtime.pilotRow = nextPos.row;
        runtime.pilotCol = nextPos.col;
      }
      return buildResult(
        { row: r, col: c },
        null,
        null,
        sensor.nearestEnemy ?? sensor.nearestRadarEnemy
      );
    }

    const slotId = callOpToSlotId(cell.op);
    if (slotId) {
      const sub =
        mech.blueprint.subroutines.find((s) => s.slotId === slotId) ??
        mech.blueprint.subroutines[0];
      const targetMode = cell.target ?? 'main';
      const target = selectTarget(targetMode, sensor, mech);

      if (!sub) {
        const nextPos = advancePilotCursor(grid, r, c, cell.dir);
        runtime.pilotRow = nextPos.row;
        runtime.pilotCol = nextPos.col;
        return buildResult({ row: r, col: c }, null, null, target);
      }

      const subExec = startSubroutineExec(sub, runtime.overrideLatched);
      const maxTicks = clamp(Math.round((cell.durationSec ?? 0.65) * SIM_TPS), 2, 120);
      const res = stepSubroutineExecution(
        sub,
        subExec,
        control,
        sensor,
        mech,
        state,
        target,
        runtime.evadeSideSign
      );
      if (res.lastBranch) {
        runtime.lastBranch = res.lastBranch;
      }
      runtime.overrideLatched = subExec.overrideLatched;

      if (!res.completed && maxTicks - 1 > 0) {
        runtime.activeCall = {
          slotId: sub.slotId,
          targetMode,
          maxTicksRemaining: maxTicks - 1,
          subExec,
          callCellRow: r,
          callCellCol: c,
          callDir: cell.dir,
        };
      } else {
        const nextPos = advancePilotCursor(grid, r, c, cell.dir);
        runtime.pilotRow = nextPos.row;
        runtime.pilotCol = nextPos.col;
      }

      return buildResult({ row: r, col: c }, sub.slotId, res.activeCell, target);
    }

    break;
  }

  return buildResult(
    { row: runtime.pilotRow, col: runtime.pilotCol },
    null,
    null,
    sensor.nearestEnemy ?? sensor.nearestRadarEnemy
  );
}
