import {
  CurriculumStepId,
  MechBlueprint,
  MechSubroutineCell,
  PilotGridCell,
  PilotProfile,
} from '../types/mech';
import { StorageLike, CURRICULUM_STORAGE_KEY } from './userProfile';

export const CURRICULUM_PROGRESS_STORAGE_KEY = 'codemech_curriculum_progress_v3';
export const TEACHER_UNLOCK_STORAGE_KEY = 'codemech_teacher_mode_v1';
export const MODEL_ANSWER_REQUIRED_ATTEMPTS = 5;

export interface MissionAttemptProgress {
  hintViewed: boolean;
  failedHashes: string[];
  cleared: boolean;
}

export type CurriculumProgressMap = Record<string, MissionAttemptProgress>;

export type FailedAttemptRejectReason =
  | 'teacher_mode'
  | 'empty_program'
  | 'unchanged_starter'
  | 'duplicate_attempt'
  | null;

export interface RecordAttemptResult {
  nextProgress: CurriculumProgressMap;
  entry: MissionAttemptProgress;
  countedAsFailedAttempt: boolean;
  rejectReason: FailedAttemptRejectReason;
  unlockedNow: boolean;
}

function getDefaultStorage(): StorageLike | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function normalizeSubCellsForHash(mech: MechBlueprint): unknown[] {
  const tier = mech.controlTier ?? 'pilot_full';
  const activeSlots = tier === 'direct_4x4' ? new Set(['S1']) : null;
  const rows: unknown[] = [];
  for (const sub of mech.subroutines ?? []) {
    if (activeSlots && !activeSlots.has(sub.slotId)) continue;
    const maxDim = tier === 'direct_4x4' ? 4 : sub.gridSize;
    const activeCells = (sub.cells ?? [])
      .filter(
        (c: MechSubroutineCell) =>
          c.row >= 0 &&
          c.row < maxDim &&
          c.col >= 0 &&
          c.col < maxDim &&
          c.op !== 'empty'
      )
      .map((c) => ({
        r: c.row,
        c: c.col,
        op: c.op,
        d: c.dir,
        ed: c.elseDir ?? null,
        du: c.durationSec ?? null,
        p: c.param ?? null,
        ua: Boolean(c.useArg),
        dirMode: c.direction ?? null,
        jd: c.jumpDir ?? null,
        ap: c.aimPoint ?? null,
        ws: c.weaponSlot ?? null,
      }))
      .sort((a, b) => a.r - b.r || a.c - b.c);
    rows.push({ slot: sub.slotId, cells: activeCells });
  }
  return rows.sort((a, b) =>
    String((a as { slot: string }).slot).localeCompare(String((b as { slot: string }).slot))
  );
}

function normalizePilotCellsForHash(mech: MechBlueprint, pilot: PilotProfile): unknown[] {
  if ((mech.controlTier ?? 'pilot_full') !== 'pilot_full') return [];
  return (pilot.grid?.cells ?? [])
    .filter((c: PilotGridCell) => c.op !== 'empty')
    .map((c) => ({
      r: c.row,
      c: c.col,
      op: c.op,
      d: c.dir,
      ed: c.elseDir ?? null,
      p: c.param ?? null,
      du: c.durationSec ?? null,
      t: c.target ?? null,
      part: c.partId ?? null,
      ws: c.weaponSlot ?? null,
    }))
    .sort((a, b) => a.r - b.r || a.c - b.c);
}

