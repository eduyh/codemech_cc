import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CURRICULUM_MISSIONS } from '../../data/curriculum';
import { STARTER_MECHS } from '../../data/presets';
import { buildCurriculumMissionScenario } from '../../engine/curriculumVerifier';
import { createSimulation } from '../../engine/mechSim';
import { createTerrain, getSurfaceHeight } from '../../engine/terrain';
import { ArenaPresetId } from '../../types/mech';
import {
  computeDirectorCameraTarget,
  computeFollowCameraTarget,
  pickStableBroadsideYaw,
} from '../cameraFraming';
import { disposeObject3D, simToThreePos, simYawToThreeRotY } from '../coords';
import { EffectsManager3D } from '../effectsPool';
import { buildProceduralMechRig, updateMechRigAnimation } from '../mechMeshBuilder';
import { buildTerrainGroup, getArenaAtmosphere } from '../terrainMeshBuilder';
import { battleAudio } from '../../utils/battleAudio';
import { formatKillBanner, formatKillFeedLine } from '../../utils/combatText';

describe('Three.js procedural 3D builders', () => {
  it('converts simulation coordinates and yaw consistently to Three.js world space', () => {
    const terrain = createTerrain('plains_ridge', 600, 600, 1);
    const center = simToThreePos({ x: 300, y: 300, z: 12 }, terrain);
    expect(center.x).toBe(0);
    expect(center.y).toBe(12);
    expect(center.z).toBe(0);

    // 0 deg (North) => rotY = 0; 90 deg (East) => rotY = -PI/2
    expect(simYawToThreeRotY(0)).toBeCloseTo(0, 6);
    expect(simYawToThreeRotY(90)).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('builds procedural 8-part mech rigs for all starter mechs and reflects damage/altitude', () => {
    const sim = createSimulation({
      seed: 11,
      entries: STARTER_MECHS.map((bp, i) => ({
        id: `m_${i}`,
        name: bp.name,
        teamId: `T${i}`,
        blueprint: bp,
      })),
    });

    for (const mech of sim.mechs) {
      const rig = buildProceduralMechRig(mech, mech.blueprint.color);
      expect(rig.partGroups.head).toBeDefined();
      expect(rig.partGroups.torso).toBeDefined();
      expect(rig.partGroups.rightShoulder).toBeDefined();
      expect(rig.partGroups.leftShoulder).toBeDefined();
      expect(rig.partGroups.rightArm).toBeDefined();
      expect(rig.partGroups.leftArm).toBeDefined();
      expect(rig.partGroups.rightLeg).toBeDefined();
      expect(rig.partGroups.leftLeg).toBeDefined();

      // Grounded intact mech
      updateMechRigAnimation(rig, mech, sim.terrain, true, 10);
      expect(rig.partGroups.rightArm.visible).toBe(true);
      expect(rig.focusRing.visible).toBe(true);
      expect(rig.altitudeLine.visible).toBe(false);

      // Destroyed arm & head hidden, airborne altitude line shown
      mech.parts.rightArm.destroyed = true;
      mech.parts.head.destroyed = true;
      mech.pos.z += 15;
      mech.grounded = false;
      updateMechRigAnimation(rig, mech, sim.terrain, false, 11);

      expect(rig.partGroups.rightArm.visible).toBe(false);
      expect(rig.partGroups.head.visible).toBe(false);
      expect(rig.focusRing.visible).toBe(false);
      expect(rig.altitudeLine.visible).toBe(true);

      disposeObject3D(rig.root);
    }
  });

  it('builds terrain meshes for all arena presets and updates EffectsManager3D cleanly', () => {
    const presets: ArenaPresetId[] = ['plains_ridge', 'twin_mesas', 'urban_pillars', 'valley_basin'];
    for (const preset of presets) {
      const terrain = createTerrain(preset, 600, 600, 1);
      const group = buildTerrainGroup(terrain);
      expect(group.children.length).toBeGreaterThanOrEqual(3);
      expect(group.getObjectByName('sky_dome')).toBeDefined();
      const atmo = getArenaAtmosphere(preset);
      expect(atmo.fogDensity).toBeGreaterThan(0);
      disposeObject3D(group);
    }

    const sim = createSimulation({
      seed: 9,
      entries: [
        { id: 'a', name: 'A', teamId: 'A', blueprint: STARTER_MECHS[0] },
        { id: 'b', name: 'B', teamId: 'B', blueprint: STARTER_MECHS[1] },
      ],
    });

    const effects = new EffectsManager3D();
    effects.syncProjectiles(
      [
        {
          id: 1,
          ownerId: 'a',
          teamId: 'A',
          slot: 'rightArm',
          weaponId: 'rifle_std',
          kind: 'ballistic',
          pos: { x: 250, y: 250, z: 8 },
          vel: { x: 100, y: 0, z: 0 },
          gravity: 4,
          damage: 40,
          canRicochet: true,
          ricochetAngleDeg: 68,
          homingTurnDegPerSec: 0,
          targetId: 'b',
          distanceTraveled: 10,
          optimalRange: 300,
          maxRange: 300,
          ttlTicks: 30,
          hp: 0,
          loftTicksRemaining: 0,
        },
      ],
      sim.terrain
    );
    effects.syncActiveBeams(
      [
        {
          id: 1,
          ownerId: 'a',
          teamId: 'A',
          slot: 'leftArm',
          weaponId: 'medium_laser',
          targetId: 'b',
          originPos: { x: 250, y: 250, z: 7 },
          endPos: { x: 280, y: 260, z: 6.5 },
          damagePerTick: 2,
          optimalRange: 280,
          maxRange: 420,
          ticksRemaining: 10,
          totalTicks: 21,
          spreadYawOffset: 0,
          spreadPitchOffset: 0,
          color: '#4ade80',
        },
      ],
      sim.terrain
    );
    effects.ingestEventsAndStep(
      [
        { tick: 1, type: 'hit', actorId: 'a', targetId: 'b', partId: 'torso', damage: 40, pos: { x: 260, y: 260, z: 7 } },
        { tick: 1, type: 'part_destroyed', actorId: 'a', targetId: 'b', partId: 'rightArm', pos: { x: 260, y: 260, z: 7 } },
      ],
      sim.mechs,
      sim.terrain,
      1
    );
    effects.dispose();
  });

  it('triggers mech recoil kick, hit flash, heat vent glow, and safe headless battleAudio playback', () => {
    const sim = createSimulation({
      seed: 19,
      entries: [
        { id: 'a', name: 'A', teamId: 'A', blueprint: STARTER_MECHS[0] },
        { id: 'b', name: 'B', teamId: 'B', blueprint: STARTER_MECHS[1] },
      ],
    });
    const mech = sim.mechs[0];
    const rig = buildProceduralMechRig(mech, '#38bdf8');

    const coolHex = rig.heatVentMat.color.getHex();
    mech.heat = mech.maxHeat * 0.95;
    mech.lastHitTick = 12;
    const events = [
      { tick: 12, type: 'fire' as const, actorId: mech.id, pos: { ...mech.pos }, detail: 'rightArm' },
      { tick: 12, type: 'mech_destroyed' as const, actorId: mech.id, targetId: 'b', pos: { ...mech.pos } },
    ];

    updateMechRigAnimation(rig, mech, sim.terrain, true, 12, events);
    expect(rig.recoilKick).toBeGreaterThan(0.4);
    expect(rig.hitFlashTicks).toBe(5);
    expect(rig.heatVentMat.color.getHex()).not.toBe(coolHex);
    expect(rig.armorMat.emissive.getHex()).toBeGreaterThan(0);

    expect(() => battleAudio.playSimEvents(events, sim.mechs, 12)).not.toThrow();
    disposeObject3D(rig.root);
  });

  it('formats detailed Japanese kill banners and runs Phase 2 pooled missile smoke & explosion VFX', () => {
    const names = new Map<string, string>([
      ['a', '★ABC-T1'],
      ['b', 'LLB-T1'],
    ]);
    const banner = formatKillBanner(
      {
        tick: 100,
        type: 'mech_destroyed',
        actorId: 'a',
        targetId: 'b',
        partId: 'torso',
        face: 'rear',
        weaponId: 'ac20',
        pos: { x: 0, y: 0, z: 0 },
        detail: 'torso_destroyed',
      },
      names
    );
    expect(banner.headline).toBe('LLB-T1 撃破!!');
    expect(banner.detail).toContain('★ABC-T1');
    expect(banner.detail).toContain('重キャノン砲');
    expect(banner.detail).toContain('背面コア撃破');

    const meltdownLine = formatKillFeedLine(
      {
        tick: 120,
        type: 'mech_destroyed',
        actorId: 'b',
        targetId: 'b',
        pos: { x: 0, y: 0, z: 0 },
        detail: 'heat_meltdown',
      },
      names
    );
    expect(meltdownLine).toBe('LLB-T1 過熱融解 [自爆]');

    const sim = createSimulation({
      seed: 23,
      entries: [
        { id: 'a', name: '★ABC-T1', teamId: 'A', blueprint: STARTER_MECHS[0] },
        { id: 'b', name: 'LLB-T1', teamId: 'B', blueprint: STARTER_MECHS[1] },
      ],
    });
    const effects = new EffectsManager3D();
    for (let tick = 1; tick <= 6; tick++) {
      effects.syncProjectiles(
        [
          {
            id: 7,
            ownerId: 'a',
            teamId: 'A',
            slot: 'leftShoulder',
            weaponId: 'lrm10',
            kind: 'lrm_homing',
            pos: { x: 250 + tick * 4, y: 250, z: 12 },
            vel: { x: 120, y: 0, z: 15 },
            gravity: 1,
            damage: 6,
            canRicochet: false,
            ricochetAngleDeg: 89,
            homingTurnDegPerSec: 105,
            targetId: 'b',
            distanceTraveled: tick * 4,
            optimalRange: 750,
            maxRange: 900,
            ttlTicks: 30,
            hp: 1,
            loftTicksRemaining: 3,
          },
        ],
        sim.terrain,
        tick
      );
      effects.syncActiveBeams(
        [
          {
            id: 2,
            ownerId: 'a',
            teamId: 'A',
            slot: 'rightShoulder',
            weaponId: 'large_laser',
            targetId: 'b',
            originPos: { x: 250, y: 250, z: 7 },
            endPos: { x: 290, y: 255, z: 6.5 },
            damagePerTick: 2,
            optimalRange: 420,
            maxRange: 620,
            ticksRemaining: 10,
            totalTicks: 28,
            spreadYawOffset: 0,
            spreadPitchOffset: 0,
            color: '#38bdf8',
          },
        ],
        sim.terrain,
        tick
      );
      effects.ingestEventsAndStep(
        tick === 2
          ? [{ tick, type: 'mech_destroyed', actorId: 'a', targetId: 'b', weaponId: 'large_laser', pos: { x: 290, y: 255, z: 0 }, detail: 'torso_destroyed' }]
          : [],
        sim.mechs,
        sim.terrain,
        tick
      );
    }
    effects.dispose();
  });

  it('frames director camera without clipping across close, mid, and long ranges', () => {
    const aspects = [4 / 3, 16 / 9];
    const spans = [80, 250, 450];

    for (const aspect of aspects) {
      for (const span of spans) {
        const sim = createSimulation({
          seed: 7,
          entries: [
            {
              id: 'a',
              name: 'A',
              teamId: 'T1',
              blueprint: STARTER_MECHS[0],
              spawnOverride: { x: 300, y: 300 + span * 0.5, yaw: 0 },
            },
            {
              id: 'b',
              name: 'B',
              teamId: 'T2',
              blueprint: STARTER_MECHS[1],
              spawnOverride: { x: 300, y: 300 - span * 0.5, yaw: 180 },
            },
          ],
        });

        const cam = new THREE.PerspectiveCamera(48, aspect, 1, 6500);
        const target = computeDirectorCameraTarget({
          state: sim,
          primary: sim.mechs[0],
          secondary: sim.mechs[1],
          killFocusPos: null,
          prevCameraYawRad: null,
          orbitAngle: 0.4,
          fovDeg: cam.fov,
          aspect,
        });
        cam.position.copy(target.camPos);
        cam.lookAt(target.lookAt);
        cam.updateMatrixWorld();

        for (const mech of sim.mechs) {
          const base = simToThreePos(mech.pos, sim.terrain);
          const headTop = new THREE.Vector3(base.x, base.y + 13 * mech.stats.sizeScale, base.z);
          for (const pt of [base, headTop]) {
            const p = pt.clone().project(cam);
            expect(p.z).toBeGreaterThan(-1);
            expect(p.z).toBeLessThan(1);
            expect(Math.abs(p.x)).toBeLessThanOrEqual(0.85);
            expect(Math.abs(p.y)).toBeLessThanOrEqual(0.85);
          }
        }
      }
    }

    // Crossing stability: avoid 180-degree flips
    const yaw1 = pickStableBroadsideYaw(10, 100, null);
    const yaw2 = pickStableBroadsideYaw(-10, -100, yaw1);
    const diff = Math.abs(Math.atan2(Math.sin(yaw2 - yaw1), Math.cos(yaw2 - yaw1)));
    expect(diff).toBeLessThan(0.5);
  });

  it('frames solo player + capture zone and multi-balloon curriculum stages inside FOV', () => {
    const stage1 = CURRICULUM_MISSIONS.find((m) => m.id === 'p1_1_capture_walk')!;
    const starter1 = stage1.buildBrokenStarter();
    const scenario1 = buildCurriculumMissionScenario(stage1.id, starter1.mech, starter1.pilot);
    const sim1 = createSimulation({
      seed: scenario1.spec.seed,
      rules: scenario1.replay.rules,
      entries: scenario1.entries,
      captureZones: scenario1.captureZones,
    });

    const aspect = 4 / 3;
    const cam1 = new THREE.PerspectiveCamera(48, aspect, 1, 6500);
    const t1 = computeDirectorCameraTarget({
      state: sim1,
      primary: sim1.mechs[0],
      secondary: undefined,
      killFocusPos: null,
      prevCameraYawRad: null,
      orbitAngle: 0.2,
      fovDeg: cam1.fov,
      aspect,
    });
    cam1.position.copy(t1.camPos);
    cam1.lookAt(t1.lookAt);
    cam1.updateMatrixWorld();

    const pProj = simToThreePos(sim1.mechs[0].pos, sim1.terrain).project(cam1);
    const z0 = sim1.captureZones![0];
    const zProj = simToThreePos(
      { x: z0.x, y: z0.y, z: z0.z ?? getSurfaceHeight(sim1.terrain, z0.x, z0.y) },
      sim1.terrain
    ).project(cam1);
    expect(Math.abs(pProj.x)).toBeLessThanOrEqual(0.85);
    expect(Math.abs(zProj.x)).toBeLessThanOrEqual(0.85);

    // 3-balloon stage should keep all 3 balloons inside frame
    const stage3 = CURRICULUM_MISSIONS.find((m) => m.id === 'p1_3_debug_order')!;
    const starter3 = stage3.buildBrokenStarter();
    const scenario3 = buildCurriculumMissionScenario(stage3.id, starter3.mech, starter3.pilot);
    const sim3 = createSimulation({
      seed: scenario3.spec.seed,
      rules: scenario3.replay.rules,
      entries: scenario3.entries,
    });
    const t3 = computeDirectorCameraTarget({
      state: sim3,
      primary: sim3.mechs[0],
      secondary: sim3.mechs[1],
      killFocusPos: null,
      prevCameraYawRad: null,
      orbitAngle: 0.2,
      fovDeg: cam1.fov,
      aspect,
    });
    cam1.position.copy(t3.camPos);
    cam1.lookAt(t3.lookAt);
    cam1.updateMatrixWorld();
    for (const m of sim3.mechs) {
      const proj = simToThreePos(m.pos, sim3.terrain).project(cam1);
      expect(Math.abs(proj.x)).toBeLessThanOrEqual(0.85);
      expect(Math.abs(proj.y)).toBeLessThanOrEqual(0.85);
    }
  });

  it('positions follow (背面) camera behind mech above terrain and sets recommendedCamera on all 24 missions', () => {
    const sim = createSimulation({
      seed: 10202,
      rules: { arenaPreset: 'urban_pillars' },
      entries: [
        {
          id: 'player',
          name: 'P',
          teamId: 'T_PLAYER',
          blueprint: STARTER_MECHS[0],
          spawnOverride: { x: 300, y: 250, yaw: 0 },
        },
      ],
    });
    const mech = sim.mechs[0];
    const follow = computeFollowCameraTarget({
      mech,
      terrain: sim.terrain,
      prevHeadingRad: null,
    });
    const mechPos = simToThreePos(mech.pos, sim.terrain);
    // North-facing mech (yaw=0) faces -Z in Three.js, so behind-camera sits at +Z
    expect(follow.camPos.z).toBeGreaterThan(mechPos.z);
    expect(follow.lookAt.z).toBeLessThan(mechPos.z);
    const camSimX = follow.camPos.x + sim.terrain.width * 0.5;
    const camSimY = follow.camPos.z + sim.terrain.depth * 0.5;
    expect(follow.camPos.y).toBeGreaterThanOrEqual(
      getSurfaceHeight(sim.terrain, camSimX, camSimY) + 10.9
    );

    expect(CURRICULUM_MISSIONS).toHaveLength(24);
    for (const m of CURRICULUM_MISSIONS) {
      expect(['director', 'follow', 'overview', 'orbit']).toContain(m.recommendedCamera);
    }
  });
});
