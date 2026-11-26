import { describe, expect, it } from 'vitest';
import { computeBlueprintRomWeight, computeMechStats } from '../../data/parts';
import {
  DEFAULT_PILOT_PROFILE,
  PILOT_BASIC,
  PILOT_BASIC_HEAVY,
  PRESET_ABC,
  PRESET_ABH,
  PRESET_ABL,
  STARTER_MECHS,
  STARTER_PILOTS,
} from '../../data/presets';
import { buildMechSensorState, createSimulation, isMechAmsActive } from '../../engine/mechSim';
import { createPilotRuntimeState, evaluatePilotTick } from '../../engine/pilotRuntime';
import {
  BUILTIN_ROMS,
  analyzeMechRomCompatibility,
  checkSingleRomCompatibility,
  deleteUserRom,
  findRomById,
  formatRomLabel,
  getAllRoms,
  getRomCategory,
  getRomWeightTags,
  inferRomCategory,
  isBasicBuiltInRom,
  normalizeRomName,
  resolveMechBlueprintRoms,
  saveUserRom,
  stripReferencedSubroutinesForStorage,
} from '../romLibrary';

describe('romLibrary & ROM weight rules', () => {
  it('clamps ROM names to 6 characters and formats 4x4 grid-size suffix', () => {
    expect(normalizeRomName('  高火力スナイパー戦術  ')).toBe('高火力スナイ');
    expect(formatRomLabel({ name: '狙撃戦術', gridSize: 4 })).toBe('狙撃戦術 (4×4)');
    expect(formatRomLabel({ name: '基礎突撃', gridSize: 4 })).toBe('基礎突撃 (4×4)');
  });

  it('keeps all 3 starter presets (ABC-T1, LLB-T1, XHD-T1) valid and non-overweight with 4x4 ROMs mounted (2.5t)', () => {
    for (const preset of STARTER_MECHS) {
      const stats = computeMechStats(preset);
      expect(stats.overweight).toBe(false);
      expect(stats.valid).toBe(true);
      expect(stats.romWeight).toBe(2.5);
    }
    expect(computeMechStats(PRESET_ABL).totalWeight).toBe(33.5);
    expect(computeMechStats(PRESET_ABL).ecmActive).toBe(true);
    const ablSim = createSimulation({
      seed: 11,
      entries: [
        { id: 'abl', name: 'LLB-T1', teamId: 'A', blueprint: PRESET_ABL },
        { id: 'abc', name: 'ABC-T1', teamId: 'B', blueprint: PRESET_ABC },
      ],
    });
    expect(isMechAmsActive(ablSim.mechs[0])).toBe(true);
    expect(computeMechStats(PRESET_ABH).totalWeight).toBe(67.5);
  });

  it('computes 0.5t per 4x4 ROM and 0t when unmounted, resolving legacy rom_std ID aliases', () => {
    const bp = structuredClone(PRESET_ABC);
    expect(computeBlueprintRomWeight(bp)).toBe(2.5);

    // Mount 4x4 ROMs in 3 slots and unmount S2 & S5 (0t each -> 1.5t), including legacy ID alias lookup
    const modified = resolveMechBlueprintRoms(
      {
        ...bp,
        romSlots: {
          S1: 'rom_std_4x4_solo',
          S2: null,
          S3: 'rom_std_s3_recon',
          S4: 'rom_std_s4_cool',
          S5: null,
        },
      },
      BUILTIN_ROMS
    );
    expect(computeBlueprintRomWeight(modified)).toBe(1.5);
    expect(findRomById(BUILTIN_ROMS, 'rom_std_s3_recon')?.id).toBe('rom_basic_s3_move');
    expect(findRomById(BUILTIN_ROMS, 'rom_std_s2_jump')?.id).toBe('rom_basic_light_jump');

    // Direct 4x4 mode only counts S1 (0.5t)
    expect(computeBlueprintRomWeight({ ...bp, controlTier: 'direct_4x4' })).toBe(0.5);
  });

  it('assigns explicit attack/move/control categories on all built-in ROMs and persists custom categories', () => {
    for (const rom of BUILTIN_ROMS) {
      expect(rom.gridSize).toBe(4);
      expect(['attack', 'move', 'control']).toContain(rom.category);
    }
    expect(getRomCategory(BUILTIN_ROMS.find((r) => r.id === 'rom_basic_s1_fire')!)).toBe('attack');
    expect(getRomCategory(BUILTIN_ROMS.find((r) => r.id === 'rom_basic_s3_move')!)).toBe('move');
    expect(getRomCategory(BUILTIN_ROMS.find((r) => r.id === 'rom_basic_s4_cool')!)).toBe('control');
    expect(inferRomCategory([{ row: 0, col: 1, op: 'move_approach', dir: 'E' }])).toBe('move');

    const { saved } = saveUserRom([], {
      name: '青制御',
      category: 'control',
      gridSize: 4,
      cells: [{ row: 0, col: 0, op: 'start', dir: 'E' }],
    });
    expect(saved.category).toBe('control');
  });

  it('saves/updates/deletes user ROMs by reference and propagates edits across mechs', () => {
    const { nextList, saved } = saveUserRom([], {
      name: '電撃強襲テスト',
      gridSize: 4,
      cells: [{ row: 0, col: 0, op: 'start', dir: 'E' }],
    });
    expect(saved.name).toBe('電撃強襲テス');
    expect(saved.builtIn).toBe(false);

    const bpA = {
      ...structuredClone(PRESET_ABC),
      romSlots: { ...PRESET_ABC.romSlots, S1: saved.id },
    };
    const stripped = stripReferencedSubroutinesForStorage(bpA);
    expect(stripped.subroutines).toHaveLength(0);

    const updated = saveUserRom(nextList, {
      id: saved.id,
      name: '電撃改',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_approach', dir: 'E' },
      ],
    });
    expect(updated.updated).toBe(true);
    const resolved = resolveMechBlueprintRoms(stripped, getAllRoms(updated.nextList));
    const s1 = resolved.subroutines.find((s) => s.slotId === 'S1');
    expect(s1?.name).toBe('電撃改 (4×4)');
    expect(s1?.cells).toHaveLength(2);

    const afterDelete = deleteUserRom(updated.nextList, saved.id);
    const resolvedAfterDelete = resolveMechBlueprintRoms(stripped, getAllRoms(afterDelete));
    const issues = analyzeMechRomCompatibility(resolvedAfterDelete, getAllRoms(afterDelete));
    expect(issues.S1.some((i) => i.level === 'error' && i.text.includes('欠損'))).toBe(true);
  });

  it('detects booster, empty weapon group, and pilot CALL to unmounted slot mismatches', () => {
    const heavyWithJump = resolveMechBlueprintRoms(
      {
        ...structuredClone(PRESET_ABH),
        weaponGroups: { G1: ['rightArm'], G2: [], G3: ['rightArm'], G4: ['leftArm'] },
        romSlots: {
          ...PRESET_ABH.romSlots,
          S2: 'rom_basic_light_jump', // uses move_jump on boosterless heavy chassis
          S3: null, // pilot PILOT_BASIC_HEAVY calls S3
        },
      },
      BUILTIN_ROMS
    );

    const issues = analyzeMechRomCompatibility(
      heavyWithJump,
      BUILTIN_ROMS,
      PILOT_BASIC_HEAVY
    );
    expect(issues.S2.some((i) => i.text.includes('跳躍不可'))).toBe(true);
    expect(issues.S1.some((i) => i.text.includes('G2 未割当'))).toBe(true);
    expect(issues.S3.some((i) => i.text.includes('要搭載'))).toBe(true);
  });

  it('does not fall back to S1 in runtime when an unmounted slot is called', () => {
    const bpNoS3 = resolveMechBlueprintRoms(
      {
        ...structuredClone(PRESET_ABC),
        romSlots: {
          ...PRESET_ABC.romSlots,
          S3: null,
        },
      },
      BUILTIN_ROMS
    );
    const pilotCallingS3Only = {
      ...structuredClone(DEFAULT_PILOT_PROFILE),
      grid: {
        gridSize: 6 as const,
        cells: [
          { row: 0, col: 0, op: 'start' as const, dir: 'E' as const },
          { row: 0, col: 1, op: 'call_s3' as const, dir: 'S' as const, durationSec: 0.6 },
        ],
      },
    };
    const sim = createSimulation({
      seed: 42,
      entries: [
        { id: 'm1', name: 'P1', teamId: 'T1', blueprint: bpNoS3, pilot: pilotCallingS3Only },
        { id: 'm2', name: 'E1', teamId: 'T2', blueprint: PRESET_ABC, pilot: DEFAULT_PILOT_PROFILE },
      ],
    });
    const rt = createPilotRuntimeState(pilotCallingS3Only);
    const out = evaluatePilotTick(pilotCallingS3Only, rt, buildMechSensorState(sim, 'm1'), sim.mechs[0], sim);
    expect(out.activeSubroutineSlot).toBeNull();
    expect(rt.activeCall).toBeNull();
  });

  it('supports mounting a 6th ROM in S6 (3.0t total) and executing call_s6 from the pilot grid', () => {
    const bp6 = resolveMechBlueprintRoms(
      {
        ...structuredClone(PRESET_ABC),
        romSlots: {
          ...PRESET_ABC.romSlots,
          S6: 'rom_basic_s5_close',
        },
      },
      BUILTIN_ROMS
    );
    expect(computeBlueprintRomWeight(bp6)).toBe(3.0);

    const pilotCallingS6 = {
      ...structuredClone(DEFAULT_PILOT_PROFILE),
      grid: {
        gridSize: 6 as const,
        cells: [
          { row: 0, col: 0, op: 'start' as const, dir: 'E' as const },
          { row: 0, col: 1, op: 'call_s6' as const, dir: 'S' as const, durationSec: 0.6 },
        ],
      },
    };
    const sim = createSimulation({
      seed: 99,
      entries: [
        { id: 'm1', name: 'P1', teamId: 'T1', blueprint: bp6, pilot: pilotCallingS6 },
        { id: 'm2', name: 'E1', teamId: 'T2', blueprint: PRESET_ABC, pilot: DEFAULT_PILOT_PROFILE },
      ],
    });
    const rt = createPilotRuntimeState(pilotCallingS6);
    const out = evaluatePilotTick(pilotCallingS6, rt, buildMechSensorState(sim, 'm1'), sim.mechs[0], sim);
    expect(out.activeSubroutineSlot).toBe('S6');
  });

  it('validates beginner preset ABC weight budget, optional booster/ECM capacity, and 基本 routines', () => {
    const baseStats = computeMechStats(PRESET_ABC);
    expect(baseStats.boosterActive).toBe(false);
    expect(baseStats.hasBoosterMount).toBe(true);
    expect(baseStats.ecmActive).toBe(false);
    expect(baseStats.hasEcmMount).toBe(true);
    expect(baseStats.totalWeight).toBe(49);
    expect(baseStats.valid).toBe(true);

    const upgradedStats = computeMechStats({
      ...structuredClone(PRESET_ABC),
      boosterEnabled: true,
      ecmEnabled: true,
    });
    expect(upgradedStats.boosterActive).toBe(true);
    expect(upgradedStats.ecmActive).toBe(true);
    expect(upgradedStats.totalWeight).toBe(54.5);
    expect(upgradedStats.overweight).toBe(false);
    expect(upgradedStats.valid).toBe(true);

    const issues = analyzeMechRomCompatibility(PRESET_ABC, BUILTIN_ROMS, PILOT_BASIC);
    for (const slot of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const) {
      expect(issues[slot]).toEqual([]);
    }

    for (const rom of BUILTIN_ROMS) {
      expect(rom.name.startsWith('基本')).toBe(true);
      expect(rom.name.length).toBeLessThanOrEqual(6);
      expect(isBasicBuiltInRom(rom)).toBe(true);
    }

    for (const starter of STARTER_MECHS) {
      expect(starter.defaultPilotId).toBeDefined();
      expect(STARTER_PILOTS.some((p) => p.id === starter.defaultPilotId)).toBe(true);
    }
    expect(PRESET_ABC.defaultPilotId).toBe('pilot_basic');
    expect(PRESET_ABL.defaultPilotId).toBe('pilot_basic_light');
    expect(PRESET_ABH.defaultPilotId).toBe('pilot_basic_heavy');
  });

  it('normalizes weightTags, classifies basic routines, and checks single-ROM compatibility', () => {
    const { saved } = saveUserRom([], {
      name: '重量テスト',
      category: 'attack',
      weightTags: ['assault', 'light', 'assault'],
      gridSize: 4,
      cells: [{ row: 0, col: 0, op: 'start', dir: 'E' }],
    });
    expect(saved.weightTags).toEqual(['light', 'assault']);

    const { saved: untagged } = saveUserRom([], {
      name: '汎用テスト',
      category: 'control',
      weightTags: [],
      gridSize: 4,
      cells: [{ row: 0, col: 0, op: 'start', dir: 'E' }],
    });
    expect(untagged.weightTags).toBeUndefined();

    const basicRoms = BUILTIN_ROMS.filter((r) => isBasicBuiltInRom(r));
    expect(basicRoms).toHaveLength(12);

    const jumpRom = BUILTIN_ROMS.find((r) => r.id === 'rom_basic_light_jump')!;
    const shieldRom = BUILTIN_ROMS.find((r) => r.id === 'rom_basic_heavy_shield')!;
    expect(getRomWeightTags(jumpRom)).toContain('light');
    expect(getRomWeightTags(shieldRom)).toContain('heavy');

    expect(
      checkSingleRomCompatibility(jumpRom, PRESET_ABH).some((i) => i.text.includes('跳躍不可'))
    ).toBe(true);
    expect(checkSingleRomCompatibility(jumpRom, PRESET_ABL)).toEqual([]);
  });
});