function fnv1a32(str: string, init = 2166136261): string {
  let h = init >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Computes a deterministic canonical fingerprint of a student's editable program + hardware loadout
 * so repeated runs of the identical broken setup or empty grid are detected accurately.
 */
export function computeCurriculumAttemptFingerprint(
  mech: MechBlueprint,
  pilot: PilotProfile
): string {
  const payload = JSON.stringify({
    tier: mech.controlTier ?? 'pilot_full',
    chassisId: mech.chassisId,
    boosterEnabled: Boolean(mech.boosterEnabled),
    ecmEnabled: Boolean(mech.ecmEnabled),
    lrmFireMode: mech.lrmFireMode ?? 'salvo',
    lrmFireModes: mech.lrmFireModes ?? null,
    extraHeatSinks: mech.extraHeatSinks ?? 0,
    extraAmmo: mech.extraAmmo ?? null,
    weaponMountCounts: mech.weaponMountCounts ?? null,
    parts: mech.parts,
    weaponGroups: mech.weaponGroups ?? null,
    armor: mech.armor,
    subs: normalizeSubCellsForHash(mech),
    pilot: normalizePilotCellsForHash(mech, pilot),
  });
  return `${fnv1a32(payload, 0x811c9dc5)}${fnv1a32(payload, 0x9e3779b9)}`;
}

function hasActionableProgramCells(mech: MechBlueprint, pilot: PilotProfile): boolean {
  const tier = mech.controlTier ?? 'pilot_full';
  if (tier === 'pilot_full') {
    const pilotActionable = (pilot.grid?.cells ?? []).some(
      (c) => c.op !== 'empty' && c.op !== 'start' && c.op !== 'wire'
    );
    const subActionable = (mech.subroutines ?? []).some((s) =>
      (s.cells ?? []).some((c) => c.op !== 'empty' && c.op !== 'start' && c.op !== 'wire')
    );
    return pilotActionable || subActionable;
  }
  const s1 = (mech.subroutines ?? []).find((s) => s.slotId === 'S1');
  const maxDim = tier === 'direct_4x4' ? 4 : 6;
  return Boolean(
    s1?.cells.some(
      (c) =>
        c.row >= 0 &&
        c.row < maxDim &&
        c.col >= 0 &&
        c.col < maxDim &&
        c.op !== 'empty' &&
        c.op !== 'start' &&
        c.op !== 'wire'
    )
  );
}

function hardwareFingerprint(mech: MechBlueprint): string {
  return JSON.stringify({
    chassisId: mech.chassisId,
    boosterEnabled: Boolean(mech.boosterEnabled),
    ecmEnabled: Boolean(mech.ecmEnabled),
    extraHeatSinks: mech.extraHeatSinks ?? 0,
    extraAmmo: mech.extraAmmo ?? null,
    weaponMountCounts: mech.weaponMountCounts ?? null,
    parts: mech.parts,
    weaponGroups: mech.weaponGroups ?? null,
    armor: mech.armor,
  });
}

/**
 * Returns false if the student left the program completely empty/inert without any hardware changes.
 */
export function hasMeaningfulCurriculumProgram(
  mech: MechBlueprint,
  pilot: PilotProfile,
  starterMech?: MechBlueprint
): boolean {
  if (hasActionableProgramCells(mech, pilot)) return true;
  if (starterMech && hardwareFingerprint(mech) !== hardwareFingerprint(starterMech)) {
    return true;
  }
  return false;
}

export function getMissionProgressEntry(
  progress: CurriculumProgressMap,
  missionId: CurriculumStepId
): MissionAttemptProgress {
  const cur = progress[missionId];
  return cur
    ? {
        hintViewed: Boolean(cur.hintViewed),
        failedHashes: Array.isArray(cur.failedHashes) ? cur.failedHashes : [],
        cleared: Boolean(cur.cleared),
      }
    : { hintViewed: false, failedHashes: [], cleared: false };
}

export function isModelAnswerUnlocked(
  entry: MissionAttemptProgress | undefined,
  teacherUnlocked = false
): boolean {
  if (teacherUnlocked) return true;
  if (!entry) return false;
  return Boolean(entry.hintViewed && entry.failedHashes.length >= MODEL_ANSWER_REQUIRED_ATTEMPTS);
}

export function markCurriculumHintViewed(
  progress: CurriculumProgressMap,
  missionId: CurriculumStepId
): CurriculumProgressMap {
  const prev = getMissionProgressEntry(progress, missionId);
  if (prev.hintViewed) return progress;
  return {
    ...progress,
    [missionId]: {
      ...prev,
      hintViewed: true,
    },
  };
}

export function recordCurriculumAttempt(
  progress: CurriculumProgressMap,
  missionId: CurriculumStepId,
  buildBrokenStarter: () => { mech: MechBlueprint; pilot: PilotProfile },
  playerMech: MechBlueprint,
  playerPilot: PilotProfile,
  passed: boolean,
  teacherMode = false
): RecordAttemptResult {
  const prev = getMissionProgressEntry(progress, missionId);
  if (teacherMode) {
    return {
      nextProgress: progress,
      entry: prev,
      countedAsFailedAttempt: false,
      rejectReason: 'teacher_mode',
      unlockedNow: false,
    };
  }
  if (passed) {
    const nextEntry: MissionAttemptProgress = { ...prev, cleared: true };
    return {
      nextProgress: { ...progress, [missionId]: nextEntry },
      entry: nextEntry,
      countedAsFailedAttempt: false,
      rejectReason: null,
      unlockedNow: false,
    };
  }

  const starter = buildBrokenStarter();
  if (!hasMeaningfulCurriculumProgram(playerMech, playerPilot, starter.mech)) {
    return {
      nextProgress: progress,
      entry: prev,
      countedAsFailedAttempt: false,
      rejectReason: 'empty_program',
      unlockedNow: false,
    };
  }

  const starterHash = computeCurriculumAttemptFingerprint(starter.mech, starter.pilot);
  const currentHash = computeCurriculumAttemptFingerprint(playerMech, playerPilot);
  if (currentHash === starterHash) {
    return {
      nextProgress: progress,
      entry: prev,
      countedAsFailedAttempt: false,
      rejectReason: 'unchanged_starter',
      unlockedNow: false,
    };
  }

  if (prev.failedHashes.includes(currentHash)) {
    return {
      nextProgress: progress,
      entry: prev,
      countedAsFailedAttempt: false,
      rejectReason: 'duplicate_attempt',
      unlockedNow: false,
    };
  }

  const wasUnlocked = isModelAnswerUnlocked(prev);
  const nextEntry: MissionAttemptProgress = {
    ...prev,
    failedHashes: [...prev.failedHashes, currentHash].slice(-32),
  };
  const nowUnlocked = isModelAnswerUnlocked(nextEntry);
  return {
    nextProgress: { ...progress, [missionId]: nextEntry },
    entry: nextEntry,
    countedAsFailedAttempt: true,
    rejectReason: null,
    unlockedNow: !wasUnlocked && nowUnlocked,
  };
}

export function extractClearedStepIds(progress: CurriculumProgressMap): CurriculumStepId[] {
  const out: CurriculumStepId[] = [];
  for (const [id, entry] of Object.entries(progress)) {
    if (entry?.cleared) out.push(id as CurriculumStepId);
  }
  return out;
}

export function loadCurriculumProgress(
  storage: StorageLike | null = getDefaultStorage()
): CurriculumProgressMap {
  if (!storage) return {};
  const map: CurriculumProgressMap = {};
  try {
    const raw = storage.getItem(CURRICULUM_PROGRESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, Partial<MissionAttemptProgress>>;
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (!v || typeof v !== 'object') continue;
          map[k] = {
            hintViewed: Boolean(v.hintViewed),
            failedHashes: Array.isArray(v.failedHashes)
              ? v.failedHashes.filter((h): h is string => typeof h === 'string')
              : [],
            cleared: Boolean(v.cleared),
          };
        }
      }
    }
    // Migrate legacy cleared step list if present
    const legacyRaw = storage.getItem(CURRICULUM_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (Array.isArray(legacy)) {
        for (const id of legacy) {
          if (typeof id === 'string') {
            const cur = map[id] ?? { hintViewed: false, failedHashes: [], cleared: false };
            map[id] = { ...cur, cleared: true };
          }
        }
      }
    }
  } catch {
    // Ignore parse error
  }
  return map;
}

