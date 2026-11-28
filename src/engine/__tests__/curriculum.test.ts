import { describe, expect, it } from 'vitest';
import { CURRICULUM_LESSONS, CURRICULUM_MISSIONS, CURRICULUM_PARTS } from '../../data/curriculum';
import { computeMechStats } from '../../data/parts';
import {
  PILOT_BASIC,
  PILOT_BASIC_HEAVY,
  PILOT_BASIC_LIGHT,
  PRESET_ABC,
  PRESET_ABH,
  PRESET_ABL,
  STARTER_MECHS,
  STARTER_PILOTS,
} from '../../data/presets';
import {
  CURRICULUM_PROGRESS_STORAGE_KEY,
  MODEL_ANSWER_REQUIRED_ATTEMPTS,
  extractClearedStepIds,
  getMissionProgressEntry,
  getTeacherUnlockCode,
  isModelAnswerUnlocked,
  loadCurriculumProgress,
  loadTeacherUnlockMode,
  markCurriculumHintViewed,
  recordCurriculumAttempt,
  saveCurriculumProgress,
  saveTeacherUnlockMode,
  verifyTeacherUnlockCode,
} from '../../utils/curriculumProgress';
import {
  buildCurriculumClearCodePayload,
  decodeClearCode,
  encodeClearCode,
} from '../../utils/clearCode';
import { analyzeMechRomCompatibility, BUILTIN_ROMS } from '../../utils/romLibrary';
import { verifyCurriculumMission } from '../curriculumVerifier';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}

