import { describe, expect, it } from 'vitest';
import { CURRICULUM_MISSIONS } from '../../data/curriculum';
import { computeMechStats } from '../../data/parts';
import {
  DEFAULT_PILOT_PROFILE,
  PILOT_BASIC,
  PRESET_ABC,
  PRESET_VANGUARD,
  STARTER_MECHS,
  STARTER_PILOTS,
} from '../../data/presets';
import { buildBasicSolo4x4Cells, buildSolo4x4Cells } from '../../data/romTemplates';
import { decodeClearCode, encodeClearCode } from '../../utils/clearCode';
import { verifyCurriculumMission } from '../curriculumVerifier';

describe('7-step debug curriculum & CMK1- clear code', () => {
  it('validates all 5 starter mechs (with 4x4x5 subroutines) and 5 starter pilots', () => {
    expect(STARTER_MECHS).toHaveLength(5);
    expect(STARTER_PILOTS).toHaveLength(5);
    for (const bp of STARTER_MECHS) {
      const stats = computeMechStats(bp);
      expect(stats.valid, `${bp.id}: ${stats.validationErrors.join(', ')}`).toBe(true);
      expect(bp.subroutines.map((s) => `${s.slotId}:${s.gridSize}`)).toEqual([
        'S1:4',
        'S2:4',
        'S3:4',
        'S4:4',
        'S5:4',
      ]);
    }
    for (const pilot of STARTER_PILOTS) {
      expect(pilot.grid.gridSize).toBe(6);
      expect(pilot.grid.cells.some((c) => c.op === 'start')).toBe(true);
    }
  });

  it('fails cleanly on each broken starter and passes all 7 steps when fixed', () => {
    expect(CURRICULUM_MISSIONS).toHaveLength(7);

    // Verify broken starters fail each of the 7 missions
    for (const spec of CURRICULUM_MISSIONS) {
      const broken = spec.buildBrokenStarter();
      const failRes = verifyCurriculumMission(spec.id, broken.mech, broken.pilot);
      expect(failRes.passed, `${spec.id} broken starter unexpectedly passed`).toBe(false);
    }

    // Step 1 Pass: simple 4-cell direct_4x4 line without pilot
    const robot4Mech = structuredClone(PRESET_VANGUARD);
    robot4Mech.controlTier = 'direct_4x4';
    robot4Mech.subroutines = robot4Mech.subroutines.map((s) =>
      s.slotId === 'S1'
        ? {
            slotId: 'S1',
            name: '基礎4x4',
            gridSize: 6,
            cells: [
              { row: 0, col: 0, op: 'start', dir: 'E' },
              { row: 0, col: 1, op: 'move_approach', dir: 'E' },
              { row: 0, col: 2, op: 'torso_track', dir: 'E' },
              { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
            ],
          }
        : s
    );
    const emptyPilot = {
      version: 2,
      id: 'unused_pilot',
      name: 'Unused',
      grid: { gridSize: 6 as const, cells: [{ row: 0, col: 0, op: 'start' as const, dir: 'E' as const }] },
    };
    const s0Pass = verifyCurriculumMission('step0_robot_4x4', robot4Mech, emptyPilot);
    expect(s0Pass.passed, s0Pass.summaryText).toBe(true);

    // Step 2 Pass: 4x4 direct robot with self-contained solo branch ROM
    const robot6Mech = structuredClone(PRESET_VANGUARD);
    robot6Mech.controlTier = 'direct_4x4';
    robot6Mech.subroutines = robot6Mech.subroutines.map((s) =>
      s.slotId === 'S1'
        ? {
            slotId: 'S1',
            name: '単体標準戦 (4×4)',
            gridSize: 4,
            cells: buildSolo4x4Cells(145),
          }
        : s
    );
    const s0bPass = verifyCurriculumMission('step0b_robot_6x6', robot6Mech, emptyPilot);
    expect(s0bPass.passed, s0bPass.summaryText).toBe(true);

    // Step 3 Pass (Pilot 6x6 routing)
    const s1Pass = verifyCurriculumMission('step1_pilot_routing', PRESET_VANGUARD, DEFAULT_PILOT_PROFILE);
    expect(s1Pass.passed, s1Pass.summaryText).toBe(true);

    // Step 4 Pass (fixed hot-laser Vanguard + DEFAULT_PILOT_PROFILE cooling hysteresis)
    const hotStep2Mech = CURRICULUM_MISSIONS.find((m) => m.id === 'step2_heat_hysteresis')!.buildBrokenStarter().mech;
    const s2Pass = verifyCurriculumMission('step2_heat_hysteresis', hotStep2Mech, DEFAULT_PILOT_PROFILE);
    expect(s2Pass.passed, s2Pass.summaryText).toBe(true);

    // Step 5 Pass
    const s3Pass = verifyCurriculumMission('step3_subroutine_4x4', PRESET_VANGUARD, DEFAULT_PILOT_PROFILE);
    expect(s3Pass.passed, s3Pass.summaryText).toBe(true);

    // Step 6 Pass
    const s4Pass = verifyCurriculumMission('step4_assemble_and_6x6', PRESET_VANGUARD, DEFAULT_PILOT_PROFILE);
    expect(s4Pass.passed, s4Pass.summaryText).toBe(true);

    // Step 7 Pass
    const s5Pass = verifyCurriculumMission('step5_transfer_squad', PRESET_VANGUARD, DEFAULT_PILOT_PROFILE);
    expect(s5Pass.passed, s5Pass.summaryText).toBe(true);
  });

  it('encodes, decodes, and tamper-checks CMK1- clear codes', () => {
    const code = encodeClearCode({
      studentName: 'テスト太郎',
      clearedSteps: ['step1_pilot_routing', 'step2_heat_hysteresis'],
      issuedAt: '2026-11-24T17:00:00Z',
    });
    expect(code.startsWith('CMK1-')).toBe(true);

    const decoded = decodeClearCode(code);
    expect(decoded.studentName).toBe('テスト太郎');
    expect(decoded.clearedSteps).toEqual(['step1_pilot_routing', 'step2_heat_hysteresis']);

    const tampered = code.slice(0, 12) + (code[12] === 'A' ? 'B' : 'A') + code.slice(13);
    expect(() => decodeClearCode(tampered)).toThrow('チェックサム');
  });

  it('passes all 7 curriculum missions with beginner preset ABC and PILOT_BASIC', () => {
    const emptyPilot = {
      version: 2,
      id: 'unused_pilot',
      name: 'Unused',
      grid: {
        gridSize: 6 as const,
        cells: [{ row: 0, col: 0, op: 'start' as const, dir: 'E' as const }],
      },
    };

    // Step 1 Pass: ABC in direct_4x4 mode with simple 4-cell S1
    const abcStep1 = structuredClone(PRESET_ABC);
    abcStep1.controlTier = 'direct_4x4';
    abcStep1.subroutines = abcStep1.subroutines.map((s) =>
      s.slotId === 'S1'
        ? {
            slotId: 'S1',
            name: '基本直進4x4',
            gridSize: 4,
            cells: [
              { row: 0, col: 0, op: 'start', dir: 'E' },
              { row: 0, col: 1, op: 'move_approach', dir: 'E' },
              { row: 0, col: 2, op: 'torso_track', dir: 'E' },
              { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
            ],
          }
        : s
    );
    const s0 = verifyCurriculumMission('step0_robot_4x4', abcStep1, emptyPilot);
    expect(s0.passed, s0.summaryText).toBe(true);

    // Step 2 Pass: ABC in direct_4x4 mode with buildBasicSolo4x4Cells(200)
    const abcStep2 = structuredClone(PRESET_ABC);
    abcStep2.controlTier = 'direct_4x4';
    abcStep2.subroutines = abcStep2.subroutines.map((s) =>
      s.slotId === 'S1'
        ? {
            slotId: 'S1',
            name: '基本単体 (4×4)',
            gridSize: 4,
            cells: buildBasicSolo4x4Cells(200),
          }
        : s
    );
    const s0b = verifyCurriculumMission('step0b_robot_6x6', abcStep2, emptyPilot);
    expect(s0b.passed, s0b.summaryText).toBe(true);

    // Step 3 Pass: ABC + PILOT_BASIC
    const s1 = verifyCurriculumMission('step1_pilot_routing', PRESET_ABC, PILOT_BASIC);
    expect(s1.passed, s1.summaryText).toBe(true);

    // Step 4 Pass: hot-laser mission mech + PILOT_BASIC cooling hysteresis
    const hotStep2Mech = CURRICULUM_MISSIONS.find((m) => m.id === 'step2_heat_hysteresis')!.buildBrokenStarter().mech;
    const s2 = verifyCurriculumMission('step2_heat_hysteresis', hotStep2Mech, PILOT_BASIC);
    expect(s2.passed, s2.summaryText).toBe(true);

    // Step 5 Pass
    const s3 = verifyCurriculumMission('step3_subroutine_4x4', PRESET_ABC, PILOT_BASIC);
    expect(s3.passed, s3.summaryText).toBe(true);

    // Step 6 Pass
    const s4 = verifyCurriculumMission('step4_assemble_and_6x6', PRESET_ABC, PILOT_BASIC);
    expect(s4.passed, s4.summaryText).toBe(true);

    // Step 7 Pass
    const s5 = verifyCurriculumMission('step5_transfer_squad', PRESET_ABC, PILOT_BASIC);
    expect(s5.passed, s5.summaryText).toBe(true);
  });
});
