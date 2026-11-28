import { describe, expect, it } from 'vitest';
import { DEFAULT_PILOT_PROFILE, PRESET_ABC } from '../../data/presets';
import {
  BACKUP_SCHEMA,
  DEFAULT_USER_NAME,
  StorageLike,
  buildDefaultTeamName,
  exportFullBackupJson,
  getShortUserId,
  loadUserProfile,
  normalizeUserName,
  parseBackupJson,
  resolveUniqueTeamName,
  restoreFullBackup,
  saveUserProfile,
} from '../userProfile';
import { saveUserTeam } from '../teamStorage';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('userProfile, Commander + UUID & backup/restore', () => {
  it('defaults username to Commander with persistent UUID and generates collision-safe squad names', () => {
    const store = createMemoryStorage();
    const initial = loadUserProfile(store);
    expect(initial.userName).toBe(DEFAULT_USER_NAME);
    expect(initial.userId).toMatch(/^[0-9a-f-]{16,}$/i);

    // Reloading preserves the generated UUID
    const reloaded = loadUserProfile(store);
    expect(reloaded.userId).toBe(initial.userId);

    // Saving empty name resets to Commander while keeping UUID
    const resetProfile = saveUserProfile('   ', 2000, store);
    expect(resetProfile.userName).toBe(DEFAULT_USER_NAME);
    expect(resetProfile.userId).toBe(initial.userId);

    expect(normalizeUserName('  Ａｃｅ #01 / test ')).toBe('Ace01test');

    // Default Commander squad includes short UUID
    const shortId = getShortUserId(initial.userId);
    const cmdTeam1 = buildDefaultTeamName('Commander', [], initial.userId);
    const cmdTeam2 = buildDefaultTeamName('Commander', [cmdTeam1], initial.userId);
    expect(cmdTeam1).toBe(`Commander-${shortId}小隊`);
    expect(cmdTeam2).toBe(`Commander-${shortId}小隊-2`);

    // Custom callsign squad uses callsign directly with duplicate sequence
    expect(buildDefaultTeamName('Valkyrie', [])).toBe('Valkyrie小隊');
    expect(buildDefaultTeamName('Valkyrie', ['Valkyrie小隊'])).toBe('Valkyrie小隊-2');
    expect(resolveUniqueTeamName('Alpha', ['alpha'])).toBe('Alpha-2');
  });

  it('auto-deduplicates saved team names via saveUserTeam', () => {
    const r1 = saveUserTeam([], {
      name: '',
      userName: 'Valkyrie',
      userId: '1111aaaa-2222-4333-8444-555566667777',
      members: [
        { mechId: PRESET_ABC.id, pilotId: DEFAULT_PILOT_PROFILE.id },
        { mechId: PRESET_ABC.id, pilotId: DEFAULT_PILOT_PROFILE.id },
        { mechId: PRESET_ABC.id, pilotId: DEFAULT_PILOT_PROFILE.id },
      ],
    });
    expect(r1.saved.name).toBe('Valkyrie小隊');

    const r2 = saveUserTeam(r1.nextList, {
      name: 'Valkyrie小隊',
      userName: 'Valkyrie',
      userId: '1111aaaa-2222-4333-8444-555566667777',
      members: r1.saved.members,
    });
    expect(r2.saved.name).toBe('Valkyrie小隊-2');
  });

  it('exports and restores full backup JSON cleanly in merge and overwrite modes', () => {
    const srcStore = createMemoryStorage();
    const srcProfile = saveUserProfile('Valkyrie', 1000, srcStore);
    srcStore.setItem(
      'codemech_saved_teams_v1',
      JSON.stringify([
        {
          id: 't1',
          name: 'Valkyrie小隊',
          savedAt: 1000,
          members: [{ mechId: PRESET_ABC.id, pilotId: DEFAULT_PILOT_PROFILE.id }],
        },
      ])
    );
    srcStore.setItem('codemech_curriculum_v2', JSON.stringify(['step0_robot_4x4']));

    const backupJson = exportFullBackupJson('0.4.1', srcStore);
    const parsed = parseBackupJson(backupJson);
    expect(parsed.schema).toBe(BACKUP_SCHEMA);
    expect(parsed.userProfile.userName).toBe('Valkyrie');
    expect(parsed.userProfile.userId).toBe(srcProfile.userId);

    // Merge into a destination that already has a team named "Valkyrie小隊" and custom name "Sentinel"
    const dstStore = createMemoryStorage();
    const dstProfile = saveUserProfile('Sentinel', 500, dstStore);
    dstStore.setItem(
      'codemech_saved_teams_v1',
      JSON.stringify([
        {
          id: 't_existing',
          name: 'Valkyrie小隊',
          savedAt: 500,
          members: [{ mechId: PRESET_ABC.id, pilotId: DEFAULT_PILOT_PROFILE.id }],
        },
      ])
    );

    const mergeRes = restoreFullBackup(parsed, 'merge', dstStore);
    expect(mergeRes.userName).toBe('Sentinel');
    expect(mergeRes.userId).toBe(dstProfile.userId);
    expect(mergeRes.teams).toBe(2);
    const mergedTeams = JSON.parse(dstStore.getItem('codemech_saved_teams_v1')!);
    expect(mergedTeams.map((t: { name: string }) => t.name)).toEqual(['Valkyrie小隊', 'Valkyrie小隊-2']);

    const overwriteRes = restoreFullBackup(parsed, 'overwrite', dstStore);
    expect(overwriteRes.userName).toBe('Valkyrie');
    expect(overwriteRes.userId).toBe(srcProfile.userId);
    expect(overwriteRes.teams).toBe(1);

    expect(() => parseBackupJson('{"schema":"other"}')).toThrow('codemech.backup.v1');
  });
});
