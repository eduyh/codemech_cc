import { CURRICULUM_MISSIONS } from '../data/curriculum';
import {
  computeMechStats,
  getEffectiveSubroutineGridSize,
  getWeaponSpec,
} from '../data/parts';
import {
  DEFAULT_PILOT_PROFILE,
  PILOT_BASIC,
  PILOT_BASIC_HEAVY,
  PILOT_BASIC_LIGHT,
  PRESET_ABH,
  PRESET_ABL,
  PRESET_ABC,
} from '../data/presets';
import {
  CaptureZoneSpec,
  CurriculumStepId,
  MatchParticipantEntry,
  MechBlueprint,
  MechControlInput,
  PilotProfile,
  SIM_TPS,
} from '../types/mech';
import type { ReplayPackageData } from '../utils/shareMech';
import { buildBattleCommentary } from './battlefield';
import { buildMechSensorState, createSimulation, stepSimulation } from './mechSim';
import { createPilotRuntimeState, evaluatePilotTick } from './pilotRuntime';

export interface CurriculumCheckItem {
  label: string;
  ok: boolean;
}

export interface CurriculumVerifyResult {
  missionId: CurriculumStepId;
  passed: boolean;
  checklist: CurriculumCheckItem[];
  summaryText: string;
  durationSec: number;
  replay: ReplayPackageData;
}

function makeTrainingTargetMech(
  base: MechBlueprint,
  armorScale: number,
  name: string,
  overrides?: Partial<{
    rightArmWeapon: string;
    leftArmWeapon: string;
    rightShoulderWeapon: string;
    leftShoulderWeapon: string;
    boosterEnabled: boolean;
    ecmEnabled: boolean;
    color: string;
  }>
): MechBlueprint {
  const clone = structuredClone(base);
  clone.name = name;
  if (overrides?.color) clone.color = overrides.color;
  if (typeof overrides?.boosterEnabled === 'boolean') {
    clone.boosterEnabled = overrides.boosterEnabled;
  }
  if (typeof overrides?.ecmEnabled === 'boolean') {
    clone.ecmEnabled = overrides.ecmEnabled;
  }
  if (overrides?.rightArmWeapon) clone.parts.rightArmWeapon = overrides.rightArmWeapon;
  if (overrides?.leftArmWeapon) clone.parts.leftArmWeapon = overrides.leftArmWeapon;
  if (overrides?.rightShoulderWeapon) clone.parts.rightShoulderWeapon = overrides.rightShoulderWeapon;
  if (overrides?.leftShoulderWeapon) clone.parts.leftShoulderWeapon = overrides.leftShoulderWeapon;
  clone.armor = {
    head: Math.max(10, Math.round(clone.armor.head * armorScale)),
    torsoFront: Math.max(15, Math.round(clone.armor.torsoFront * armorScale)),
    torsoRear: Math.max(10, Math.round(clone.armor.torsoRear * armorScale)),
    rightShoulderFront: Math.max(10, Math.round(clone.armor.rightShoulderFront * armorScale)),
    rightShoulderRear: Math.max(10, Math.round(clone.armor.rightShoulderRear * armorScale)),
    leftShoulderFront: Math.max(10, Math.round(clone.armor.leftShoulderFront * armorScale)),
    leftShoulderRear: Math.max(10, Math.round(clone.armor.leftShoulderRear * armorScale)),
    rightArm: Math.max(10, Math.round(clone.armor.rightArm * armorScale)),
    leftArm: Math.max(10, Math.round(clone.armor.leftArm * armorScale)),
    rightLeg: Math.max(10, Math.round(clone.armor.rightLeg * armorScale)),
    leftLeg: Math.max(10, Math.round(clone.armor.leftLeg * armorScale)),
  };
  return clone;
}

function makeUnarmedBalloonBlueprint(name: string, color = '#f43f5e'): MechBlueprint {
  const bp = structuredClone(PRESET_ABL);
  bp.id = `balloon_${name}`;
  bp.name = name;
  bp.color = color;
  bp.boosterEnabled = false;
  bp.ecmEnabled = false;
  bp.parts.rightArmWeapon = 'arm_none';
  bp.parts.leftArmWeapon = 'arm_none';
  bp.parts.rightShoulderWeapon = 'shd_none';
  bp.parts.leftShoulderWeapon = 'shd_none';
  bp.weaponGroups = { G1: [], G2: [], G3: [], G4: [] };
  return bp;
}

function makeStationaryTargetPilot(): PilotProfile {
  return {
    version: 2,
    id: 'pilot_stationary_target',
    name: '固定標的',
    grid: {
      gridSize: 6,
      cells: [{ row: 0, col: 0, op: 'start', dir: 'S' }],
    },
  };
}

function makeOrbitBalloonPilot(range = 90): PilotProfile {
  return {
    version: 2,
    id: 'pilot_orbit_balloon',
    name: '移動バルーン',
    grid: {
      gridSize: 6,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'S' },
        { row: 1, col: 0, op: 'call_s3', dir: 'S', target: 'nearest', param: range, durationSec: 0.7 },
      ],
    },
  };
}

