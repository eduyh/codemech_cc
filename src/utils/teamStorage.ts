import { getChassisSpec } from '../data/parts';
import { DEFAULT_PILOT_PROFILE, PRESET_ABC, STARTER_MECHS } from '../data/presets';
import { clamp } from '../engine/math';
import { MechBlueprint, PilotProfile, ProgramRomEntry } from '../types/mech';
import { SavedCustomMech } from './customMechStorage';
import { resolveMechBlueprintRoms } from './romLibrary';
import { encodeMechCode } from './shareMech';
import { wrapCodeLines } from './shareCodec';
import {
  DEFAULT_USER_NAME,
  buildDefaultTeamName,
  cleanTeamName,
  resolveUniqueTeamName,
} from './userProfile';

export const SAVED_TEAMS_STORAGE_KEY = 'codemech_saved_teams_v1';
export const BATTLEFIELD_PENDING_TEAM_KEY = 'codemech_bf_pending_team_v1';
export const DEFAULT_TEAM_TONNAGE_CAP = 180;
export const DEFAULT_RANDOM_TONNAGE_MULTIPLIER = 1.35;
export const TEAM_SQUAD_SIZE = 3;

export interface SavedTeamMember {
  mechId: string;
  pilotId: string;
}

export interface SavedTeamEntry {
  id: string;
  name: string;
  savedAt: number;
  members: SavedTeamMember[];
}

export interface TeamTonnageEval {
  totalTonnage: number;
  effectiveCap: number;
  allowed: boolean;
  overBy: number;
  isRandomTeam: boolean;
}

export function getMechChassisTonnage(bp: Pick<MechBlueprint, 'chassisId'>): number {
  return getChassisSpec(bp.chassisId).maxTonnage;
}

export function computeTeamTonnage(
  mechs: ReadonlyArray<Pick<MechBlueprint, 'chassisId'>>
): number {
  let sum = 0;
  for (const m of mechs) {
    sum += getMechChassisTonnage(m);
  }
  return sum;
}

export function evaluateTeamTonnageLimit(
  totalTonnage: number,
  cap: number,
  isRandomTeam = false,
  randomMultiplier = DEFAULT_RANDOM_TONNAGE_MULTIPLIER
): TeamTonnageEval {
  if (cap <= 0) {
    return {
      totalTonnage,
      effectiveCap: 0,
      allowed: true,
      overBy: 0,
      isRandomTeam,
    };
  }
  const safeMult = clamp(Number.isFinite(randomMultiplier) ? randomMultiplier : DEFAULT_RANDOM_TONNAGE_MULTIPLIER, 1.2, 1.5);
  const effectiveCap = isRandomTeam ? Math.round(cap * safeMult) : Math.round(cap);
  const overBy = Math.max(0, totalTonnage - effectiveCap);
  return {
    totalTonnage,
    effectiveCap,
    allowed: totalTonnage <= effectiveCap,
    overBy,
    isRandomTeam,
  };
}

export function loadSavedTeams(): SavedTeamEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_TEAMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedTeamEntry =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          Array.isArray(item.members) &&
          item.members.length > 0
      )
      .map((item) => ({
        id: item.id,
        name: item.name.trim().slice(0, 24) || '無名小隊',
        savedAt: typeof item.savedAt === 'number' ? item.savedAt : Date.now(),
        members: item.members.slice(0, TEAM_SQUAD_SIZE).map((m) => ({
          mechId: typeof m?.mechId === 'string' ? m.mechId : PRESET_ABC.id,
          pilotId: typeof m?.pilotId === 'string' ? m.pilotId : DEFAULT_PILOT_PROFILE.id,
        })),
      }));
  } catch {
    return [];
  }
}

export function persistSavedTeams(list: readonly SavedTeamEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SAVED_TEAMS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota / private browsing errors
  }
}

