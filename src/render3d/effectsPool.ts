import * as THREE from 'three';
import {
  ActiveBeamState,
  MechRuntimeState,
  ProjectileState,
  SimCombatEvent,
  TerrainConfig,
} from '../types/mech';
import { simToThreePos } from './coords';

const MAX_PROJECTILES = 160;
const MAX_PARTICLES = 140;
const MAX_LASER_BEAMS = 24;

interface ParticleSlot {
  active: boolean;
  age: number;
  maxAge: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  baseScale: number;
  mesh: THREE.Mesh;
}

interface LaserBeamSlot {
  active: boolean;
  age: number;
  maxAge: number;
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
}

export class EffectsManager3D {
  public readonly group = new THREE.Group();

  private projMeshes: THREE.Mesh[] = [];
  private projLines: THREE.Line[] = [];
  private projGeo: THREE.BufferGeometry;
  private projMaterials: Record<'ballistic' | 'energy' | 'missile', THREE.MeshBasicMaterial>;
  private trailMaterials: Record<'ballistic' | 'energy' | 'missile', THREE.LineBasicMaterial>;

  private laserBeams: LaserBeamSlot[] = [];
  private activeBeamMeshes: THREE.Mesh[] = [];
  private activeBeamGeo: THREE.CylinderGeometry;
  private particles: ParticleSlot[] = [];
  private particleGeo: THREE.BufferGeometry;
  private lastEventTick = -1;

