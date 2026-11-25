import { MechSubroutineCell, ProgramRomEntry } from '../types/mech';

export type RomArchetype = 'balanced' | 'skirmish' | 'fortress' | 'sniper' | 'berserker';

/**
 * Modular S1 Attack ROM (4x4): preserves leg command latched by S3,
 * tracks target with torso, fires weapon groups, and gates secondary fire by ARG heat threshold.
 */
export function buildAttackS1Cells(options?: {
  heatLimit?: number;
  altFireOp?: 'fire_group_3' | 'fire_group_4';
}): MechSubroutineCell[] {
  const heatLimit = options?.heatLimit ?? 76;
  const altFireOp = options?.altFireOp ?? 'fire_group_4';
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'torso_track', dir: 'E' },
    { row: 0, col: 2, op: 'if_group_1_ready', dir: 'E', elseDir: 'S' },
    { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
    {
      row: 1,
      col: 3,
      op: 'if_heat_below',
      dir: 'S',
      elseDir: 'E',
      param: heatLimit,
      useArg: true,
    },
    { row: 2, col: 3, op: altFireOp, dir: 'S', durationSec: 0.35 },
    { row: 1, col: 2, op: 'if_group_2_ready', dir: 'W', elseDir: 'S' },
    { row: 1, col: 1, op: 'fire_group_2', dir: 'W', durationSec: 0.45 },
    { row: 2, col: 2, op: 'if_group_3_ready', dir: 'W', elseDir: 'S' },
    { row: 2, col: 1, op: 'fire_group_3', dir: 'W', durationSec: 0.4 },
    { row: 3, col: 2, op: 'wait', dir: 'S', durationSec: 0.15 },
  ];
}

/**
 * Solo Direct 4x4 ROM: self-contained movement + tracking + firing for Lv.1 direct mode.
 */
export function buildSolo4x4Cells(desiredRange = 145): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    {
      row: 0,
      col: 1,
      op: 'if_enemy_dist_lt',
      dir: 'E',
      elseDir: 'S',
      param: desiredRange,
      useArg: true,
    },
    { row: 0, col: 2, op: 'move_retreat', dir: 'S' },
    { row: 1, col: 1, op: 'move_approach', dir: 'E' },
    { row: 1, col: 2, op: 'torso_track', dir: 'S' },
    { row: 2, col: 2, op: 'if_group_1_ready', dir: 'E', elseDir: 'W' },
    { row: 2, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
    { row: 3, col: 3, op: 'if_heat_below', dir: 'W', elseDir: 'S', param: 76 },
    { row: 3, col: 2, op: 'fire_group_4', dir: 'S', durationSec: 0.35 },
    { row: 2, col: 1, op: 'if_group_2_ready', dir: 'S', elseDir: 'W' },
    { row: 3, col: 1, op: 'fire_group_2', dir: 'S', durationSec: 0.45 },
    { row: 2, col: 0, op: 'wait', dir: 'S', durationSec: 0.2 },
  ];
}

