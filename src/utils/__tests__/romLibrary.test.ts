import { describe, expect, it } from 'vitest';
import { computeBlueprintRomWeight, computeMechStats } from '../../data/parts';
import { DEFAULT_PILOT_PROFILE, PRESET_FORTRESS, PRESET_STRIKER, PRESET_VANGUARD, STARTER_MECHS } from '../../data/presets';
import { createSimulation } from '../../engine/mechSim';
import { createPilotRuntimeState, evaluatePilotTick } from '../../engine/pilotRuntime';
import { buildMechSensorState } from '../../engine/mechSim';
import {
  BUILTIN_ROMS,
  analyzeMechRomCompatibility,
  deleteUserRom,
  findRomById,
  formatRomLabel,
  getAllRoms,
  getRomCategory,
  inferRomCategory,
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

  it('keeps all 4 starter presets valid and non-overweight with 4x4 ROMs mounted (2.5t)', () => {
    for (const preset of STARTER_MECHS) {
      const stats = computeMechStats(preset);
      expect(stats.overweight).toBe(false);
      expect(stats.valid).toBe(true);
      expect(stats.romWeight).toBe(2.5);
    }
    expect(computeMechStats(PRESET_STRIKER).totalWeight).toBeLessThanOrEqual(35);
  });

  it('computes 0.5t per 4x4 ROM and 0t when unmounted', () => {
    const bp = structuredClone(PRESET_VANGUARD);
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
    expect(findRomById(BUILTIN_ROMS, 'rom_std_s3_recon')?.id).toBe('rom_std_s3_range');

    // Direct 4x4 mode only counts S1 (0.5t)
    expect(computeBlueprintRomWeight({ ...bp, controlTier: 'direct_4x4' })).toBe(0.5);
  });

  it('assigns explicit attack/move/control categories on all built-in ROMs and persists custom categories', () => {
    for (const rom of BUILTIN_ROMS) {
      expect(rom.gridSize).toBe(4);
      expect(['attack', 'move', 'control']).toContain(rom.category);
    }
    expect(getRomCategory(BUILTIN_ROMS.find((r) => r.id === 'rom_std_s1_bal')!)).toBe('attack');
    expect(getRomCategory(BUILTIN_ROMS.find((r) => r.id === 'rom_std_s3_range')!)).toBe('move');
    expect(getRomCategory(BUILTIN_ROMS.find((r) => r.id === 'rom_std_s4_cool')!)).toBe('control');
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
      ...structuredClone(PRESET_VANGUARD),
      romSlots: { ...PRESET_VANGUARD.romSlots, S1: saved.id },
    };
    const stripped = stripReferencedSubroutinesForStorage(bpA);
    expect(stripped.subroutines).toHaveLength(0);

    // Update ROM in place -> resolving bpA picks up new cell automatically
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

    // Delete ROM -> compatibility checker flags missing reference
    const afterDelete = deleteUserRom(updated.nextList, saved.id);
    const resolvedAfterDelete = resolveMechBlueprintRoms(stripped, getAllRoms(afterDelete));
    const issues = analyzeMechRomCompatibility(resolvedAfterDelete, getAllRoms(afterDelete));
    expect(issues.S1.some((i) => i.level === 'error' && i.text.includes('欠損'))).toBe(true);
  });

  it('detects booster, empty weapon group, and pilot CALL to unmounted slot mismatches', () => {
    const fortressWithJump = resolveMechBlueprintRoms(
      {
        ...structuredClone(PRESET_FORTRESS),
        weaponGroups: { G1: ['rightArm'], G2: [], G3: ['rightArm'], G4: ['leftArm'] },
        romSlots: {
          ...PRESET_FORTRESS.romSlots,
          S2: 'rom_std_s2_jump', // uses move_jump & fire_alpha on boosterless chassis
          S3: null, // pilot DEFAULT_PILOT_PROFILE calls S3
        },
      },
      BUILTIN_ROMS
    );

    const issues = analyzeMechRomCompatibility(
      fortressWithJump,
      BUILTIN_ROMS,
      DEFAULT_PILOT_PROFILE
    );
    expect(issues.S2.some((i) => i.text.includes('跳躍不可'))).toBe(true);
    expect(issues.S1.some((i) => i.text.includes('G2 未割当'))).toBe(true);
    expect(issues.S3.some((i) => i.text.includes('未搭載'))).toBe(true);
  });

  it('does not fall back to S1 in runtime when an unmounted slot is called', () => {
    const bpNoS3 = resolveMechBlueprintRoms(
      {
        ...structuredClone(PRESET_VANGUARD),
        romSlots: {
          ...PRESET_VANGUARD.romSlots,
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
        { id: 'm2', name: 'E1', teamId: 'T2', blueprint: PRESET_VANGUARD, pilot: DEFAULT_PILOT_PROFILE },
      ],
    });
    const rt = createPilotRuntimeState(pilotCallingS3Only);
    const out = evaluatePilotTick(pilotCallingS3Only, rt, buildMechSensorState(sim, 'm1'), sim.mechs[0], sim);
    expect(out.activeSubroutineSlot).toBeNull();
    expect(rt.activeCall).toBeNull();
  });
});
