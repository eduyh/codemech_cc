import { describe, expect, it } from 'vitest';
import {
  ARM_WEAPONS,
  computeMechStats,
  computeRangeFalloffMultiplier,
  getWeaponSlotMaxAmmo,
} from '../../data/parts';
import {
  PRESET_BERSERKER,
  PRESET_FORTRESS,
  PRESET_SNIPER,
  PRESET_STRIKER,
  PRESET_VANGUARD,
  STARTER_MECHS,
} from '../../data/presets';
import { MAX_CHASSIS_TONNAGE, MatchParticipantEntry, MechControlInput } from '../../types/mech';
import { validateAndRepairMechBlueprint } from '../../utils/shareMech';
import { applyDamageToMechParts, getMechMobilityMultipliers, testProjectileHitMech } from '../hitbox';
import { vectorToAngle2D } from '../math';
import {
  buildMechSensorState,
  createSimulation,
  DEFAULT_MATCH_RULES,
  EMPTY_CONTROL_INPUT,
  getMechTorsoWorldYaw,
  stepSimulation,
} from '../mechSim';

function createTeamEntries(teamCount: number, perTeam: number): MatchParticipantEntry[] {
  const list: MatchParticipantEntry[] = [];
  for (let t = 0; t < teamCount; t++) {
    for (let m = 0; m < perTeam; m++) {
      const bp = STARTER_MECHS[(t * perTeam + m) % STARTER_MECHS.length];
      list.push({
        id: `mech_${t}_${m}`,
        name: `Unit-${t}-${m}`,
        teamId: `team_${t}`,
        blueprint: bp,
      });
    }
  }
  return list;
}

function buildSimpleBotControls(state: ReturnType<typeof createSimulation>): Record<string, MechControlInput> {
  const controls: Record<string, MechControlInput> = {};
  for (const mech of state.mechs) {
    if (!mech.alive) continue;
    const sensor = buildMechSensorState(state, mech.id);
    const enemy = sensor.nearestEnemy;
    if (enemy) {
      controls[mech.id] = {
        ...EMPTY_CONTROL_INPUT,
        targetYaw: enemy.bearingDeg,
        moveForward: enemy.distance > 170 ? 1 : enemy.distance < 90 ? -0.6 : 0.2,
        moveStrafe: (mech.slotIndex % 2 === 0 ? 1 : -1) * 0.7,
        boost: state.tick % 45 < 15 && !mech.enOverheated,
        fireRightArm: enemy.distance <= 350,
        fireLeftArm: enemy.distance <= 240,
        fireRightShoulder: enemy.distance <= 400 && state.tick % 10 === 0,
        lockTargetId: enemy.id,
      };
    } else {
      const toCenterYaw = vectorToAngle2D(
        state.terrain.width * 0.5 - mech.pos.x,
        state.terrain.depth * 0.5 - mech.pos.y
      );
      controls[mech.id] = {
        ...EMPTY_CONTROL_INPUT,
        targetYaw: toCenterYaw,
        moveForward: 0.9,
        jump: state.tick % 60 === 0,
      };
    }
  }
  return controls;
}

