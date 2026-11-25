import {
  computeMechStats,
  getArmWeaponSpec,
  getControlTierSpec,
  getResolvedWeaponGroups,
  getShoulderWeaponSpec,
  isPassiveModuleSpec,
} from '../data/parts';
import { BUILTIN_ROMS } from '../data/romTemplates';
import {
  MECH_SUBROUTINE_SLOT_SPECS,
  MechBlueprint,
  MechSubroutine,
  MechSubroutineCell,
  MechSubroutineSlotId,
  PilotProfile,
  ProgramRomEntry,
  RomCategory,
  WeaponGroupId,
  WeaponSlotId,
} from '../types/mech';

export const ROM_LIBRARY_STORAGE_KEY = 'codemech_rom_library_v1';
export const MAX_ROM_NAME_LEN = 6;

export const ROM_CATEGORY_SPECS: ReadonlyArray<{
  id: RomCategory;
  label: string;
  short: string;
}> = [
  { id: 'attack', label: '攻撃系', short: '攻' },
  { id: 'move', label: '移動系', short: '移' },
  { id: 'control', label: '制御系', short: '制' },
];

export function isValidRomCategory(cat: unknown): cat is RomCategory {
  return cat === 'attack' || cat === 'move' || cat === 'control';
}

export function inferRomCategory(cells: readonly MechSubroutineCell[]): RomCategory {
  if (cells.some((c) => c.op.startsWith('fire_'))) return 'attack';
  if (
    cells.some(
      (c) =>
        c.op.startsWith('torso_twist_') ||
        c.op === 'emergency_cool' ||
        c.op === 'override_on' ||
        c.op === 'override_off'
    )
  ) {
    return 'control';
  }
  if (cells.some((c) => c.op.startsWith('move_'))) return 'move';
  return 'control';
}

export function getRomCategory(
  rom: Pick<ProgramRomEntry, 'category' | 'cells'>
): RomCategory {
  return isValidRomCategory(rom.category) ? rom.category : inferRomCategory(rom.cells);
}

export interface RomCompatibilityIssue {
  level: 'error' | 'warn';
  text: string;
}

export function normalizeRomName(raw: string): string {
  return Array.from(raw.trim()).slice(0, MAX_ROM_NAME_LEN).join('');
}

export function formatRomLabel(rom: Pick<ProgramRomEntry, 'name' | 'gridSize'>): string {
  return `${rom.name} (${rom.gridSize}×${rom.gridSize})`;
}

export function loadUserRoms(): ProgramRomEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ROM_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is ProgramRomEntry =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          (item.gridSize === 4 || item.gridSize === 6) &&
          Array.isArray(item.cells)
      )
      .map((item) => {
        const cleanCells = filterCellsForGrid(item.cells, 4);
        return {
          id: item.id,
          name: normalizeRomName(item.name) || '自作',
          category: isValidRomCategory(item.category)
            ? item.category
            : inferRomCategory(cleanCells),
          gridSize: 4 as const,
          builtIn: false,
          savedAt: typeof item.savedAt === 'number' ? item.savedAt : Date.now(),
          cells: cleanCells,
        };
      });
  } catch {
    return [];
  }
}

