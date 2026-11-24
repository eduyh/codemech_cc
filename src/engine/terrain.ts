import {
  ArenaPresetId,
  MatchParticipantEntry,
  TerrainConfig,
  TerrainObstacle,
  Vec3,
} from '../types/mech';
import { clamp, deriveEntityRngSeed, nextMulberry32, vectorToAngle2D } from './math';

export function createTerrain(
  presetId: ArenaPresetId,
  width = 600,
  depth = 600,
  seed = 1
): TerrainConfig {
  const cx = width * 0.5;
  const cy = depth * 0.5;
  const obstacles: TerrainObstacle[] = [];

  if (presetId === 'plains_ridge') {
    obstacles.push(
      {
        id: 'cover_nw',
        x: cx - 140,
        y: cy - 110,
        width: 36,
        height: 16,
        baseZ: 0,
        topZ: 11,
      },
      {
        id: 'cover_se',
        x: cx + 104,
        y: cy + 94,
        width: 36,
        height: 16,
        baseZ: 0,
        topZ: 11,
      }
    );
    return {
      id: presetId,
      width,
      depth,
      heightAmplitude: 16,
      ridgeType: 'central_ridge',
      obstacles,
      seed,
    };
  }

  if (presetId === 'twin_mesas') {
    obstacles.push(
      {
        id: 'mesa_w',
        x: cx - 155,
        y: cy - 55,
        width: 90,
        height: 110,
        baseZ: 0,
        topZ: 14,
      },
      {
        id: 'mesa_e',
        x: cx + 65,
        y: cy - 55,
        width: 90,
        height: 110,
        baseZ: 0,
        topZ: 14,
      },
      {
        id: 'cover_mid',
        x: cx - 18,
        y: cy - 18,
        width: 36,
        height: 36,
        baseZ: 0,
        topZ: 12,
      }
    );
    return {
      id: presetId,
      width,
      depth,
      heightAmplitude: 8,
      ridgeType: 'twin_mesas',
      obstacles,
      seed,
    };
  }

  if (presetId === 'urban_pillars') {
    const coords = [
      [-150, -130, 38, 38, 22],
      [112, -130, 38, 38, 22],
      [-150, 92, 38, 38, 22],
      [112, 92, 38, 38, 22],
      [-24, -120, 48, 24, 15],
      [-24, 96, 48, 24, 15],
      [-110, -20, 26, 40, 14],
      [84, -20, 26, 40, 14],
    ];
    coords.forEach(([ox, oy, w, h, topZ], idx) => {
      obstacles.push({
        id: `pillar_${idx}`,
        x: cx + ox,
        y: cy + oy,
        width: w,
        height: h,
        baseZ: 0,
        topZ,
      });
    });
    return {
      id: presetId,
      width,
      depth,
      heightAmplitude: 0,
      ridgeType: 'urban_flat',
      obstacles,
      seed,
    };
  }

  // valley_basin
  obstacles.push(
    {
      id: 'basin_boulder_n',
      x: cx - 22,
      y: cy - 85,
      width: 44,
      height: 22,
      baseZ: 0,
      topZ: 10,
    },
    {
      id: 'basin_boulder_s',
      x: cx - 22,
      y: cy + 63,
      width: 44,
      height: 22,
      baseZ: 0,
      topZ: 10,
    }
  );
  return {
    id: 'valley_basin',
    width,
    depth,
    heightAmplitude: 18,
    ridgeType: 'valley_rim',
    obstacles,
    seed,
  };
}