export function saveUserTeam(
  list: readonly SavedTeamEntry[],
  input: {
    id?: string;
    name: string;
    members: readonly SavedTeamMember[];
    userName?: string;
    userId?: string;
  },
  now = Date.now()
): { nextList: SavedTeamEntry[]; saved: SavedTeamEntry; updated: boolean } {
  const existingIdx = input.id ? list.findIndex((t) => t.id === input.id) : -1;
  const otherNames = list
    .filter((_, idx) => idx !== existingIdx)
    .map((t) => t.name);

  const rawCleaned = cleanTeamName(input.name);
  const cleanName = rawCleaned
    ? resolveUniqueTeamName(rawCleaned, otherNames)
    : buildDefaultTeamName(input.userName ?? DEFAULT_USER_NAME, otherNames, input.userId);

  const members = input.members.slice(0, TEAM_SQUAD_SIZE).map((m) => ({
    mechId: m.mechId || PRESET_ABC.id,
    pilotId: m.pilotId || DEFAULT_PILOT_PROFILE.id,
  }));
  while (members.length < TEAM_SQUAD_SIZE) {
    members.push({ mechId: PRESET_ABC.id, pilotId: DEFAULT_PILOT_PROFILE.id });
  }

  const id =
    existingIdx >= 0
      ? list[existingIdx].id
      : `team_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const entry: SavedTeamEntry = {
    id,
    name: cleanName,
    savedAt: now,
    members,
  };

  const nextList =
    existingIdx >= 0
      ? list.map((item, idx) => (idx === existingIdx ? entry : item))
      : [entry, ...list];

  persistSavedTeams(nextList);
  return { nextList, saved: entry, updated: existingIdx >= 0 };
}

export function deleteUserTeam(
  list: readonly SavedTeamEntry[],
  teamId: string
): SavedTeamEntry[] {
  const nextList = list.filter((t) => t.id !== teamId);
  persistSavedTeams(nextList);
  return nextList;
}

export function queueTeamForBattlefield(teamId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BATTLEFIELD_PENDING_TEAM_KEY, teamId);
  } catch {
    // Ignore storage errors
  }
}

export function consumeQueuedBattlefieldTeamId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const val = localStorage.getItem(BATTLEFIELD_PENDING_TEAM_KEY);
    if (!val) return null;
    localStorage.removeItem(BATTLEFIELD_PENDING_TEAM_KEY);
    return val;
  } catch {
    return null;
  }
}

export function resolveTeamMemberAssets(
  member: SavedTeamMember,
  savedMechs: readonly SavedCustomMech[],
  allPilots: readonly PilotProfile[],
  allRoms: readonly ProgramRomEntry[]
): { mech: MechBlueprint; pilot: PilotProfile; mechEntryId: string; pilotId: string } {
  const customMech = savedMechs.find((m) => m.id === member.mechId);
  const starterMech = STARTER_MECHS.find((m) => m.id === member.mechId);
  const rawMech = customMech?.blueprint ?? starterMech ?? PRESET_ABC;
  const mech = resolveMechBlueprintRoms(structuredClone(rawMech), allRoms);

  const fallbackPilotId = customMech?.pilotId ?? rawMech.defaultPilotId ?? DEFAULT_PILOT_PROFILE.id;
  const foundPilot =
    allPilots.find((p) => p.id === member.pilotId) ??
    allPilots.find((p) => p.id === fallbackPilotId) ??
    DEFAULT_PILOT_PROFILE;

  return {
    mech,
    pilot: structuredClone(foundPilot),
    mechEntryId: customMech?.id ?? starterMech?.id ?? PRESET_ABC.id,
    pilotId: foundPilot.id,
  };
}

export function buildRandomSquad<T extends { mech: MechBlueprint; pilot: PilotProfile }>(
  pool: ReadonlyArray<T>,
  count: number,
  cap: number,
  randomMultiplier = DEFAULT_RANDOM_TONNAGE_MULTIPLIER,
  rng: () => number = Math.random
): T[] {
  if (pool.length === 0 || count <= 0) return [];
  const effectiveCap =
    cap > 0
      ? Math.round(cap * clamp(randomMultiplier, 1.2, 1.5))
      : Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 60; attempt++) {
    const picked: T[] = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rng() * pool.length) % pool.length;
      const item = pool[idx];
      picked.push(item);
      sum += getMechChassisTonnage(item.mech);
    }
    if (sum <= effectiveCap) {
      return picked;
    }
  }

  // Fallback: pick valid lightest candidates within effectiveCap
  const sortedByWeight = [...pool].sort(
    (a, b) => getMechChassisTonnage(a.mech) - getMechChassisTonnage(b.mech)
  );
  const picked: T[] = [];
  let remainingCap = effectiveCap;
  for (let i = 0; i < count; i++) {
    const slotsLeft = count - i - 1;
    const minUnitTon = getMechChassisTonnage(sortedByWeight[0].mech);
    const maxAllowedForSlot = remainingCap - slotsLeft * minUnitTon;
    const candidates = sortedByWeight.filter(
      (item) => getMechChassisTonnage(item.mech) <= maxAllowedForSlot
    );
    const chooseFrom = candidates.length > 0 ? candidates : [sortedByWeight[0]];
    const chosen = chooseFrom[Math.floor(rng() * chooseFrom.length) % chooseFrom.length];
    picked.push(chosen);
    remainingCap -= getMechChassisTonnage(chosen.mech);
  }
  return picked;
}

export function formatTeamSubmissionText(
  teamName: string,
  members: ReadonlyArray<{ mech: MechBlueprint; pilot: PilotProfile }>,
  opts?: { battleOnly?: boolean; authorName?: string; authorId?: string }
): string {
  const cleanTeam = cleanTeamName(teamName) || '無名小隊';
  const totalTonnage = computeTeamTonnage(members.map((m) => m.mech));
  const cleanAuthor = opts?.authorName?.trim();
  const cleanAuthorId = opts?.authorId?.trim();
  const lines: string[] = [
    `# CodeMech チーム提出 #${cleanTeam} (計${totalTonnage}t / ${members.length}機)`,
  ];
  members.forEach((entry, idx) => {
    const stampedMech = {
      ...entry.mech,
      ...(cleanAuthor ? { authorName: cleanAuthor } : {}),
      ...(cleanAuthorId ? { authorId: cleanAuthorId } : {}),
    };
    const code = encodeMechCode(
      {
        mech: stampedMech,
        pilot: entry.pilot,
        battleOnly: Boolean(opts?.battleOnly),
        teamTag: cleanTeam,
      },
      { battleOnly: Boolean(opts?.battleOnly) }
    );
    const ton = getMechChassisTonnage(entry.mech);
    lines.push(
      `[${idx + 1}番機] ${entry.mech.name} (${ton}t) / #${cleanTeam}`,
      '>>>',
      wrapCodeLines(code, 76),
      '<<<'
    );
  });
  return lines.join('\n');
}
