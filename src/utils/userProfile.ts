import { PilotProfile, ProgramRomEntry } from '../types/mech';
import type { SavedTeamEntry } from './teamStorage';
import {
  SAVED_MECHS_STORAGE_KEY,
  SavedCustomMech,
  loadSavedCustomMechs,
} from './customMechStorage';
import { PILOT_LIBRARY_STORAGE_KEY, loadUserPilots } from './pilotLibrary';
import { ROM_LIBRARY_STORAGE_KEY, loadUserRoms } from './romLibrary';

export const USER_PROFILE_STORAGE_KEY = 'codemech_user_profile_v1';
export const CURRICULUM_STORAGE_KEY = 'codemech_curriculum_v2';
export const BACKUP_SCHEMA = 'codemech.backup.v1';
export const DEFAULT_USER_NAME = 'Commander';
const SAVED_TEAMS_KEY = 'codemech_saved_teams_v1';
const TEAM_NAME_MAX_LEN = 24;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface UserProfile {
  userId: string;
  userName: string;
  updatedAt: number;
}

export interface CodeMechBackupPayload {
  schema: typeof BACKUP_SCHEMA;
  exportedAt: string;
  appVersion: string;
  userProfile: UserProfile;
  savedMechs: SavedCustomMech[];
  userPilots: PilotProfile[];
  userRoms: ProgramRomEntry[];
  savedTeams: SavedTeamEntry[];
  clearedCurriculum: string[];
}

function getDefaultStorage(): StorageLike | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/**
 * Generates a persistent RFC-4122 v4 UUID for local user identification.
 */
export function generateUserUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const seg = (n: number) => Array.from({ length: n }, hex).join('');
  const variant = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)];
  return `${seg(8)}-${seg(4)}-4${seg(3)}-${variant}${seg(3)}-${seg(12)}`;
}

/**
 * Extracts a compact 4-char uppercase tag from a UUID (e.g. "A1B2").
 */