export function getGroundHeight(terrain: TerrainConfig, x: number, y: number): number {
  if (terrain.heightAmplitude <= 0) return 0;

  const cx = terrain.width * 0.5;
  const cy = terrain.depth * 0.5;
  const nx = (x - cx) / Math.max(1, cx);
  const ny = (y - cy) / Math.max(1, cy);

  if (terrain.ridgeType === 'central_ridge') {
    // Prominent east-west ridge along y = cy (ny = 0) for hull-down cover
    const ridgeBand = Math.exp(-(ny * ny) / 0.022);
    const eastWestSpan = Math.exp(-(nx * nx) / 0.55);
    const ridge = terrain.heightAmplitude * ridgeBand * eastWestSpan;

    // Gentle side hills on far east/west flanks
    const sideHillL = 9 * Math.exp(-((nx + 0.55) ** 2 + (ny - 0.15) ** 2) / 0.06);
    const sideHillR = 9 * Math.exp(-((nx - 0.55) ** 2 + (ny + 0.15) ** 2) / 0.06);
    return Math.max(0, ridge + sideHillL + sideHillR);
  }

  if (terrain.ridgeType === 'twin_mesas') {
    const moundW = terrain.heightAmplitude * Math.exp(-((nx + 0.45) ** 2 + ny * ny) / 0.08);
    const moundE = terrain.heightAmplitude * Math.exp(-((nx - 0.45) ** 2 + ny * ny) / 0.08);
    return Math.max(0, moundW + moundE);
  }

  if (terrain.ridgeType === 'valley_rim') {
    const rSq = nx * nx + ny * ny;
    const rim = Math.max(0, rSq - 0.25) * terrain.heightAmplitude * 0.85;
    return clamp(rim, 0, terrain.heightAmplitude);
  }

  return 0;
}

export function getSurfaceHeight(terrain: TerrainConfig, x: number, y: number): number {
  let h = getGroundHeight(terrain, x, y);
  for (const obs of terrain.obstacles) {
    if (x >= obs.x && x <= obs.x + obs.width && y >= obs.y && y <= obs.y + obs.height) {
      if (obs.topZ > h) {
        h = obs.topZ;
      }
    }
  }
  return h;
}

export function isInsideObstacleSolid(
  terrain: TerrainConfig,
  x: number,
  y: number,
  z: number,
  pad = 0
): TerrainObstacle | null {
  for (const obs of terrain.obstacles) {
    if (
      x >= obs.x - pad &&
      x <= obs.x + obs.width + pad &&
      y >= obs.y - pad &&
      y <= obs.y + obs.height + pad &&
      z >= obs.baseZ &&
      z < obs.topZ
    ) {
      return obs;
    }
  }
  return null;
}

function intersectSegmentAABB3D(from: Vec3, to: Vec3, obs: TerrainObstacle): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;

  const mins = [obs.x, obs.y, obs.baseZ];
  const maxs = [obs.x + obs.width, obs.y + obs.height, obs.topZ];
  const origins = [from.x, from.y, from.z];
  const dirs = [dx, dy, dz];

  let tMin = 0;
  let tMax = 1;

  for (let i = 0; i < 3; i++) {
    if (Math.abs(dirs[i]) < 1e-8) {
      if (origins[i] < mins[i] || origins[i] > maxs[i]) {
        return null;
      }
    } else {
      let t1 = (mins[i] - origins[i]) / dirs[i];
      let t2 = (maxs[i] - origins[i]) / dirs[i];
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) {
        return null;
      }
    }
  }

  return tMin >= 0 && tMin <= 1 ? tMin : null;
}

export interface TerrainRayHit {
  hit: boolean;
  hitPos: Vec3 | null;
  hitType: 'ground' | 'obstacle' | null;
  t: number;
}