describe('24-stage 2-part curriculum, verified model solutions & unlock gate', () => {
  it('validates all 3 starter mechs (ABC-T1, LLB-T1, XHD-T1) and 3 basic starter pilots', () => {
    expect(STARTER_MECHS).toHaveLength(3);
    expect(STARTER_PILOTS).toHaveLength(3);
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

    const emptyCompat = { S1: [], S2: [], S3: [], S4: [], S5: [], S6: [] };
    expect(analyzeMechRomCompatibility(PRESET_ABC, BUILTIN_ROMS, PILOT_BASIC)).toEqual(emptyCompat);
    expect(analyzeMechRomCompatibility(PRESET_ABL, BUILTIN_ROMS, PILOT_BASIC_LIGHT)).toEqual(emptyCompat);
    expect(analyzeMechRomCompatibility(PRESET_ABH, BUILTIN_ROMS, PILOT_BASIC_HEAVY)).toEqual(emptyCompat);
  });

  it('defines 2 parts, 8 lessons (60m each), and 24 stages with hints and model solutions', () => {
    expect(CURRICULUM_PARTS).toHaveLength(2);
    expect(CURRICULUM_LESSONS).toHaveLength(8);
    expect(CURRICULUM_MISSIONS).toHaveLength(24);
    expect(CURRICULUM_MISSIONS.filter((m) => m.part === 'part1_basics')).toHaveLength(12);
    expect(CURRICULUM_MISSIONS.filter((m) => m.part === 'part2_tactics')).toHaveLength(12);
    for (const spec of CURRICULUM_MISSIONS) {
      expect(spec.hint.trim().length).toBeGreaterThan(10);
      expect(spec.modelSolutionSummary.trim().length).toBeGreaterThan(10);
    }
  });

  it('fails on every broken starter AND passes on every model solution across all 24 stages', () => {
    const failures: string[] = [];
    for (const spec of CURRICULUM_MISSIONS) {
      const broken = spec.buildBrokenStarter();
      const failRes = verifyCurriculumMission(spec.id, broken.mech, broken.pilot);
      if (failRes.passed) {
        failures.push(`BROKEN PASSED: ${spec.stageCode} (${spec.id}) | ${failRes.summaryText}`);
      }

      const sol = spec.buildModelSolution();
      const passRes = verifyCurriculumMission(spec.id, sol.mech, sol.pilot);
      if (!passRes.passed) {
        failures.push(
          `SOL FAILED: ${spec.stageCode} (${spec.id}) [${passRes.checklist
            .filter((c) => !c.ok)
            .map((c) => c.label)
            .join(' / ')}] | ${passRes.summaryText}`
        );
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('enforces hint viewed + 5 distinct modified failed attempts before unlocking model answer', () => {
    const spec = CURRICULUM_MISSIONS[1]; // p1_2_balloon_pop
    const starter = spec.buildBrokenStarter();
    let progress = {};

    // 1. Empty / non-actionable program does NOT count
    const emptyMech = structuredClone(starter.mech);
    emptyMech.subroutines = emptyMech.subroutines.map((s) =>
      s.slotId === 'S1'
        ? {
            ...s,
            cells: [
              { row: 0, col: 0, op: 'start', dir: 'E' },
              { row: 0, col: 1, op: 'wire', dir: 'E' },
            ],
          }
        : s
    );
    const emptyRes = recordCurriculumAttempt(
      progress,
      spec.id,
      spec.buildBrokenStarter,
      emptyMech,
      starter.pilot,
      false
    );
    expect(emptyRes.countedAsFailedAttempt).toBe(false);
    expect(emptyRes.rejectReason).toBe('empty_program');

    // 2. Unchanged starter program does NOT count
    const unchangedRes = recordCurriculumAttempt(
      progress,
      spec.id,
      spec.buildBrokenStarter,
      starter.mech,
      starter.pilot,
      false
    );
    expect(unchangedRes.countedAsFailedAttempt).toBe(false);
    expect(unchangedRes.rejectReason).toBe('unchanged_starter');

    // 3. Running the exact same wrong modification twice counts ONLY once
    const mod1 = structuredClone(starter.mech);
    mod1.subroutines = mod1.subroutines.map((s) =>
      s.slotId === 'S1'
        ? {
            ...s,
            cells: [
              { row: 0, col: 0, op: 'start', dir: 'E' },
              { row: 0, col: 1, op: 'wait', dir: 'E', durationSec: 0.4 },
            ],
          }
        : s
    );
    const firstModRes = recordCurriculumAttempt(
      progress,
      spec.id,
      spec.buildBrokenStarter,
      mod1,
      starter.pilot,
      false
    );
    expect(firstModRes.countedAsFailedAttempt).toBe(true);
    progress = firstModRes.nextProgress;

    const dupRes = recordCurriculumAttempt(
      progress,
      spec.id,
      spec.buildBrokenStarter,
      mod1,
      starter.pilot,
      false
    );
    expect(dupRes.countedAsFailedAttempt).toBe(false);
    expect(dupRes.rejectReason).toBe('duplicate_attempt');

    // 4. Add 4 more DISTINCT wrong programs (total 5) WITHOUT viewing hint -> still locked!
    for (let k = 2; k <= MODEL_ANSWER_REQUIRED_ATTEMPTS; k++) {
      const m = structuredClone(starter.mech);
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              ...s,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'wait', dir: 'S', durationSec: k * 0.2 },
              ],
            }
          : s
      );
      const r = recordCurriculumAttempt(progress, spec.id, spec.buildBrokenStarter, m, starter.pilot, false);
      expect(r.countedAsFailedAttempt).toBe(true);
      progress = r.nextProgress;
    }

    const entryBeforeHint = getMissionProgressEntry(progress, spec.id);
    expect(entryBeforeHint.failedHashes).toHaveLength(5);
    expect(isModelAnswerUnlocked(entryBeforeHint)).toBe(false);

    // 5. View hint -> NOW unlocked!
    progress = markCurriculumHintViewed(progress, spec.id);
    const entryAfterHint = getMissionProgressEntry(progress, spec.id);
    expect(isModelAnswerUnlocked(entryAfterHint)).toBe(true);

    // Persistence round-trip
    const mem = createMemoryStorage();
    saveCurriculumProgress(progress, mem);
    expect(mem.getItem(CURRICULUM_PROGRESS_STORAGE_KEY)).toBeTruthy();
    const reloaded = loadCurriculumProgress(mem);
    expect(isModelAnswerUnlocked(getMissionProgressEntry(reloaded, spec.id))).toBe(true);

    // Passing records cleared step
    const sol = spec.buildModelSolution();
    const passRec = recordCurriculumAttempt(
      reloaded,
      spec.id,
      spec.buildBrokenStarter,
      sol.mech,
      sol.pilot,
      true
    );
    expect(extractClearedStepIds(passRec.nextProgress)).toContain(spec.id);
  });

  it('encodes, decodes, preserves progress metadata, and tamper-checks CMK1- clear codes', () => {
    let progress = markCurriculumHintViewed({}, 'p1_1_capture_walk');
    const starter = CURRICULUM_MISSIONS[0].buildBrokenStarter();
    const altMech = structuredClone(starter.mech);
    altMech.subroutines = altMech.subroutines.map((s) =>
      s.slotId === 'S1'
        ? { ...s, cells: [{ row: 0, col: 0, op: 'start', dir: 'E' }, { row: 0, col: 1, op: 'wait', dir: 'S', durationSec: 0.4 }] }
        : s
    );
    progress = recordCurriculumAttempt(
      progress,
      'p1_1_capture_walk',
      CURRICULUM_MISSIONS[0].buildBrokenStarter,
      altMech,
      starter.pilot,
      false
    ).nextProgress;
    progress = recordCurriculumAttempt(
      progress,
      'p1_1_capture_walk',
      CURRICULUM_MISSIONS[0].buildBrokenStarter,
      altMech,
      starter.pilot,
      true
    ).nextProgress;

    const payload = buildCurriculumClearCodePayload(
      { userName: 'ACE-01', userId: 'uuid-test-1234' },
      progress,
      '2026-11-28T12:00:00Z'
    );
    const code = encodeClearCode(payload);
    expect(code.startsWith('CMK1-')).toBe(true);

    const decoded = decodeClearCode(code);
    expect(decoded.studentName).toBe('ACE-01');
    expect(decoded.userId).toBe('uuid-test-1234');
    expect(decoded.clearedSteps).toEqual(['p1_1_capture_walk']);
    expect(decoded.part1Cleared).toBe(1);
    expect(decoded.part2Cleared).toBe(0);
    expect(decoded.totalStages).toBe(24);
    expect(decoded.hintViewedSteps).toEqual(['p1_1_capture_walk']);
    expect(decoded.attemptCounts).toEqual({ p1_1_capture_walk: 1 });

    const tampered = code.slice(0, 12) + (code[12] === 'A' ? 'B' : 'A') + code.slice(13);
    expect(() => decodeClearCode(tampered)).toThrow('チェックサム');
  });

  it('supports daily 4-digit MMDD teacher unlock mode with next-day expiration', () => {
    const day1 = new Date(2026, 3, 5, 10, 0, 0); // 0405
    const day2 = new Date(2026, 3, 6, 9, 0, 0); // 0406
    expect(getTeacherUnlockCode(day1)).toBe('0405');
    expect(verifyTeacherUnlockCode('0405', day1)).toBe(true);
    expect(verifyTeacherUnlockCode('０４０５', day1)).toBe(true);
    expect(verifyTeacherUnlockCode('9999', day1)).toBe(false);
    expect(verifyTeacherUnlockCode('0406', day1)).toBe(false);

    // Without teacher mode, untouched mission is locked; with teacher mode, immediately unlocked
    expect(isModelAnswerUnlocked(undefined, false)).toBe(false);
    expect(isModelAnswerUnlocked(undefined, true)).toBe(true);

    const mem = createMemoryStorage();
    expect(loadTeacherUnlockMode(day1, mem)).toBe(false);
    saveTeacherUnlockMode(true, day1, mem);
    expect(loadTeacherUnlockMode(day1, mem)).toBe(true);
    expect(loadTeacherUnlockMode(day2, mem)).toBe(false);
    saveTeacherUnlockMode(false, day1, mem);
    expect(loadTeacherUnlockMode(day1, mem)).toBe(false);

    // Teacher mode executions must NEVER record clears or failed attempts into student progress
    const s = CURRICULUM_MISSIONS[0];
    const sol = s.buildModelSolution();
    const tPass = recordCurriculumAttempt({}, s.id, s.buildBrokenStarter, sol.mech, sol.pilot, true, true);
    expect(tPass.rejectReason).toBe('teacher_mode');
    expect(extractClearedStepIds(tPass.nextProgress)).toEqual([]);
    const tFail = recordCurriculumAttempt({}, s.id, s.buildBrokenStarter, sol.mech, sol.pilot, false, true);
    expect(tFail.countedAsFailedAttempt).toBe(false);
    expect(getMissionProgressEntry(tFail.nextProgress, s.id).failedHashes).toEqual([]);
  });
});
