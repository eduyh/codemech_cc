import {
  MECH_SUBROUTINE_SLOT_SPECS,
  MechBlueprint,
  MechSubroutine,
  PilotProfile,
} from '../types/mech';

type SubArchetype = 'balanced' | 'skirmish' | 'fortress' | 'sniper' | 'berserker';

function buildCleanS1(desiredRange: number, withCircle = false): MechSubroutine {
  return {
    slotId: 'S1',
    name: withCircle ? '周回交戦・ツイスト' : '主交戦・ツイスト防御',
    gridSize: 6,
    cells: [
      { row: 0, col: 0, op: 'start', dir: 'E' },
      {
        row: 0,
        col: 1,
        op: withCircle ? 'move_circle' : 'move_maintain',
        dir: 'E',
        param: desiredRange,
      },
      { row: 0, col: 2, op: 'torso_track', dir: 'S' },
      { row: 1, col: 2, op: 'if_group_1_ready', dir: 'E', elseDir: 'S' },
      { row: 1, col: 3, op: 'fire_group_1', dir: 'E', durationSec: 0.45 },
      { row: 1, col: 4, op: 'if_heat_below', dir: 'E', elseDir: 'S', param: 76 },
      { row: 1, col: 5, op: 'fire_group_4', dir: 'S', durationSec: 0.35 },
      { row: 2, col: 5, op: 'wait', dir: 'S', durationSec: 0.15 },
      { row: 2, col: 4, op: 'return', dir: 'S' },
      { row: 2, col: 2, op: 'if_group_2_ready', dir: 'E', elseDir: 'S' },
      { row: 2, col: 3, op: 'fire_group_2', dir: 'S', durationSec: 0.45 },
      { row: 3, col: 2, op: 'if_incoming_fire', dir: 'E', elseDir: 'S' },
      { row: 3, col: 3, op: 'torso_twist_auto', dir: 'E' },
      { row: 3, col: 4, op: 'wait', dir: 'S', durationSec: 0.35 },
      { row: 4, col: 2, op: 'wait', dir: 'S', durationSec: 0.2 },
    ],
  };
}

function buildArchetypeS2(archetype: SubArchetype): MechSubroutine {
  if (archetype === 'sniper') {
    return {
      slotId: 'S2',
      name: '曲射・高台狙撃 (6×6)',
      gridSize: 6,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_high_ground', dir: 'E' },
        { row: 0, col: 2, op: 'torso_track', dir: 'S' },
        { row: 1, col: 2, op: 'if_enemy_dist_lt', dir: 'E', elseDir: 'S', param: 115 },
        { row: 1, col: 3, op: 'move_retreat', dir: 'E' },
        { row: 1, col: 4, op: 'fire_group_3', dir: 'S', durationSec: 0.4 },
        { row: 2, col: 2, op: 'if_group_2_ready', dir: 'E', elseDir: 'S' },
        { row: 2, col: 3, op: 'fire_group_2', dir: 'S', durationSec: 0.45 },
        { row: 3, col: 2, op: 'if_group_1_ready', dir: 'E', elseDir: 'S' },
        { row: 3, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
        { row: 4, col: 2, op: 'wait', dir: 'S', durationSec: 0.25 },
      ],
    };
  }

  if (archetype === 'skirmish' || archetype === 'berserker') {
    return {
      slotId: 'S2',
      name: '跳躍一斉強襲 (6×6)',
      gridSize: 6,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'if_airborne', dir: 'S', elseDir: 'E' },
        { row: 0, col: 2, op: 'move_jump', dir: 'S' },
        { row: 1, col: 2, op: 'torso_track', dir: 'W' },
        { row: 1, col: 1, op: 'move_approach', dir: 'S' },
        { row: 2, col: 1, op: 'fire_alpha', dir: 'E', durationSec: 0.45 },
        { row: 2, col: 2, op: 'torso_twist_auto', dir: 'E' },
        { row: 2, col: 3, op: 'wait', dir: 'S', durationSec: 0.35 },
      ],
    };
  }

  if (archetype === 'fortress') {
    return {
      slotId: 'S2',
      name: '重装ツイスト斉射 (6×6)',
      gridSize: 6,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_stop', dir: 'E' },
        { row: 0, col: 2, op: 'if_right_armor_weaker', dir: 'E', elseDir: 'S' },
        { row: 0, col: 3, op: 'torso_twist_angle', dir: 'S', param: 55 },
        { row: 1, col: 3, op: 'wait', dir: 'S', durationSec: 0.35 },
        { row: 1, col: 2, op: 'torso_twist_angle', dir: 'S', param: -55 },
        { row: 2, col: 2, op: 'wait', dir: 'E', durationSec: 0.3 },
        { row: 2, col: 3, op: 'torso_track', dir: 'E' },
        { row: 2, col: 4, op: 'fire_group_4', dir: 'E', durationSec: 0.4 },
        { row: 2, col: 5, op: 'fire_group_2', dir: 'S', durationSec: 0.4 },
      ],
    };
  }

  // balanced
  return {
    slotId: 'S2',
    name: '予備兵装・ツイスト反撃 (6×6)',
    gridSize: 6,
    cells: [
      { row: 0, col: 0, op: 'start', dir: 'E' },
      { row: 0, col: 1, op: 'move_maintain', dir: 'E', param: 150 },
      { row: 0, col: 2, op: 'torso_track', dir: 'S' },
      { row: 1, col: 2, op: 'if_group_4_ready', dir: 'E', elseDir: 'S' },
      { row: 1, col: 3, op: 'fire_group_4', dir: 'S', durationSec: 0.45 },
      { row: 2, col: 2, op: 'if_group_2_ready', dir: 'E', elseDir: 'S' },
      { row: 2, col: 3, op: 'fire_group_2', dir: 'S', durationSec: 0.45 },
      { row: 3, col: 2, op: 'if_group_3_ready', dir: 'E', elseDir: 'S' },
      { row: 3, col: 3, op: 'fire_group_3', dir: 'S', durationSec: 0.45 },
      { row: 4, col: 2, op: 'torso_twist_auto', dir: 'E' },
      { row: 4, col: 3, op: 'wait', dir: 'S', durationSec: 0.35 },
    ],
  };
}

