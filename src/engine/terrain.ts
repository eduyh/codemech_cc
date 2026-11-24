import {
  ArenaPresetId,
  MatchParticipantEntry,
  TerrainConfig,
  TerrainObstacle,
  Vec3,
} from '../types/mech';
import { clamp, deriveEntityRngSeed, nextMulberry32, vectorToAngle2D } from './math';

export function computeRecommendedArenaSize(mechCount: number): number {
  if (mechCount <= 2) return 1000;
  if (mechCount <= 4) return 1200;
  if (mechCount <= 6) return 1500;
  if (mechCount <= 9) return 1750;
  return 2000;
}

function buildProportionalObstacle(
  terrainDraft: TerrainConfig,
  id: string,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
  clearHeight: number
): TerrainObstacle {
  const x = cx + ox * sx;
  const y = cy + oy * sy;
  const width = Math.max(8, w * sx);
  const height = Math.max(8, h * sy);
  const localH = getGroundHeight(terrainDraft, x + width * 0.5, y + height * 0.5);
  return {
    id,
    x,
    y,
    width,
    height,
    baseZ: 0,
    topZ: Math.round((localH + clearHeight) * 10) / 10,
  };
}

export function createTerrain(
  presetId: ArenaPresetId,
  width = 1000,
  depth = 1000,
  seed = 1
): TerrainConfig {
  const cx = width * 0.5;
  const cy = depth * 0.5;
  const sx = width / 600;
  const sy = depth / 600;
  const ampScale = clamp(Math.pow(width / 600, 0.55), 0.75, 2.2);
  const obstacles: TerrainObstacle[] = [];

  if (presetId === 'plains_ridge') {
    const draft: TerrainConfig = {
      id: presetId,
      width,
      depth,
      heightAmplitude: Math.round(16 * ampScale * 10) / 10,
      ridgeType: 'central_ridge',
      obstacles,
      seed,
    };
    const specs: Array<[string, number, number, number, number, number]> = [
      // Mid full-body cover (13m)
      ['cover_nw', -140, -110, 36, 16, 13],
      ['cover_se', 104, 94, 36, 16, 13],
      // Low hull-down cover (6m: shields legs while allowing torso/arm fire)
      ['hulldown_n', -32, -82, 64, 14, 6],
      ['hulldown_s', -32, 68, 64, 14, 6],
      // Tall monoliths (32m: blocks direct LOS, jump-jets, and low arcs)
      ['spire_w', -215, -22, 28, 44, 32],
      ['spire_e', 187, -22, 28, 44, 32],
    ];
    for (const [id, ox, oy, w, h, ch] of specs) {
      obstacles.push(buildProportionalObstacle(draft, id, cx, cy, sx, sy, ox, oy, w, h, ch));
    }
    return draft;
  }

  if (presetId === 'twin_mesas') {
    const draft: TerrainConfig = {
      id: presetId,
      width,
      depth,
      heightAmplitude: Math.round(8 * ampScale * 10) / 10,
      ridgeType: 'twin_mesas',
      obstacles,
      seed,
    };
    const specs: Array<[string, number, number, number, number, number]> = [
      // Mid jumpable mesas (14m)
      ['mesa_w', -155, -55, 86, 105, 14],
      ['mesa_e', 69, -55, 86, 105, 14],
      // Low hull-down barricades near center (6m)
      ['barricade_n', -30, -96, 60, 14, 6],
      ['barricade_s', -30, 82, 60, 14, 6],
      // Tall central spire (34m)
      ['spire_mid', -16, -16, 32, 32, 34],
    ];
    for (const [id, ox, oy, w, h, ch] of specs) {
      obstacles.push(buildProportionalObstacle(draft, id, cx, cy, sx, sy, ox, oy, w, h, ch));
    }
    return draft;
  }

  if (presetId === 'urban_pillars') {
    const draft: TerrainConfig = {
      id: presetId,
      width,
      depth,
      heightAmplitude: 0,
      ridgeType: 'urban_flat',
      obstacles,
      seed,
    };
    const specs: Array<[string, number, number, number, number, number]> = [
      // Tall skyscraper pillars (34-38m)
      ['tower_nw', -155, -135, 36, 36, 36],
      ['tower_ne', 119, -135, 36, 36, 36],
      ['tower_sw', -155, 99, 36, 36, 36],
      ['tower_se', 119, 99, 36, 36, 36],
      // Mid buildings (14-15m)
      ['bldg_n', -24, -120, 48, 24, 15],
      ['bldg_s', -24, 96, 48, 24, 15],
      ['bldg_w', -112, -20, 26, 40, 14],
      ['bldg_e', 86, -20, 26, 40, 14],
      // Low street jersey barriers (6m hull-down)
      ['low_wall_c', -22, -7, 44, 14, 6],
      ['low_wall_w', -180, -7, 26, 14, 6],
      ['low_wall_e', 154, -7, 26, 14, 6],
    ];
    for (const [id, ox, oy, w, h, ch] of specs) {
      obstacles.push(buildProportionalObstacle(draft, id, cx, cy, sx, sy, ox, oy, w, h, ch));
    }
    return draft;
  }

  // valley_basin
  const draft: TerrainConfig = {
    id: 'valley_basin',
    width,
    depth,
    heightAmplitude: Math.round(18 * ampScale * 10) / 10,
    ridgeType: 'valley_rim',
    obstacles,
    seed,
  };
  const specs: Array<[string, number, number, number, number, number]> = [
    // Low basin hull-down rocks (6m)
    ['basin_low_w', -85, -18, 20, 36, 6],
    ['basin_low_e', 65, -18, 20, 36, 6],
    // Mid boulders (12m)
    ['basin_boulder_n', -22, -85, 44, 22, 12],
    ['basin_boulder_s', -22, 63, 44, 22, 12],
    // Tall cliff monoliths (30m)
    ['basin_spire_nw', -160, -140, 30, 30, 30],
    ['basin_spire_se', 130, 110, 30, 30, 30],
  ];
  for (const [id, ox, oy, w, h, ch] of specs) {
    obstacles.push(buildProportionalObstacle(draft, id, cx, cy, sx, sy, ox, oy, w, h, ch));
  }
  return draft;
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
    const spacing = Math.min(
      Math.max(28, terrain.width * 0.045),
      (Math.PI * 2 * ringRadius) / Math.max(entries.length * 1.4, 4)
    );
    const radialStep = Math.max(12, terrain.width * 0.02);

    members.forEach((member, mIdx) => {
      const offsetIndex = mIdx - (members.length - 1) * 0.5;
      const radialStagger = mIdx % 2 === 0 ? 0 : radialStep;
      const rawX = anchorX + tangX * offsetIndex * spacing + dirX * radialStagger;
      const rawY = anchorY + tangY * offsetIndex * spacing + dirY * radialStagger;

      let x = clamp(rawX, margin, terrain.width - margin);
      let y = clamp(rawY, margin, terrain.depth - margin);
      for (let nudge = 0; nudge < 6; nudge++) {
        const gh = getGroundHeight(terrain, x, y);
        if (!isInsideObstacleSolid(terrain, x, y, gh + 1.5, 4.5)) break;
        x = clamp(x + dirX * 14 + tangX * 10, margin, terrain.width - margin);
        y = clamp(y + dirY * 14 + tangY * 10, margin, terrain.depth - margin);
      }
      const z = getSurfaceHeight(terrain, x, y);
      const yaw = vectorToAngle2D(cx - x, cy - y);

      result.set(member.id, { x, y, z, yaw });
    });
  }

  return result;
}
