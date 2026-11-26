import * as THREE from 'three';
import {
  ActiveBeamState,
  MechRuntimeState,
  ProjectileState,
  SimCombatEvent,
  TerrainConfig,
} from '../types/mech';
import { simToThreePos } from './coords';

const MAX_PROJECTILES = 320;
const MAX_PARTICLES = 200;
const MAX_SMOKE = 140;
const MAX_LASER_BEAMS = 48;
const MAX_FLASHES = 24;
const MAX_FIREBALLS = 18;
const MAX_RINGS = 14;
const MAX_DYNAMIC_LIGHTS = 3;

interface ParticleSlot {
  active: boolean;
  age: number;
  maxAge: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  gravity: number;
  baseScale: number;
  mesh: THREE.Mesh;
}

interface SmokeSlot {
  active: boolean;
  age: number;
  maxAge: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  baseScale: number;
  growthFactor: number;
  maxOpacity: number;
  mesh: THREE.Mesh;
}

interface FlashSlot {
  active: boolean;
  age: number;
  maxAge: number;
  baseScale: number;
  mesh: THREE.Mesh;
}

interface FireballSlot {
  active: boolean;
  age: number;
  maxAge: number;
  maxRadius: number;
  startColor: THREE.Color;
  endColor: THREE.Color;
  mesh: THREE.Mesh;
}

interface ShockwaveRingSlot {
  active: boolean;
  age: number;
  maxAge: number;
  maxRadius: number;
  mesh: THREE.Mesh;
}

interface DynamicLightSlot {
  active: boolean;
  age: number;
  maxAge: number;
  maxIntensity: number;
  light: THREE.PointLight;
}

interface LaserBeamSlot {
  active: boolean;
  age: number;
  maxAge: number;
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
}

interface ActiveBeamVisualSlot {
  core: THREE.Mesh;
  glow: THREE.Mesh;
}

export class EffectsManager3D {
  public readonly group = new THREE.Group();

  private projMeshes: THREE.Mesh[] = [];
  private projLines: THREE.Line[] = [];
  private projGeo: THREE.BufferGeometry;
  private projMaterials: Record<'ballistic' | 'energy' | 'missile', THREE.MeshBasicMaterial>;
  private trailMaterials: Record<'ballistic' | 'energy' | 'missile', THREE.LineBasicMaterial>;

  private laserBeams: LaserBeamSlot[] = [];
  private activeBeamSlots: ActiveBeamVisualSlot[] = [];
  private activeBeamCoreGeo: THREE.CylinderGeometry;
  private activeBeamGlowGeo: THREE.CylinderGeometry;

  private particles: ParticleSlot[] = [];
  private particleGeo: THREE.BufferGeometry;

  private smokePuffs: SmokeSlot[] = [];
  private smokeGeo: THREE.BufferGeometry;

  private flashes: FlashSlot[] = [];
  private flashGeo: THREE.SphereGeometry;

  private fireballs: FireballSlot[] = [];
  private fireballGeo: THREE.SphereGeometry;

  private rings: ShockwaveRingSlot[] = [];
  private ringGeo: THREE.RingGeometry;

  private dynLights: DynamicLightSlot[] = [];

  private lastEventTick = -1;
  private lastSmokeTick = -1;
  private lastBeamSparkTick = -1;

  constructor() {
    this.group.name = 'effects_pool';

    this.projGeo = new THREE.SphereGeometry(0.55, 6, 6);
    this.projMaterials = {
      ballistic: new THREE.MeshBasicMaterial({ color: '#fde047' }),
      energy: new THREE.MeshBasicMaterial({ color: '#22d3ee' }),
      missile: new THREE.MeshBasicMaterial({ color: '#fb923c' }),
    };
    this.trailMaterials = {
      ballistic: new THREE.LineBasicMaterial({ color: '#fef08a', transparent: true, opacity: 0.72 }),
      energy: new THREE.LineBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 0.85 }),
      missile: new THREE.LineBasicMaterial({ color: '#fdba74', transparent: true, opacity: 0.82 }),
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

