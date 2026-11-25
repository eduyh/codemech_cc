import {
  MECH_SUBROUTINE_SLOT_SPECS,
  MechBlueprint,
  MechSubroutine,
  PilotProfile,
} from '../types/mech';
import {
  RomArchetype,
  buildArchetypeS2Cells,
  buildAttackS1Cells,
  buildS3MoveCells,
  buildS4CoolCells,
  buildS5CloseCells,
} from './romTemplates';

function buildDefaultSubroutines(
  archetype: RomArchetype,
  desiredRange: number
): MechSubroutine[] {
  const isSkirmish = archetype === 'skirmish' || archetype === 'berserker';
  return [
    {
      slotId: 'S1',
      name: isSkirmish
        ? '強襲連射戦 (4×4)'
        : archetype === 'sniper'
          ? '狙撃射撃戦 (4×4)'
          : '主攻撃標準 (4×4)',
      category: 'attack',
      gridSize: 4,
      cells: buildAttackS1Cells({
        heatLimit: isSkirmish ? 78 : 76,
        altFireOp: archetype === 'sniper' ? 'fire_group_3' : 'fire_group_4',
      }),
    },
    {
      slotId: 'S2',
      name:
        archetype === 'sniper'
          ? '高台曲射戦 (4×4)'
          : isSkirmish
            ? '跳躍強襲戦 (4×4)'
            : archetype === 'fortress'
              ? '重装反撃戦 (4×4)'
              : '予備兵装戦 (4×4)',
      category: 'attack',
      gridSize: 4,
      cells: buildArchetypeS2Cells(archetype),
    },
    {
      slotId: 'S3',
      name: isSkirmish
        ? '盾側周回 (4×4)'
        : archetype === 'fortress'
          ? '重装進軍 (4×4)'
          : archetype === 'sniper'
            ? '狙撃間合 (4×4)'
            : '間合い制御 (4×4)',
      category: 'move',
      gridSize: 4,
      cells: buildS3MoveCells(archetype, desiredRange),
    },
    {
      slotId: 'S4',
      name: '盾防御冷却 (4×4)',
      category: 'control',
      gridSize: 4,
      cells: buildS4CoolCells(),
    },
    {
      slotId: 'S5',
      name: archetype === 'sniper' ? '後退迎撃戦 (4×4)' : '近接迎撃戦 (4×4)',
      category: 'attack',
      gridSize: 4,
      cells: buildS5CloseCells(archetype === 'sniper'),
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
  romSlots: {
    S1: 'rom_std_s1_bal',
    S2: 'rom_std_s2_backup',
    S3: 'rom_std_s3_range',
    S4: 'rom_std_s4_cool',
    S5: 'rom_std_s5_close',
  },
  boosterEnabled: true,
  ecmEnabled: false,
  lrmFireMode: 'stream',
  extraHeatSinks: 1,
  weaponMountCounts: {
    leftArm: 2,
  },
  parts: {
    head: 'head_std',
    torso: 'torso_std',
    rightShoulderMount: 'shd_std',
    leftShoulderMount: 'shd_std',
    rightArmWeapon: 'ac5',
    leftArmWeapon: 'medium_laser',
    rightShoulderWeapon: 'lrm5',
    leftShoulderWeapon: 'ams_ballistic',
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
    head: 45,
    torsoFront: 185,
    torsoRear: 50,
    rightShoulderFront: 90,
    rightShoulderRear: 25,
    leftShoulderFront: 90,
    leftShoulderRear: 25,
    rightArm: 65,
    leftArm: 65,
    rightLeg: 80,
    leftLeg: 80,
  },
  subroutines: buildDefaultSubroutines('balanced', 150),
};

export const PRESET_STRIKER: MechBlueprint = {
  version: 2,
  id: 'preset_striker',
  name: 'CM-02 ストライカー',
  authorName: 'CodeMech Official',
  color: '#22c55e',
  chassisId: 'chassis_striker',
  romSlots: {
    S1: 'rom_std_s1_skirmish',
    S2: 'rom_std_s2_jump',
    S3: 'rom_std_s3_orbit',
    S4: 'rom_std_s4_cool',
    S5: 'rom_std_s5_close',
  },
  boosterEnabled: true,
  ecmEnabled: false,
  lrmFireMode: 'salvo',
  extraHeatSinks: 0,
  weaponMountCounts: {
    rightArm: 2,
  },
  parts: {
    head: 'head_std',
    torso: 'torso_light',
    rightShoulderMount: 'shd_light',
    leftShoulderMount: 'shd_light',
    rightArmWeapon: 'medium_laser',
    leftArmWeapon: 'small_laser',
    rightShoulderWeapon: 'srm_rocket',
    leftShoulderWeapon: 'ecm_suite',
    legs: 'legs_biped_std',
    booster: 'boost_high_thrust',
  },
  weaponGroups: {
    G1: ['rightArm', 'leftArm'],
    G2: ['rightShoulder'],
    G3: ['rightArm'],
    G4: ['leftArm', 'rightShoulder'],
  },
  armor: {
    head: 25,
    torsoFront: 110,
    torsoRear: 25,
    rightShoulderFront: 60,
    rightShoulderRear: 15,
    leftShoulderFront: 60,
    leftShoulderRear: 15,
    rightArm: 45,
    leftArm: 45,
    rightLeg: 50,
    leftLeg: 50,
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
  romSlots: {
    S1: 'rom_std_s1_bal',
    S2: 'rom_std_s2_heavy',
    S3: 'rom_std_s3_advance',
    S4: 'rom_std_s4_cool',
    S5: 'rom_std_s5_close',
  },
  boosterEnabled: false,
  ecmEnabled: false,
  lrmFireMode: 'salvo',
  extraHeatSinks: 2,
  extraAmmo: {
    rightArm: 1,
    rightShoulder: 1,
  },
  weaponMountCounts: {
    leftArm: 3,
  },
  parts: {
    head: 'head_armored',
    torso: 'torso_heavy',
    rightShoulderMount: 'shd_heavy',
    leftShoulderMount: 'shd_heavy',
    rightArmWeapon: 'ac20',
    leftArmWeapon: 'medium_laser',
    rightShoulderWeapon: 'lrm15',
    leftShoulderWeapon: 'ams_bap_pod',
    legs: 'legs_biped_std',
    booster: 'boost_none',
  },
  weaponGroups: {
    G1: ['rightArm', 'leftArm'],
    G2: ['rightShoulder'],
    G3: ['rightArm'],
    G4: ['leftArm'],
  },
  armor: {
    head: 70,
    torsoFront: 375,
    torsoRear: 95,
    rightShoulderFront: 205,
    rightShoulderRear: 55,
    leftShoulderFront: 205,
    leftShoulderRear: 55,
    rightArm: 160,
    leftArm: 160,
    rightLeg: 160,
    leftLeg: 160,
  },
  subroutines: buildDefaultSubroutines('fortress', 155),
};

export const PRESET_SNIPER: MechBlueprint = {
  version: 2,
  id: 'preset_sniper',
  name: 'CM-04 ホークアイ',
  authorName: 'CodeMech Official',
  color: '#a855f7',
  chassisId: 'chassis_hawkeye',
  romSlots: {
    S1: 'rom_std_s1_sniper',
    S2: 'rom_std_s2_lrm',
    S3: 'rom_std_s3_sniper',
    S4: 'rom_std_s4_cool',
    S5: 'rom_std_s5_retreat',
  },
  boosterEnabled: false,
  ecmEnabled: false,
  lrmFireMode: 'salvo',
  extraHeatSinks: 0,
  weaponMountCounts: {
    leftArm: 2,
  },
  parts: {
    head: 'head_recon',
    torso: 'torso_light',
    rightShoulderMount: 'shd_std',
    leftShoulderMount: 'shd_light',
    rightArmWeapon: 'gauss_rifle',
    leftArmWeapon: 'medium_laser',
    rightShoulderWeapon: 'lrm5',
    leftShoulderWeapon: 'ams_bap_pod',
    legs: 'legs_biped_std',
    booster: 'boost_none',
  },
  weaponGroups: {
    G1: ['rightArm'],
    G2: ['rightShoulder'],
    G3: ['leftArm'],
    G4: ['rightArm', 'leftArm'],
  },
  armor: {
    head: 55,
    torsoFront: 190,
    torsoRear: 50,
    rightShoulderFront: 110,
    rightShoulderRear: 30,
    leftShoulderFront: 110,
    leftShoulderRear: 30,
    rightArm: 70,
    leftArm: 70,
    rightLeg: 75,
    leftLeg: 75,
  },
  subroutines: buildDefaultSubroutines('sniper', 240),
};

export const STARTER_MECHS: readonly MechBlueprint[] = [
  PRESET_VANGUARD,
  PRESET_STRIKER,
  PRESET_FORTRESS,
  PRESET_SNIPER,
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
      { row: 2, col: 1, op: 'call_s5', dir: 'E', target: 'flank', durationSec: 0.6 },
      { row: 3, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
      { row: 3, col: 1, op: 'call_s3', dir: 'E', target: 'main', durationSec: 0.3 },
      { row: 3, col: 2, op: 'if_ammo_empty', dir: 'E', elseDir: 'S', weaponSlot: 'rightArm' },
      { row: 3, col: 3, op: 'call_s2', dir: 'S', target: 'main', durationSec: 0.65 },
      { row: 4, col: 3, op: 'if_incoming_fire', dir: 'S', elseDir: 'E' },
      { row: 4, col: 2, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.65 },
      { row: 5, col: 2, op: 'if_incoming_fire', dir: 'E', elseDir: 'S' },
      { row: 5, col: 3, op: 'call_s4', dir: 'S', target: 'attacker', param: 55, durationSec: 0.4 },
      { row: 4, col: 0, op: 'call_s3', dir: 'S', target: 'nearest', durationSec: 0.5 },
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
      { row: 1, col: 2, op: 'call_s5', dir: 'E', target: 'nearest', durationSec: 0.65 },
      { row: 2, col: 0, op: 'override_off', dir: 'S' },
      { row: 3, col: 0, op: 'call_s3', dir: 'S', target: 'nearest', param: 95, durationSec: 0.3 },
      { row: 4, col: 0, op: 'if_enemy_dist_lt', dir: 'E', elseDir: 'S', param: 135 },
      { row: 4, col: 1, op: 'call_s2', dir: 'E', target: 'nearest', durationSec: 0.65 },
      { row: 5, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
      { row: 5, col: 1, op: 'call_s1', dir: 'E', target: 'nearest', param: 85, durationSec: 0.65 },
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
      { row: 2, col: 1, op: 'call_s5', dir: 'E', target: 'nearest', durationSec: 0.6 },
      { row: 3, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
      { row: 3, col: 1, op: 'call_s3', dir: 'E', target: 'weakest', param: 250, durationSec: 0.3 },
      { row: 3, col: 2, op: 'call_s1', dir: 'E', target: 'weakest', durationSec: 0.7 },
      { row: 4, col: 0, op: 'if_enemy_on_radar', dir: 'E', elseDir: 'S' },
      { row: 4, col: 1, op: 'call_s3', dir: 'E', target: 'weakest', param: 250, durationSec: 0.3 },
      { row: 4, col: 2, op: 'call_s2', dir: 'E', target: 'weakest', durationSec: 0.7 },
      { row: 5, col: 0, op: 'call_s3', dir: 'E', target: 'main', param: 250, durationSec: 0.5 },
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
      { row: 1, col: 2, op: 'if_heat_below', dir: 'E', elseDir: 'W', param: 45 },
      { row: 2, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
      { row: 2, col: 1, op: 'call_s3', dir: 'E', target: 'main', param: 155, durationSec: 0.3 },
      { row: 2, col: 2, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.65 },
      { row: 3, col: 2, op: 'if_incoming_fire', dir: 'E', elseDir: 'S' },
      { row: 3, col: 3, op: 'call_s4', dir: 'S', target: 'attacker', param: 60, durationSec: 0.45 },
      { row: 4, col: 3, op: 'call_s2', dir: 'S', target: 'attacker', durationSec: 0.6 },
      { row: 3, col: 0, op: 'call_s3', dir: 'S', target: 'nearest', param: 155, durationSec: 0.5 },
    ],
  },
};

export const STARTER_PILOTS: readonly PilotProfile[] = [
  DEFAULT_PILOT_PROFILE,
  PILOT_AGGRESSIVE,
  PILOT_SNIPER_TACTICIAN,
  PILOT_TORSO_TANK,
];
