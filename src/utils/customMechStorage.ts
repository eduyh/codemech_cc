import { getChassisSpec, inferChassisIdFromParts } from '../data/parts';
import { STARTER_MECHS } from '../data/presets';
import { MechBlueprint } from '../types/mech';
import { stripReferencedSubroutinesForStorage } from './romLibrary';

export const SAVED_MECHS_STORAGE_KEY = 'codemech_saved_mechs_v1';
export const DEFAULT_STARTER_MODEL_TAG = 'T1';
export const MAX_CUSTOM_TAG_LEN = 8;

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
 * Normalizes a custom model suffix string:
 * - converts full-width ASCII alphanumeric & '-' / '_' to half-width
 * - strips whitespace and reserved delimiter chars ('/', '[', ']', '\')
 * - clamps to MAX_CUSTOM_TAG_LEN characters
 */
export function normalizeCustomTag(raw: string): string {
  const halfWidth = raw
    .trim()
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  const cleaned = halfWidth.replace(/[\s/[\]\\]/g, '');
  return Array.from(cleaned).slice(0, MAX_CUSTOM_TAG_LEN).join('');
}

/**
 * Resolves the canonical inherent base name (e.g. "ABC-T1", "FNT-T1") for a chassis.
 */
export function getBaseMechName(chassisId: string): string {
  const starter = STARTER_MECHS.find((m) => m.chassisId === chassisId);
  if (starter) return starter.name;
  const chassis = getChassisSpec(chassisId);
  if (chassis.modelCode) {
    return `${chassis.modelCode}-${DEFAULT_STARTER_MODEL_TAG}`;
  }
  return chassis.name;
}

/**
 * Extracts the model series prefix (e.g. "ABC", "LLB", "XHD") from a chassisId or base name.
 */
export function getBaseMechPrefix(baseNameOrChassisId: string): string {
  const raw = baseNameOrChassisId.startsWith('chassis_')
    ? getBaseMechName(baseNameOrChassisId)
    : baseNameOrChassisId;
  const trimmed = raw.trim();
  const match = /^([A-Za-z0-9]+)-[^-\s]+$/.exec(trimmed);
  if (match) return match[1];
  return trimmed.replace(/-[^-]+$/, '');
}

/**
 * Resolves the Japanese role name (e.g. "基本ミドル", "高機動ライト") for a chassis.
 */
export function getChassisRoleName(chassisId: string): string {
  const chassis = getChassisSpec(chassisId);
  return chassis.roleName ?? chassis.name.split(/[\s（(]/)[0] ?? '';
}

/**
 * Formats a mech label for dropdowns/headers as "和名 形式名" (e.g. "基本ミドル ABC-T1").
 */
export function formatMechDropdownLabel(chassisId: string | undefined, modelName: string): string {
  const trimmed = modelName.trim();
  if (!chassisId) return trimmed;
  const roleName = getChassisRoleName(chassisId).trim();
  if (!roleName) return trimmed;
  if (!trimmed) return roleName;
  if (trimmed.startsWith(roleName)) return trimmed;
  return `${roleName} ${trimmed}`;
}

/**
 * Formats a mech display name by replacing the model suffix ("ABC-T1" + "X2" -> "ABC-X2")
 * while keeping legacy "CM-01 ヴァンガード" -> "CM-01/TAG ヴァンガード" compatibility.
 */
export function formatCustomMechName(baseName: string, tag: string): string {
  const trimmed = baseName.trim();
  const clean = normalizeCustomTag(tag);
  if (!clean) return trimmed;
  const legacyCmMatch = /^([A-Z]+-\d+)(\s+.*)?$/.exec(trimmed);
  if (legacyCmMatch) {
    return `${legacyCmMatch[1]}/${clean}${legacyCmMatch[2] ?? ''}`;
  }
  const hyphenMatch = /^([A-Za-z0-9]+)-[^\s]+$/.exec(trimmed);
  if (hyphenMatch) {
    return `${hyphenMatch[1]}-${clean}`;
  }
  return `${trimmed}-${clean}`;
}

/**
 * Extracts a custom model suffix from "ABC-X2", legacy "CM-01/TAG 機体名", or legacy "[TAG]" names.
 */
export function extractCustomTagFromName(name: string): string {
  const trimmed = name.trim();
  const slashMatch = /^(?:[A-Z]+-\d+|[^/\s]+)\/([^\s]+)(?:\s|$)/.exec(trimmed);
  if (slashMatch) return normalizeCustomTag(slashMatch[1]);
  const legacyMatch = /\s\[([^\]]+)\]$/.exec(trimmed);
  if (legacyMatch) return normalizeCustomTag(legacyMatch[1]);
  const hyphenMatch = /^[A-Za-z0-9]+-([^\s]+)$/.exec(trimmed);
  if (hyphenMatch) return normalizeCustomTag(hyphenMatch[1]);
  return '';
}

/**
 * Returns the default starter model tag for a blueprint ("T1", "T2", etc.).
 */
export function getDefaultModelTagForBlueprint(
  bp: Pick<MechBlueprint, 'id'>
): string {
  const starter = STARTER_MECHS.find((m) => m.id === bp.id);
  if (starter) {
    return extractCustomTagFromName(starter.name) || DEFAULT_STARTER_MODEL_TAG;
  }
  return DEFAULT_STARTER_MODEL_TAG;
}

/**
 * Resolves the canonical name to revert to when a starter or custom blueprint's
 * editable suffix input is cleared back to empty.
 */
export function getRevertMechName(
  bp: Pick<MechBlueprint, 'id' | 'chassisId'>
): string {
  const starter = STARTER_MECHS.find((m) => m.id === bp.id);
  return starter?.name ?? getBaseMechName(bp.chassisId);
}

/**
 * Returns initial editable input tag for UI: hides default "T1"/"T2" on unmodified starter mechs
 * so the placeholder shows the starter's tag until the user types a custom suffix.
 */
export function getEditableModelTagFromBlueprint(
  bp: Pick<MechBlueprint, 'id' | 'name'>
): string {
  const starter = STARTER_MECHS.find((m) => m.id === bp.id);
  if (starter && bp.name.trim() === starter.name.trim()) {
    return '';
  }
  return extractCustomTagFromName(bp.name);
}

function getFallbackTag(list: SavedCustomMech[], chassisId: string): string {
  const usedTags = new Set<string>();
  for (const m of list) {
    if (m.chassisId === chassisId && m.tag) usedTags.add(m.tag);
  }
  for (const s of STARTER_MECHS) {
    if (s.chassisId === chassisId) {
      const sTag = extractCustomTagFromName(s.name);
      if (sTag) usedTags.add(sTag);
    }
  }
  for (let i = 2; i < 100; i++) {
    const cand = normalizeCustomTag(`T${i}`);
    if (cand && !usedTags.has(cand)) {
      return cand;
    }
  }
  return 'T99';
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
        const tag = normalizeCustomTag(item.tag) || 'T2';
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