    // Dual-core additive beams (white incandescent inner core + colored outer bloom halo)
    this.activeBeamCoreGeo = new THREE.CylinderGeometry(0.14, 0.14, 1, 6);
    this.activeBeamGlowGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 6);
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

      const coreMat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const core = new THREE.Mesh(this.activeBeamCoreGeo, coreMat);
      core.visible = false;
      this.group.add(core);

      const glowMat = new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.46,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(this.activeBeamGlowGeo, glowMat);
      glow.visible = false;
      this.group.add(glow);

      this.activeBeamSlots.push({ core, glow });
    }

    this.particleGeo = new THREE.BoxGeometry(0.65, 0.65, 0.65);
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
        gravity: 0,
        baseScale: 1,
        mesh,
      });
    }

    // Smoke puffs for curved missile trails & burning wrecks
    this.smokeGeo = new THREE.SphereGeometry(0.65, 6, 5);
    for (let i = 0; i < MAX_SMOKE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#cbd5e1',
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.smokeGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.smokePuffs.push({
        active: false,
        age: 0,
        maxAge: 24,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        baseScale: 1,
        growthFactor: 1.5,
        maxOpacity: 0.36,
        mesh,
      });
    }

    // Muzzle / impact flashes
    this.flashGeo = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < MAX_FLASHES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#fef08a',
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.flashGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.flashes.push({ active: false, age: 0, maxAge: 4, baseScale: 1.8, mesh });
    }

    // Multi-stage explosion fireballs
    this.fireballGeo = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < MAX_FIREBALLS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#fb923c',
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.fireballGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.fireballs.push({
        active: false,
        age: 0,
        maxAge: 18,
        maxRadius: 8,
        startColor: new THREE.Color('#fffbeb'),
        endColor: new THREE.Color('#dc2626'),
        mesh,
      });
    }

    // Expanding horizontal shockwave rings
    this.ringGeo = new THREE.RingGeometry(0.66, 1.0, 24);
    this.ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#fb923c',
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ active: false, age: 0, maxAge: 18, maxRadius: 24, mesh });
    }

    // 3 reusable dynamic PointLights (explosions / heavy cannons)
    for (let i = 0; i < MAX_DYNAMIC_LIGHTS; i++) {
      const light = new THREE.PointLight('#ffaa44', 0, 120, 1.5);
      this.group.add(light);
      this.dynLights.push({ active: false, age: 0, maxAge: 12, maxIntensity: 10, light });
    }
  }

  public reset(): void {
    this.lastEventTick = -1;
    this.lastSmokeTick = -1;
    this.lastBeamSparkTick = -1;
    for (const m of this.projMeshes) m.visible = false;
    for (const l of this.projLines) l.visible = false;
    for (const b of this.laserBeams) {
      b.active = false;
      b.line.visible = false;
    }
    for (const slot of this.activeBeamSlots) {
      slot.core.visible = false;
      slot.glow.visible = false;
    }
    for (const p of this.particles) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const s of this.smokePuffs) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const f of this.flashes) {
      f.active = false;
      f.mesh.visible = false;
    }
    for (const fb of this.fireballs) {
      fb.active = false;
      fb.mesh.visible = false;
    }
    for (const r of this.rings) {
      r.active = false;
      r.mesh.visible = false;
    }
    for (const dl of this.dynLights) {
      dl.active = false;
      dl.light.intensity = 0;
    }
  }

  public syncActiveBeams(
    beams: ActiveBeamState[],
    terrain: TerrainConfig,
    simTick?: number
  ): void {
    const startVec = new THREE.Vector3();
    const endVec = new THREE.Vector3();
    const dirVec = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const count = Math.min(beams.length, MAX_LASER_BEAMS);
    const shouldSpark =
      typeof simTick === 'number' &&
      simTick !== this.lastBeamSparkTick &&
      simTick % 2 === 0;
    if (typeof simTick === 'number') {
      if (simTick < this.lastBeamSparkTick) this.lastBeamSparkTick = -1;
      this.lastBeamSparkTick = simTick;
    }

    for (let i = 0; i < MAX_LASER_BEAMS; i++) {
      const slot = this.activeBeamSlots[i];
      if (i >= count) {
        slot.core.visible = false;
        slot.glow.visible = false;
        continue;
      }
      const b = beams[i];
      simToThreePos(b.originPos, terrain, startVec);
      simToThreePos(b.endPos, terrain, endVec);
      dirVec.subVectors(endVec, startVec);
      const len = dirVec.length();
      if (len < 0.05) {
        slot.core.visible = false;
        slot.glow.visible = false;
        continue;
      }
      const midX = startVec.x + dirVec.x * 0.5;
      const midY = startVec.y + dirVec.y * 0.5;
      const midZ = startVec.z + dirVec.z * 0.5;
      dirVec.divideScalar(len);

      const pulse = typeof simTick === 'number' ? 0.92 + Math.sin(simTick * 1.4 + i) * 0.2 : 1;

      slot.core.position.set(midX, midY, midZ);
      slot.core.quaternion.setFromUnitVectors(upAxis, dirVec);
      slot.core.scale.set(pulse, len, pulse);
      slot.core.visible = true;

      slot.glow.position.set(midX, midY, midZ);
      slot.glow.quaternion.setFromUnitVectors(upAxis, dirVec);
      slot.glow.scale.set(1.15 * pulse, len, 1.15 * pulse);
      const glowMat = slot.glow.material as THREE.MeshBasicMaterial;
      glowMat.color.set(b.color);
      glowMat.opacity = 0.44;
      slot.glow.visible = true;

      if (shouldSpark) {
        this.spawnParticle(
          endVec.x,
          endVec.y,
          endVec.z,
          (Math.random() - 0.5) * 0.45,
          0.25 + Math.random() * 0.25,
          (Math.random() - 0.5) * 0.45,
          b.color,
          6,
          0.9,
          -0.025
        );
      }
    }
  }

  public syncProjectiles(
    projectiles: ProjectileState[],
    terrain: TerrainConfig,
    simTick?: number
  ): void {
    const tmpPos = new THREE.Vector3();
    const count = Math.min(projectiles.length, MAX_PROJECTILES);
    const shouldEmitSmoke =
      typeof simTick === 'number' &&
      simTick !== this.lastSmokeTick &&
      simTick % 2 === 0;
    if (typeof simTick === 'number') {
      if (simTick < this.lastSmokeTick) this.lastSmokeTick = -1;
      this.lastSmokeTick = simTick;
    }

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
          : p.kind === 'missile' ||
              p.kind === 'srm_rocket' ||
              p.kind === 'srm_homing' ||
              p.kind === 'lrm_homing'
            ? 'missile'
            : 'ballistic';

      simToThreePos(p.pos, terrain, tmpPos);
      mesh.position.copy(tmpPos);
      mesh.material = this.projMaterials[styleKey];
      mesh.scale.setScalar(
        styleKey === 'missile' ? 1.5 : p.kind === 'shotgun' ? 0.72 : p.kind === 'energy' ? 1.65 : 1.05
      );
      mesh.visible = true;

      const vLen = Math.hypot(p.vel.x, p.vel.y, p.vel.z) || 1;
      const trailLen = p.kind === 'energy' ? 16 : styleKey === 'missile' ? 13 : 10;
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

      if (shouldEmitSmoke && styleKey === 'missile') {
        const tailOffset = 1.4;
        this.spawnSmoke(
          tmpPos.x - (p.vel.x / vLen) * tailOffset,
          tmpPos.y - (p.vel.z / vLen) * tailOffset,
          tmpPos.z - (p.vel.y / vLen) * tailOffset,
          (Math.random() - 0.5) * 0.04,
          0.06,
          (Math.random() - 0.5) * 0.04,
          '#cbd5e1',
          13,
          0.28,
          0.8,
          0.22
        );
      }
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
    baseScale: number,
    gravity = 0
  ): void {
    const slot = this.particles.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.maxAge = maxAge;
    slot.pos.set(x, y, z);
    slot.vel.set(vx, vy, vz);
    slot.gravity = gravity;
    slot.baseScale = baseScale;
    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = 0.92;
    slot.mesh.position.copy(slot.pos);
    slot.mesh.scale.setScalar(baseScale);
    slot.mesh.visible = true;
  }

  private spawnSmoke(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: string,
    maxAge: number,
    baseScale: number,
    growthFactor = 1.5,
    maxOpacity = 0.36
  ): void {
    const slot = this.smokePuffs.find((s) => !s.active);
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.maxAge = maxAge;
    slot.pos.set(x, y, z);
    slot.vel.set(vx, vy, vz);
    slot.baseScale = baseScale;
    slot.growthFactor = growthFactor;
    slot.maxOpacity = maxOpacity;
    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = maxOpacity;
    slot.mesh.position.copy(slot.pos);
    slot.mesh.scale.setScalar(baseScale);
    slot.mesh.visible = true;
  }

  private spawnFlash(x: number, y: number, z: number, color: string, baseScale: number, maxAge = 4): void {
    const slot = this.flashes.find((f) => !f.active);
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.maxAge = maxAge;
    slot.baseScale = baseScale;
    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = 0.95;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(baseScale);
    slot.mesh.visible = true;
  }

  private spawnFireball(
    x: number,
    y: number,
    z: number,
    maxRadius: number,
    maxAge: number,
    startHex = '#fffbeb',
    endHex = '#dc2626'
  ): void {
    const slot = this.fireballs.find((fb) => !fb.active);
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.maxAge = maxAge;
    slot.maxRadius = maxRadius;
    slot.startColor.set(startHex);
    slot.endColor.set(endHex);
    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.copy(slot.startColor);
    mat.opacity = 0.92;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(maxRadius * 0.2);
    slot.mesh.visible = true;
  }

  private spawnRing(x: number, y: number, z: number, color: string, maxRadius: number, maxAge: number): void {
    const slot = this.rings.find((r) => !r.active);
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.maxAge = maxAge;
    slot.maxRadius = maxRadius;
    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = 0.85;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(1);
    slot.mesh.visible = true;
  }

  private triggerLight(x: number, y: number, z: number, color: string, intensity: number, maxAge: number): void {
    let target = this.dynLights.find((l) => !l.active);
    if (!target) {
      target = this.dynLights.reduce((prev, curr) => (curr.age > prev.age ? curr : prev), this.dynLights[0]);
    }
    target.active = true;
    target.age = 0;
    target.maxAge = maxAge;
    target.maxIntensity = intensity;
    target.light.color.set(color);
    target.light.intensity = intensity;
    target.light.position.set(x, y, z);
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
        if (ev.type === 'fire') {
          const isLaser = ev.detail === 'laser';
          this.spawnFlash(
            tmp.x,
            tmp.y,
            tmp.z,
            isLaser ? '#67e8f9' : '#fef08a',
            isLaser ? 1.35 : 2.1,
            4
          );
          if (!isLaser) {
            this.triggerLight(tmp.x, tmp.y, tmp.z, '#fde047', 4.5, 5);
          }
          if (ev.endPos && !isLaser) {
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
              slot.mat.color.set('#22d3ee');
              slot.mat.opacity = 0.95;
              slot.line.visible = true;
            }
          }
        } else if (ev.type === 'missile_intercepted' && ev.endPos) {
          const endVec = new THREE.Vector3();
          simToThreePos(ev.endPos, terrain, endVec);
          const slot = this.laserBeams.find((b) => !b.active);
          if (slot) {
            const attr = slot.line.geometry.attributes.position as THREE.BufferAttribute;
            attr.setXYZ(0, tmp.x, tmp.y, tmp.z);
            attr.setXYZ(1, endVec.x, endVec.y, endVec.z);
            attr.needsUpdate = true;
            slot.active = true;
            slot.age = 0;
            slot.maxAge = 5;
            slot.mat.color.set(ev.detail === 'ams_laser' ? '#4ade80' : '#fde047');
            slot.mat.opacity = 0.9;
            slot.line.visible = true;
          }
          this.spawnFlash(
            endVec.x,
            endVec.y,
            endVec.z,
            ev.detail === 'ams_laser' ? '#4ade80' : '#fb923c',
            1.4,
            4
          );
        } else if (ev.type === 'hit') {
          this.spawnParticle(tmp.x, tmp.y, tmp.z, 0.25, 0.42, 0.25, '#facc15', 11, 1.25, -0.03);
          this.spawnParticle(tmp.x, tmp.y, tmp.z, -0.28, 0.35, -0.22, '#f97316', 11, 1.05, -0.03);
          if ((ev.damage ?? 0) >= 35) {
            this.spawnFlash(tmp.x, tmp.y, tmp.z, '#fb923c', 2.6, 5);
            this.triggerLight(tmp.x, tmp.y, tmp.z, '#fb923c', 7, 6);
          }
        } else if (ev.type === 'ricochet') {
          this.spawnParticle(tmp.x, tmp.y, tmp.z, 0.48, 0.65, -0.35, '#93c5fd', 12, 1.3, -0.03);
          this.spawnFlash(tmp.x, tmp.y, tmp.z, '#bae6fd', 1.4, 3);
        } else if (ev.type === 'part_destroyed') {
          this.spawnFireball(tmp.x, tmp.y + 5.2, tmp.z, 4.8, 15, '#fef08a', '#ea580c');
          this.spawnRing(tmp.x, tmp.y + 0.6, tmp.z, '#fb923c', 13, 14);
          this.triggerLight(tmp.x, tmp.y + 6, tmp.z, '#fb923c', 10, 12);
          for (let b = 0; b < 5; b++) {
            const ang = (b / 5) * Math.PI * 2;
            this.spawnParticle(
              tmp.x,
              tmp.y + 5.2,
              tmp.z,
              Math.cos(ang) * 0.55,
              0.42 + (b % 3) * 0.14,
              Math.sin(ang) * 0.55,
              b % 2 === 0 ? '#f97316' : '#475569',
              22,
              1.4,
              -0.028
            );
          }
        } else if (ev.type === 'mech_destroyed') {
          this.spawnFireball(tmp.x, tmp.y + 5.5, tmp.z, 11.5, 22, '#ffffff', '#dc2626');
          this.spawnFireball(tmp.x + 2.4, tmp.y + 7.5, tmp.z - 1.8, 7.2, 18, '#fef08a', '#ea580c');
          this.spawnFireball(tmp.x - 2.2, tmp.y + 3.8, tmp.z + 2.0, 6.8, 20, '#fed7aa', '#b91c1c');
          this.spawnRing(tmp.x, tmp.y + 0.8, tmp.z, '#fde047', 34, 22);
          this.spawnRing(tmp.x, tmp.y + 1.0, tmp.z, '#ef4444', 24, 18);
          this.triggerLight(tmp.x, tmp.y + 8, tmp.z, '#ff8833', 18, 24);
          for (let b = 0; b < 10; b++) {
            const ang = (b / 10) * Math.PI * 2;
            const spd = 0.45 + (b % 3) * 0.25;
            this.spawnParticle(
              tmp.x,
              tmp.y + 5,
              tmp.z,
              Math.cos(ang) * spd,
              0.55 + (b % 4) * 0.16,
              Math.sin(ang) * spd,
              b % 3 === 0 ? '#ef4444' : b % 3 === 1 ? '#facc15' : '#334155',
              28,
              b % 2 === 0 ? 2.1 : 1.5,
              -0.032
            );
          }
          for (let s = 0; s < 4; s++) {
            const ang = (s / 4) * Math.PI * 2;
            this.spawnSmoke(
              tmp.x + Math.cos(ang) * 2.2,
              tmp.y + 4,
              tmp.z + Math.sin(ang) * 2.2,
              Math.cos(ang) * 0.14,
              0.26,
              Math.sin(ang) * 0.14,
              '#475569',
              34,
              2.6
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
          this.spawnSmoke(
            tmp.x + ((simTick % 3) - 1) * 0.6,
            tmp.y + (m.alive ? 6.2 : 2.0),
            tmp.z,
            0.05,
            0.22,
            0.05,
            '#334155',
            26,
            m.alive ? 1.3 : 1.9
          );
        }
      }

      // Advance active laser flash lines
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

      // Advance debris & spark particles
      for (const p of this.particles) {
        if (!p.active) continue;
        p.age += 1;
        if (p.age >= p.maxAge) {
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
        p.vel.y += p.gravity;
        p.pos.add(p.vel);
        p.mesh.position.copy(p.pos);
        const progress = p.age / p.maxAge;
        p.mesh.scale.setScalar(p.baseScale * (1 - progress * 0.35));
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, (1 - progress) * 0.9);
      }

      // Advance curved smoke trails & plumes
      for (const s of this.smokePuffs) {
        if (!s.active) continue;
        s.age += 1;
        if (s.age >= s.maxAge) {
          s.active = false;
          s.mesh.visible = false;
          continue;
        }
        s.pos.add(s.vel);
        s.mesh.position.copy(s.pos);
        const progress = s.age / s.maxAge;
        s.mesh.scale.setScalar(s.baseScale * (1 + progress * s.growthFactor));
        const mat = s.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, (1 - progress) * s.maxOpacity);
      }

      // Advance muzzle/hit flashes
      for (const f of this.flashes) {
        if (!f.active) continue;
        f.age += 1;
        if (f.age >= f.maxAge) {
          f.active = false;
          f.mesh.visible = false;
          continue;
        }
        const progress = f.age / f.maxAge;
        f.mesh.scale.setScalar(f.baseScale * (1 + progress * 0.55));
        const mat = f.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, (1 - progress) * 0.95);
      }

      // Advance explosion fireballs
      for (const fb of this.fireballs) {
        if (!fb.active) continue;
        fb.age += 1;
        if (fb.age >= fb.maxAge) {
          fb.active = false;
          fb.mesh.visible = false;
          continue;
        }
        const progress = fb.age / fb.maxAge;
        const radius = fb.maxRadius * (0.25 + Math.pow(progress, 0.45) * 0.75);
        fb.mesh.scale.setScalar(radius);
        const mat = fb.mesh.material as THREE.MeshBasicMaterial;
        mat.color.copy(fb.startColor).lerp(fb.endColor, Math.min(1, progress * 1.25));
        mat.opacity = Math.max(0, (1 - progress) * 0.9);
      }

      // Advance shockwave rings
      for (const r of this.rings) {
        if (!r.active) continue;
        r.age += 1;
        if (r.age >= r.maxAge) {
          r.active = false;
          r.mesh.visible = false;
          continue;
        }
        const progress = r.age / r.maxAge;
        r.mesh.scale.setScalar(Math.max(0.5, r.maxRadius * Math.pow(progress, 0.55)));
        const mat = r.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, (1 - progress) * 0.85);
      }

      // Advance dynamic point lights
      for (const dl of this.dynLights) {
        if (!dl.active) continue;
        dl.age += 1;
        if (dl.age >= dl.maxAge) {
          dl.active = false;
          dl.light.intensity = 0;
          continue;
        }
        const progress = dl.age / dl.maxAge;
        dl.light.intensity = dl.maxIntensity * (1 - progress);
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
    this.activeBeamCoreGeo.dispose();
    this.activeBeamGlowGeo.dispose();
    for (const slot of this.activeBeamSlots) {
      (slot.core.material as THREE.Material).dispose();
      (slot.glow.material as THREE.Material).dispose();
    }
    this.particleGeo.dispose();
    for (const p of this.particles) {
      (p.mesh.material as THREE.Material).dispose();
    }
    this.smokeGeo.dispose();
    for (const s of this.smokePuffs) {
      (s.mesh.material as THREE.Material).dispose();
    }
    this.flashGeo.dispose();
    for (const f of this.flashes) {
      (f.mesh.material as THREE.Material).dispose();
    }
    this.fireballGeo.dispose();
    for (const fb of this.fireballs) {
      (fb.mesh.material as THREE.Material).dispose();
    }
    this.ringGeo.dispose();
    for (const r of this.rings) {
      (r.mesh.material as THREE.Material).dispose();
    }
    for (const dl of this.dynLights) {
      dl.light.dispose();
    }
  }
}