function buildDefaultSubroutines(
  archetype: SubArchetype,
  desiredRange: number
): MechSubroutine[] {
  const withCircle = archetype === 'skirmish' || archetype === 'berserker';
  return [
    buildCleanS1(desiredRange, withCircle),
    buildArchetypeS2(archetype),
    {
      slotId: 'S3',
      name: '索敵・高台曲射 (4×4)',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_high_ground', dir: 'E' },
        { row: 0, col: 2, op: 'torso_track', dir: 'S' },
        { row: 1, col: 2, op: 'if_group_2_ready', dir: 'E', elseDir: 'S' },
        { row: 1, col: 3, op: 'fire_group_2', dir: 'S', durationSec: 0.4 },
        { row: 2, col: 2, op: 'wait', dir: 'S', durationSec: 0.4 },
      ],
    },
    {
      slotId: 'S4',
      name: '冷却・回避防御 (4×4)',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'if_incoming_fire', dir: 'E', elseDir: 'S' },
        { row: 0, col: 2, op: 'move_evade', dir: 'E', direction: 'auto' },
        { row: 0, col: 3, op: 'torso_twist_auto', dir: 'S' },
        { row: 1, col: 3, op: 'wait', dir: 'S', durationSec: 0.45 },
        { row: 1, col: 1, op: 'emergency_cool', dir: 'S', durationSec: 0.55 },
      ],
    },
    {
      slotId: 'S5',
      name: '近接・側面迎撃 (4×4)',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        {
          row: 0,
          col: 1,
          op: archetype === 'sniper' ? 'move_retreat' : 'move_approach',
          dir: 'E',
        },
        { row: 0, col: 2, op: 'torso_track', dir: 'S' },
        { row: 1, col: 2, op: 'if_group_4_ready', dir: 'E', elseDir: 'S' },
        { row: 1, col: 3, op: 'fire_group_4', dir: 'S', durationSec: 0.4 },
        { row: 2, col: 2, op: 'fire_group_3', dir: 'S', durationSec: 0.4 },
      ],
    },
  ];
}

export function createEmptySubroutines(): MechSubroutine[] {
  return MECH_SUBROUTINE_SLOT_SPECS.map((spec) => ({
    slotId: spec.slotId,
    name: spec.defaultName,
    gridSize: spec.gridSize,
    cells: [{ row: 0, col: 0, op: 'start', dir: 'E' }],
  }));
}