function makeBasicTrainingPilot(desiredRange = 200): PilotProfile {
  return {
    version: 2,
    id: 'pilot_training_target',
    name: '訓練用標的AI',
    grid: {
      gridSize: 6,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'S' },
        { row: 1, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
        { row: 1, col: 1, op: 'call_s3', dir: 'E', target: 'main', param: desiredRange, durationSec: 0.3 },
        { row: 1, col: 2, op: 'call_s1', dir: 'S', target: 'main', durationSec: desiredRange > 180 ? 0.65 : 0.55 },
        { row: 2, col: 0, op: 'call_s3', dir: 'S', target: 'main', param: desiredRange, durationSec: 0.55 },
      ],
    },
  };
}

function getActiveS1Cells(mech: MechBlueprint) {
  const s1 = mech.subroutines.find((s) => s.slotId === 'S1');
  const effSize = Math.min(4, getEffectiveSubroutineGridSize(mech, 'S1'));
  return (s1?.cells ?? []).filter(
    (c) =>
      c.row >= 0 &&
      c.row < effSize &&
      c.col >= 0 &&
      c.col < effSize &&
      c.op !== 'empty' &&
      c.op !== 'start' &&
      c.op !== 'wire'
  );
}

export interface CurriculumMissionScenario {
  spec: (typeof CURRICULUM_MISSIONS)[number];
  entries: MatchParticipantEntry[];
  captureZones: CaptureZoneSpec[];
  replay: ReplayPackageData;
}

/**
 * Builds the deterministic match entries, optional capture zones, and replay package
 * for a curriculum stage so both live preview and verification use identical setups.
 */