export function raycastTerrain3D(
  terrain: TerrainConfig,
  from: Vec3,
  to: Vec3,
  stepMeters = 2.0
): TerrainRayHit {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const segLen = Math.hypot(dx, dy, dz);

  let bestT = Infinity;
  let bestType: 'ground' | 'obstacle' | null = null;

  for (const obs of terrain.obstacles) {
    const tObs = intersectSegmentAABB3D(from, to, obs);
    if (tObs !== null && tObs < bestT) {
      bestT = tObs;
      bestType = 'obstacle';
    }
  }

  if (segLen > 1e-6) {
    const maxSampleT = Math.min(1, bestT);
    const steps = clamp(Math.ceil((segLen * maxSampleT) / Math.max(0.5, stepMeters)), 8, 256);

    let prevT = 0;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * maxSampleT;
      const px = from.x + dx * t;
      const py = from.y + dy * t;
      const pz = from.z + dz * t;
      const gh = getGroundHeight(terrain, px, py);

      if (pz <= gh) {
        // Binary refine on [prevT, t]
        let lo = prevT;
        let hi = t;
        for (let iter = 0; iter < 4; iter++) {
          const mid = 0.5 * (lo + hi);
          const mx = from.x + dx * mid;
          const my = from.y + dy * mid;
          const mz = from.z + dz * mid;
          if (mz <= getGroundHeight(terrain, mx, my)) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        if (hi < bestT) {
          bestT = hi;
          bestType = 'ground';
        }
        break;
      }
      prevT = t;
    }
  }

  if (bestType === null || bestT > 1) {
    return { hit: false, hitPos: null, hitType: null, t: 1 };
  }

  return {
    hit: true,
    hitType: bestType,
    t: bestT,
    hitPos: {
      x: from.x + dx * bestT,
      y: from.y + dy * bestT,
      z: from.z + dz * bestT,
    },
  };
}

export function hasLineOfSight3D(terrain: TerrainConfig, from: Vec3, to: Vec3): boolean {
  return !raycastTerrain3D(terrain, from, to).hit;
}

export interface SpawnTransform {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export function generateSpawnPositions(
  terrain: TerrainConfig,
  entries: MatchParticipantEntry[],
  matchSeed: number
): Map<string, SpawnTransform> {
  const result = new Map<string, SpawnTransform>();
  if (entries.length === 0) return result;

  const teamOrder: string[] = [];
  const byTeam = new Map<string, MatchParticipantEntry[]>();

  for (const entry of entries) {
    if (!byTeam.has(entry.teamId)) {
      teamOrder.push(entry.teamId);
      byTeam.set(entry.teamId, []);
    }
    byTeam.get(entry.teamId)!.push(entry);
  }

  const cx = terrain.width * 0.5;
  const cy = terrain.depth * 0.5;
  const ringRadius = Math.min(terrain.width, terrain.depth) * 0.36;
  const margin = 24;

  const rngSeed = deriveEntityRngSeed(matchSeed, 999);
  const { value: randAngle } = nextMulberry32(rngSeed);
  // 2 teams default near North/South so plains_ridge sits directly between them unless seed rotates slightly
  const baseAngleOffset = teamOrder.length === 2 ? (randAngle - 0.5) * 0.25 : randAngle * Math.PI * 2;

  const teamCount = teamOrder.length;
  for (let tIdx = 0; tIdx < teamCount; tIdx++) {
    const teamId = teamOrder[tIdx];
    const members = byTeam.get(teamId)!;
    const teamAngle = baseAngleOffset + (tIdx / teamCount) * Math.PI * 2;

    // Angle 0 => North (0, -1), Angle PI/2 => East (1, 0)
    const dirX = Math.sin(teamAngle);
    const dirY = -Math.cos(teamAngle);
    const tangX = Math.cos(teamAngle);
    const tangY = Math.sin(teamAngle);

    const anchorX = cx + dirX * ringRadius;
    const anchorY = cy + dirY * ringRadius;
    const spacing = Math.min(28, (Math.PI * 2 * ringRadius) / Math.max(entries.length * 1.4, 4));

    members.forEach((member, mIdx) => {
      const offsetIndex = mIdx - (members.length - 1) * 0.5;
      const radialStagger = (mIdx % 2 === 0 ? 0 : 12);
      const rawX = anchorX + tangX * offsetIndex * spacing + dirX * radialStagger;
      const rawY = anchorY + tangY * offsetIndex * spacing + dirY * radialStagger;

      const x = clamp(rawX, margin, terrain.width - margin);
      const y = clamp(rawY, margin, terrain.depth - margin);
      const z = getSurfaceHeight(terrain, x, y);
      const yaw = vectorToAngle2D(cx - x, cy - y);

      result.set(member.id, { x, y, z, yaw });
    });
  }

  return result;
}