export function buildArchetypeS2Cells(archetype: RomArchetype): MechSubroutineCell[] {
  if (archetype === 'sniper') {
    return [
      { row: 0, col: 0, op: 'start', dir: 'E' },
      { row: 0, col: 1, op: 'move_high_ground', dir: 'E' },
      { row: 0, col: 2, op: 'torso_track', dir: 'S' },
      { row: 1, col: 2, op: 'if_group_2_ready', dir: 'E', elseDir: 'S' },
      { row: 1, col: 3, op: 'fire_group_2', dir: 'E', durationSec: 0.45 },
      { row: 2, col: 2, op: 'if_group_1_ready', dir: 'E', elseDir: 'S' },
      { row: 2, col: 3, op: 'fire_group_1', dir: 'E', durationSec: 0.45 },
      { row: 3, col: 2, op: 'wait', dir: 'S', durationSec: 0.25 },
    ];
  }

  if (archetype === 'skirmish' || archetype === 'berserker') {
    return [
      { row: 0, col: 0, op: 'start', dir: 'E' },
      { row: 0, col: 1, op: 'if_airborne', dir: 'S', elseDir: 'E' },
      { row: 0, col: 2, op: 'move_jump', dir: 'S', jumpDir: 'forward', durationSec: 0.75 },
      { row: 1, col: 2, op: 'torso_track', dir: 'W' },
      { row: 1, col: 1, op: 'move_approach', dir: 'S' },
      { row: 2, col: 1, op: 'fire_alpha', dir: 'E', durationSec: 0.45 },
      { row: 2, col: 2, op: 'if_right_armor_weaker', dir: 'E', elseDir: 'S' },
      { row: 2, col: 3, op: 'torso_twist_r', dir: 'S', param: 55, useArg: true },
      { row: 3, col: 2, op: 'torso_twist_l', dir: 'E', param: 55, useArg: true },
      { row: 3, col: 3, op: 'wait', dir: 'S', durationSec: 0.3 },
    ];
  }

  if (archetype === 'fortress') {
    return [
      { row: 0, col: 0, op: 'start', dir: 'E' },
      { row: 0, col: 1, op: 'torso_track', dir: 'E' },
      { row: 0, col: 2, op: 'fire_group_4', dir: 'E', durationSec: 0.4 },
      { row: 0, col: 3, op: 'fire_group_2', dir: 'S', durationSec: 0.4 },
      { row: 1, col: 3, op: 'if_right_armor_weaker', dir: 'S', elseDir: 'W' },
      { row: 2, col: 3, op: 'torso_twist_r', dir: 'S', param: 55, useArg: true },
      { row: 3, col: 3, op: 'wait', dir: 'S', durationSec: 0.35 },
      { row: 1, col: 2, op: 'torso_twist_l', dir: 'S', param: 55, useArg: true },
      { row: 2, col: 2, op: 'wait', dir: 'S', durationSec: 0.35 },
    ];
  }

  // balanced backup (preserves latchedLeg from S3)
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'torso_track', dir: 'E' },
    { row: 0, col: 2, op: 'if_group_4_ready', dir: 'E', elseDir: 'S' },
    { row: 0, col: 3, op: 'fire_group_4', dir: 'S', durationSec: 0.45 },
    { row: 1, col: 3, op: 'wait', dir: 'S', durationSec: 0.2 },
    { row: 1, col: 2, op: 'if_group_2_ready', dir: 'W', elseDir: 'S' },
    { row: 1, col: 1, op: 'fire_group_2', dir: 'W', durationSec: 0.45 },
    { row: 2, col: 2, op: 'if_group_3_ready', dir: 'W', elseDir: 'S' },
    { row: 2, col: 1, op: 'fire_group_3', dir: 'W', durationSec: 0.45 },
    { row: 3, col: 2, op: 'wait', dir: 'S', durationSec: 0.2 },
  ];
}

/**
 * Modular S3 Movement & Recon ROM (4x4): 0-tick leg latch update + RETURN.
 * Accepts ARG as desired range or orbit radius.
 */
export function buildS3MoveCells(
  archetype: RomArchetype,
  desiredRange = 150
): MechSubroutineCell[] {
  if (archetype === 'skirmish' || archetype === 'berserker') {
    return [
      { row: 0, col: 0, op: 'start', dir: 'E' },
      { row: 0, col: 1, op: 'if_enemy_in_sight', dir: 'S', elseDir: 'E' },
      { row: 0, col: 2, op: 'move_approach', dir: 'E' },
      { row: 0, col: 3, op: 'return', dir: 'S' },
      { row: 1, col: 1, op: 'if_right_armor_weaker', dir: 'E', elseDir: 'S' },
      {
        row: 1,
        col: 2,
        op: 'move_circle',
        dir: 'E',
        param: desiredRange,
        useArg: true,
        direction: 'left',
      },
      { row: 1, col: 3, op: 'return', dir: 'S' },
      {
        row: 2,
        col: 1,
        op: 'move_circle',
        dir: 'E',
        param: desiredRange,
        useArg: true,
        direction: 'right',
      },
      { row: 2, col: 2, op: 'return', dir: 'S' },
    ];
  }

  const closeOp = archetype === 'fortress' ? 'move_stop' : 'move_retreat';
  const farOp = archetype === 'sniper' ? 'move_high_ground' : 'move_approach';
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'if_enemy_in_sight', dir: 'S', elseDir: 'E' },
    { row: 0, col: 2, op: 'move_high_ground', dir: 'E' },
    { row: 0, col: 3, op: 'return', dir: 'S' },
    {
      row: 1,
      col: 1,
      op: 'if_enemy_dist_lt',
      dir: 'E',
      elseDir: 'S',
      param: desiredRange,
      useArg: true,
    },
    { row: 1, col: 2, op: closeOp, dir: 'E' },
    { row: 1, col: 3, op: 'return', dir: 'S' },
    { row: 2, col: 1, op: farOp, dir: 'E' },
    { row: 2, col: 2, op: 'return', dir: 'S' },
  ];
}