export const PRESET_VANGUARD: MechBlueprint = {
  version: 2,
  id: 'preset_vanguard',
  name: 'CM-01 ヴァンガード',
  authorName: 'CodeMech Official',
  color: '#06b6d4',
  chassisId: 'chassis_vanguard',
  boosterEnabled: true,
  extraHeatSinks: 1,
  parts: {
    head: 'head_std',
    torso: 'torso_std',
    rightShoulderMount: 'shd_std',
    leftShoulderMount: 'shd_std',
    rightArmWeapon: 'ac5',
    leftArmWeapon: 'medium_laser',
    rightShoulderWeapon: 'lrm5',
    leftShoulderWeapon: 'shd_none',
    legs: 'legs_biped_std',
    booster: 'boost_std',
  },
  weaponGroups: {
    G1: ['rightArm', 'leftArm'],
    G2: ['rightShoulder'],
    G3: ['rightArm'],
    G4: ['leftArm'],
  },
  armor: {
    head: 60,
    torsoFront: 250,
    torsoRear: 110,
    rightShoulderFront: 130,
    rightShoulderRear: 60,
    leftShoulderFront: 130,
    leftShoulderRear: 60,
    rightArm: 110,
    leftArm: 110,
    rightLeg: 130,
    leftLeg: 130,
  },
  subroutines: buildDefaultSubroutines('balanced', 170),
};

export const PRESET_STRIKER: MechBlueprint = {
  version: 2,
  id: 'preset_striker',
  name: 'CM-02 ストライカー',
  authorName: 'CodeMech Official',
  color: '#22c55e',
  chassisId: 'chassis_striker',
  boosterEnabled: true,
  extraHeatSinks: 0,
  parts: {
    head: 'head_std',
    torso: 'torso_light',
    rightShoulderMount: 'shd_light',
    leftShoulderMount: 'shd_light',
    rightArmWeapon: 'mg_light',
    leftArmWeapon: 'small_laser',
    rightShoulderWeapon: 'srm_rocket',
    leftShoulderWeapon: 'shd_none',
    legs: 'legs_reverse_agile',
    booster: 'boost_high_thrust',
  },
  weaponGroups: {
    G1: ['rightArm', 'leftArm'],
    G2: ['rightShoulder'],
    G3: ['rightArm'],
    G4: ['leftArm', 'rightShoulder'],
  },
  armor: {
    head: 45,
    torsoFront: 180,
    torsoRear: 75,
    rightShoulderFront: 80,
    rightShoulderRear: 40,
    leftShoulderFront: 80,
    leftShoulderRear: 40,
    rightArm: 70,
    leftArm: 70,
    rightLeg: 80,
    leftLeg: 80,
  },
  subroutines: buildDefaultSubroutines('skirmish', 105),
};

export const PRESET_FORTRESS: MechBlueprint = {
  version: 2,
  id: 'preset_fortress',
  name: 'CM-03 フォートレス',
  authorName: 'CodeMech Official',
  color: '#f59e0b',
  chassisId: 'chassis_fortress',
  boosterEnabled: false,
  extraHeatSinks: 2,
  parts: {
    head: 'head_armored',
    torso: 'torso_heavy',
    rightShoulderMount: 'shd_heavy',
    leftShoulderMount: 'shd_heavy',
    rightArmWeapon: 'ac10',
    leftArmWeapon: 'medium_laser',
    rightShoulderWeapon: 'lrm10',
    leftShoulderWeapon: 'large_laser',
    legs: 'legs_heavy_quad',
    booster: 'boost_none',
  },
  weaponGroups: {
    G1: ['rightArm', 'leftShoulder'],
    G2: ['rightShoulder'],
    G3: ['rightArm', 'leftArm'],
    G4: ['leftArm', 'leftShoulder'],
  },
  armor: {
    head: 110,
    torsoFront: 500,
    torsoRear: 190,
    rightShoulderFront: 230,
    rightShoulderRear: 100,
    leftShoulderFront: 230,
    leftShoulderRear: 100,
    rightArm: 190,
    leftArm: 290,
    rightLeg: 330,
    leftLeg: 330,
  },
  subroutines: buildDefaultSubroutines('fortress', 190),
};

