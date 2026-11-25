import { getChassisSpec, inferChassisIdFromParts } from '../data/parts';
import { STARTER_MECHS } from '../data/presets';
import { MechBlueprint } from '../types/mech';
import { stripReferencedSubroutinesForStorage } from './romLibrary';

export const SAVED_MECHS_STORAGE_KEY = 'codemech_saved_mechs_v1';
export const MAX_CUSTOM_TAG_LEN = 3;

export interface SavedCustomMech {
  id: string;
  chassisId: string;
  baseName: string;
  tag: string;
  savedAt: number;
  pilotId?: string;
  blueprint: MechBlueprint;
}

export function isStarterMechId(id: string): boolean {
  return STARTER_MECHS.some((m) => m.id === id);
}

/**
 * Normalizes a custom variant tag to half-width ASCII alphanumeric/_/- characters,
 * converting full-width ASCII where possible and clamping to at most 3 characters.
 */
export function normalizeCustomTag(raw: string): string {
  const halfWidth = raw
    .trim()
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  return halfWidth.replace(/[^A-Za-z0-9_-]/g, '').slice(0, MAX_CUSTOM_TAG_LEN);
}

/**
 * Resolves the canonical inherent base name (e.g. "CM-03 フォートレス") for a chassis.
 */
export function getBaseMechName(chassisId: string): string {
  return STARTER_MECHS.find((m) => m.chassisId === chassisId)?.name ?? getChassisSpec(chassisId).name;
}

/**
 * Formats a mech display name by appending "/TAG" to the model code prefix (e.g. "CM-01/ABC ヴァンガード").
 */
export function formatCustomMechName(baseName: string, tag: string): string {
  const clean = normalizeCustomTag(tag);
  if (!clean) return baseName;
  const match = /^([A-Z]+-\d+)(\s+.*)?$/.exec(baseName.trim());
  if (match) {
    return `${match[1]}/${clean}${match[2] ?? ''}`;
  }
  return `${baseName}/${clean}`;
}

/**
 * Extracts a custom variant tag from either "CM-01/ABC 機体名" or legacy "[tag]" display names.
 */
export function extractCustomTagFromName(name: string): string {
  const slashMatch = /^(?:[A-Z]+-\d+|[^/\s]+)\/([A-Za-z0-9_-]{1,3})(?:\s|$)/.exec(name.trim());
  if (slashMatch) return normalizeCustomTag(slashMatch[1]);
  const legacyMatch = /\s\[([^\]]+)\]$/.exec(name.trim());
  return legacyMatch ? normalizeCustomTag(legacyMatch[1]) : '';
}

function getFallbackTag(list: SavedCustomMech[], chassisId: string): string {
  for (let i = 1; i < 100; i++) {
    const cand = normalizeCustomTag(`C${i}`);
    if (cand && !list.some((m) => m.chassisId === chassisId && m.tag === cand)) {
      return cand;
    }
  }
  return 'C01';
}

export function loadSavedCustomMechs(): SavedCustomMech[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_MECHS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedCustomMech =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.chassisId === 'string' &&
          typeof item.baseName === 'string' &&
          typeof item.tag === 'string' &&
          typeof item.savedAt === 'number' &&
          Boolean(item.blueprint)
      )
      .map((item) => {
        const tag = normalizeCustomTag(item.tag) || 'C1';
        const formattedName = formatCustomMechName(item.baseName, tag);
        return {
          ...item,
          tag,
          ...(typeof item.pilotId === 'string' && item.pilotId.trim()
            ? { pilotId: item.pilotId.trim() }
            : {}),
          blueprint: {
            ...item.blueprint,
            name: formattedName,
          },
        };
      });
  } catch {
    return [];
  }
}

export function persistSavedCustomMechs(list: SavedCustomMech[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SAVED_MECHS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function saveCustomMech(
  list: SavedCustomMech[],
  blueprint: MechBlueprint,
  rawTag: string,
  now = Date.now(),
  pilotId?: string
): { nextList: SavedCustomMech[]; saved: SavedCustomMech; updated: boolean } {
  const chassisId = blueprint.chassisId || inferChassisIdFromParts(blueprint.parts);
  const baseName = getBaseMechName(chassisId);
  const normalized = normalizeCustomTag(rawTag);
  const tag = normalized || getFallbackTag(list, chassisId);

  const existingIdx = list.findIndex((m) => m.chassisId === chassisId && m.tag === tag);
  const id =
    existingIdx >= 0
      ? list[existingIdx].id
      : `custom_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const clonedBp = stripReferencedSubroutinesForStorage(blueprint);
  clonedBp.id = id;
  clonedBp.chassisId = chassisId;
  clonedBp.name = formatCustomMechName(baseName, tag);

  const cleanPilotId = typeof pilotId === 'string' && pilotId.trim() ? pilotId.trim() : undefined;
  if (cleanPilotId) {
    clonedBp.defaultPilotId = cleanPilotId;
  } else {
    delete clonedBp.defaultPilotId;
  }
  const entry: SavedCustomMech = {
    id,
    chassisId,
    baseName,
    tag,
    savedAt: now,
    ...(cleanPilotId ? { pilotId: cleanPilotId } : {}),
    blueprint: clonedBp,
  };

  let nextList: SavedCustomMech[];
  if (existingIdx >= 0) {
    nextList = list.map((item, i) => (i === existingIdx ? entry : item));
  } else {
    nextList = [entry, ...list];
  }

  persistSavedCustomMechs(nextList);
  return { nextList, saved: entry, updated: existingIdx >= 0 };
}

export function deleteSavedCustomMech(list: SavedCustomMech[], id: string): SavedCustomMech[] {
  const nextList = list.filter((m) => m.id !== id);
  persistSavedCustomMechs(nextList);
  return nextList;
}