export function buildCurriculumMissionScenario(
  missionId: CurriculumStepId,
  playerMech: MechBlueprint,
  playerPilot: PilotProfile
): CurriculumMissionScenario {
  const spec = CURRICULUM_MISSIONS.find((m) => m.id === missionId) ?? CURRICULUM_MISSIONS[0];
  const captureZones: CaptureZoneSpec[] = [];
  const entries: MatchParticipantEntry[] = [];

  if (missionId === 'p1_1_capture_walk') {
    entries.push({
      id: 'player',
      name: playerMech.name,
      teamId: 'T_PLAYER',
      blueprint: playerMech,
      pilot: playerPilot,
      spawnOverride: { x: 300, y: 380, yaw: 0 },
    });
    captureZones.push({
      id: 'zone_a',
      label: '陣とりA',
      x: 300,
      y: 180,
      radius: 38,
      holdSec: 2.0,
      teamId: 'T_PLAYER',
    });
  } else if (missionId === 'p1_2_balloon_pop') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 300, y: 420, yaw: 0 },
      },
      {
        id: 'balloon_1',
        name: '標的バルーン',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('標的バルーン'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 35,
        spawnOverride: { x: 300, y: 180, yaw: 180 },
      }
    );
  } else if (missionId === 'p1_3_debug_order') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 525, y: 555, yaw: 0 },
      },
      {
        id: 'balloon_1',
        name: 'バルーン1',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('バルーン1', '#f43f5e'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 26,
        spawnOverride: { x: 505, y: 290, yaw: 180 },
      },
      {
        id: 'balloon_2',
        name: 'バルーン2',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('バルーン2', '#f59e0b'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 26,
        spawnOverride: { x: 525, y: 260, yaw: 180 },
      },
      {
        id: 'balloon_3',
        name: 'バルーン3',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('バルーン3', '#a855f7'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 26,
        spawnOverride: { x: 545, y: 290, yaw: 180 },
      }
    );
  } else if (missionId === 'p1_4_range_branch') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 525, y: 515, yaw: 0 },
      },
      {
        id: 'balloon_near',
        name: '近距離バルーン',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('近距離バルーン', '#22c55e'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 25,
        spawnOverride: { x: 525, y: 425, yaw: 180 },
      },
      {
        id: 'balloon_far',
        name: '遠距離バルーン',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('遠距離バルーン', '#f59e0b'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 35,
        spawnOverride: { x: 525, y: 165, yaw: 180 },
      }
    );
  } else if (missionId === 'p1_5_jump_wall') {
    // Urban bldg_n is at x=276..324, y=180..204, topZ=15
    entries.push({
      id: 'player',
      name: playerMech.name,
      teamId: 'T_PLAYER',
      blueprint: playerMech,
      pilot: playerPilot,
      spawnOverride: { x: 300, y: 250, yaw: 0 },
    });
    captureZones.push({
      id: 'zone_roof',
      label: '屋上マス',
      x: 300,
      y: 192,
      z: 15,
      radius: 22,
      holdSec: 1.5,
      teamId: 'T_PLAYER',
    });
  } else if (missionId === 'p1_6_moving_balloons') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 300, y: 470, yaw: 0 },
      },
      {
        id: 'balloon_m1',
        name: '移動バルーンA',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('移動バルーンA', '#f43f5e'),
        pilot: makeOrbitBalloonPilot(95),
        isBalloon: true,
        balloonHp: 32,
        spawnOverride: { x: 220, y: 240, yaw: 120 },
      },
      {
        id: 'balloon_m2',
        name: '移動バルーンB',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('移動バルーンB', '#ec4899'),
        pilot: makeOrbitBalloonPilot(95),
        isBalloon: true,
        balloonHp: 32,
        spawnOverride: { x: 380, y: 240, yaw: 240 },
      }
    );
  } else if (missionId === 'p1_7_rapid_loop') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 525, y: 430, yaw: 0 },
      },
      {
        id: 'balloon_tough',
        name: '高耐久バルーン',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('高耐久バルーン', '#f59e0b'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 230,
        spawnOverride: { x: 525, y: 260, yaw: 180 },
      }
    );
  } else if (missionId === 'p1_8_heat_hysteresis') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 300, y: 550, yaw: 0 },
      },
      {
        id: 'balloon_h1',
        name: '耐熱標的A',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('耐熱標的A', '#ef4444'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 110,
        spawnOverride: { x: 260, y: 420, yaw: 180 },
      },
      {
        id: 'balloon_h2',
        name: '耐熱標的B',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('耐熱標的B', '#f97316'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 110,
        spawnOverride: { x: 300, y: 410, yaw: 180 },
      },
      {
        id: 'balloon_h3',
        name: '耐熱標的C',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('耐熱標的C', '#eab308'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 110,
        spawnOverride: { x: 340, y: 420, yaw: 180 },
      }
    );
  } else if (missionId === 'p1_9_zone_and_pop') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 355, y: 490, yaw: 0 },
      },
      {
        id: 'balloon_snipe',
        name: '狙撃バルーン',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('狙撃バルーン', '#06b6d4'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 45,
        spawnOverride: { x: 355, y: 140, yaw: 180 },
      }
    );
    captureZones.push({
      id: 'zone_snipe',
      label: '狙撃陣地A',
      x: 355,
      y: 360,
      radius: 30,
      holdSec: 4.5,
      teamId: 'T_PLAYER',
    });
  } else if (missionId === 'p1_10_pilot_6x6') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
      },
      {
        id: 'enemy_1',
        name: '訓練用スカウト',
        teamId: 'T_ENEMY',
        blueprint: makeTrainingTargetMech(PRESET_ABL, 0.52, '訓練用スカウト'),
        pilot: makeBasicTrainingPilot(),
      }
    );
  } else if (missionId === 'p1_11_subroutine_arg') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 110, y: 490, yaw: 90 },
      },
      {
        id: 'balloon_arg_1',
        name: '近標バルーン',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('近標バルーン', '#22c55e'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 65,
        spawnOverride: { x: 270, y: 480, yaw: 270 },
      },
      {
        id: 'balloon_arg_2',
        name: '遠標バルーン',
        teamId: 'T_ENEMY',
        blueprint: makeUnarmedBalloonBlueprint('遠標バルーン', '#f59e0b'),
        pilot: makeStationaryTargetPilot(),
        isBalloon: true,
        balloonHp: 80,
        spawnOverride: { x: 450, y: 495, yaw: 270 },
      }
    );
  } else if (missionId === 'p1_12_part1_exam') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
      },
      {
        id: 'enemy_1',
        name: '卒業試験標的機',
        teamId: 'T_ENEMY',
        blueprint: makeTrainingTargetMech(PRESET_ABL, 0.58, '卒業試験標的機'),
        pilot: makeBasicTrainingPilot(185),
      }
    );
  } else if (missionId === 'p2_1_flank_rear') {
    const fortress = makeTrainingTargetMech(PRESET_ABH, 0.25, '正面重装甲砲台', {
      rightArmWeapon: 'small_laser',
      leftArmWeapon: 'arm_none',
      rightShoulderWeapon: 'shd_none',
      leftShoulderWeapon: 'shd_none',
      boosterEnabled: false,
    });
    fortress.weaponGroups = {
      G1: ['rightArm'],
      G2: ['rightArm'],
      G3: ['rightArm'],
      G4: ['rightArm'],
    };
    fortress.armor.torsoFront = 420;
    fortress.armor.rightShoulderFront = 320;
    fortress.armor.leftShoulderFront = 320;
    fortress.armor.torsoRear = 12;
    fortress.armor.rightShoulderRear = 10;
    fortress.armor.leftShoulderRear = 10;
    const turretPilot: PilotProfile = {
      version: 2,
      id: 'pilot_slow_turret',
      name: '固定砲台AI',
      grid: {
        gridSize: 6,
        cells: [
          { row: 0, col: 0, op: 'start', dir: 'S' },
          { row: 1, col: 0, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.7 },
        ],
      },
    };
    fortress.subroutines = fortress.subroutines.map((s) =>
      s.slotId === 'S1'
        ? {
            slotId: 'S1',
            name: '固定砲撃',
            gridSize: 4,
            cells: [
              { row: 0, col: 0, op: 'start', dir: 'E' },
              { row: 0, col: 1, op: 'torso_center', dir: 'E' },
              { row: 0, col: 2, op: 'fire_group_1', dir: 'S', durationSec: 0.6 },
            ],
          }
        : s
    );
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 355, y: 400, yaw: 0 },
      },
      {
        id: 'enemy_fortress',
        name: '正面重装甲砲台',
        teamId: 'T_ENEMY',
        blueprint: fortress,
        pilot: turretPilot,
        spawnOverride: { x: 355, y: 215, yaw: 180 },
      }
    );
  } else if (missionId === 'p2_2_leg_sweep') {
    const legRunner = makeTrainingTargetMech(PRESET_ABL, 0.35, '脚狙い演習スカウト', {
      rightShoulderWeapon: 'small_laser',
      leftShoulderWeapon: 'shd_none',
    });
    legRunner.weaponGroups = { G1: ['rightShoulder'], G2: ['rightShoulder'], G3: ['rightShoulder'], G4: ['rightShoulder'] };
    legRunner.armor.torsoFront = 95;
    legRunner.armor.rightLeg = 18;
    legRunner.armor.leftLeg = 18;
    legRunner.boosterEnabled = false;
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
      },
      {
        id: 'enemy_1',
        name: '脚狙い演習スカウト',
        teamId: 'T_ENEMY',
        blueprint: legRunner,
        pilot: makeBasicTrainingPilot(160),
      }
    );
  } else if (missionId === 'p2_3_arm_shield') {
    const armHeavy = makeTrainingTargetMech(PRESET_ABH, 0.45, '右腕高火力機', {
      rightArmWeapon: 'ac10',
      leftArmWeapon: 'arm_none',
      rightShoulderWeapon: 'shd_none',
      leftShoulderWeapon: 'shd_none',
    });
    armHeavy.weaponGroups = {
      G1: ['rightArm'],
      G2: ['rightArm'],
      G3: ['rightArm'],
      G4: ['rightArm'],
    };
    armHeavy.armor.rightArm = 35;
    armHeavy.armor.torsoFront = 180;
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
      },
      {
        id: 'enemy_1',
        name: '右腕高火力機',
        teamId: 'T_ENEMY',
        blueprint: armHeavy,
        pilot: makeBasicTrainingPilot(165),
      }
    );
  } else if (missionId === 'p2_4_crit_combo') {
    const toughArmorTarget = makeTrainingTargetMech(PRESET_ABC, 0.55, '重構造訓練機', {
      rightShoulderWeapon: 'medium_laser',
      leftShoulderWeapon: 'shd_none',
    });
    toughArmorTarget.weaponGroups = {
      G1: ['rightShoulder'],
      G2: ['rightShoulder'],
      G3: ['rightShoulder'],
      G4: ['rightShoulder'],
    };
    toughArmorTarget.armor.torsoFront = 95;
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 300, y: 420, yaw: 0 },
      },
      {
        id: 'enemy_1',
        name: '重構造訓練機',
        teamId: 'T_ENEMY',
        blueprint: toughArmorTarget,
        pilot: makeBasicTrainingPilot(140),
        spawnOverride: { x: 300, y: 240, yaw: 180 },
      }
    );
  } else if (missionId === 'p2_5_garage_rebuild') {
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
      },
      {
        id: 'enemy_1',
        name: 'ガレージ検定機',
        teamId: 'T_ENEMY',
        blueprint: makeTrainingTargetMech(PRESET_ABL, 0.5, 'ガレージ検定機'),
        pilot: makeBasicTrainingPilot(175),
      }
    );
  } else if (missionId === 'p2_6_range_control') {
    const ac20Brawler = makeTrainingTargetMech(PRESET_ABH, 0.72, 'AC20重近接機', {
      rightArmWeapon: 'arm_none',
      leftArmWeapon: 'arm_none',
      rightShoulderWeapon: 'ac20',
      leftShoulderWeapon: 'shd_none',
    });
    ac20Brawler.weaponGroups = {
      G1: ['rightShoulder'],
      G2: ['rightShoulder'],
      G3: ['rightShoulder'],
      G4: ['rightShoulder'],
    };
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 300, y: 460, yaw: 0 },
      },
      {
        id: 'enemy_1',
        name: 'AC20重近接機',
        teamId: 'T_ENEMY',
        blueprint: ac20Brawler,
        pilot: makeBasicTrainingPilot(95),
        spawnOverride: { x: 300, y: 200, yaw: 180 },
      }
    );
  } else if (missionId === 'p2_7_indirect_lrm') {
    // Ally spotter sees enemy behind twin_mesas central spire (x=300, y=300)
    const spotter = makeTrainingTargetMech(PRESET_ABL, 0.85, '前衛観測スカウト', {
      rightShoulderWeapon: 'bap_probe',
      leftShoulderWeapon: 'shd_none',
    });
    spotter.weaponGroups = { G1: [], G2: [], G3: [], G4: [] };
    const coverTarget = makeTrainingTargetMech(PRESET_ABC, 0.42, '遮蔽裏固定砲台', {
      rightShoulderWeapon: 'small_laser',
      leftShoulderWeapon: 'shd_none',
    });
    coverTarget.weaponGroups = { G1: ['rightShoulder'], G2: [], G3: [], G4: [] };
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
        spawnOverride: { x: 300, y: 485, yaw: 0 },
      },
      {
        id: 'ally_spotter',
        name: '前衛観測スカウト',
        teamId: 'T_PLAYER',
        blueprint: spotter,
        pilot: {
          version: 2,
          id: 'pilot_spotter_hold',
          name: '観測待機AI',
          grid: {
            gridSize: 6,
            cells: [
              { row: 0, col: 0, op: 'start', dir: 'S' },
              { row: 1, col: 0, op: 'call_s3', dir: 'S', target: 'main', param: 220, durationSec: 0.7 },
            ],
          },
        },
        spawnOverride: { x: 465, y: 180, yaw: 260 },
      },
      {
        id: 'enemy_cover',
        name: '遮蔽裏標的',
        teamId: 'T_ENEMY',
        blueprint: coverTarget,
        pilot: makeStationaryTargetPilot(),
        spawnOverride: { x: 300, y: 120, yaw: 180 },
      }
    );
  } else if (missionId === 'p2_8_ams_defense') {
    const lrmBoat = makeTrainingTargetMech(PRESET_ABC, 0.48, 'LRM弾幕試験機', {
      rightShoulderWeapon: 'lrm10',
      leftShoulderWeapon: 'lrm10',
    });
    lrmBoat.weaponGroups = {
      G1: ['rightShoulder'],
      G2: ['leftShoulder'],
      G3: ['rightShoulder'],
      G4: ['rightShoulder', 'leftShoulder'],
    };
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
      },
      {
        id: 'enemy_1',
        name: 'LRM弾幕試験機',
        teamId: 'T_ENEMY',
        blueprint: lrmBoat,
        pilot: makeBasicTrainingPilot(340),
      }
    );
  } else if (missionId === 'p2_9_ecm_hunter') {
    const ecmScout = makeTrainingTargetMech(PRESET_ABL, 0.45, 'ECMステルス機', {
      rightShoulderWeapon: 'medium_laser',
      leftShoulderWeapon: 'ecm_suite',
      ecmEnabled: true,
    });
    ecmScout.weaponGroups = {
      G1: ['rightShoulder'],
      G2: ['rightShoulder'],
      G3: ['rightShoulder'],
      G4: ['rightShoulder'],
    };
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
      },
      {
        id: 'enemy_1',
        name: 'ECMステルス機',
        teamId: 'T_ENEMY',
        blueprint: ecmScout,
        pilot: makeBasicTrainingPilot(190),
      }
    );
  } else if (missionId === 'p2_10_pilot_transfer') {
    // Primary match runs on PRESET_ABL; secondary check runs on PRESET_ABH
    const ablClone = structuredClone(PRESET_ABL);
    ablClone.controlTier = 'pilot_full';
    const transferTargetL = makeTrainingTargetMech(PRESET_ABC, 0.35, '乗換試験標的', {
      rightShoulderWeapon: 'medium_laser',
      leftShoulderWeapon: 'shd_none',
    });
    transferTargetL.weaponGroups = {
      G1: ['rightShoulder'],
      G2: ['rightShoulder'],
      G3: ['rightShoulder'],
      G4: ['rightShoulder'],
    };
    entries.push(
      {
        id: 'player',
        name: '乗換試験機 LLB',
        teamId: 'T_PLAYER',
        blueprint: ablClone,
        pilot: playerPilot,
      },
      {
        id: 'enemy_1',
        name: '乗換試験標的',
        teamId: 'T_ENEMY',
        blueprint: transferTargetL,
        pilot: makeBasicTrainingPilot(185),
      }
    );
  } else if (missionId === 'p2_11_squad_180t' || missionId === 'p2_12_graduation_match') {
    const scale = missionId === 'p2_12_graduation_match' ? 0.56 : 0.45;
    entries.push(
      {
        id: 'player',
        name: playerMech.name,
        teamId: 'T_PLAYER',
        blueprint: playerMech,
        pilot: playerPilot,
      },
      {
        id: 'ally_1',
        name: '僚機 LLB (35t)',
        teamId: 'T_PLAYER',
        blueprint: PRESET_ABL,
        pilot: PILOT_BASIC_LIGHT,
      },
      {
        id: 'ally_2',
        name: '僚機 ABC (55t)',
        teamId: 'T_PLAYER',
        blueprint: PRESET_ABC,
        pilot: PILOT_BASIC,
      },
      {
        id: 'enemy_1',
        name: '敵軽戦 LLB',
        teamId: 'T_ENEMY',
        blueprint: makeTrainingTargetMech(PRESET_ABL, scale, '敵軽戦 LLB'),
        pilot: makeBasicTrainingPilot(130),
      },
      {
        id: 'enemy_2',
        name: '敵中戦 ABC',
        teamId: 'T_ENEMY',
        blueprint: makeTrainingTargetMech(PRESET_ABC, scale, '敵中戦 ABC'),
        pilot: makeBasicTrainingPilot(200),
      },
      {
        id: 'enemy_3',
        name: '敵重戦 XHD',
        teamId: 'T_ENEMY',
        blueprint: makeTrainingTargetMech(PRESET_ABH, scale * 0.9, '敵重戦 XHD', {
          rightShoulderWeapon: 'large_laser',
          leftShoulderWeapon: 'shd_none',
        }),
        pilot: makeBasicTrainingPilot(210),
      }
    );
  }

  const replay: ReplayPackageData = {
    title: spec.title,
    recordedAt: new Date().toISOString(),
    matchSeed: spec.seed,
    rules: {
      maxSeconds: spec.maxSeconds,
      friendlyFire: false,
      headDestructionKills: true,
      arenaPreset: spec.arenaPreset,
      arenaWidth: 600,
      arenaDepth: 600,
    },
    participants: entries.map((e) => ({
      id: e.id,
      name: e.name,
      teamId: e.teamId,
      mech: e.blueprint,
      pilot: e.pilot ?? DEFAULT_PILOT_PROFILE,
      ...(e.isBalloon ? { isBalloon: true } : {}),
      ...(typeof e.balloonHp === 'number' ? { balloonHp: e.balloonHp } : {}),
      ...(e.spawnOverride ? { spawnOverride: e.spawnOverride } : {}),
    })),
    ...(captureZones.length > 0 ? { captureZones } : {}),
  };

  return {
    spec,
    entries,
    captureZones,
    replay,
  };
}