describe('deterministic 30 TPS mech simulator', () => {
  it('validates all starter presets within weight and armor caps', () => {
    for (const bp of STARTER_MECHS) {
      const stats = computeMechStats(bp);
      expect(stats.valid).toBe(true);
      expect(stats.validationErrors).toEqual([]);
    }
  });

  it('guarantees bit-identical determinism for 12 mechs with the same seed', () => {
    const entries = createTeamEntries(4, 3);
    const simA = createSimulation({ seed: 202611, entries });
    const simB = createSimulation({ seed: 202611, entries });
    const simC = createSimulation({ seed: 202612, entries });

    for (let t = 0; t < 180; t++) {
      stepSimulation(simA, buildSimpleBotControls(simA));
      stepSimulation(simB, buildSimpleBotControls(simB));
      stepSimulation(simC, buildSimpleBotControls(simC));
    }

    expect(simA.mechs.map((m) => ({ pos: m.pos, en: m.en, parts: m.parts }))).toEqual(
      simB.mechs.map((m) => ({ pos: m.pos, en: m.en, parts: m.parts }))
    );

    const posA = simA.mechs.map((m) => m.pos);
    const posC = simC.mechs.map((m) => m.pos);
    expect(posA).not.toEqual(posC);
  });

  it('blocks low shots across the central ridge while elevated shots clear it', () => {
    const sim = createSimulation({
      seed: 7,
      rules: { arenaPreset: 'plains_ridge' },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: STARTER_MECHS[3] },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: STARTER_MECHS[0] },
      ],
    });

    const shooter = sim.mechs[0];
    const target = sim.mechs[1];
    shooter.pos = { x: 300, y: 260, z: 7.2 };
    shooter.yawDeg = 180; // South (+Y)
    target.pos = { x: 300, y: 340, z: 7.2 };
    target.yawDeg = 0;

    // Ground shot should hit the central ridge (~16m high at y=300)
    const lowShotHitEvents: string[] = [];
    stepSimulation(sim, {
      shooter: { ...EMPTY_CONTROL_INPUT, fireRightArm: true },
      target: EMPTY_CONTROL_INPUT,
    });
    for (let i = 0; i < 30; i++) {
      stepSimulation(sim, { shooter: EMPTY_CONTROL_INPUT, target: EMPTY_CONTROL_INPUT });
      for (const ev of sim.lastTickEvents) {
        lowShotHitEvents.push(ev.type);
      }
    }
    expect(lowShotHitEvents).toContain('terrain_hit');
    expect(lowShotHitEvents).not.toContain('hit');

    // Elevated shot from z=22 clears the ridge and hits target
    const simHigh = createSimulation({
      seed: 7,
      rules: { arenaPreset: 'plains_ridge' },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: STARTER_MECHS[3] },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: STARTER_MECHS[0] },
      ],
    });
    simHigh.mechs[0].pos = { x: 300, y: 260, z: 22 };
    simHigh.mechs[0].yawDeg = 180;
    simHigh.mechs[1].pos = { x: 300, y: 340, z: 22 };
    simHigh.mechs[1].yawDeg = 0;

    const highEvents: string[] = [];
    stepSimulation(simHigh, {
      shooter: { ...EMPTY_CONTROL_INPUT, fireRightArm: true, lockTargetId: 'target' },
      target: EMPTY_CONTROL_INPUT,
    });
    for (let i = 0; i < 30; i++) {
      stepSimulation(simHigh, { shooter: EMPTY_CONTROL_INPUT, target: EMPTY_CONTROL_INPUT });
      for (const ev of simHigh.lastTickEvents) {
        highEvents.push(ev.type);
      }
    }
    expect(highEvents).toContain('hit');
  });

  it('enforces part destruction penalties (arm weapon disabled, legs immobile, rear torso kill)', () => {
    const sim = createSimulation({
      seed: 55,
      entries: [
        { id: 'a', name: 'A', teamId: 'A', blueprint: STARTER_MECHS[0] },
        { id: 'b', name: 'B', teamId: 'B', blueprint: STARTER_MECHS[0] },
      ],
    });
    const mech = sim.mechs[0];
    mech.pos = { x: 200, y: 200, z: 0 };
    mech.yawDeg = 0;

    // Destroy right arm -> rightArm firing must produce no projectiles
    const rArmHit = testProjectileHitMech(
      { x: 202.0, y: 190, z: 5.8 },
      { x: 202.0, y: 210, z: 5.8 },
      mech.pos,
      mech.yawDeg
    )!;
    applyDamageToMechParts(mech, rArmHit, 999, DEFAULT_MATCH_RULES);
    expect(mech.parts.rightArm.destroyed).toBe(true);

    stepSimulation(sim, {
      a: { ...EMPTY_CONTROL_INPUT, fireRightArm: true },
      b: EMPTY_CONTROL_INPUT,
    });
    expect(sim.projectiles.length).toBe(0);

    // Destroy both legs -> mech cannot walk or jump
    const rLegHit = testProjectileHitMech(
      { x: 200.8, y: 190, z: 2.3 },
      { x: 200.8, y: 210, z: 2.3 },
      mech.pos,
      mech.yawDeg
    )!;
    const lLegHit = testProjectileHitMech(
      { x: 199.2, y: 190, z: 2.3 },
      { x: 199.2, y: 210, z: 2.3 },
      mech.pos,
      mech.yawDeg
    )!;
    applyDamageToMechParts(mech, rLegHit, 999, DEFAULT_MATCH_RULES);
    applyDamageToMechParts(mech, lLegHit, 999, DEFAULT_MATCH_RULES);

    const posBefore = { ...mech.pos };
    for (let i = 0; i < 15; i++) {
      stepSimulation(sim, {
        a: { ...EMPTY_CONTROL_INPUT, moveForward: 1, boost: true, jump: true },
        b: EMPTY_CONTROL_INPUT,
      });
    }
    expect(mech.pos.x).toBeCloseTo(posBefore.x, 4);
    expect(mech.pos.y).toBeCloseTo(posBefore.y, 4);
    expect(mech.pos.z).toBeCloseTo(posBefore.z, 4);

    // Rear torso kill even while front armor is intact
    const frontBefore = mech.parts.torso.frontArmor;
    const rearHit = testProjectileHitMech(
      { x: mech.pos.x, y: mech.pos.y + 12, z: 6.5 },
      { x: mech.pos.x, y: mech.pos.y - 10, z: 6.5 },
      mech.pos,
      mech.yawDeg
    )!;
    applyDamageToMechParts(mech, rearHit, 2000, DEFAULT_MATCH_RULES);
    expect(mech.parts.torso.frontArmor).toBe(frontBefore);
    expect(mech.alive).toBe(false);
    expect(mech.destroyedReason).toBe('torso_destroyed');
  });

  it('triggers EN overheat on depletion and recovers at 30% capacity', () => {
    const sim = createSimulation({
      seed: 12,
      entries: [
        { id: 'runner', name: 'Runner', teamId: 'A', blueprint: STARTER_MECHS[4] }, // Large/Small laser high heat
        { id: 'dummy', name: 'Dummy', teamId: 'B', blueprint: STARTER_MECHS[0] },
      ],
    });
    const runner = sim.mechs[0];
    runner.pos = { x: 300, y: 300, z: 0 };
    sim.mechs[1].pos = { x: 300, y: 200, z: 0 };
    runner.yawDeg = 0;

    let sawShutdown = false;
    for (let t = 0; t < 450; t++) {
      stepSimulation(sim, {
        runner: {
          ...EMPTY_CONTROL_INPUT,
          fireRightArm: true,
          fireLeftArm: true,
          jump: true,
          lockTargetId: 'dummy',
        },
        dummy: EMPTY_CONTROL_INPUT,
      });
      if (runner.thermalShutdown) {
        sawShutdown = true;
        break;
      }
    }
    expect(sawShutdown).toBe(true);
    expect(runner.heat).toBeGreaterThanOrEqual(runner.maxHeat * 0.99);

    // Must stay shut down until heat cools below 70% capacity
    for (let t = 0; t < 240; t++) {
      stepSimulation(sim, {
        runner: { ...EMPTY_CONTROL_INPUT, moveForward: 1, jump: true },
        dummy: EMPTY_CONTROL_INPUT,
      });
      if (!runner.thermalShutdown) {
        expect(runner.heat).toBeLessThanOrEqual(runner.maxHeat * 0.7);
        break;
      }
    }
    expect(runner.thermalShutdown).toBe(false);
  });

  it('supports override shutdown (internal torso heat damage while staying active), laser beams, ammo depletion, and extra heat sinks', () => {
    const withSink = { ...structuredClone(PRESET_VANGUARD), extraHeatSinks: 3 };
    const noSink = { ...structuredClone(PRESET_VANGUARD), extraHeatSinks: 0 };
    const sWith = computeMechStats(withSink);
    const sNo = computeMechStats(noSink);
    expect(sWith.heatSinkWeight).toBe(3);
    expect(sWith.totalWeight).toBeCloseTo(sNo.totalWeight + 3, 2);
    expect(sWith.heatDissipationPerSec).toBeGreaterThan(sNo.heatDissipationPerSec);

    const sim = createSimulation({
      seed: 99,
      rules: { arenaPreset: 'urban_pillars', maxSeconds: 60 },
      entries: [
        { id: 'hot', name: 'Hot', teamId: 'A', blueprint: STARTER_MECHS[4] },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: PRESET_VANGUARD },
      ],
    });
    sim.terrain.obstacles = [];
    const hot = sim.mechs[0];
    const tgt = sim.mechs[1];
    hot.pos = { x: 300, y: 300, z: 0 };
    hot.yawDeg = 0;
    tgt.pos = { x: 300, y: 150, z: 0 };
    tgt.yawDeg = 180;

    // 1. Instant laser hit beam emits fire event with endPos and damages target immediately
    stepSimulation(sim, {
      hot: { ...EMPTY_CONTROL_INPUT, fireRightArm: true, lockTargetId: 'target' },
      target: EMPTY_CONTROL_INPUT,
    });
    const laserFire = sim.lastTickEvents.find((e) => e.type === 'fire' && e.endPos);
    expect(laserFire).toBeDefined();
    expect(tgt.damageTaken).toBeGreaterThan(0);

    // 2. Override shutdown above 100 heat: continues moving & firing, deals direct torso structure damage
    hot.heat = 115;
    const torsoStructBefore = hot.parts.torso.structure;
    const yBefore = hot.pos.y;
    for (let t = 0; t < 20; t++) {
      hot.heat = Math.max(115, hot.heat);
      stepSimulation(sim, {
        hot: { ...EMPTY_CONTROL_INPUT, moveForward: 1, overrideShutdown: true },
        target: EMPTY_CONTROL_INPUT,
      });
    }
    expect(hot.thermalShutdown).toBe(false);
    expect(hot.overrideShutdownActive).toBe(true);
    expect(hot.pos.y).toBeLessThan(yBefore);
    expect(hot.parts.torso.structure).toBeLessThan(torsoStructBefore);
    expect(hot.overheatDamageTaken).toBeGreaterThan(0);

    // 3. Ammo depletion prevents firing when ammoRemaining === 0
    tgt.weapons.rightArm.ammoRemaining = 1;
    stepSimulation(sim, {
      hot: EMPTY_CONTROL_INPUT,
      target: { ...EMPTY_CONTROL_INPUT, fireRightArm: true, lockTargetId: 'hot' },
    });
    expect(tgt.weapons.rightArm.ammoRemaining).toBe(0);
    tgt.weapons.rightArm.cooldownRemaining = 0;
    const projCountBefore = sim.projectiles.length;
    stepSimulation(sim, {
      hot: EMPTY_CONTROL_INPUT,
      target: { ...EMPTY_CONTROL_INPUT, fireRightArm: true, lockTargetId: 'hot' },
    });
    expect(sim.projectiles.length).toBeLessThanOrEqual(projCountBefore);
  });

  it('runs 12-mech multi-team formats (2x6, 3x4, 4x3, 6x2, 12-BR) cleanly at 30 TPS', () => {
    const formats: Array<[number, number]> = [
      [6, 2],
      [4, 3],
      [3, 4],
      [2, 6],
      [12, 1],
    ];

    for (const [teamCount, perTeam] of formats) {
      const sim = createSimulation({
        seed: 900 + teamCount,
        rules: { maxSeconds: 15 },
        entries: createTeamEntries(teamCount, perTeam),
      });

      expect(sim.mechs.length).toBe(12);

      for (let t = 0; t < 300; t++) {
        stepSimulation(sim, buildSimpleBotControls(sim));
        if (sim.finished) break;
      }

      for (const m of sim.mechs) {
        expect(Number.isFinite(m.pos.x)).toBe(true);
        expect(Number.isFinite(m.pos.y)).toBe(true);
        expect(Number.isFinite(m.pos.z)).toBe(true);
        expect(Number.isFinite(m.en)).toBe(true);
      }
    }
  });

  it('enforces 100t chassis cap, fixed booster-mount eligibility, ON/OFF toggle, and leg-damage impact', () => {
    for (const bp of STARTER_MECHS) {
      const stats = computeMechStats(bp);
      expect(stats.valid).toBe(true);
      expect(stats.loadCapacity).toBeLessThanOrEqual(MAX_CHASSIS_TONNAGE);
    }
    expect(computeMechStats(PRESET_FORTRESS).loadCapacity).toBe(100);

    // 1. Toggling booster OFF on PRESET_VANGUARD frees 4.0t and prevents boost/jump
    const vOn = computeMechStats(PRESET_VANGUARD);
    const vanguardOff = { ...structuredClone(PRESET_VANGUARD), boosterEnabled: false };
    const vOff = computeMechStats(vanguardOff);
    expect(vOn.hasBoosterMount).toBe(true);
    expect(vOn.boosterActive).toBe(true);
    expect(vOff.boosterActive).toBe(false);
    expect(vOff.totalWeight).toBeCloseTo(vOn.totalWeight - vOn.boosterWeight, 2);
    expect(vOff.boostSpeed).toBe(0);
    expect(vOff.jumpImpulse).toBe(0);

    // 2. Non-booster chassis (PRESET_FORTRESS) cannot retrofit booster
    const illegalFortress = { ...structuredClone(PRESET_FORTRESS), boosterEnabled: true };
    const illegalStats = computeMechStats(illegalFortress);
    expect(illegalStats.valid).toBe(false);
    expect(illegalStats.hasBoosterMount).toBe(false);
    expect(illegalStats.boosterActive).toBe(false);
    expect(validateAndRepairMechBlueprint(illegalFortress).boosterEnabled).toBe(false);

    const sim = createSimulation({
      seed: 88,
      rules: { arenaPreset: 'urban_pillars' },
      entries: [
        { id: 'van_on', name: 'VanOn', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 'van_off', name: 'VanOff', teamId: 'B', blueprint: vanguardOff },
        { id: 'fort', name: 'Fortress', teamId: 'C', blueprint: illegalFortress },
      ],
    });
    sim.terrain.obstacles = [];
    sim.mechs[0].pos = { x: 150, y: 300, z: 0 };
    sim.mechs[1].pos = { x: 300, y: 300, z: 0 };
    sim.mechs[2].pos = { x: 450, y: 300, z: 0 };

    const zStartFort = sim.mechs[2].pos.z;
    const zStartVanOff = sim.mechs[1].pos.z;
    for (let t = 0; t < 15; t++) {
      stepSimulation(sim, {
        van_on: { ...EMPTY_CONTROL_INPUT, moveForward: 1, boost: true, jump: true },
        van_off: { ...EMPTY_CONTROL_INPUT, moveForward: 1, boost: true, jump: true },
        fort: { ...EMPTY_CONTROL_INPUT, moveForward: 1, boost: true, jump: true },
      });
    }
    expect(sim.mechs[0].pos.z).toBeGreaterThan(2.5);
    expect(sim.mechs[1].pos.z).toBeCloseTo(zStartVanOff, 4);
    expect(sim.mechs[2].pos.z).toBeCloseTo(zStartFort, 4);

    // 3. Leg damage still degrades and disables boost/jump on booster-equipped mech
    const van = sim.mechs[0];
    van.parts.rightLeg.destroyed = true;
    expect(getMechMobilityMultipliers(van.parts).boostMult).toBeLessThan(1);
    expect(getMechMobilityMultipliers(van.parts).jumpMult).toBeLessThan(1);
    van.parts.leftLeg.destroyed = true;
    expect(getMechMobilityMultipliers(van.parts).boostMult).toBe(0);
    expect(getMechMobilityMultipliers(van.parts).jumpMult).toBe(0);
  });

  it('lands ballistic lead shots on moving targets cleanly in MechWarrior cadence', () => {
    const sim = createSimulation({
      seed: 314,
      rules: { arenaPreset: 'urban_pillars', maxSeconds: 30 },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: PRESET_VANGUARD },
      ],
    });
    sim.terrain.obstacles = [];
    sim.mechs[0].pos = { x: 300, y: 300, z: 0 };
    sim.mechs[0].yawDeg = 0;
    sim.mechs[1].pos = { x: 300, y: 150, z: 0 };
    sim.mechs[1].yawDeg = 90;

    let hitCount = 0;
    for (let t = 0; t < 360; t++) {
      stepSimulation(sim, {
        shooter: {
          ...EMPTY_CONTROL_INPUT,
          targetYaw: vectorToAngle2D(
            sim.mechs[1].pos.x - sim.mechs[0].pos.x,
            sim.mechs[1].pos.y - sim.mechs[0].pos.y
          ),
          fireRightArm: true,
          lockTargetId: 'target',
        },
        target: {
          ...EMPTY_CONTROL_INPUT,
          moveForward: 1, // walking across line of fire
        },
      });
      hitCount += sim.lastTickEvents.filter((e) => e.type === 'hit').length;
    }

    expect(hitCount).toBeGreaterThanOrEqual(2);
    expect(sim.mechs[1].damageTaken).toBeGreaterThan(0);
  });

  it('enforces forward/reverse locomotion (no strafe), speed-dependent turning, and ~60-deg forward boost-jump', () => {
    const sim = createSimulation({
      seed: 404,
      rules: { arenaPreset: 'urban_pillars', maxSeconds: 30 },
      entries: [
        { id: 'pivot', name: 'Pivot', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 'mover', name: 'Mover', teamId: 'B', blueprint: PRESET_VANGUARD },
        { id: 'light_run', name: 'LightRun', teamId: 'C', blueprint: PRESET_STRIKER },
        { id: 'heavy_still', name: 'HeavyStill', teamId: 'D', blueprint: PRESET_BERSERKER },
      ],
    });
    sim.terrain.obstacles = [];
    sim.mechs[0].pos = { x: 120, y: 300, z: 0 };
    sim.mechs[0].yawDeg = 0;
    sim.mechs[1].pos = { x: 240, y: 300, z: 0 };
    sim.mechs[1].yawDeg = 0;
    sim.mechs[2].pos = { x: 360, y: 300, z: 0 };
    sim.mechs[2].yawDeg = 0;
    sim.mechs[3].pos = { x: 480, y: 300, z: 0 };
    sim.mechs[3].yawDeg = 0;

    // 1. Accelerate mover & light_run forward cleanly; lateral moveStrafe causes zero sideways drift
    for (let t = 0; t < 25; t++) {
      stepSimulation(sim, {
        pivot: { ...EMPTY_CONTROL_INPUT, moveStrafe: 1 },
        mover: { ...EMPTY_CONTROL_INPUT, moveForward: 1, moveStrafe: 1 },
        light_run: { ...EMPTY_CONTROL_INPUT, moveForward: 1 },
        heavy_still: EMPTY_CONTROL_INPUT,
      });
    }
    expect(sim.mechs[0].pos.x).toBeCloseTo(120, 4);
    expect(sim.mechs[0].pos.y).toBeCloseTo(300, 4);
    expect(sim.mechs[1].pos.x).toBeCloseTo(240, 4);
    expect(sim.mechs[1].pos.y).toBeLessThan(295); // moved North (-Y) only

    // 2. Speed-dependent turning: stopped 超信地旋回 rotates strictly more than turning while moving
    const pivotYaw0 = sim.mechs[0].yawDeg;
    const moverYaw0 = sim.mechs[1].yawDeg;
    stepSimulation(sim, {
      pivot: { ...EMPTY_CONTROL_INPUT, turnYaw: 1 },
      mover: { ...EMPTY_CONTROL_INPUT, moveForward: 1, turnYaw: 1 },
      light_run: { ...EMPTY_CONTROL_INPUT, moveForward: 1 },
      heavy_still: EMPTY_CONTROL_INPUT,
    });
    const pivotDelta = sim.mechs[0].yawDeg - pivotYaw0;
    const moverDelta = sim.mechs[1].yawDeg - moverYaw0;
    expect(pivotDelta).toBeGreaterThan(moverDelta);

    // 3. ~60° oblique-forward boost-jump: moves forward (-Y) + up (+Z) with zero X drift,
    //    and light running mech leaps higher/farther than heavy stationary mech
    const lightY0 = sim.mechs[2].pos.y;
    const heavyY0 = sim.mechs[3].pos.y;
    let lightMaxZ = 0;
    let heavyMaxZ = 0;
    for (let t = 0; t < 18; t++) {
      stepSimulation(sim, {
        pivot: EMPTY_CONTROL_INPUT,
        mover: EMPTY_CONTROL_INPUT,
        light_run: { ...EMPTY_CONTROL_INPUT, moveForward: 1, jump: true, boost: true },
        heavy_still: { ...EMPTY_CONTROL_INPUT, jump: true, boost: true },
      });
      lightMaxZ = Math.max(lightMaxZ, sim.mechs[2].pos.z);
      heavyMaxZ = Math.max(heavyMaxZ, sim.mechs[3].pos.z);
    }
    expect(sim.mechs[2].pos.x).toBeCloseTo(360, 4);
    expect(sim.mechs[3].pos.x).toBeCloseTo(480, 4);
    expect(sim.mechs[2].pos.y).toBeLessThan(lightY0); // forward arc (-Y)
    expect(sim.mechs[3].pos.y).toBeLessThan(heavyY0); // heavy also lifts slightly forward (-Y)
    expect(lightMaxZ).toBeGreaterThan(heavyMaxZ);
    expect(heavyMaxZ).toBeGreaterThan(1.0);
  });

  it('twists upper torso independently of legs and enforces firing arcs', () => {
    const sim = createSimulation({
      seed: 515,
      rules: { arenaPreset: 'urban_pillars', maxSeconds: 30 },
      entries: [
        { id: 'me', name: 'Me', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 'east', name: 'East', teamId: 'B', blueprint: PRESET_STRIKER },
      ],
    });
    sim.terrain.obstacles = [];
    const me = sim.mechs[0];
    const east = sim.mechs[1];
    me.pos = { x: 250, y: 300, z: 0 };
    me.yawDeg = 0; // Legs face North
    east.pos = { x: 400, y: 300, z: 0 }; // Due East (+90 deg)

    // Tick 1: torso is still facing 0 deg, so East target (90 deg) is outside +/-45 arm firing arc -> refuses to fire
    stepSimulation(sim, {
      me: {
        ...EMPTY_CONTROL_INPUT,
        torsoTargetYaw: 90,
        fireRightArm: true,
        lockTargetId: 'east',
      },
      east: EMPTY_CONTROL_INPUT,
    });
    expect(me.yawDeg).toBe(0); // Legs stayed North
    expect(me.torsoYawOffsetDeg).toBeGreaterThan(0);
    expect(sim.projectiles).toHaveLength(0);

    // Twist all the way to +85 deg max twist while legs stay at 0 deg; once inside arm arc (<=45 deg), AC/5 fires
    let fired = false;
    for (let t = 0; t < 35; t++) {
      stepSimulation(sim, {
        me: {
          ...EMPTY_CONTROL_INPUT,
          torsoTargetYaw: 90,
          fireRightArm: true,
          lockTargetId: 'east',
        },
        east: EMPTY_CONTROL_INPUT,
      });
      if (sim.lastTickEvents.some((e) => e.type === 'fire')) {
        fired = true;
        break;
      }
    }
    expect(me.yawDeg).toBe(0);
    expect(me.torsoYawOffsetDeg).toBeLessThanOrEqual(me.stats.torsoTwistMaxDeg);
    expect(getMechTorsoWorldYaw(me)).toBeGreaterThan(45);
    expect(fired).toBe(true);
  });

  it('separates optical FOV+LOS vision from 360-deg radar and supports indirect LRM fire', () => {
    const sim = createSimulation({
      seed: 616,
      rules: { arenaPreset: 'urban_pillars', maxSeconds: 30 },
      entries: [
        { id: 'me', name: 'Me', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 'behind', name: 'Behind', teamId: 'B', blueprint: PRESET_STRIKER },
        { id: 'covered', name: 'Covered', teamId: 'B', blueprint: PRESET_STRIKER },
      ],
    });
    // Place tall wall at y=220..240 blocking optical LOS to 'covered' at (300, 120)
    sim.terrain.obstacles = [
      { id: 'wall', x: 250, y: 215, width: 100, height: 25, baseZ: 0, topZ: 28 },
    ];
    sim.mechs[0].pos = { x: 300, y: 300, z: 0 };
    sim.mechs[0].yawDeg = 0; // Looking North (-Y)
    sim.mechs[1].pos = { x: 300, y: 420, z: 0 }; // 120m South (directly behind)
    sim.mechs[2].pos = { x: 300, y: 120, z: 0 }; // 180m North (in FOV, but blocked by wall)

    const sensor = buildMechSensorState(sim, 'me');
    // Neither enemy is optically visible (one behind FOV, one behind wall)
    expect(sensor.visibleEnemies).toHaveLength(0);
    // Both enemies ARE detected on 360° radar!
    expect(sensor.radarContacts.map((c) => c.id).sort()).toEqual(['behind', 'covered']);
    const coveredContact = sensor.radarContacts.find((c) => c.id === 'covered')!;
    expect(coveredContact.inVisualFov).toBe(true);
    expect(coveredContact.hasLineOfSight).toBe(false);

    // Direct-fire AC/5 cannot fire at radar-only covered target, whereas LRM-5 CAN fire indirect lofted salvo
    stepSimulation(sim, {
      me: {
        ...EMPTY_CONTROL_INPUT,
        fireRightArm: true,
        fireRightShoulder: true,
        lockTargetId: 'covered',
      },
    });
    expect(sim.projectiles.some((p) => p.slot === 'rightArm')).toBe(false);
    expect(sim.projectiles.some((p) => p.slot === 'rightShoulder' && p.kind === 'lrm_homing')).toBe(true);
  });

  it('supports per-slot extra ammo bins, keeps energy blade, and removes buckler shield', () => {
    expect(ARM_WEAPONS.some((w) => w.id === 'buckler_shield')).toBe(false);
    const blade = ARM_WEAPONS.find((w) => w.id === 'laser_blade');
    expect(blade).toBeDefined();
    expect(blade!.kind).toBe('melee');

    const baseStats = computeMechStats(PRESET_VANGUARD);
    const upAmmoBp = structuredClone(PRESET_VANGUARD);
    upAmmoBp.extraAmmo = { rightArm: 2, rightShoulder: 1 };
    const upStats = computeMechStats(upAmmoBp);

    expect(upStats.ammoWeight).toBe(3);
    expect(upStats.totalWeight).toBeCloseTo(baseStats.totalWeight + 3, 2);
    expect(getWeaponSlotMaxAmmo(upAmmoBp, 'rightArm')).toBe(45 + 2 * 30);
    expect(getWeaponSlotMaxAmmo(upAmmoBp, 'rightShoulder')).toBe(24 + 1 * 24);

    const repaired = validateAndRepairMechBlueprint(upAmmoBp);
    expect(repaired.extraAmmo).toEqual({ rightArm: 2, rightShoulder: 1 });

    const sim = createSimulation({
      seed: 717,
      entries: [
        { id: 'u', name: 'U', teamId: 'A', blueprint: repaired },
        { id: 'e', name: 'E', teamId: 'B', blueprint: PRESET_STRIKER },
      ],
    });
    expect(sim.mechs[0].weapons.rightArm.ammoRemaining).toBe(105);
    expect(sim.mechs[0].weapons.rightShoulder.ammoRemaining).toBe(48);
  });

  it('burns laser damage over burnDurationSec, spreads across twisting target parts, and sweeps off when shooter twists away', () => {
    // Vanguard leftArm = medium_laser (damage 40, range 280, maxRange 420, burnDurationSec 0.7 => 21 ticks)
    const sim = createSimulation({
      seed: 808,
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: PRESET_FORTRESS },
      ],
    });
    sim.terrain.obstacles = [];
    const shooter = sim.mechs[0];
    const target = sim.mechs[1];
    shooter.pos = { x: 300, y: 300, z: 0 };
    shooter.yawDeg = 0;
    target.pos = { x: 300, y: 180, z: 0 };
    target.yawDeg = 180;

    // Tick 1: spawn medium_laser burn beam -> partial damage (~40/21) applied immediately
    stepSimulation(sim, {
      shooter: { ...EMPTY_CONTROL_INPUT, fireLeftArm: true, lockTargetId: 'target' },
      target: EMPTY_CONTROL_INPUT,
    });
    expect(sim.activeBeams).toHaveLength(1);
    expect(sim.activeBeams[0].ticksRemaining).toBe(20);
    const dmgAfterTick1 = target.damageTaken;
    expect(dmgAfterTick1).toBeGreaterThan(0.5);
    expect(dmgAfterTick1).toBeLessThan(6);

    // Twist target torso left mid-burn -> spreads burn across multiple parts
    for (let t = 0; t < 22; t++) {
      stepSimulation(sim, {
        shooter: EMPTY_CONTROL_INPUT,
        target: { ...EMPTY_CONTROL_INPUT, torsoTwistOffsetDeg: t < 10 ? 0 : -65 },
      });
    }
    expect(sim.activeBeams).toHaveLength(0);
    expect(target.damageTaken).toBeGreaterThan(34);
    expect(target.damageTaken).toBeLessThanOrEqual(40.5);

    // Shooter twists sharply away right after firing -> beam sweeps off-target and deals reduced total damage
    const sim2 = createSimulation({
      seed: 809,
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: PRESET_FORTRESS },
      ],
    });
    sim2.terrain.obstacles = [];
    sim2.mechs[0].pos = { x: 300, y: 300, z: 0 };
    sim2.mechs[0].yawDeg = 0;
    sim2.mechs[1].pos = { x: 300, y: 180, z: 0 };
    sim2.mechs[1].yawDeg = 180;

    stepSimulation(sim2, {
      shooter: { ...EMPTY_CONTROL_INPUT, fireLeftArm: true, lockTargetId: 'target' },
      target: EMPTY_CONTROL_INPUT,
    });
    for (let t = 0; t < 25; t++) {
      stepSimulation(sim2, {
        shooter: { ...EMPTY_CONTROL_INPUT, torsoTwistOffsetDeg: -85, turnYaw: -1 },
        target: EMPTY_CONTROL_INPUT,
      });
    }
    expect(sim2.mechs[1].damageTaken).toBeLessThan(target.damageTaken);
  });

  it('applies linear optimal-to-max range damage falloff for ballistics and lasers', () => {
    // 1. Laser falloff: medium_laser optimal=280, max=420 -> at 350m multiplier is 0.5 (~20 total dmg)
    const laserSim = createSimulation({
      seed: 901,
      rules: { arenaWidth: 1000, arenaDepth: 1000 },
      entries: [
        { id: 's', name: 'S', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 't', name: 'T', teamId: 'B', blueprint: PRESET_FORTRESS },
      ],
    });
    laserSim.terrain.obstacles = [];
    laserSim.terrain.heightAmplitude = 0;
    laserSim.mechs[0].pos = { x: 500, y: 550, z: 0 };
    laserSim.mechs[0].yawDeg = 0;
    laserSim.mechs[1].pos = { x: 500, y: 200, z: 0 }; // 350m North (halfway between 280 and 420)
    laserSim.mechs[1].yawDeg = 180;

    stepSimulation(laserSim, {
      s: { ...EMPTY_CONTROL_INPUT, fireLeftArm: true, lockTargetId: 't' },
      t: EMPTY_CONTROL_INPUT,
    });
    for (let i = 0; i < 24; i++) {
      stepSimulation(laserSim, { s: EMPTY_CONTROL_INPUT, t: EMPTY_CONTROL_INPUT });
    }
    expect(laserSim.mechs[1].damageTaken).toBeGreaterThan(15);
    expect(laserSim.mechs[1].damageTaken).toBeLessThan(26);

    // 2. Falloff curve + Ballistic falloff: gauss_rifle optimal=540, max=900 -> at 630m multiplier is 0.75 (~93.75 dmg vs 125 base)
    expect(computeRangeFalloffMultiplier(300, 380, 680)).toBe(1);
    expect(computeRangeFalloffMultiplier(530, 380, 680)).toBeCloseTo(0.5, 4);
    expect(computeRangeFalloffMultiplier(700, 380, 680)).toBe(0);

    const gaussSim = createSimulation({
      seed: 905,
      rules: { arenaWidth: 1000, arenaDepth: 1000 },
      entries: [
        { id: 's', name: 'S', teamId: 'A', blueprint: PRESET_SNIPER },
        { id: 't', name: 'T', teamId: 'B', blueprint: PRESET_FORTRESS },
      ],
    });
    gaussSim.terrain.obstacles = [];
    gaussSim.terrain.heightAmplitude = 0;
    gaussSim.mechs[0].pos = { x: 500, y: 830, z: 0 };
    gaussSim.mechs[0].yawDeg = 0;
    gaussSim.mechs[1].pos = { x: 500, y: 200, z: 0 }; // 630m North (90m past optimal 540m)
    gaussSim.mechs[1].yawDeg = 180;

    stepSimulation(gaussSim, {
      s: { ...EMPTY_CONTROL_INPUT, fireRightArm: true, lockTargetId: 't' },
      t: EMPTY_CONTROL_INPUT,
    });
    for (let i = 0; i < 80; i++) {
      stepSimulation(gaussSim, { s: EMPTY_CONTROL_INPUT, t: EMPTY_CONTROL_INPUT });
      if (gaussSim.mechs[1].damageTaken > 0) break;
    }
    expect(gaussSim.mechs[1].damageTaken).toBeGreaterThan(75);
    expect(gaussSim.mechs[1].damageTaken).toBeLessThan(110);
  });
});