export function getShortUserId(userId: string): string {
  const cleaned = String(userId ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  if (cleaned.length >= 4) return cleaned.slice(0, 4);
  if (cleaned.length > 0) return cleaned.padEnd(4, '0');
  return makeShortSuffix();
}

/**
 * Normalizes a player's callsign / handle for squad naming and author attribution.
 * Removes whitespace and delimiter characters that could interfere with `#team` tag parsing.
 */
export function normalizeUserName(raw: string): string {
  const halfWidth = String(raw ?? '')
    .trim()
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  const cleaned = halfWidth.replace(/[\s#@:[\]()<>「」/\\]/g, '');
  return Array.from(cleaned).slice(0, 16).join('');
}

export function cleanTeamName(raw: string): string {
  const halfWidth = String(raw ?? '')
    .trim()
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  const cleaned = halfWidth.replace(/[\s#@:[\]()<>「」/\\]/g, '');
  return Array.from(cleaned).slice(0, TEAM_NAME_MAX_LEN).join('');
}

export function loadUserProfile(storage: StorageLike | null = getDefaultStorage()): UserProfile {
  if (!storage) {
    return {
      userId: generateUserUuid(),
      userName: DEFAULT_USER_NAME,
      updatedAt: 0,
    };
  }
  try {
    const raw = storage.getItem(USER_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const existingId =
        typeof parsed?.userId === 'string' && parsed.userId.trim()
          ? parsed.userId.trim().slice(0, 64)
          : '';
      const userId = existingId || generateUserUuid();
      const userName = normalizeUserName(parsed?.userName ?? '') || DEFAULT_USER_NAME;
      const updatedAt = typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : Date.now();
      const profile: UserProfile = { userId, userName, updatedAt };
      if (!existingId || !parsed?.userName) {
        try {
          storage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
        } catch {
          // Ignore storage quota errors
        }
      }
      return profile;
    }
  } catch {
    // Fall through to creating fresh default profile
  }

  const fresh: UserProfile = {
    userId: generateUserUuid(),
    userName: DEFAULT_USER_NAME,
    updatedAt: Date.now(),
  };
  try {
    storage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // Ignore storage quota errors
  }
  return fresh;
}

export function saveUserProfile(
  rawName: string,
  now = Date.now(),
  storage: StorageLike | null = getDefaultStorage()
): UserProfile {
  const existing = loadUserProfile(storage);
  const profile: UserProfile = {
    userId: existing.userId || generateUserUuid(),
    userName: normalizeUserName(rawName) || DEFAULT_USER_NAME,
    updatedAt: now,
  };
  if (storage) {
    try {
      storage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Ignore storage quota errors
    }
  }
  return profile;
}

/**
 * Ensures a team name is unique against `existingNames` (case-insensitive),
 * automatically appending `-2`, `-3`, ... on collision while honoring 24-char max length.
 */
export function resolveUniqueTeamName(
  desired: string,
  existingNames: ReadonlyArray<string>
): string {
  const base = cleanTeamName(desired) || '小隊';
  const taken = new Set(
    existingNames.map((n) => cleanTeamName(n).toLowerCase()).filter(Boolean)
  );
  if (!taken.has(base.toLowerCase())) {
    return base;
  }
  for (let i = 2; i < 1000; i++) {
    const suffix = `-${i}`;
    const prefixMax = Math.max(1, TEAM_NAME_MAX_LEN - suffix.length);
    const trimmedBase = Array.from(base).slice(0, prefixMax).join('');
    const cand = `${trimmedBase}${suffix}`;
    if (!taken.has(cand.toLowerCase())) {
      return cand;
    }
  }
  return base;
}

function makeShortSuffix(seedStr?: string): string {
  if (seedStr && seedStr.trim()) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let k = 0; k < 4; k++) {
      out += chars[(h >>> (k * 6)) % chars.length];
    }
    return out;
  }
  return Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
}

/**
 * Builds a collision-resistant default squad name derived from the user's callsign
 * and persistent UUID. Default `Commander` users get `Commander-<shortUUID>小隊`.
 */
export function buildDefaultTeamName(
  userName: string,
  existingNames: ReadonlyArray<string>,
  userId?: string
): string {
  const cleanUser = normalizeUserName(userName) || DEFAULT_USER_NAME;
  const isDefaultCommander = cleanUser.toLowerCase() === DEFAULT_USER_NAME.toLowerCase();
  const base = isDefaultCommander
    ? `${DEFAULT_USER_NAME}-${getShortUserId(userId ?? '')}小隊`
    : `${cleanUser}小隊`;
  return resolveUniqueTeamName(base, existingNames);
}

function readJsonArray<T>(storage: StorageLike | null, key: string): T[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function exportFullBackupPayload(
  appVersion: string,
  storage: StorageLike | null = getDefaultStorage()
): CodeMechBackupPayload {
  const usingDefault = storage === getDefaultStorage();
  const savedMechs = usingDefault
    ? loadSavedCustomMechs()
    : readJsonArray<SavedCustomMech>(storage, SAVED_MECHS_STORAGE_KEY);
  const userPilots = usingDefault
    ? loadUserPilots()
    : readJsonArray<PilotProfile>(storage, PILOT_LIBRARY_STORAGE_KEY);
  const userRoms = usingDefault
    ? loadUserRoms()
    : readJsonArray<ProgramRomEntry>(storage, ROM_LIBRARY_STORAGE_KEY);
  const savedTeams = readJsonArray<SavedTeamEntry>(storage, SAVED_TEAMS_KEY);
  const clearedCurriculum = readJsonArray<string>(storage, CURRICULUM_STORAGE_KEY).filter(
    (s): s is string => typeof s === 'string'
  );

  return {
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    appVersion,
    userProfile: loadUserProfile(storage),
    savedMechs,
    userPilots,
    userRoms,
    savedTeams,
    clearedCurriculum,
  };
}

export function exportFullBackupJson(
  appVersion: string,
  storage: StorageLike | null = getDefaultStorage()
): string {
  return JSON.stringify(exportFullBackupPayload(appVersion, storage), null, 2);
}

export function parseBackupJson(rawText: string): CodeMechBackupPayload {
  let parsed: Partial<CodeMechBackupPayload>;
  try {
    parsed = JSON.parse(rawText) as Partial<CodeMechBackupPayload>;
  } catch {
    throw new Error('バックアップJSONの形式が不正です。');
  }
  if (!parsed || parsed.schema !== BACKUP_SCHEMA) {
    throw new Error('CodeMech バックアップファイル (codemech.backup.v1) ではありません。');
  }
  const parsedId =
    typeof parsed.userProfile?.userId === 'string' && parsed.userProfile.userId.trim()
      ? parsed.userProfile.userId.trim().slice(0, 64)
      : generateUserUuid();
  return {
    schema: BACKUP_SCHEMA,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : '0.4.1',
    userProfile: {
      userId: parsedId,
      userName: normalizeUserName(parsed.userProfile?.userName ?? '') || DEFAULT_USER_NAME,
      updatedAt:
        typeof parsed.userProfile?.updatedAt === 'number'
          ? parsed.userProfile.updatedAt
          : Date.now(),
    },
    savedMechs: Array.isArray(parsed.savedMechs) ? parsed.savedMechs : [],
    userPilots: Array.isArray(parsed.userPilots) ? parsed.userPilots : [],
    userRoms: Array.isArray(parsed.userRoms) ? parsed.userRoms : [],
    savedTeams: Array.isArray(parsed.savedTeams) ? parsed.savedTeams : [],
    clearedCurriculum: Array.isArray(parsed.clearedCurriculum)
      ? parsed.clearedCurriculum.filter((s): s is string => typeof s === 'string')
      : [],
  };
}

function mergeById<T extends { id: string }>(
  existing: ReadonlyArray<T>,
  incoming: ReadonlyArray<T>
): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    if (item && typeof item.id === 'string') map.set(item.id, item);
  }
  for (const item of incoming) {
    if (item && typeof item.id === 'string' && !map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export function restoreFullBackup(
  payload: CodeMechBackupPayload,
  mode: 'merge' | 'overwrite',
  storage: StorageLike | null = getDefaultStorage()
): { mechs: number; pilots: number; roms: number; teams: number; userName: string; userId: string } {
  const curProfile = loadUserProfile(storage);
  const incomingName = normalizeUserName(payload.userProfile.userName) || DEFAULT_USER_NAME;
  const nextProfile: UserProfile =
    mode === 'overwrite'
      ? {
          userId: payload.userProfile.userId || curProfile.userId || generateUserUuid(),
          userName: incomingName,
          updatedAt: Date.now(),
        }
      : {
          userId: curProfile.userId || payload.userProfile.userId || generateUserUuid(),
          userName:
            curProfile.userName !== DEFAULT_USER_NAME ? curProfile.userName : incomingName,
          updatedAt: Date.now(),
        };

  const nextMechs =
    mode === 'overwrite'
      ? payload.savedMechs
      : mergeById(readJsonArray<SavedCustomMech>(storage, SAVED_MECHS_STORAGE_KEY), payload.savedMechs);

  const nextPilots =
    mode === 'overwrite'
      ? payload.userPilots
      : mergeById(readJsonArray<PilotProfile>(storage, PILOT_LIBRARY_STORAGE_KEY), payload.userPilots);

  const nextRoms =
    mode === 'overwrite'
      ? payload.userRoms
      : mergeById(readJsonArray<ProgramRomEntry>(storage, ROM_LIBRARY_STORAGE_KEY), payload.userRoms);

  const existingTeams = readJsonArray<SavedTeamEntry>(storage, SAVED_TEAMS_KEY);
  let nextTeams: SavedTeamEntry[];
  if (mode === 'overwrite') {
    const usedNames: string[] = [];
    nextTeams = payload.savedTeams.map((t) => {
      const unique = resolveUniqueTeamName(t.name, usedNames);
      usedNames.push(unique);
      return { ...t, name: unique };
    });
  } else {
    const mergedRaw = mergeById(existingTeams, payload.savedTeams);
    const usedNames: string[] = [];
    nextTeams = mergedRaw.map((t) => {
      const unique = resolveUniqueTeamName(t.name, usedNames);
      usedNames.push(unique);
      return { ...t, name: unique };
    });
  }

  const nextCurriculum =
    mode === 'overwrite'
      ? Array.from(new Set(payload.clearedCurriculum))
      : Array.from(
          new Set([
            ...readJsonArray<string>(storage, CURRICULUM_STORAGE_KEY),
            ...payload.clearedCurriculum,
          ])
        );

  if (storage) {
    storage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    storage.setItem(SAVED_MECHS_STORAGE_KEY, JSON.stringify(nextMechs));
    storage.setItem(PILOT_LIBRARY_STORAGE_KEY, JSON.stringify(nextPilots));
    storage.setItem(ROM_LIBRARY_STORAGE_KEY, JSON.stringify(nextRoms));
    storage.setItem(SAVED_TEAMS_KEY, JSON.stringify(nextTeams));
    storage.setItem(CURRICULUM_STORAGE_KEY, JSON.stringify(nextCurriculum));
  }

  return {
    mechs: nextMechs.length,
    pilots: nextPilots.length,
    roms: nextRoms.length,
    teams: nextTeams.length,
    userName: nextProfile.userName,
    userId: nextProfile.userId,
  };
}