  constructor() {
    this.group.name = 'effects_pool';

    this.projGeo = new THREE.SphereGeometry(0.42, 6, 6);
    this.projMaterials = {
      ballistic: new THREE.MeshBasicMaterial({ color: '#fbbf24' }),
      energy: new THREE.MeshBasicMaterial({ color: '#22d3ee' }),
      missile: new THREE.MeshBasicMaterial({ color: '#f97316' }),
    };
    this.trailMaterials = {
      ballistic: new THREE.LineBasicMaterial({ color: '#fde68a', transparent: true, opacity: 0.6 }),
      energy: new THREE.LineBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 0.75 }),
      missile: new THREE.LineBasicMaterial({ color: '#fb923c', transparent: true, opacity: 0.75 }),
    };

    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const mesh = new THREE.Mesh(this.projGeo, this.projMaterials.ballistic);
      mesh.visible = false;
      this.group.add(mesh);
      this.projMeshes.push(mesh);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]);
      const line = new THREE.Line(lineGeo, this.trailMaterials.ballistic);
      line.visible = false;
      this.group.add(line);
      this.projLines.push(line);
    }

    this.activeBeamGeo = new THREE.CylinderGeometry(0.18, 0.18, 1, 6);
    for (let i = 0; i < MAX_LASER_BEAMS; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.95,
      });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      this.group.add(line);
      this.laserBeams.push({ active: false, age: 0, maxAge: 8, line, mat });

      const beamMat = new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.88,
      });
      const beamMesh = new THREE.Mesh(this.activeBeamGeo, beamMat);
      beamMesh.visible = false;
      this.group.add(beamMesh);
      this.activeBeamMeshes.push(beamMesh);
    }

    this.particleGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#f97316',
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.particles.push({
        active: false,
        age: 0,
        maxAge: 15,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        baseScale: 1,
        mesh,
      });
    }
  }

  public reset(): void {
    this.lastEventTick = -1;
    for (const m of this.projMeshes) m.visible = false;
    for (const l of this.projLines) l.visible = false;
    for (const b of this.laserBeams) {
      b.active = false;
      b.line.visible = false;
    }
    for (const bm of this.activeBeamMeshes) {
      bm.visible = false;
    }
    for (const p of this.particles) {
      p.active = false;
      p.mesh.visible = false;
    }
  }

  public syncActiveBeams(beams: ActiveBeamState[], terrain: TerrainConfig): void {
    const startVec = new THREE.Vector3();
    const endVec = new THREE.Vector3();
    const dirVec = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const count = Math.min(beams.length, MAX_LASER_BEAMS);

    for (let i = 0; i < MAX_LASER_BEAMS; i++) {
      const mesh = this.activeBeamMeshes[i];
      if (i >= count) {
        mesh.visible = false;
        continue;
      }
      const b = beams[i];
      simToThreePos(b.originPos, terrain, startVec);
      simToThreePos(b.endPos, terrain, endVec);
      dirVec.subVectors(endVec, startVec);
      const len = dirVec.length();
      if (len < 0.05) {
        mesh.visible = false;
        continue;
      }
      mesh.position.copy(startVec).addScaledVector(dirVec, 0.5);
      dirVec.divideScalar(len);
      mesh.quaternion.setFromUnitVectors(upAxis, dirVec);
      mesh.scale.set(1, len, 1);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(b.color);
      mat.opacity = 0.85;
      mesh.visible = true;
    }
  }

  public syncProjectiles(projectiles: ProjectileState[], terrain: TerrainConfig): void {
    const tmpPos = new THREE.Vector3();
    const count = Math.min(projectiles.length, MAX_PROJECTILES);

    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const mesh = this.projMeshes[i];
      const line = this.projLines[i];
      if (i >= count) {
        mesh.visible = false;
        line.visible = false;
        continue;
      }

      const p = projectiles[i];
      const styleKey =
        p.kind === 'energy' || p.kind === 'laser'
          ? 'energy'
          : p.kind === 'missile' || p.kind === 'srm_rocket' || p.kind === 'srm_homing' || p.kind === 'lrm_homing'
            ? 'missile'
            : 'ballistic';

      simToThreePos(p.pos, terrain, tmpPos);
      mesh.position.copy(tmpPos);
      mesh.material = this.projMaterials[styleKey];
      mesh.scale.setScalar(styleKey === 'missile' ? 1.45 : p.kind === 'shotgun' ? 0.78 : 1.0);
      mesh.visible = true;

      // Trail pointing backward along projectile velocity
      const vLen = Math.hypot(p.vel.x, p.vel.y, p.vel.z) || 1;
      const trailLen = p.kind === 'energy' ? 12 : p.kind === 'missile' ? 9 : 7;
      const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
      posAttr.setXYZ(0, tmpPos.x, tmpPos.y, tmpPos.z);
      posAttr.setXYZ(
        1,
        tmpPos.x - (p.vel.x / vLen) * trailLen,
        tmpPos.y - (p.vel.z / vLen) * trailLen,
        tmpPos.z - (p.vel.y / vLen) * trailLen
      );
      posAttr.needsUpdate = true;
      line.material = this.trailMaterials[styleKey];
      line.visible = true;
    }
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: string,
    maxAge: number,
    baseScale: number
  ): void {
    const slot = this.particles.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.maxAge = maxAge;
    slot.pos.set(x, y, z);
    slot.vel.set(vx, vy, vz);
    slot.baseScale = baseScale;
    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = 0.9;
    slot.mesh.position.copy(slot.pos);
    slot.mesh.scale.setScalar(baseScale);
    slot.mesh.visible = true;
  }

  public ingestEventsAndStep(
    events: SimCombatEvent[],
    mechs: MechRuntimeState[],
    terrain: TerrainConfig,
    simTick: number
  ): void {
    if (simTick < this.lastEventTick) {
      this.reset();
    }

    if (simTick !== this.lastEventTick) {
      this.lastEventTick = simTick;
      const tmp = new THREE.Vector3();

      for (const ev of events) {
        simToThreePos(ev.pos, terrain, tmp);
        if (ev.type === 'fire' && ev.endPos && ev.detail !== 'laser') {
          const slot = this.laserBeams.find((b) => !b.active);
          if (slot) {
            const endVec = new THREE.Vector3();
            simToThreePos(ev.endPos, terrain, endVec);
            const attr = slot.line.geometry.attributes.position as THREE.BufferAttribute;
            attr.setXYZ(0, tmp.x, tmp.y, tmp.z);
            attr.setXYZ(1, endVec.x, endVec.y, endVec.z);
            attr.needsUpdate = true;
            slot.active = true;
            slot.age = 0;
            slot.maxAge = 7;
            slot.mat.opacity = 0.95;
            slot.line.visible = true;
          }
        } else if (ev.type === 'hit') {
          this.spawnParticle(tmp.x, tmp.y, tmp.z, 0.2, 0.35, 0.2, '#facc15', 10, 1.3);
          this.spawnParticle(tmp.x, tmp.y, tmp.z, -0.25, 0.3, -0.2, '#f97316', 10, 1.1);
        } else if (ev.type === 'ricochet') {
          this.spawnParticle(tmp.x, tmp.y, tmp.z, 0.4, 0.55, -0.3, '#93c5fd', 12, 1.4);
        } else if (ev.type === 'part_destroyed' || ev.type === 'mech_destroyed') {
          const burstCount = ev.type === 'mech_destroyed' ? 6 : 3;
          for (let b = 0; b < burstCount; b++) {
            const ang = (b / burstCount) * Math.PI * 2;
            this.spawnParticle(
              tmp.x,
              tmp.y + 5,
              tmp.z,
              Math.cos(ang) * 0.45,
              0.45 + b * 0.08,
              Math.sin(ang) * 0.45,
              b % 2 === 0 ? '#ef4444' : '#475569',
              22,
              ev.type === 'mech_destroyed' ? 2.4 : 1.7
            );
          }
        }
      }

      // Damaged or destroyed mechs emit dark smoke puffs periodically
      if (simTick % 4 === 0) {
        for (const m of mechs) {
          const hasBrokenPart =
            !m.alive ||
            m.parts.rightArm.destroyed ||
            m.parts.leftArm.destroyed ||
            m.parts.rightShoulder.destroyed ||
            m.parts.leftShoulder.destroyed ||
            m.parts.rightLeg.destroyed ||
            m.parts.leftLeg.destroyed;
          if (!hasBrokenPart) continue;
          simToThreePos(m.pos, terrain, tmp);
          this.spawnParticle(
            tmp.x + ((simTick % 3) - 1) * 0.6,
            tmp.y + (m.alive ? 6.2 : 1.8),
            tmp.z,
            0.05,
            0.28,
            0.05,
            '#334155',
            26,
            1.6
          );
        }
      }

      // Advance active laser beams
      for (const b of this.laserBeams) {
        if (!b.active) continue;
        b.age += 1;
        if (b.age >= b.maxAge) {
          b.active = false;
          b.line.visible = false;
        } else {
          b.mat.opacity = Math.max(0.1, 1 - b.age / b.maxAge);
        }
      }

      // Advance active particles
      for (const p of this.particles) {
        if (!p.active) continue;
        p.age += 1;
        if (p.age >= p.maxAge) {
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
        p.pos.add(p.vel);
        p.mesh.position.copy(p.pos);
        const progress = p.age / p.maxAge;
        p.mesh.scale.setScalar(p.baseScale * (1 + progress * 0.8));
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, (1 - progress) * 0.85);
      }
    }
  }

  public dispose(): void {
    this.projGeo.dispose();
    Object.values(this.projMaterials).forEach((m) => m.dispose());
    Object.values(this.trailMaterials).forEach((m) => m.dispose());
    for (const l of this.projLines) l.geometry.dispose();
    for (const b of this.laserBeams) {
      b.line.geometry.dispose();
      b.mat.dispose();
    }
    this.activeBeamGeo.dispose();
    for (const bm of this.activeBeamMeshes) {
      (bm.material as THREE.Material).dispose();
    }
    this.particleGeo.dispose();
    for (const p of this.particles) {
      (p.mesh.material as THREE.Material).dispose();
    }
  }
}
