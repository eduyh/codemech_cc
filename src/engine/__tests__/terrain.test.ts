import { describe, expect, it } from 'vitest';
import { STARTER_MECHS } from '../../data/presets';
import { MatchParticipantEntry } from '../../types/mech';
import { distance2D } from '../math';
import {
  createTerrain,
  generateSpawnPositions,
  getGroundHeight,
  getSurfaceHeight,
  hasLineOfSight3D,
} from '../terrain';

function buildEntries(teamCount: number, perTeam: number): MatchParticipantEntry[] {
  const entries: MatchParticipantEntry[] = [];
  for (let t = 0; t < teamCount; t++) {
    for (let m = 0; m < perTeam; m++) {
      const bp = STARTER_MECHS[(t * perTeam + m) % STARTER_MECHS.length];
      entries.push({
        id: `m_${t}_${m}`,
        name: `Mech ${t}-${m}`,
        teamId: `team_${t}`,
        blueprint: bp,
      });
    }
  }
  return entries;
}

describe('terrain & multi-team spawns', () => {
  it('computes deterministic heightmap elevations for plains_ridge', () => {
    const tA = createTerrain('plains_ridge', 600, 600, 777);
    const tB = createTerrain('plains_ridge', 600, 600, 777);

    const centerH = getGroundHeight(tA, 300, 300);
    const northPlainH = getGroundHeight(tA, 300, 120);

    expect(centerH).toBeGreaterThan(12);
    expect(northPlainH).toBeLessThan(2);
    expect(centerH).toBe(getGroundHeight(tB, 300, 300));
    expect(getSurfaceHeight(tA, 300 - 130, 300 - 100)).toBeGreaterThanOrEqual(11);
  });

  it('blocks ground-level line of sight across central ridge and restores LOS when elevated', () => {
    const terrain = createTerrain('plains_ridge', 600, 600, 1);
    const northGround = { x: 300, y: 180, z: getGroundHeight(terrain, 300, 180) + 9 };
    const southGround = { x: 300, y: 420, z: getGroundHeight(terrain, 300, 420) + 6.7 };

    expect(hasLineOfSight3D(terrain, northGround, southGround)).toBe(false);

    const northElevated = { x: 300, y: 180, z: northGround.z + 18 };
    const southElevated = { x: 300, y: 420, z: southGround.z + 18 };
    expect(hasLineOfSight3D(terrain, northElevated, southElevated)).toBe(true);
  });

  it('generates non-overlapping in-bounds spawns for 2x6, 3x4, 4x3, 6x2, 3x3, and 12-mech BR', () => {
    const terrain = createTerrain('plains_ridge', 600, 600, 42);
    const configs: Array<[number, number]> = [
      [6, 2],
      [4, 3],
      [3, 4],
      [2, 6],
      [3, 3],
      [12, 1],
    ];

    for (const [teams, perTeam] of configs) {
      const entries = buildEntries(teams, perTeam);
      const spawns = generateSpawnPositions(terrain, entries, 42);
      expect(spawns.size).toBe(entries.length);

      const list = Array.from(spawns.values());
      for (const s of list) {
        expect(s.x).toBeGreaterThanOrEqual(20);
        expect(s.x).toBeLessThanOrEqual(580);
        expect(s.y).toBeGreaterThanOrEqual(20);
        expect(s.y).toBeLessThanOrEqual(580);
        expect(s.z).toBeGreaterThanOrEqual(0);
      }

      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          expect(distance2D(list[i].x, list[i].y, list[j].x, list[j].y)).toBeGreaterThan(8);
        }
      }
    }
  });
});