export const PRESET_SNIPER: MechBlueprint = {
  version: 2,
  id: 'preset_sniper',
  name: 'CM-04 ホークアイ',
  authorName: 'CodeMech Official',
  color: '#a855f7',
  chassisId: 'chassis_hawkeye',
  boosterEnabled: false,
  extraHeatSinks: 1,
  parts: {
    head: 'head_recon',
    torso: 'torso_light',
    rightShoulderMount: 'shd_std',
    leftShoulderMount: 'shd_light',
    rightArmWeapon: 'gauss_rifle',
    leftArmWeapon: 'medium_laser',
    rightShoulderWeapon: 'lrm5',
    leftShoulderWeapon: 'shd_none',
    legs: 'legs_hover',
    booster: 'boost_none',
  },
  weaponGroups: {
    G1: ['rightArm'],
    G2: ['rightShoulder'],
    G3: ['leftArm'],
    G4: ['rightArm', 'leftArm'],
  },
  armor: {
    head: 60,
    torsoFront: 300,
    torsoRear: 120,
    rightShoulderFront: 150,
    rightShoulderRear: 70,
    leftShoulderFront: 140,
    leftShoulderRear: 70,
    rightArm: 120,
    leftArm: 120,
    rightLeg: 150,
    leftLeg: 150,
  },
  subroutines: buildDefaultSubroutines('sniper', 260),
};

export const PRESET_TEMPEST: MechBlueprint = {
  version: 2,
  id: 'preset_tempest',
  name: 'CM-05 テンペスト',
  authorName: 'CodeMech Official',
  color: '#3b82f6',
  chassisId: 'chassis_tempest',
  boosterEnabled: true,
  extraHeatSinks: 2,
  parts: {
    head: 'head_std',
    torso: 'torso_light',
    rightShoulderMount: 'shd_light',
    leftShoulderMount: 'shd_light',
    rightArmWeapon: 'large_laser',
    leftArmWeapon: 'small_laser',
    rightShoulderWeapon: 'streak_srm',
    leftShoulderWeapon: 'shd_none',
    legs: 'legs_hover',
    booster: 'boost_std',
  },
  weaponGroups: {
    G1: ['rightArm', 'leftArm'],
    G2: ['rightShoulder'],
    G3: ['leftArm'],
    G4: ['rightArm', 'leftArm', 'rightShoulder'],
  },
  armor: {
    head: 55,
    torsoFront: 210,
    torsoRear: 90,
    rightShoulderFront: 105,
    rightShoulderRear: 50,
    leftShoulderFront: 105,
    leftShoulderRear: 50,
    rightArm: 95,
    leftArm: 90,
    rightLeg: 100,
    leftLeg: 100,
  },
  subroutines: buildDefaultSubroutines('skirmish', 155),
};

export const PRESET_AEGIS: MechBlueprint = {
  version: 2,
  id: 'preset_aegis',
  name: 'CM-06 イージス',
  authorName: 'CodeMech Official',
  color: '#14b8a6',
  chassisId: 'chassis_aegis',
  boosterEnabled: false,
  extraHeatSinks: 2,
  parts: {
    head: 'head_armored',
    torso: 'torso_std',
    rightShoulderMount: 'shd_std',
    leftShoulderMount: 'shd_std',
    rightArmWeapon: 'ppc',
    leftArmWeapon: 'medium_laser',
    rightShoulderWeapon: 'lrm5',
    leftShoulderWeapon: 'lbx_shotgun',
    legs: 'legs_biped_std',
    booster: 'boost_none',
  },
  weaponGroups: {
    G1: ['rightArm', 'leftArm'],
    G2: ['rightShoulder'],
    G3: ['leftShoulder'],
    G4: ['leftArm', 'leftShoulder'],
  },
  armor: {
    head: 70,
    torsoFront: 300,
    torsoRear: 110,
    rightShoulderFront: 140,
    rightShoulderRear: 60,
    leftShoulderFront: 140,
    leftShoulderRear: 60,
    rightArm: 110,
    leftArm: 190,
    rightLeg: 150,
    leftLeg: 150,
  },
  subroutines: buildDefaultSubroutines('fortress', 175),
};

