import { describe, expect, it } from 'vitest';
import { STARTER_MECHS } from '../../data/presets';
import { MatchParticipantEntry } from '../../types/mech';
import { distance2D } from '../math';
import {
  computeRecommendedArenaSize,
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

  it('scales arena size with mech count, creates 3-tier obstacle heights, and generates non-overlapping spawns up to 2000m', () => {
    expect(computeRecommendedArenaSize(2)).toBe(1000);
    expect(computeRecommendedArenaSize(4)).toBe(1200);
    expect(computeRecommendedArenaSize(6)).toBe(1500);
    expect(computeRecommendedArenaSize(9)).toBe(1750);
    expect(computeRecommendedArenaSize(12)).toBe(2000);

    const presets = ['plains_ridge', 'twin_mesas', 'urban_pillars', 'valley_basin'] as const;
    for (const p of presets) {
      const t = createTerrain(p, 2000, 2000, 42);
      const clearHeights = t.obstacles.map(
        (o) => o.topZ - getGroundHeight(t, o.x + o.width * 0.5, o.y + o.height * 0.5)
      );
      expect(clearHeights.some((h) => h < 8)).toBe(true); // low hull-down
      expect(clearHeights.some((h) => h >= 10 && h <= 20)).toBe(true); // mid cover
      expect(clearHeights.some((h) => h > 25)).toBe(true); // tall tower/monolith
    }

    const terrain = createTerrain('plains_ridge', 2000, 2000, 42);
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
        expect(s.x).toBeLessThanOrEqual(1980);
        expect(s.y).toBeGreaterThanOrEqual(20);
        expect(s.y).toBeLessThanOrEqual(1980);
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
