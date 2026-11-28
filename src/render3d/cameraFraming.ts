import * as THREE from 'three';
import { clamp, degToRad } from '../engine/math';
import { getSurfaceHeight } from '../engine/terrain';
import { MechRuntimeState, SimState, TerrainConfig, Vec3 } from '../types/mech';
import { simToThreePos } from './coords';

export type CameraMode = 'director' | 'overview' | 'follow' | 'orbit';

export interface FramingPoint {
  x: number;
  y: number;
  z: number;
  radiusH: number;
  radiusUp: number;
  radiusDown: number;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Normalizes the signed angular difference from `fromRad` to `toRad` into [-PI, PI].
 */
export function shortestAngleDelta(fromRad: number, toRad: number): number {
  let diff = (toRad - fromRad) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Linearly interpolates between two radian angles along the shortest arc.
 */
export function lerpAngle(fromRad: number, toRad: number, alpha: number): number {
  return fromRad + shortestAngleDelta(fromRad, toRad) * alpha;
}

/**
 * Chooses the broadside camera yaw angle closest to `prevYawRad` so crossing mechs
 * do not cause a sudden 180-degree camera whip-flip.
 */
export function pickStableBroadsideYaw(
  dx: number,
  dz: number,
  prevYawRad: number | null,
  offsetRad = Math.PI * 0.42
): number {
  if (Math.hypot(dx, dz) < 2) {
    return prevYawRad ?? 0.6;
  }
  const pairYaw = Math.atan2(dx, dz);
  const candA = pairYaw + offsetRad;
  const candB = candA + Math.PI;
  if (prevYawRad === null) return candA;
  return Math.abs(shortestAngleDelta(prevYawRad, candA)) <=
    Math.abs(shortestAngleDelta(prevYawRad, candB))
    ? candA
    : candB;
}

/**
 * Computes a perspective camera placement along `camYawRad` that guarantees every
 * framing point (including horizontal & vertical margins) fits inside the safe viewport fraction.
 */
export function fitFramingPointsToCamera(params: {
  points: readonly FramingPoint[];
  fovDeg: number;
  aspect: number;
  camYawRad: number;
  elevationRad?: number;
  safeFracX?: number;
  safeFracY?: number;
  minDist?: number;
  maxDist?: number;
}): { camPos: THREE.Vector3; lookAt: THREE.Vector3; distance: number } {
  const {
    points,
    fovDeg,
    aspect,
    camYawRad,
    safeFracX = 0.72,
    safeFracY = 0.65,
    minDist = 68,
    maxDist = 640,
  } = params;

  if (points.length === 0) {
    return {
      camPos: new THREE.Vector3(0, 120, 180),
      lookAt: new THREE.Vector3(0, 6, 0),
      distance: 216,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const p of points) {
    if (p.x - p.radiusH < minX) minX = p.x - p.radiusH;
    if (p.x + p.radiusH > maxX) maxX = p.x + p.radiusH;
    if (p.y - p.radiusDown < minY) minY = p.y - p.radiusDown;
    if (p.y + p.radiusUp > maxY) maxY = p.y + p.radiusUp;
    if (p.z - p.radiusH < minZ) minZ = p.z - p.radiusH;
    if (p.z + p.radiusH > maxZ) maxZ = p.z + p.radiusH;
  }

  const lookAt = new THREE.Vector3(
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    (minZ + maxZ) * 0.5
  );

  const horizSpan = Math.hypot(maxX - minX, maxZ - minZ);
  const elev = clamp(
    params.elevationRad ?? degToRad(21 + horizSpan * 0.025),
    degToRad(16),
    degToRad(50)
  );
  const cosE = Math.cos(elev);
  const sinE = Math.sin(elev);

  const back = new THREE.Vector3(
    Math.sin(camYawRad) * cosE,
    sinE,
    Math.cos(camYawRad) * cosE
  ).normalize();
  const right = new THREE.Vector3().crossVectors(WORLD_UP, back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);

  const tanHalfV = Math.tan(degToRad(fovDeg) * 0.5);
  const tanHalfH = tanHalfV * Math.max(0.6, aspect);
  const rel = new THREE.Vector3();

  let requiredDist = minDist;
  for (const p of points) {
    rel.set(p.x - lookAt.x, p.y - lookAt.y, p.z - lookAt.z);
    const projR = rel.dot(right);
    const projU = rel.dot(up);
    const projD = rel.dot(back);

    const reqX = projD + (Math.abs(projR) + p.radiusH) / (safeFracX * tanHalfH);
    const reqTop = projD + Math.max(0, projU + p.radiusUp) / (safeFracY * tanHalfV);
    const reqBot = projD + Math.max(0, -projU + p.radiusDown) / (safeFracY * tanHalfV);
    const reqNear = projD + Math.max(18, p.radiusH * 1.4);

    if (reqX > requiredDist) requiredDist = reqX;
    if (reqTop > requiredDist) requiredDist = reqTop;
    if (reqBot > requiredDist) requiredDist = reqBot;
    if (reqNear > requiredDist) requiredDist = reqNear;
  }

  const distance = clamp(requiredDist, minDist, maxDist);
  const camPos = lookAt.clone().addScaledVector(back, distance);
  return { camPos, lookAt, distance };
}

function mechToFramingPoint(mech: MechRuntimeState, terrain: TerrainConfig): FramingPoint {
  const pos3 = simToThreePos(mech.pos, terrain);
  const scale = mech.stats?.sizeScale ?? 1;
  return {
    x: pos3.x,
    y: pos3.y,
    z: pos3.z,
    radiusH: 11 * scale,
    radiusUp: 15.5 * scale,
    radiusDown: 4,
  };
}

function clampCamAboveTerrain(camPos: THREE.Vector3, terrain: TerrainConfig, clearance = 14): void {
  const camSimX = camPos.x + terrain.width * 0.5;
  const camSimY = camPos.z + terrain.depth * 0.5;
  const minSurfaceY = getSurfaceHeight(terrain, camSimX, camSimY) + clearance;
  if (camPos.y < minSurfaceY) {
    camPos.y = minSurfaceY;
  }
}

/**
 * Computes the desired target position and lookAt point for the automated Director camera,
 * framing active pairs, nearby skirmishers/balloons, and active capture zones inside the FOV.
 */
export function computeDirectorCameraTarget(params: {
  state: SimState;
  primary?: MechRuntimeState;
  secondary?: MechRuntimeState;
  killFocusPos?: Vec3 | null;
  prevCameraYawRad: number | null;
  orbitAngle: number;
  fovDeg: number;
  aspect: number;
}): { camPos: THREE.Vector3; lookAt: THREE.Vector3; cameraYawRad: number } {
  const {
    state,
    primary,
    secondary,
    killFocusPos,
    prevCameraYawRad,
    orbitAngle,
    fovDeg,
    aspect,
  } = params;

  if (killFocusPos) {
    const kVec = simToThreePos(killFocusPos, state.terrain);
    const lookAt = new THREE.Vector3(kVec.x, kVec.y + 5, kVec.z);
    const angle = orbitAngle * 1.4;
    const dist = 64;
    const camPos = new THREE.Vector3(
      kVec.x + Math.sin(angle) * dist,
      kVec.y + 24,
      kVec.z + Math.cos(angle) * dist
    );
    clampCamAboveTerrain(camPos, state.terrain, 14);
    return { camPos, lookAt, cameraYawRad: angle };
  }

  const alive = state.mechs.filter((m) => m.alive);
  const uncapturedZones = (state.captureZones ?? []).filter((z) => !z.captured);
  const targetZones =
    uncapturedZones.length > 0 ? uncapturedZones : (state.captureZones ?? []);

  if (primary && secondary) {
    const vA = simToThreePos(primary.pos, state.terrain);
    const vB = simToThreePos(secondary.pos, state.terrain);
    const points: FramingPoint[] = [
      mechToFramingPoint(primary, state.terrain),
      mechToFramingPoint(secondary, state.terrain),
    ];

    const addedIds = new Set<string>([primary.id, secondary.id]);
    if (alive.length <= 4) {
      let minX = Math.min(vA.x, vB.x);
      let maxX = Math.max(vA.x, vB.x);
      let minZ = Math.min(vA.z, vB.z);
      let maxZ = Math.max(vA.z, vB.z);
      for (const m of alive) {
        if (addedIds.has(m.id)) continue;
        const vm = simToThreePos(m.pos, state.terrain);
        minX = Math.min(minX, vm.x);
        maxX = Math.max(maxX, vm.x);
        minZ = Math.min(minZ, vm.z);
        maxZ = Math.max(maxZ, vm.z);
      }
      if (Math.hypot(maxX - minX, maxZ - minZ) <= 440) {
        for (const m of alive) {
          if (addedIds.has(m.id)) continue;
          addedIds.add(m.id);
          points.push(mechToFramingPoint(m, state.terrain));
        }
      }
    } else {
      const midX = (vA.x + vB.x) * 0.5;
      const midZ = (vA.z + vB.z) * 0.5;
      for (const m of alive) {
        if (addedIds.has(m.id) || points.length >= 4) continue;
        const vm = simToThreePos(m.pos, state.terrain);
        if (Math.hypot(vm.x - midX, vm.z - midZ) <= 150) {
          addedIds.add(m.id);
          points.push(mechToFramingPoint(m, state.terrain));
        }
      }
    }

    if (targetZones.length > 0 && alive.length <= 3) {
      for (const zone of targetZones) {
        const surfaceZ = zone.z ?? getSurfaceHeight(state.terrain, zone.x, zone.y);
        const vz = simToThreePos({ x: zone.x, y: zone.y, z: surfaceZ }, state.terrain);
        points.push({
          x: vz.x,
          y: vz.y,
          z: vz.z,
          radiusH: Math.max(18, zone.radius * 0.85),
          radiusUp: 12,
          radiusDown: 3,
        });
      }
    }

    const desiredYaw = pickStableBroadsideYaw(
      vB.x - vA.x,
      vB.z - vA.z,
      prevCameraYawRad,
      Math.PI * 0.42
    );
    const nextYaw =
      prevCameraYawRad === null ? desiredYaw : lerpAngle(prevCameraYawRad, desiredYaw, 0.08);
    const renderYaw = nextYaw + Math.sin(orbitAngle * 0.65) * 0.14;

    const fitted = fitFramingPointsToCamera({
      points,
      fovDeg,
      aspect,
      camYawRad: renderYaw,
      minDist: 72,
      maxDist: 640,
    });
    clampCamAboveTerrain(fitted.camPos, state.terrain, 14);
    return {
      camPos: fitted.camPos,
      lookAt: fitted.lookAt,
      cameraYawRad: nextYaw,
    };
  }

  if (primary) {
    const vP = simToThreePos(primary.pos, state.terrain);
    if (targetZones.length > 0) {
      const zone = targetZones[0];
      const surfaceZ = zone.z ?? getSurfaceHeight(state.terrain, zone.x, zone.y);
      const vz = simToThreePos({ x: zone.x, y: zone.y, z: surfaceZ }, state.terrain);
      const points: FramingPoint[] = [
        mechToFramingPoint(primary, state.terrain),
        {
          x: vz.x,
          y: vz.y,
          z: vz.z,
          radiusH: Math.max(20, zone.radius * 0.9),
          radiusUp: 14,
          radiusDown: 4,
        },
      ];
      const desiredYaw = pickStableBroadsideYaw(
        vz.x - vP.x,
        vz.z - vP.z,
        prevCameraYawRad,
        Math.PI * 0.4
      );
      const nextYaw =
        prevCameraYawRad === null ? desiredYaw : lerpAngle(prevCameraYawRad, desiredYaw, 0.08);
      const renderYaw = nextYaw + Math.sin(orbitAngle * 0.6) * 0.12;

      const fitted = fitFramingPointsToCamera({
        points,
        fovDeg,
        aspect,
        camYawRad: renderYaw,
        minDist: 72,
        maxDist: 560,
      });
      clampCamAboveTerrain(fitted.camPos, state.terrain, 14);
      return {
        camPos: fitted.camPos,
        lookAt: fitted.lookAt,
        cameraYawRad: nextYaw,
      };
    }

    const lookAt = new THREE.Vector3(vP.x, vP.y + 6.5, vP.z);
    const camPos = new THREE.Vector3(
      vP.x + Math.sin(orbitAngle) * 76,
      vP.y + 28,
      vP.z + Math.cos(orbitAngle) * 76
    );
    clampCamAboveTerrain(camPos, state.terrain, 14);
    return {
      camPos,
      lookAt,
      cameraYawRad: orbitAngle,
    };
  }

  const fallbackCam = new THREE.Vector3(0, 120, 180);
  clampCamAboveTerrain(fallbackCam, state.terrain, 14);
  return {
    camPos: fallbackCam,
    lookAt: new THREE.Vector3(0, 6, 0),
    cameraYawRad: prevCameraYawRad ?? 0,
  };
}

/**
 * Computes a third-person over-shoulder / behind-the-mech chase camera (`背面`).
 * Slightly tracks waist twist so aimed targets stay visible while preventing terrain/obstacle clipping.
 */
export function computeFollowCameraTarget(params: {
  mech: MechRuntimeState;
  terrain: TerrainConfig;
  prevHeadingRad: number | null;
}): { camPos: THREE.Vector3; lookAt: THREE.Vector3; headingRad: number } {
  const { mech, terrain, prevHeadingRad } = params;
  const targetVec = simToThreePos(mech.pos, terrain);
  const torsoBiasDeg = clamp(mech.torsoYawOffsetDeg, -40, 40) * 0.35;
  const desiredHeadingRad = degToRad(mech.yawDeg + torsoBiasDeg);
  const headingRad =
    prevHeadingRad === null
      ? desiredHeadingRad
      : lerpAngle(prevHeadingRad, desiredHeadingRad, 0.18);

  const fwdX = Math.sin(headingRad);
  const fwdZ = -Math.cos(headingRad);
  const camPos = new THREE.Vector3(
    targetVec.x - fwdX * 54,
    targetVec.y + 26,
    targetVec.z - fwdZ * 54
  );

  // Prevent clipping into walls/ridges behind the mech or along the boom
  const camSimX = camPos.x + terrain.width * 0.5;
  const camSimY = camPos.z + terrain.depth * 0.5;
  const midSimX = (mech.pos.x + camSimX) * 0.5;
  const midSimY = (mech.pos.y + camSimY) * 0.5;
  const surfaceAtCam = getSurfaceHeight(terrain, camSimX, camSimY);
  const surfaceAtMid = getSurfaceHeight(terrain, midSimX, midSimY);
  camPos.y = Math.max(camPos.y, surfaceAtCam + 11, surfaceAtMid + 9);

  const lookAt = new THREE.Vector3(
    targetVec.x + fwdX * 62,
    targetVec.y + 7,
    targetVec.z + fwdZ * 62
  );

  return { camPos, lookAt, headingRad };
}