export const PRESET_VALKYRIE: MechBlueprint = {
  version: 2,
  id: 'preset_valkyrie',
  name: 'CM-07 バルキリー',
  authorName: 'CodeMech Official',
  color: '#ec4899',
  chassisId: 'chassis_valkyrie',
  boosterEnabled: true,
  extraHeatSinks: 1,
  parts: {
    head: 'head_recon',
    torso: 'torso_light',
    rightShoulderMount: 'shd_light',
    leftShoulderMount: 'shd_light',
    rightArmWeapon: 'large_laser',
    leftArmWeapon: 'laser_blade',
    rightShoulderWeapon: 'streak_srm',
    leftShoulderWeapon: 'shd_none',
    legs: 'legs_reverse_agile',
    booster: 'boost_high_thrust',
  },
  weaponGroups: {
    G1: ['rightArm'],
    G2: ['rightShoulder'],
    G3: ['leftArm'],
    G4: ['rightArm', 'rightShoulder'],
  },
  armor: {
    head: 55,
    torsoFront: 240,
    torsoRear: 105,
    rightShoulderFront: 120,
    rightShoulderRear: 55,
    leftShoulderFront: 120,
    leftShoulderRear: 55,
    rightArm: 110,
    leftArm: 110,
    rightLeg: 115,
    leftLeg: 115,
  },
  subroutines: buildDefaultSubroutines('sniper', 210),
};

export const PRESET_BERSERKER: MechBlueprint = {
  version: 2,
  id: 'preset_berserker',
  name: 'CM-08 バーサーカー',
  authorName: 'CodeMech Official',
  color: '#ef4444',
  chassisId: 'chassis_berserker',
  boosterEnabled: true,
  extraHeatSinks: 1,
  parts: {
    head: 'head_armored',
    torso: 'torso_heavy',
    rightShoulderMount: 'shd_heavy',
    leftShoulderMount: 'shd_heavy',
    rightArmWeapon: 'lbx_shotgun',
    leftArmWeapon: 'laser_blade',
    rightShoulderWeapon: 'srm_rocket',
    leftShoulderWeapon: 'srm_rocket',
    legs: 'legs_biped_std',
    booster: 'boost_heavy',
  },
  weaponGroups: {
    G1: ['rightArm', 'rightShoulder', 'leftShoulder'],
    G2: ['rightShoulder', 'leftShoulder'],
    G3: ['leftArm'],
    G4: ['rightArm', 'leftArm'],
  },
  armor: {
    head: 90,
    torsoFront: 420,
    torsoRear: 160,
    rightShoulderFront: 195,
    rightShoulderRear: 90,
    leftShoulderFront: 195,
    leftShoulderRear: 90,
    rightArm: 170,
    leftArm: 200,
    rightLeg: 300,
    leftLeg: 300,
  },
  subroutines: buildDefaultSubroutines('berserker', 90),
};

export const STARTER_MECHS: readonly MechBlueprint[] = [
  PRESET_VANGUARD,
  PRESET_STRIKER,
  PRESET_FORTRESS,
  PRESET_SNIPER,
  PRESET_TEMPEST,
  PRESET_AEGIS,
  PRESET_VALKYRIE,
  PRESET_BERSERKER,
];

/* -------------------------------------------------------------------------- */
/* Layer 1: 4 Starter Pilot 6x6 Strategic Flowcharts                          */
/* -------------------------------------------------------------------------- */