export function verifyCurriculumMission(
  missionId: CurriculumStepId,
  playerMech: MechBlueprint,
  playerPilot: PilotProfile
): CurriculumVerifyResult {
  const scenario = buildCurriculumMissionScenario(missionId, playerMech, playerPilot);
  const { spec, entries, captureZones, replay } = scenario;
  const stats = computeMechStats(playerMech);
  const checklist: CurriculumCheckItem[] = [];

  checklist.push({
    label: '機体が積載・装甲上限内で有効である',
    ok: stats.valid,
  });

  const pilotCells = playerPilot.grid?.cells ?? [];
  const distinctCalls = new Set(
    pilotCells.filter((c) => c.op.startsWith('call_s')).map((c) => c.op)
  );
  const s1Active = getActiveS1Cells(playerMech);
  const allSubCells = (playerMech.subroutines ?? []).flatMap((s) => s.cells ?? []);

  // Static structural & concept checks per mission
  switch (missionId) {
    case 'p1_1_capture_walk':
      checklist.push({
        label: 'S1 (4×4) に前進命令 (`move_approach`) が組み込まれている',
        ok: s1Active.some((c) => c.op === 'move_approach'),
      });
      break;
    case 'p1_2_balloon_pop':
    case 'p1_3_debug_order':
      checklist.push({
        label: 'S1 (4×4) に移動・腰追尾・射撃を含む 3 マス以上が組まれている',
        ok:
          s1Active.length >= 3 &&
          s1Active.some((c) => c.op.startsWith('move_') && c.op !== 'move_stop') &&
          s1Active.some((c) => c.op === 'torso_track') &&
          s1Active.some((c) => c.op.startsWith('fire_')),
      });
      break;
    case 'p1_4_range_branch':
      checklist.push({
        label: 'S1 (4×4) に距離/条件分岐 (`if_*`) を用いた武器切替がある',
        ok: s1Active.some((c) => c.op.startsWith('if_')) && s1Active.length >= 4,
      });
      break;
    case 'p1_5_jump_wall':
      checklist.push({
        label: 'S1 (4×4) に `if_obstacle_ahead` と `move_jump` が組み込まれている',
        ok:
          s1Active.some((c) => c.op === 'if_obstacle_ahead') &&
          s1Active.some((c) => c.op === 'move_jump'),
      });
      break;
    case 'p1_6_moving_balloons':
      checklist.push({
        label: 'S1 (4×4) に視界判定 (`if_enemy_in_sight`) と追尾・射撃がある',
        ok:
          s1Active.some((c) => c.op === 'if_enemy_in_sight') &&
          s1Active.some((c) => c.op === 'torso_track') &&
          s1Active.some((c) => c.op.startsWith('fire_')),
      });
      break;
    case 'p1_7_rapid_loop':
      checklist.push({
        label: 'S1 から固定待機 (`wait`) を除き、射撃可否分岐ループを組んでいる',
        ok:
          !s1Active.some((c) => c.op === 'wait') &&
          s1Active.some((c) => c.op.startsWith('if_')) &&
          s1Active.some((c) => c.op.startsWith('fire_')),
      });
      break;
    case 'p1_8_heat_hysteresis':
      checklist.push({
        label: 'S1 に熱分岐 (`if_heat_above` 等) と `emergency_cool` による冷却ループがある',
        ok:
          s1Active.some((c) => c.op === 'if_heat_above') &&
          s1Active.some((c) => c.op === 'emergency_cool') &&
          !s1Active.some((c) => c.op === 'override_on'),
      });
      break;
    case 'p1_9_zone_and_pop':
      checklist.push({
        label: 'S1 に距離判定 (`if_enemy_dist_lt` 等) と停止占領 (`move_stop`) がある',
        ok:
          s1Active.some((c) => c.op === 'if_enemy_dist_lt' || c.op === 'if_enemy_dist_gt') &&
          s1Active.some((c) => c.op === 'move_stop'),
      });
      break;
    case 'p1_10_pilot_6x6':
    case 'p1_12_part1_exam':
      checklist.push({
        label: 'パイロット 6×6 で 2 種類以上のサブルーチン (`CALL S*`) を呼び分けている',
        ok: distinctCalls.size >= 2,
      });
      break;
    case 'p1_11_subroutine_arg': {
      const hasUseArg = allSubCells.some((c) => Boolean(c.useArg));
      const argParams = new Set(
        pilotCells
          .filter((c) => c.op.startsWith('call_s') && typeof c.param === 'number')
          .map((c) => c.param)
      );
      checklist.push({
        label: 'サブルーチン内で `ARG使用` を有効化し、パイロットから異なる引数を渡している',
        ok: hasUseArg && argParams.size >= 2,
      });
      break;
    }
    case 'p2_1_flank_rear':
      checklist.push({
        label: 'サブルーチン内に旋回移動 (`move_circle`) が組み込まれている',
        ok: allSubCells.some((c) => c.op === 'move_circle'),
      });
      break;
    case 'p2_2_leg_sweep':
      checklist.push({
        label: '射撃マスの狙点が `legs (脚)` に設定されている',
        ok: allSubCells.some((c) => c.op.startsWith('fire_') && c.aimPoint === 'legs'),
      });
      break;
    case 'p2_3_arm_shield':
      checklist.push({
        label: '`if_right_armor_weaker` ＋ 腰ひねり防御と狙点 `arms (腕)` を組んでいる',
        ok:
          allSubCells.some((c) => c.op === 'if_right_armor_weaker') &&
          allSubCells.some((c) => c.op === 'torso_twist_l' || c.op === 'torso_twist_r') &&
          allSubCells.some((c) => c.op.startsWith('fire_') && c.aimPoint === 'arms'),
      });
      break;
    case 'p2_4_crit_combo': {
      const weps = [
        playerMech.parts.rightArmWeapon,
        playerMech.parts.leftArmWeapon,
        playerMech.parts.rightShoulderWeapon,
        playerMech.parts.leftShoulderWeapon,
      ];
      const hasCritWep = weps.includes('mg_light') || weps.includes('lbx_shotgun');
      const hasStripWep = weps.some((w) => {
        const s = getWeaponSpec(w);
        return s.kind === 'laser' || w === 'ppc';
      });
      const calledSlots = new Set(
        pilotCells
          .filter((c) => c.op.startsWith('call_s'))
          .map((c) => c.op.replace('call_s', 'S'))
      );
      const activeSubCells = (playerMech.subroutines ?? [])
        .filter((s) => calledSlots.has(s.slotId))
        .flatMap((s) => s.cells ?? []);
      const firesBoth =
        activeSubCells.some((c) => c.op === 'fire_alpha') ||
        new Set(activeSubCells.filter((c) => c.op.startsWith('fire_')).map((c) => c.op)).size >= 2;
      checklist.push({
        label: '外装削り用レーザー等と `mg_light` / `lbx_shotgun` を併用して両方発射している',
        ok: hasCritWep && hasStripWep && firesBoth,
      });
      break;
    }
    case 'p2_5_garage_rebuild':
      checklist.push({
        label: '中央胴の前装甲が後装甲より厚く、追加ヒートシンク ≥ 1 になっている',
        ok:
          playerMech.armor.torsoFront > playerMech.armor.torsoRear &&
          (playerMech.extraHeatSinks ?? 0) >= 1,
      });
      break;
    case 'p2_6_range_control': {
      const calledSlots = new Set(
        pilotCells
          .filter((c) => c.op.startsWith('call_s'))
          .map((c) => c.op.replace('call_s', 'S'))
      );
      const calledSubCells = (playerMech.subroutines ?? [])
        .filter((s) => calledSlots.has(s.slotId))
        .flatMap((s) => s.cells ?? []);
      checklist.push({
        label: '距離維持 (`move_maintain`) または後退 (`move_retreat`) でアウトレンジ制御している',
        ok: calledSubCells.some((c) => c.op === 'move_maintain' || c.op === 'move_retreat'),
      });
      break;
    }
    case 'p2_7_indirect_lrm':
      checklist.push({
        label: 'LRM 装備およびロック完了分岐 (`if_target_locked`) が組み込まれている',
        ok:
          [playerMech.parts.rightShoulderWeapon, playerMech.parts.leftShoulderWeapon].some((w) =>
            w.startsWith('lrm')
          ) && allSubCells.some((c) => c.op === 'if_target_locked'),
      });
      break;
    case 'p2_8_ams_defense': {
      const hasAms = [
        playerMech.parts.rightShoulderWeapon,
        playerMech.parts.leftShoulderWeapon,
      ].some((w) => Boolean(getWeaponSpec(w).providesAms));
      checklist.push({
        label: 'AMS を装備し、パイロットに `if_incoming_missile` 回避分岐がある',
        ok: hasAms && pilotCells.some((c) => c.op === 'if_incoming_missile'),
      });
      break;
    }
    case 'p2_9_ecm_hunter': {
      const equipped = [
        playerMech.parts.rightArmWeapon,
        playerMech.parts.leftArmWeapon,
        playerMech.parts.rightShoulderWeapon,
        playerMech.parts.leftShoulderWeapon,
      ];
      const hasBapOrPpc = equipped.some(
        (w) => w === 'ppc' || Boolean(getWeaponSpec(w).providesBap)
      );
      checklist.push({
        label: 'BAP 探知モジュールまたは `ppc` (EMP) を搭載している',
        ok: hasBapOrPpc,
      });
      break;
    }
    case 'p2_10_pilot_transfer':
      checklist.push({
        label: '汎用パイロット 6×6 に 2 種類以上のサブルーチン呼出しがある',
        ok: distinctCalls.size >= 2,
      });
      break;
    case 'p2_11_squad_180t':
    case 'p2_12_graduation_match':
      checklist.push({
        label: '3機合計 180t 規制内に収まっている（僚機 35t+55t と合わせて自機 ≤ 90t）',
        ok: stats.totalWeight <= 90,
      });
      checklist.push({
        label: 'パイロット 6×6 で 3 種類以上のサブルーチンを呼び分けている',
        ok: distinctCalls.size >= 3,
      });
      break;
  }

  const sim = createSimulation({
    seed: spec.seed,
    rules: replay.rules,
    entries,
    ...(captureZones.length > 0 ? { captureZones } : {}),
  });
  const runtimes = Object.fromEntries(
    entries.map((e) => [e.id, createPilotRuntimeState(e.pilot ?? DEFAULT_PILOT_PROFILE)])
  );
  const profiles = Object.fromEntries(
    entries.map((e) => [e.id, e.pilot ?? DEFAULT_PILOT_PROFILE])
  );

  const maxTicks = Math.ceil(spec.maxSeconds * SIM_TPS) + 5;
  for (let t = 0; t < maxTicks && !sim.finished; t++) {
    const controls: Record<string, MechControlInput> = {};
    for (const mech of sim.mechs) {
      if (!mech.alive) continue;
      const sensor = buildMechSensorState(sim, mech.id);
      const out = evaluatePilotTick(profiles[mech.id], runtimes[mech.id], sensor, mech, sim);
      controls[mech.id] = out.control;
    }
    stepSimulation(sim, controls);
  }

  // Runtime post-match checks
  if (missionId === 'p1_8_heat_hysteresis') {
    const hadHeatIssue = sim.events.some(
      (e) =>
        e.actorId === 'player' &&
        (e.type === 'thermal_shutdown' || e.type === 'heat_damage')
    );
    checklist.push({
      label: '熱シャットダウン・過熱ダメージ 0 回で戦い抜いた',
      ok: !hadHeatIssue,
    });
  } else if (missionId === 'p2_2_leg_sweep') {
    const brokeLeg = sim.events.some(
      (e) =>
        e.type === 'part_destroyed' &&
        e.targetId === 'enemy_1' &&
        (e.partId === 'rightLeg' || e.partId === 'leftLeg')
    );
    checklist.push({
      label: '実際に敵機の脚部 (`rightLeg` / `leftLeg`) を破壊した',
      ok: brokeLeg,
    });
  } else if (missionId === 'p2_10_pilot_transfer') {
    // Also run a real match on PRESET_ABH to prove the pilot works across weight classes
    const abhClone = structuredClone(PRESET_ABH);
    abhClone.controlTier = 'pilot_full';
    const transferTargetH = makeTrainingTargetMech(PRESET_ABC, 0.28, '重量乗換試験標的', {
      rightShoulderWeapon: 'medium_laser',
      leftShoulderWeapon: 'shd_none',
    });
    transferTargetH.weaponGroups = {
      G1: ['rightShoulder'],
      G2: ['rightShoulder'],
      G3: ['rightShoulder'],
      G4: ['rightShoulder'],
    };
    const ePilotH = makeBasicTrainingPilot(170);
    const heavySim = createSimulation({
      seed: spec.seed + 11,
      rules: { maxSeconds: 180, arenaPreset: spec.arenaPreset, arenaWidth: 600, arenaDepth: 600 },
      entries: [
        {
          id: 'tx_player',
          name: '乗換機 XHD',
          teamId: 'T_PLAYER',
          blueprint: abhClone,
          pilot: playerPilot,
          spawnOverride: { x: 300, y: 420, yaw: 0 },
        },
        {
          id: 'tx_enemy',
          name: '重量乗換試験標的',
          teamId: 'T_ENEMY',
          blueprint: transferTargetH,
          pilot: ePilotH,
          spawnOverride: { x: 300, y: 200, yaw: 180 },
        },
      ],
    });
    const rtP = createPilotRuntimeState(playerPilot);
    const rtE = createPilotRuntimeState(ePilotH);
    for (let t = 0; t < 180 * SIM_TPS && !heavySim.finished; t++) {
      const m0 = heavySim.mechs[0];
      const m1 = heavySim.mechs[1];
      const ctrls: Record<string, MechControlInput> = {};
      if (m0.alive) {
        ctrls[m0.id] = evaluatePilotTick(playerPilot, rtP, buildMechSensorState(heavySim, m0.id), m0, heavySim).control;
      }
      if (m1.alive) {
        ctrls[m1.id] = evaluatePilotTick(ePilotH, rtE, buildMechSensorState(heavySim, m1.id), m1, heavySim).control;
      }
      stepSimulation(heavySim, ctrls);
    }
    checklist.push({
      label: '重量機 (XHD) への乗り換え戦でも勝利した',
      ok: heavySim.winnerTeamId === 'T_PLAYER',
    });
  }

  if (entries.some((e) => e.isBalloon)) {
    const allBalloonsCleared = !sim.mechs.some((m) => m.teamId !== 'T_PLAYER' && m.alive);
    checklist.push({
      label: 'すべての標的バルーンを時間内に撃破した',
      ok: allBalloonsCleared,
    });
  }

  if (captureZones.length > 0) {
    const allCap = Boolean(sim.captureZones?.every((z) => z.captured));
    checklist.push({
      label: 'すべての陣とりマスを 100% 確保した',
      ok: allCap,
    });
  }

  checklist.push({
    label: '指定シードの模擬戦に勝利した',
    ok: sim.winnerTeamId === 'T_PLAYER',
  });

  const passed = checklist.every((c) => c.ok);
  const commentary = buildBattleCommentary(sim, {
    T_PLAYER: 'プレイヤー側',
    T_ENEMY: '演習標的',
  });

  return {
    missionId,
    passed,
    checklist,
    summaryText: commentary.summaryText,
    durationSec: sim.time,
    replay,
  };
}

// Keep unused preset symbol silence check clean
void PILOT_BASIC_HEAVY;
