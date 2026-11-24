import { CurriculumStepId } from '../types/mech';
import { decodeFramedJson, encodeFramedJson } from './shareCodec';

export const CLEAR_CODE_PREFIX = 'CMK1-';
const CLEAR_MASK_SEED = 0x1f83d9ab;
const MAX_CLEAR_PAYLOAD_BYTES = 16 * 1024;

export interface ClearCodePayload {
  studentName: string;
  clearedSteps: CurriculumStepId[];
  issuedAt: string;
}

export function encodeClearCode(payload: ClearCodePayload): string {
  const clean: ClearCodePayload = {
    studentName: payload.studentName.trim().slice(0, 40) || 'Student',
    clearedSteps: Array.from(new Set(payload.clearedSteps)),
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
    studentName: String(data.studentName || 'Student'),
    clearedSteps: data.clearedSteps,
    issuedAt: String(data.issuedAt || ''),
  };
}
