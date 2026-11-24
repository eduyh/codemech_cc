import { describe, expect, it } from 'vitest';
import { CURRICULUM_MISSIONS } from '../../data/curriculum';
import { computeMechStats } from '../../data/parts';
import {
  DEFAULT_PILOT_PROFILE,
  PRESET_TEMPEST,
  PRESET_VANGUARD,
  STARTER_MECHS,
  STARTER_PILOTS,
} from '../../data/presets';
import { decodeClearCode, encodeClearCode } from '../../utils/clearCode';
import { verifyCurriculumMission } from '../curriculumVerifier';

describe('5-step debug curriculum & CMK1- clear code', () => {
  it('validates all 8 starter mechs (with 6x6x2 + 4x4x3 subroutines) and 4 starter pilots', () => {
    expect(STARTER_MECHS).toHaveLength(8);
    expect(STARTER_PILOTS).toHaveLength(4);
    for (const bp of STARTER_MECHS) {
      const stats = computeMechStats(bp);
      expect(stats.valid, `${bp.id}: ${stats.validationErrors.join(', ')}`).toBe(true);
      expect(bp.subroutines.map((s) => `${s.slotId}:${s.gridSize}`)).toEqual([
        'S1:6',
        'S2:6',
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

  it('fails cleanly on each broken starter and passes all 5 steps when fixed', () => {
    // Verify broken starters fail each of the 5 missions
    for (const spec of CURRICULUM_MISSIONS) {
      const broken = spec.buildBrokenStarter();
      const failRes = verifyCurriculumMission(spec.id, broken.mech, broken.pilot);
      expect(failRes.passed, `${spec.id} broken starter unexpectedly passed`).toBe(false);
    }

    // Step 1 Pass
    const s1Pass = verifyCurriculumMission('step1_pilot_routing', PRESET_VANGUARD, DEFAULT_PILOT_PROFILE);
    expect(s1Pass.passed, s1Pass.summaryText).toBe(true);

    // Step 2 Pass (fixed Tempest + DEFAULT_PILOT_PROFILE cooling hysteresis)
    const s2Pass = verifyCurriculumMission('step2_heat_hysteresis', PRESET_TEMPEST, DEFAULT_PILOT_PROFILE);
    expect(s2Pass.passed, s2Pass.summaryText).toBe(true);

    // Step 3 Pass
    const s3Pass = verifyCurriculumMission('step3_subroutine_4x4', PRESET_VANGUARD, DEFAULT_PILOT_PROFILE);
    expect(s3Pass.passed, s3Pass.summaryText).toBe(true);

    // Step 4 Pass
    const s4Pass = verifyCurriculumMission('step4_assemble_and_6x6', PRESET_VANGUARD, DEFAULT_PILOT_PROFILE);
    expect(s4Pass.passed, s4Pass.summaryText).toBe(true);

    // Step 5 Pass
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
});
