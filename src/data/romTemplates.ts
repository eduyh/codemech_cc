import { MechSubroutineCell, ProgramRomEntry } from '../types/mech';

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

export function buildBasicLightOrbitCells(orbitDist = 110): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
    {
      row: 0,
      col: 2,
      op: 'move_circle',
      dir: 'E',
      direction: 'right',
      param: orbitDist,
      useArg: true,
    },
    { row: 0, col: 3, op: 'return', dir: 'S' },
    { row: 1, col: 1, op: 'move_approach', dir: 'E' },
    { row: 1, col: 2, op: 'return', dir: 'S' },
  ];
}

export function buildBasicLightJumpCells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'if_airborne', dir: 'S', elseDir: 'E' },
    { row: 0, col: 2, op: 'move_jump', dir: 'S', jumpDir: 'forward', durationSec: 0.65 },
    { row: 1, col: 1, op: 'torso_track', dir: 'E' },
    { row: 1, col: 2, op: 'torso_track', dir: 'E' },
    { row: 1, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
    { row: 2, col: 3, op: 'return', dir: 'S' },
  ];
}

export function buildBasicHeavyAdvanceCells(holdDist = 180): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
    {
      row: 0,
      col: 2,
      op: 'if_enemy_dist_lt',
      dir: 'E',
      elseDir: 'S',
      param: holdDist,
      useArg: true,
    },
    { row: 0, col: 3, op: 'move_stop', dir: 'S' },
    { row: 1, col: 3, op: 'return', dir: 'S' },
    { row: 1, col: 2, op: 'move_approach', dir: 'E' },
    { row: 1, col: 1, op: 'move_approach', dir: 'S' },
    { row: 2, col: 1, op: 'return', dir: 'S' },
  ];
}

export function buildBasicHeavyShieldCells(twistDeg = 55): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'torso_twist_l', dir: 'E', param: twistDeg, useArg: true },
    { row: 0, col: 2, op: 'wait', dir: 'E', durationSec: 0.4 },
    { row: 0, col: 3, op: 'return', dir: 'S' },
  ];
}

export function buildBasicDirectFireCells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'torso_track', dir: 'E' },
    { row: 0, col: 2, op: 'if_group_1_ready', dir: 'E', elseDir: 'S' },
    { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
    { row: 1, col: 3, op: 'return', dir: 'S' },
    { row: 1, col: 2, op: 'if_group_2_ready', dir: 'W', elseDir: 'S' },
    { row: 1, col: 1, op: 'fire_group_2', dir: 'S', durationSec: 0.45 },
    { row: 2, col: 1, op: 'return', dir: 'S' },
    { row: 2, col: 2, op: 'wait', dir: 'S', durationSec: 0.15 },
  ];
}

export function buildBasicS2TrackCells(): MechSubroutineCell[] {
  return [
    { row: 0, col: 0, op: 'start', dir: 'E' },
    { row: 0, col: 1, op: 'torso_track', dir: 'E' },
    { row: 0, col: 2, op: 'wait', dir: 'E', durationSec: 0.35 },
    { row: 0, col: 3, op: 'return', dir: 'S' },
  ];
}

export const BUILTIN_ROMS: readonly ProgramRomEntry[] = [
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
  {
    id: 'rom_basic_light_orbit',
    name: '基本周回',
    category: 'move',
    weightTags: ['light'],
    gridSize: 4,
    builtIn: true,
    cells: buildBasicLightOrbitCells(110),
  },
  {
    id: 'rom_basic_light_jump',
    name: '基本跳躍',
    category: 'attack',
    weightTags: ['light'],
    gridSize: 4,
    builtIn: true,
    cells: buildBasicLightJumpCells(),
  },
  {
    id: 'rom_basic_heavy_advance',
    name: '基本進軍',
    category: 'move',
    weightTags: ['heavy'],
    gridSize: 4,
    builtIn: true,
    cells: buildBasicHeavyAdvanceCells(180),
  },
  {
    id: 'rom_basic_heavy_shield',
    name: '基本盾防御',
    category: 'control',
    weightTags: ['heavy'],
    gridSize: 4,
    builtIn: true,
    cells: buildBasicHeavyShieldCells(55),
  },
  {
    id: 'rom_basic_direct_fire',
    name: '基本直撃',
    category: 'attack',
    gridSize: 4,
    builtIn: true,
    cells: buildBasicDirectFireCells(),
  },
  {
    id: 'rom_basic_s2_track',
    name: '基本照準',
    category: 'control',
    gridSize: 4,
    builtIn: true,
    cells: buildBasicS2TrackCells(),
  },
];