export function buildS3ReconCells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'move_high_ground', dir: 'E' },
    { row: 0, col: 2, op: 'torso_track', dir: 'S' },
    { row: 1, col: 2, op: 'if_group_2_ready', dir: 'E', elseDir: 'S' },
    { row: 1, col: 3, op: 'fire_group_2', dir: 'S', durationSec: 0.4 },
    { row: 2, col: 2, op: 'wait', dir: 'S', durationSec: 0.4 },
  ];
}

/**
 * Modular S4 Shield Defense & Cooling ROM (4x4):
 * - When heat > 75%: emergency cooling.
 * - Otherwise: preserves leg movement from S3 while twisting healthier side toward threat (ARG angle).
 */
export function buildS4CoolCells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'if_heat_above', dir: 'S', elseDir: 'E', param: 75 },
    { row: 1, col: 1, op: 'emergency_cool', dir: 'S', durationSec: 0.55 },
    { row: 0, col: 2, op: 'if_right_armor_weaker', dir: 'E', elseDir: 'S' },
    { row: 0, col: 3, op: 'torso_twist_r', dir: 'S', param: 55, useArg: true },
    { row: 1, col: 2, op: 'torso_twist_l', dir: 'E', param: 55, useArg: true },
    { row: 1, col: 3, op: 'wait', dir: 'S', durationSec: 0.35 },
  ];
}

export function buildS5CloseCells(retreat = false): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: retreat ? 'move_retreat' : 'move_approach', dir: 'E' },
    { row: 0, col: 2, op: 'torso_track', dir: 'S' },
    { row: 1, col: 2, op: 'if_group_4_ready', dir: 'E', elseDir: 'S' },
    { row: 1, col: 3, op: 'fire_group_4', dir: 'S', durationSec: 0.4 },
    { row: 2, col: 2, op: 'fire_group_3', dir: 'S', durationSec: 0.4 },
  ];
}

export function buildBasic4x4Cells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'move_approach', dir: 'E' },
    { row: 0, col: 2, op: 'torso_track', dir: 'E' },
    { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
    { row: 1, col: 3, op: 'wait', dir: 'S', durationSec: 0.15 },
  ];
}

export function buildDefShieldCells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'if_right_armor_weaker', dir: 'E', elseDir: 'S' },
    { row: 0, col: 2, op: 'torso_twist_r', dir: 'S', param: 55, useArg: true },
    { row: 1, col: 2, op: 'wait', dir: 'S', durationSec: 0.35 },
    { row: 1, col: 1, op: 'torso_twist_l', dir: 'S', param: 55, useArg: true },
    { row: 2, col: 1, op: 'wait', dir: 'E', durationSec: 0.35 },
    { row: 2, col: 2, op: 'return', dir: 'S' },
  ];
}