export function saveCurriculumProgress(
  progress: CurriculumProgressMap,
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(CURRICULUM_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    storage.setItem(CURRICULUM_STORAGE_KEY, JSON.stringify(extractClearedStepIds(progress)));
  } catch {
    // Ignore storage quota errors
  }
}

function formatLocalDateStamp(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the 4-digit daily teacher unlock code (`MMDD`, local calendar date).
 */
export function getTeacherUnlockCode(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${m}${d}`;
}

/**
 * Verifies a 4-digit instructor unlock code (supports half-width and full-width digits).
 */
export function verifyTeacherUnlockCode(rawInput: string, now: Date = new Date()): boolean {
  const normalized = String(rawInput ?? '')
    .trim()
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  return /^\d{4}$/.test(normalized) && normalized === getTeacherUnlockCode(now);
}

/**
 * Loads same-day teacher unlock state (automatically expires when the date rolls over).
 */
export function loadTeacherUnlockMode(
  now: Date = new Date(),
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(TEACHER_UNLOCK_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { date?: string };
    return parsed?.date === formatLocalDateStamp(now);
  } catch {
    return false;
  }
}

export function saveTeacherUnlockMode(
  enabled: boolean,
  now: Date = new Date(),
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage) return;
  try {
    if (enabled) {
      storage.setItem(
        TEACHER_UNLOCK_STORAGE_KEY,
        JSON.stringify({ date: formatLocalDateStamp(now) })
      );
    } else {
      storage.removeItem(TEACHER_UNLOCK_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}