export const DEFAULT_PILOT_PROFILE: PilotProfile = {
  version: 2,
  id: 'pilot_balanced',
  name: '標準戦術パイロット (6×6)',
  authorName: 'CodeMech Official',
  grid: {
    gridSize: 6,
    cells: [
      { row: 0, col: 0, op: 'start', dir: 'S' },
      { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 85 },
      { row: 1, col: 1, op: 'flag_a_on', dir: 'E' },
      { row: 1, col: 2, op: 'call_s4', dir: 'E', target: 'nearest', durationSec: 0.65 },
      { row: 1, col: 3, op: 'if_heat_below', dir: 'E', elseDir: 'W', param: 45 },
      { row: 1, col: 4, op: 'flag_a_off', dir: 'S' },
      { row: 2, col: 0, op: 'if_enemy_flank', dir: 'E', elseDir: 'S', param: 150 },
      { row: 2, col: 1, op: 'call_s5', dir: 'S', target: 'flank', durationSec: 0.6 },
      { row: 3, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
      { row: 3, col: 1, op: 'if_ammo_empty', dir: 'E', elseDir: 'S', weaponSlot: 'rightArm' },
      { row: 3, col: 2, op: 'call_s2', dir: 'S', target: 'main', durationSec: 0.65 },
      { row: 4, col: 1, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.7 },
      { row: 4, col: 0, op: 'if_enemy_on_radar', dir: 'E', elseDir: 'S' },
      { row: 4, col: 2, op: 'wire', dir: 'S' },
      { row: 5, col: 0, op: 'call_s3', dir: 'E', target: 'nearest', durationSec: 0.65 },
    ],
  },
};

export const PILOT_AGGRESSIVE: PilotProfile = {
  version: 2,
  id: 'pilot_aggressive',
  name: '強襲オーバーライドパイロット (6×6)',
  authorName: 'CodeMech Official',
  grid: {
    gridSize: 6,
    cells: [
      { row: 0, col: 0, op: 'start', dir: 'S' },
      { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 92 },
      { row: 1, col: 1, op: 'override_on', dir: 'E' },
      { row: 1, col: 2, op: 'call_s5', dir: 'S', target: 'nearest', durationSec: 0.65 },
      { row: 2, col: 0, op: 'override_off', dir: 'S' },
      { row: 3, col: 0, op: 'if_enemy_dist_lt', dir: 'E', elseDir: 'S', param: 135 },
      { row: 3, col: 1, op: 'call_s2', dir: 'S', target: 'nearest', durationSec: 0.65 },
      { row: 4, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
      { row: 4, col: 1, op: 'call_s1', dir: 'S', target: 'nearest', durationSec: 0.65 },
      { row: 5, col: 0, op: 'call_s3', dir: 'E', target: 'nearest', durationSec: 0.6 },
    ],
  },
};

export const PILOT_SNIPER_TACTICIAN: PilotProfile = {
  version: 2,
  id: 'pilot_sniper',
  name: '遠距離索敵・曲射パイロット (6×6)',
  authorName: 'CodeMech Official',
  grid: {
    gridSize: 6,
    cells: [
      { row: 0, col: 0, op: 'start', dir: 'S' },
      { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 84 },
      { row: 1, col: 1, op: 'call_s4', dir: 'E', target: 'nearest', durationSec: 0.65 },
      { row: 1, col: 2, op: 'if_heat_below', dir: 'S', elseDir: 'W', param: 45 },
      { row: 2, col: 0, op: 'if_enemy_dist_lt', dir: 'E', elseDir: 'S', param: 115 },
      { row: 2, col: 1, op: 'call_s5', dir: 'S', target: 'nearest', durationSec: 0.6 },
      { row: 3, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
      { row: 3, col: 1, op: 'call_s1', dir: 'S', target: 'weakest', durationSec: 0.7 },
      { row: 4, col: 0, op: 'if_enemy_on_radar', dir: 'E', elseDir: 'S' },
      { row: 4, col: 1, op: 'call_s2', dir: 'S', target: 'weakest', durationSec: 0.7 },
      { row: 5, col: 0, op: 'call_s3', dir: 'E', target: 'main', durationSec: 0.6 },
    ],
  },
};

export const PILOT_TORSO_TANK: PilotProfile = {
  version: 2,
  id: 'pilot_torso_tank',
  name: '重装甲ツイスト戦術パイロット (6×6)',
  authorName: 'CodeMech Official',
  grid: {
    gridSize: 6,
    cells: [
      { row: 0, col: 0, op: 'start', dir: 'S' },
      { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 85 },
      { row: 1, col: 1, op: 'call_s4', dir: 'E', target: 'nearest', durationSec: 0.65 },
      { row: 1, col: 2, op: 'if_heat_below', dir: 'S', elseDir: 'W', param: 45 },
      { row: 2, col: 0, op: 'if_incoming_fire', dir: 'E', elseDir: 'S' },
      { row: 2, col: 1, op: 'call_s2', dir: 'S', target: 'attacker', durationSec: 0.65 },
      { row: 3, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
      { row: 3, col: 1, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.7 },
      { row: 4, col: 0, op: 'call_s3', dir: 'S', target: 'nearest', durationSec: 0.6 },
    ],
  },
};

export const STARTER_PILOTS: readonly PilotProfile[] = [
  DEFAULT_PILOT_PROFILE,
  PILOT_AGGRESSIVE,
  PILOT_SNIPER_TACTICIAN,
  PILOT_TORSO_TANK,
];
