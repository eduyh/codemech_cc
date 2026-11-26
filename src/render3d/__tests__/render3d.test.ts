import { describe, expect, it } from 'vitest';
import { STARTER_MECHS } from '../../data/presets';
import { createSimulation } from '../../engine/mechSim';
import { createTerrain } from '../../engine/terrain';
import { ArenaPresetId } from '../../types/mech';
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
});