export function buildBasicS1FireCells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'torso_track', dir: 'E' },
    { row: 0, col: 2, op: 'if_group_1_ready', dir: 'E', elseDir: 'S' },
    { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
    { row: 1, col: 3, op: 'return', dir: 'S' },
    { row: 1, col: 2, op: 'if_target_locked', dir: 'W', elseDir: 'S' },
    { row: 1, col: 1, op: 'if_group_2_ready', dir: 'S', elseDir: 'W' },
    { row: 2, col: 1, op: 'fire_group_2', dir: 'S', durationSec: 0.45 },
    { row: 3, col: 1, op: 'return', dir: 'S' },
    { row: 2, col: 2, op: 'wait', dir: 'S', durationSec: 0.15 },
  ];
}

export function buildBasicS2LrmCells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'torso_track', dir: 'E' },
    { row: 0, col: 2, op: 'if_target_locked', dir: 'S', elseDir: 'E' },
    { row: 0, col: 3, op: 'wait', dir: 'S', durationSec: 0.25 },
    { row: 1, col: 2, op: 'if_group_2_ready', dir: 'E', elseDir: 'S' },
    { row: 1, col: 3, op: 'fire_group_2', dir: 'S', durationSec: 0.45 },
    { row: 2, col: 3, op: 'return', dir: 'S' },
    { row: 2, col: 2, op: 'wait', dir: 'S', durationSec: 0.2 },
  ];
}

export function buildBasicS3MoveCells(desiredRange = 220): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'if_enemy_in_sight', dir: 'S', elseDir: 'E' },
    { row: 0, col: 2, op: 'move_approach', dir: 'E' },
    { row: 0, col: 3, op: 'return', dir: 'S' },
    {
      row: 1,
      col: 1,
      op: 'if_enemy_dist_lt',
      dir: 'E',
      elseDir: 'S',
      param: desiredRange,
      useArg: true,
    },
    { row: 1, col: 2, op: 'move_retreat', dir: 'E' },
    { row: 1, col: 3, op: 'return', dir: 'S' },
    { row: 2, col: 1, op: 'move_approach', dir: 'E' },
    { row: 2, col: 2, op: 'return', dir: 'S' },
  ];
}

export function buildBasicS4CoolCells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'emergency_cool', dir: 'E', durationSec: 0.6 },
    { row: 0, col: 2, op: 'return', dir: 'S' },
  ];
}

export function buildBasicS5CloseCells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'move_retreat', dir: 'E' },
    { row: 0, col: 2, op: 'torso_track', dir: 'E' },
    { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
    { row: 1, col: 3, op: 'return', dir: 'S' },
  ];
}

export function buildBasicSolo4x4Cells(desiredRange = 200): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'if_enemy_dist_lt', dir: 'E', elseDir: 'S', param: desiredRange },
    { row: 0, col: 2, op: 'move_retreat', dir: 'S' },
    { row: 1, col: 1, op: 'move_approach', dir: 'E' },
    { row: 1, col: 2, op: 'torso_track', dir: 'S' },
    { row: 2, col: 2, op: 'if_group_1_ready', dir: 'E', elseDir: 'W' },
    { row: 2, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
    { row: 2, col: 1, op: 'if_group_2_ready', dir: 'S', elseDir: 'W' },
    { row: 3, col: 1, op: 'fire_group_2', dir: 'S', durationSec: 0.45 },
    { row: 2, col: 0, op: 'wait', dir: 'S', durationSec: 0.15 },
  ];
}

