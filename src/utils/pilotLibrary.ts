import { STARTER_PILOTS } from '../data/presets';
import { PilotGridCell, PilotProfile } from '../types/mech';

export const PILOT_LIBRARY_STORAGE_KEY = 'codemech_pilot_library_v1';

function sanitizePilotCells(cells: readonly PilotGridCell[]): PilotGridCell[] {
  return structuredClone(
    cells.filter(
      (c) =>
        c &&
        typeof c.row === 'number' &&
        typeof c.col === 'number' &&
        c.row >= 0 &&
        c.row < 6 &&
        c.col >= 0 &&
        c.col < 6 &&
        typeof c.op === 'string' &&
        c.op !== 'empty'
    )
  );
}

export function isBuiltInPilotId(id: string | undefined): boolean {
  if (!id) return false;
  return STARTER_PILOTS.some((p) => p.id === id);
}

export function loadUserPilots(): PilotProfile[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PILOT_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is PilotProfile =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          Boolean(item.grid) &&
          Array.isArray(item.grid.cells)
      )
      .map((item) => {
        const cleanCells = sanitizePilotCells(item.grid.cells);
        return {
          version: 2,
          id: item.id,
          name: item.name.trim().slice(0, 32) || '自作パイロット',
          authorName: 'Custom',
          grid: {
            gridSize: 6 as const,
            cells: cleanCells.length > 0 ? cleanCells : [{ row: 0, col: 0, op: 'start', dir: 'S' }],
          },
        };
      });
  } catch {
    return [];
  }
}

export function persistUserPilots(list: PilotProfile[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PILOT_LIBRARY_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function getAllPilots(userPilots: readonly PilotProfile[]): PilotProfile[] {
  return [...userPilots, ...STARTER_PILOTS];
}

function getFallbackPilotName(userPilots: readonly PilotProfile[]): string {
  for (let i = 1; i < 1000; i++) {
    const cand = `自作パイロット${i}`;
    if (!userPilots.some((p) => p.name === cand)) return cand;
  }
  return '自作パイロット';
}

export function saveUserPilot(
  userPilots: readonly PilotProfile[],
  input: {
    id?: string;
    name: string;
    cells: readonly PilotGridCell[];
  },
  now = Date.now()
): { nextList: PilotProfile[]; saved: PilotProfile; updated: boolean } {
  const cleanName = input.name.trim().slice(0, 32) || getFallbackPilotName(userPilots);
  const cleanCells = sanitizePilotCells(input.cells);
  const existingIdx =
    input.id && !isBuiltInPilotId(input.id)
      ? userPilots.findIndex((p) => p.id === input.id)
      : -1;

  const id =
    existingIdx >= 0
      ? userPilots[existingIdx].id
      : `pilot_u_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const entry: PilotProfile = {
    version: 2,
    id,
    name: cleanName,
    authorName: 'Custom',
    grid: {
      gridSize: 6,
      cells: cleanCells.length > 0 ? cleanCells : [{ row: 0, col: 0, op: 'start', dir: 'S' }],
    },
  };

  const nextList =
    existingIdx >= 0
      ? userPilots.map((p, i) => (i === existingIdx ? entry : p))
      : [entry, ...userPilots];

  persistUserPilots(nextList);
  return { nextList, saved: entry, updated: existingIdx >= 0 };
}

export function deleteUserPilot(
  userPilots: readonly PilotProfile[],
  pilotId: string
): PilotProfile[] {
  const nextList = userPilots.filter((p) => p.id !== pilotId);
  persistUserPilots(nextList);
  return nextList;
}
