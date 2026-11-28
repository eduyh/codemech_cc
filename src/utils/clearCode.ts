import { CURRICULUM_MISSIONS } from '../data/curriculum';
import { CurriculumStepId } from '../types/mech';
import {
  CurriculumProgressMap,
  extractClearedStepIds,
  getMissionProgressEntry,
  isModelAnswerUnlocked,
} from './curriculumProgress';
import { decodeFramedJson, encodeFramedJson } from './shareCodec';
import { DEFAULT_USER_NAME, UserProfile } from './userProfile';

export const CLEAR_CODE_PREFIX = 'CMK1-';
const CLEAR_MASK_SEED = 0x1f83d9ab;
const MAX_CLEAR_PAYLOAD_BYTES = 16 * 1024;

export interface ClearCodePayload {
  studentName: string;
  userId?: string;
  clearedSteps: CurriculumStepId[];
  totalStages?: number;
  part1Cleared?: number;
  part2Cleared?: number;
  hintViewedSteps?: CurriculumStepId[];
  attemptCounts?: Partial<Record<CurriculumStepId, number>>;
  unlockedSolutionSteps?: CurriculumStepId[];
  issuedAt: string;
}

export function buildCurriculumClearCodePayload(
  userProfile: Pick<UserProfile, 'userName' | 'userId'>,
  progressMap: CurriculumProgressMap,
  issuedAt = new Date().toISOString()
): ClearCodePayload {
  const clearedSteps = extractClearedStepIds(progressMap);
  const hintViewedSteps: CurriculumStepId[] = [];
  const unlockedSolutionSteps: CurriculumStepId[] = [];
  const attemptCounts: Partial<Record<CurriculumStepId, number>> = {};

  for (const m of CURRICULUM_MISSIONS) {
    const entry = getMissionProgressEntry(progressMap, m.id);
    if (entry.hintViewed) hintViewedSteps.push(m.id);
    if (entry.failedHashes.length > 0) {
      attemptCounts[m.id] = entry.failedHashes.length;
    }
    if (isModelAnswerUnlocked(entry)) unlockedSolutionSteps.push(m.id);
  }

  const part1Cleared = CURRICULUM_MISSIONS.filter(
    (m) => m.part === 'part1_basics' && clearedSteps.includes(m.id)
  ).length;
  const part2Cleared = CURRICULUM_MISSIONS.filter(
    (m) => m.part === 'part2_tactics' && clearedSteps.includes(m.id)
  ).length;

  return {
    studentName: userProfile.userName.trim() || DEFAULT_USER_NAME,
    userId: userProfile.userId,
    clearedSteps,
    totalStages: CURRICULUM_MISSIONS.length,
    part1Cleared,
    part2Cleared,
    hintViewedSteps,
    attemptCounts,
    unlockedSolutionSteps,
    issuedAt,
  };
}

export function encodeClearCode(payload: ClearCodePayload): string {
  const clean: ClearCodePayload = {
    studentName: payload.studentName.trim().slice(0, 40) || DEFAULT_USER_NAME,
    ...(payload.userId ? { userId: String(payload.userId).slice(0, 64) } : {}),
    clearedSteps: Array.from(new Set(payload.clearedSteps)),
    ...(typeof payload.totalStages === 'number' ? { totalStages: payload.totalStages } : {}),
    ...(typeof payload.part1Cleared === 'number' ? { part1Cleared: payload.part1Cleared } : {}),
    ...(typeof payload.part2Cleared === 'number' ? { part2Cleared: payload.part2Cleared } : {}),
    ...(Array.isArray(payload.hintViewedSteps)
      ? { hintViewedSteps: Array.from(new Set(payload.hintViewedSteps)) }
      : {}),
    ...(payload.attemptCounts ? { attemptCounts: payload.attemptCounts } : {}),
    ...(Array.isArray(payload.unlockedSolutionSteps)
      ? { unlockedSolutionSteps: Array.from(new Set(payload.unlockedSolutionSteps)) }
      : {}),
    issuedAt: payload.issuedAt || new Date().toISOString(),
  };
  return encodeFramedJson(CLEAR_CODE_PREFIX, clean, {
    obfuscate: true,
    maskSeed: CLEAR_MASK_SEED,
  });
}

export function decodeClearCode(raw: string): ClearCodePayload {
  const { data } = decodeFramedJson<ClearCodePayload>(
    raw,
    [CLEAR_CODE_PREFIX],
    MAX_CLEAR_PAYLOAD_BYTES,
    { [CLEAR_CODE_PREFIX]: CLEAR_MASK_SEED }
  );
  if (!Array.isArray(data?.clearedSteps)) {
    throw new Error('無効なクリアコードデータです');
  }
  return {
    studentName: String(data.studentName || DEFAULT_USER_NAME),
    ...(typeof data.userId === 'string' && data.userId ? { userId: data.userId } : {}),
    clearedSteps: data.clearedSteps,
    ...(typeof data.totalStages === 'number' ? { totalStages: data.totalStages } : {}),
    ...(typeof data.part1Cleared === 'number' ? { part1Cleared: data.part1Cleared } : {}),
    ...(typeof data.part2Cleared === 'number' ? { part2Cleared: data.part2Cleared } : {}),
    ...(Array.isArray(data.hintViewedSteps) ? { hintViewedSteps: data.hintViewedSteps } : {}),
    ...(data.attemptCounts && typeof data.attemptCounts === 'object'
      ? { attemptCounts: data.attemptCounts }
      : {}),
    ...(Array.isArray(data.unlockedSolutionSteps)
      ? { unlockedSolutionSteps: data.unlockedSolutionSteps }
      : {}),
    issuedAt: String(data.issuedAt || ''),
  };
}