export const BUILTIN_ROMS: readonly ProgramRomEntry[] = [
  // Basic / Beginner ROMs
  {
    id: 'rom_basic_s1_fire',
    name: '基本攻撃',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildBasicS1FireCells(),
  },
  {
    id: 'rom_basic_s2_lrm',
    name: '基本ミサイル',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildBasicS2LrmCells(),
  },
  {
    id: 'rom_basic_s3_move',
    name: '基本移動',
    category: 'move',
    gridSize: 4,
    builtIn: true,
    cells: buildBasicS3MoveCells(220),
  },
  {
    id: 'rom_basic_s4_cool',
    name: '基本冷却',
    category: 'control',
    gridSize: 4,
    builtIn: true,
    cells: buildBasicS4CoolCells(),
  },
  {
    id: 'rom_basic_s5_close',
    name: '基本近接',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildBasicS5CloseCells(),
  },
  {
    id: 'rom_basic_4x4_solo',
    name: '基本単体',
    category: 'control',
    gridSize: 4,
    builtIn: true,
    cells: buildBasicSolo4x4Cells(200),
  },
  // Attack ROMs (Red)
  {
    id: 'rom_std_s1_bal',
    name: '主攻撃標準',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildAttackS1Cells({ heatLimit: 76 }),
  },
  {
    id: 'rom_std_s1_skirmish',
    name: '強襲連射戦',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildAttackS1Cells({ heatLimit: 78 }),
  },
  {
    id: 'rom_std_s1_sniper',
    name: '狙撃射撃戦',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildAttackS1Cells({ heatLimit: 76, altFireOp: 'fire_group_3' }),
  },
  {
    id: 'rom_std_s2_backup',
    name: '予備兵装戦',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildArchetypeS2Cells('balanced'),
  },
  {
    id: 'rom_std_s2_jump',
    name: '跳躍強襲戦',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildArchetypeS2Cells('skirmish'),
  },
  {
    id: 'rom_std_s2_heavy',
    name: '重装反撃戦',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildArchetypeS2Cells('fortress'),
  },
  {
    id: 'rom_std_s2_lrm',
    name: '高台曲射戦',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildArchetypeS2Cells('sniper'),
  },
  {
    id: 'rom_std_poptart',
    name: '飛出狙撃',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: [
      { row: 0, col: 0, op: 'start', dir: 'E' },
      { row: 0, col: 1, op: 'if_airborne', dir: 'S', elseDir: 'E' },
      { row: 0, col: 2, op: 'move_jump', dir: 'S', jumpDir: 'vertical', durationSec: 0.8 },
      { row: 1, col: 2, op: 'torso_track', dir: 'W' },
      { row: 1, col: 1, op: 'torso_track', dir: 'S' },
      { row: 2, col: 1, op: 'wait', dir: 'S', durationSec: 0.35 },
      { row: 3, col: 1, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
      { row: 3, col: 2, op: 'fire_group_1', dir: 'E', durationSec: 0.45 },
      { row: 3, col: 3, op: 'return', dir: 'S' },
    ],
  },
  {
    id: 'rom_std_s5_close',
    name: '近接迎撃戦',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildS5CloseCells(false),
  },
  {
    id: 'rom_std_s5_retreat',
    name: '後退迎撃戦',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildS5CloseCells(true),
  },
  // Movement ROMs (Green)
  {
    id: 'rom_std_s3_range',
    name: '間合い制御',
    category: 'move',
    gridSize: 4,
    builtIn: true,
    cells: buildS3MoveCells('balanced', 150),
  },
  {
    id: 'rom_std_s3_orbit',
    name: '盾側周回',
    category: 'move',
    gridSize: 4,
    builtIn: true,
    cells: buildS3MoveCells('skirmish', 105),
  },
  {
    id: 'rom_std_s3_advance',
    name: '重装進軍',
    category: 'move',
    gridSize: 4,
    builtIn: true,
    cells: buildS3MoveCells('fortress', 155),
  },
  {
    id: 'rom_std_s3_sniper',
    name: '狙撃間合',
    category: 'move',
    gridSize: 4,
    builtIn: true,
    cells: buildS3MoveCells('sniper', 240),
  },
  // Control / Defense ROMs (Blue)
  {
    id: 'rom_std_s4_cool',
    name: '盾防御冷却',
    category: 'control',
    gridSize: 4,
    builtIn: true,
    cells: buildS4CoolCells(),
  },
  {
    id: 'rom_std_def_shield',
    name: '純盾防御',
    category: 'control',
    gridSize: 4,
    builtIn: true,
    cells: buildDefShieldCells(),
  },
  {
    id: 'rom_std_4x4_solo',
    name: '単体標準戦',
    category: 'control',
    gridSize: 4,
    builtIn: true,
    cells: buildSolo4x4Cells(145),
  },
];
