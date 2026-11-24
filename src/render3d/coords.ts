import * as THREE from 'three';
import { degToRad } from '../engine/math';
import { TerrainConfig, Vec3 } from '../types/mech';

export const TEAM_COLORS_3D: readonly string[] = [
  '#06b6d4',
  '#f59e0b',
  '#22c55e',
  '#a855f7',
  '#f43f5e',
  '#3b82f6',
  '#14b8a6',
  '#eab308',
  '#ec4899',
  '#6366f1',
  '#84cc16',
  '#fb923c',
];

export function getTeamColorHex(teamOrder: readonly string[], teamId: string): string {
  const idx = Math.max(0, teamOrder.indexOf(teamId));
  return TEAM_COLORS_3D[idx % TEAM_COLORS_3D.length];
}

export function simToThreePos(
  pos: Vec3,
  terrain: Pick<TerrainConfig, 'width' | 'depth'>,
  out = new THREE.Vector3()
): THREE.Vector3 {
  return out.set(
    pos.x - terrain.width * 0.5,
    pos.z,
    pos.y - terrain.depth * 0.5
  );
}

export function simYawToThreeRotY(yawDeg: number): number {
  return -degToRad(yawDeg);
}

export function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
      geometries.add(mesh.geometry);
    }
    const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      if (m) {
        const spriteMat = m as THREE.SpriteMaterial;
        if (spriteMat.map) spriteMat.map.dispose();
        materials.add(m);
      }
    }
  });

  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