export function persistUserRoms(list: ProgramRomEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ROM_LIBRARY_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function getAllRoms(userRoms: readonly ProgramRomEntry[]): ProgramRomEntry[] {
  return [...userRoms, ...BUILTIN_ROMS];
}

const LEGACY_ROM_ID_ALIASES: Record<string, string> = {
  rom_std_s1_fortress: 'rom_std_s1_bal',
  rom_std_s3_recon: 'rom_std_s3_range',
  rom_std_4x4_basic: 'rom_std_4x4_solo',
};

export function findRomById(
  allRoms: readonly ProgramRomEntry[],
  id: string | null | undefined
): ProgramRomEntry | undefined {
  if (!id) return undefined;
  const resolvedId = LEGACY_ROM_ID_ALIASES[id] ?? id;
  return allRoms.find((r) => r.id === resolvedId);
}

function getFallbackRomName(userRoms: readonly ProgramRomEntry[]): string {
  for (let i = 1; i < 1000; i++) {
    const cand = normalizeRomName(`自作${i}`);
    if (!userRoms.some((r) => r.name === cand)) return cand;
  }
  return '自作';
}

export function filterCellsForGrid(
  cells: readonly MechSubroutineCell[],
  gridSize: 4 | 6
): MechSubroutineCell[] {
  return structuredClone(
    cells.filter(
      (c) =>
        c &&
        typeof c.row === 'number' &&
        typeof c.col === 'number' &&
        c.row >= 0 &&
        c.row < gridSize &&
        c.col >= 0 &&
        c.col < gridSize &&
        typeof c.op === 'string' &&
        c.op !== 'empty'
    )
  );
}

export function saveUserRom(
  userRoms: readonly ProgramRomEntry[],
  input: {
    id?: string;
    name: string;
    category?: RomCategory;
    gridSize?: 4 | 6;
    cells: readonly MechSubroutineCell[];
  },
  now = Date.now()
): { nextList: ProgramRomEntry[]; saved: ProgramRomEntry; updated: boolean } {
  const cleanName = normalizeRomName(input.name) || getFallbackRomName(userRoms);
  const cleanCells = filterCellsForGrid(input.cells, 4);
  const existingIdx = input.id
    ? userRoms.findIndex((r) => r.id === input.id && !r.builtIn)
    : -1;

  const id =
    existingIdx >= 0
      ? userRoms[existingIdx].id
      : `rom_u_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const category = isValidRomCategory(input.category)
    ? input.category
    : inferRomCategory(cleanCells);

  const entry: ProgramRomEntry = {
    id,
    name: cleanName,
    category,
    gridSize: 4,
    builtIn: false,
    savedAt: now,
    cells: cleanCells.length > 0 ? cleanCells : [{ row: 0, col: 0, op: 'start', dir: 'E' }],
  };

  const nextList =
    existingIdx >= 0
      ? userRoms.map((r, i) => (i === existingIdx ? entry : r))
      : [entry, ...userRoms];

  persistUserRoms(nextList);
  return { nextList, saved: entry, updated: existingIdx >= 0 };
}

export function deleteUserRom(
  userRoms: readonly ProgramRomEntry[],
  romId: string
): ProgramRomEntry[] {
  const nextList = userRoms.filter((r) => r.id !== romId || r.builtIn);
  persistUserRoms(nextList);
  return nextList;
}

/**
 * Resolves `romSlots` references in a MechBlueprint into live `subroutines` entries
 * from the supplied ROM catalog, omitting explicitly unmounted (`null`) or missing ROMs.
 */
export function resolveMechBlueprintRoms(
  bp: MechBlueprint,
  allRoms: readonly ProgramRomEntry[]
): MechBlueprint {
  if (!bp.romSlots) return bp;

  const resolvedSubs: MechSubroutine[] = [];
  for (const spec of MECH_SUBROUTINE_SLOT_SPECS) {
    const refId = bp.romSlots[spec.slotId];
    if (refId === null) {
      continue;
    }
    if (typeof refId === 'string') {
      const rom = findRomById(allRoms, refId);
      if (rom) {
        resolvedSubs.push({
          slotId: spec.slotId,
          name: formatRomLabel(rom),
          category: getRomCategory(rom),
          gridSize: rom.gridSize,
          cells: structuredClone(rom.cells),
        });
      }
      continue;
    }
    const existing = bp.subroutines.find((s) => s.slotId === spec.slotId);
    if (existing) {
      resolvedSubs.push(structuredClone(existing));
    }
  }

  return {
    ...bp,
    subroutines: resolvedSubs,
  };
}

/**
 * Strips subroutine cell payloads from slots managed by `romSlots` so custom mechs
 * stored locally keep lightweight ROM ID references instead of duplicated code copies.
 */
export function stripReferencedSubroutinesForStorage(bp: MechBlueprint): MechBlueprint {
  const cloned = structuredClone(bp);
  if (!cloned.romSlots) return cloned;
  cloned.subroutines = cloned.subroutines.filter(
    (s) => cloned.romSlots?.[s.slotId] === undefined
  );
  return cloned;
}

const SLOT_LABEL: Record<WeaponSlotId, string> = {
  rightArm: '右腕',
  leftArm: '左腕',
  rightShoulder: '右胴',
  leftShoulder: '左胴',
};

const CALL_OP_FOR_SLOT: Record<MechSubroutineSlotId, string> = {
  S1: 'call_s1',
  S2: 'call_s2',
  S3: 'call_s3',
  S4: 'call_s4',
  S5: 'call_s5',
};

function checkCellsCompatibility(
  cells: readonly MechSubroutineCell[],
  romGridSize: 4 | 6,
  slotMaxSize: 4 | 6,
  bp: MechBlueprint,
  statsBoosterActive: boolean,
  groups: Record<WeaponGroupId, WeaponSlotId[]>,
  slotActiveWeapon: Record<WeaponSlotId, boolean>
): RomCompatibilityIssue[] {
  const issues: RomCompatibilityIssue[] = [];
  const pushUnique = (level: 'error' | 'warn', text: string) => {
    if (!issues.some((i) => i.text === text)) {
      issues.push({ level, text });
    }
  };

  if (romGridSize > slotMaxSize) {
    pushUnique('warn', `${slotMaxSize}×${slotMaxSize}枠に${romGridSize}×${romGridSize}ROM（範囲外マス無効）`);
  }

  for (const c of cells) {
    if (c.op === 'move_jump' && !statsBoosterActive) {
      pushUnique('warn', '跳躍不可（ブーストOFF/非搭載）');
    }
    const checkGroup = (gid: WeaponGroupId) => {
      const hasWeapon = groups[gid].some((ws) => slotActiveWeapon[ws]);
      if (!hasWeapon) {
        pushUnique('warn', `${gid} 未割当`);
      }
    };
    if (c.op === 'fire_group_1' || c.op === 'if_group_1_ready') checkGroup('G1');
    if (c.op === 'fire_group_2' || c.op === 'if_group_2_ready') checkGroup('G2');
    if (c.op === 'fire_group_3' || c.op === 'if_group_3_ready') checkGroup('G3');
    if (c.op === 'fire_group_4' || c.op === 'if_group_4_ready') checkGroup('G4');

    const checkWeaponSlot = (ws: WeaponSlotId) => {
      if (!slotActiveWeapon[ws]) {
        pushUnique('warn', `${SLOT_LABEL[ws]} 未装備`);
      }
    };
    if (c.op === 'fire_right_arm' || c.op === 'if_right_arm_ready') checkWeaponSlot('rightArm');
    if (c.op === 'fire_left_arm' || c.op === 'if_left_arm_ready') checkWeaponSlot('leftArm');
    if (c.op === 'fire_right_shoulder' || c.op === 'if_right_shoulder_ready') {
      checkWeaponSlot('rightShoulder');
    }
    if (c.op === 'fire_left_shoulder' || c.op === 'if_left_shoulder_ready') {
      checkWeaponSlot('leftShoulder');
    }

    if (c.op === 'fire_alpha') {
      const anyWeapon = (Object.values(slotActiveWeapon) as boolean[]).some(Boolean);
      if (!anyWeapon) {
        pushUnique('warn', '全門発射対象なし');
      }
    }
  }

  void bp;
  return issues;
}

/**
 * Computes static compatibility warnings/errors for each active subroutine slot.
 * These never block execution or saving — they surface configuration mismatches clearly.
 */
export function analyzeMechRomCompatibility(
  bp: MechBlueprint,
  allRoms: readonly ProgramRomEntry[],
  pilot?: PilotProfile
): Record<MechSubroutineSlotId, RomCompatibilityIssue[]> {
  const result: Record<MechSubroutineSlotId, RomCompatibilityIssue[]> = {
    S1: [],
    S2: [],
    S3: [],
    S4: [],
    S5: [],
  };

  const tierSpec = getControlTierSpec(bp.controlTier);
  const stats = computeMechStats(bp);
  const groups = getResolvedWeaponGroups(bp);
  const ra = getArmWeaponSpec(bp.parts.rightArmWeapon);
  const la = getArmWeaponSpec(bp.parts.leftArmWeapon);
  const rs = getShoulderWeaponSpec(bp.parts.rightShoulderWeapon);
  const ls = getShoulderWeaponSpec(bp.parts.leftShoulderWeapon);

  const slotActiveWeapon: Record<WeaponSlotId, boolean> = {
    rightArm: ra.id !== 'arm_none' && !isPassiveModuleSpec(ra),
    leftArm: la.id !== 'arm_none' && !isPassiveModuleSpec(la),
    rightShoulder: rs.id !== 'shd_none' && !isPassiveModuleSpec(rs),
    leftShoulder: ls.id !== 'shd_none' && !isPassiveModuleSpec(ls),
  };

  for (const slotId of tierSpec.enabledSlots) {
    const slotMaxSize = tierSpec.slotGridSizes[slotId];
    const refId = bp.romSlots?.[slotId];

    if (refId === null) {
      if (pilot && tierSpec.pilotEnabled) {
        const callOp = CALL_OP_FOR_SLOT[slotId];
        if (pilot.grid.cells.some((c) => c.op === callOp)) {
          result[slotId].push({ level: 'warn', text: 'パイロット呼出中（未搭載）' });
        }
      }
      continue;
    }

    if (typeof refId === 'string') {
      const rom = findRomById(allRoms, refId);
      if (!rom) {
        result[slotId].push({ level: 'error', text: '参照ROM欠損（削除済み）' });
        continue;
      }
      result[slotId].push(
        ...checkCellsCompatibility(
          rom.cells,
          rom.gridSize,
          slotMaxSize,
          bp,
          stats.boosterActive,
          groups,
          slotActiveWeapon
        )
      );
      continue;
    }

    const inlineSub = bp.subroutines.find((s) => s.slotId === slotId);
    if (inlineSub) {
      result[slotId].push(
        ...checkCellsCompatibility(
          inlineSub.cells,
          inlineSub.gridSize,
          slotMaxSize,
          bp,
          stats.boosterActive,
          groups,
          slotActiveWeapon
        )
      );
    } else if (pilot && tierSpec.pilotEnabled) {
      const callOp = CALL_OP_FOR_SLOT[slotId];
      if (pilot.grid.cells.some((c) => c.op === callOp)) {
        result[slotId].push({ level: 'warn', text: 'パイロット呼出中（未搭載）' });
      }
    }
  }

  return result;
}

export function getRomFeatureTags(rom: Pick<ProgramRomEntry, 'cells'>): string[] {
  const tags: string[] = [];
  const add = (t: string) => {
    if (!tags.includes(t)) tags.push(t);
  };
  for (const c of rom.cells) {
    if (c.op === 'fire_group_1' || c.op === 'if_group_1_ready') add('G1');
    if (c.op === 'fire_group_2' || c.op === 'if_group_2_ready') add('G2');
    if (c.op === 'fire_group_3' || c.op === 'if_group_3_ready') add('G3');
    if (c.op === 'fire_group_4' || c.op === 'if_group_4_ready') add('G4');
    if (c.op === 'fire_alpha') add('一斉');
    if (c.op === 'move_jump') add('跳躍');
    if (c.op === 'torso_twist_r' || c.op === 'torso_twist_l' || c.op === 'torso_twist_angle') {
      add('盾');
    }
    if (c.op === 'emergency_cool') add('冷却');
    if (c.useArg) add('ARG');
  }
  return tags;
}

export { BUILTIN_ROMS };
