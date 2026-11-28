import { describe, expect, it } from 'vitest';
import {
  ARM_WEAPONS,
  MECH_CHASSIS_CATALOG,
  SHOULDER_WEAPONS,
  computeMechStats,
  computeRangeFalloffMultiplier,
  getWeaponSlotMaxAmmo,
} from '../../data/parts';
import { CURRICULUM_MISSIONS } from '../../data/curriculum';
import {
  PRESET_ABC,
  PRESET_ABH,
  PRESET_ABL,
  STARTER_MECHS,
} from '../../data/presets';
import { MAX_CHASSIS_TONNAGE, MatchParticipantEntry, MechControlInput, SimCombatEvent } from '../../types/mech';
import { validateAndRepairMechBlueprint } from '../../utils/shareMech';
import { applyDamageToMechParts, getMechMobilityMultipliers, testProjectileHitMech } from '../hitbox';
import { vectorToAngle2D } from '../math';
import {
  buildMechSensorState,
  createSimulation,
  DEFAULT_MATCH_RULES,
  EMPTY_CONTROL_INPUT,
  getMechTorsoWorldYaw,
  isMechAmsActive,
  isMechBapActive,
  isMechEcmActive,
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
    const shooterBp = structuredClone(PRESET_ABH);
    shooterBp.parts.rightArmWeapon = 'ac10';
    const sim = createSimulation({
      seed: 7,
      rules: { arenaPreset: 'plains_ridge', arenaWidth: 600, arenaDepth: 600 },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: shooterBp },
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
      rules: { arenaPreset: 'plains_ridge', arenaWidth: 600, arenaDepth: 600 },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: shooterBp },
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

    // Combat kill via simulation step records weaponId & face on mech_destroyed event
    const simKill = createSimulation({
      seed: 56,
      entries: [
        { id: 'killer', name: 'Killer', teamId: 'A', blueprint: STARTER_MECHS[2] },
        { id: 'victim', name: 'Victim', teamId: 'B', blueprint: STARTER_MECHS[1] },
      ],
    });
    simKill.terrain.obstacles = [];
    simKill.terrain.heightAmplitude = 0;
    simKill.mechs[0].pos = { x: 300, y: 360, z: 0 };
    simKill.mechs[0].yawDeg = 0;
    simKill.mechs[1].pos = { x: 300, y: 300, z: 0 };
    simKill.mechs[1].yawDeg = 180;
    simKill.mechs[1].parts.torso.frontArmor = 5;
    simKill.mechs[1].parts.torso.structure = 5;
    simKill.mechs[1].parts.leftShoulder.frontArmor = 5;
    simKill.mechs[1].parts.leftShoulder.structure = 5;
    simKill.mechs[1].parts.rightShoulder.frontArmor = 5;
    simKill.mechs[1].parts.rightShoulder.structure = 5;
    stepSimulation(simKill, {
      killer: { ...EMPTY_CONTROL_INPUT, fireRightShoulder: true, lockTargetId: 'victim' },
      victim: EMPTY_CONTROL_INPUT,
    });
    for (let t = 0; t < 25; t++) {
      if (simKill.finished) break;
      stepSimulation(simKill, {});
    }
    const killEv = simKill.events.find((e) => e.type === 'mech_destroyed');
    expect(killEv).toBeDefined();
    expect(killEv!.actorId).toBe('killer');
    expect(killEv!.targetId).toBe('victim');
    expect(killEv!.weaponId).toBe('ac20');
  });

  it('triggers EN overheat on depletion and recovers at 30% capacity', () => {
    const hotLaserMech = CURRICULUM_MISSIONS.find((m) => m.id === 'step2_heat_hysteresis')!.buildBrokenStarter().mech;
    const sim = createSimulation({
      seed: 12,
      entries: [
        { id: 'runner', name: 'Runner', teamId: 'A', blueprint: hotLaserMech }, // Large/Med laser high heat
        { id: 'dummy', name: 'Dummy', teamId: 'B', blueprint: STARTER_MECHS[0] },
      ],
    });
    const runner = sim.mechs[0];
    runner.pos = { x: 300, y: 300, z: 0 };
    // Place dummy behind runner so dummy is not destroyed before overheat triggers
    sim.mechs[1].pos = { x: 300, y: 750, z: 0 };
    runner.yawDeg = 0;

    let sawShutdown = false;
    for (let t = 0; t < 450; t++) {
      stepSimulation(sim, {
        runner: {
          ...EMPTY_CONTROL_INPUT,
          fireRightArm: true,
          fireLeftArm: true,
          fireRightShoulder: true,
          jump: true,
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
    const withSink = { ...structuredClone(PRESET_ABC), extraHeatSinks: 3 };
    const noSink = { ...structuredClone(PRESET_ABC), extraHeatSinks: 0 };
    const sWith = computeMechStats(withSink);
    const sNo = computeMechStats(noSink);
    expect(sWith.heatSinkWeight).toBe(3);
    expect(sWith.totalWeight).toBeCloseTo(sNo.totalWeight + 3, 2);
    expect(sWith.heatDissipationPerSec).toBeGreaterThan(sNo.heatDissipationPerSec);

    const hotLaserMech = CURRICULUM_MISSIONS.find((m) => m.id === 'step2_heat_hysteresis')!.buildBrokenStarter().mech;
    const targetBp = structuredClone(PRESET_ABH);
    targetBp.parts.rightArmWeapon = 'ac10';
    const sim = createSimulation({
      seed: 99,
      rules: { arenaPreset: 'urban_pillars', maxSeconds: 60 },
      entries: [
        { id: 'hot', name: 'Hot', teamId: 'A', blueprint: hotLaserMech },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: targetBp },
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

  it('provides 8 standardized frames (2 per class, all ECM+thruster capable) with monotonic lighter-faster scaling and toggle behavior', () => {
    for (const bp of STARTER_MECHS) {
      const stats = computeMechStats(bp);
      expect(stats.valid).toBe(true);
      expect(stats.loadCapacity).toBeLessThanOrEqual(MAX_CHASSIS_TONNAGE);
    }

    expect(MECH_CHASSIS_CATALOG).toHaveLength(8);
    for (const wc of ['light', 'medium', 'heavy', 'assault'] as const) {
      expect(MECH_CHASSIS_CATALOG.filter((c) => c.weightClass === wc)).toHaveLength(2);
    }
    for (let i = 0; i < MECH_CHASSIS_CATALOG.length; i++) {
      const c = MECH_CHASSIS_CATALOG[i];
      expect(c.hasJumpBoosterMount).toBe(true);
      expect(c.hasEcmMount).toBe(true);
      expect(c.maxTonnage).toBeLessThanOrEqual(MAX_CHASSIS_TONNAGE);
      if (i > 0) {
        const prev = MECH_CHASSIS_CATALOG[i - 1];
        expect(c.maxTonnage).toBeGreaterThan(prev.maxTonnage);
        expect(c.walkSpeed).toBeLessThan(prev.walkSpeed);
        expect(c.jumpImpulse).toBeLessThan(prev.jumpImpulse);
        expect(c.sizeScale).toBeGreaterThan(prev.sizeScale);
        expect(c.radarSignatureRange).toBeGreaterThan(prev.radarSignatureRange);
      }
    }

    // 1. Toggling booster OFF on ABC frees 4.0t and prevents boost/jump
    const abcOnBp = { ...structuredClone(PRESET_ABC), boosterEnabled: true };
    const vOn = computeMechStats(abcOnBp);
    const abcOffBp = { ...structuredClone(PRESET_ABC), boosterEnabled: false };
    const vOff = computeMechStats(abcOffBp);
    expect(vOn.hasBoosterMount).toBe(true);
    expect(vOn.boosterActive).toBe(true);
    expect(vOff.boosterActive).toBe(false);
    expect(vOff.totalWeight).toBeCloseTo(vOn.totalWeight - vOn.boosterWeight, 2);
    expect(vOff.boostSpeed).toBe(0);
    expect(vOff.jumpImpulse).toBe(0);

    // 2. Heavy ABH chassis also supports optional thruster toggle (5.5t) & lighter mechs jump higher
    const abhOnBp = { ...structuredClone(PRESET_ABH), boosterEnabled: true, ecmEnabled: true };
    const abhOnStats = computeMechStats(abhOnBp);
    expect(abhOnStats.valid).toBe(true);
    expect(abhOnStats.boosterActive).toBe(true);
    expect(abhOnStats.ecmActive).toBe(true);
    expect(abhOnStats.boosterWeight).toBe(5.5);
    expect(vOn.jumpImpulse).toBeGreaterThan(abhOnStats.jumpImpulse);

    const sim = createSimulation({
      seed: 88,
      rules: { arenaPreset: 'urban_pillars' },
      entries: [
        { id: 'abc_on', name: 'AbcOn', teamId: 'A', blueprint: abcOnBp },
        { id: 'abc_off', name: 'AbcOff', teamId: 'B', blueprint: abcOffBp },
        { id: 'abh_on', name: 'AbhOn', teamId: 'C', blueprint: abhOnBp },
      ],
    });
    sim.terrain.obstacles = [];
    sim.mechs[0].pos = { x: 150, y: 300, z: 0 };
    sim.mechs[1].pos = { x: 300, y: 300, z: 0 };
    sim.mechs[2].pos = { x: 450, y: 300, z: 0 };

    const zStartAbcOff = sim.mechs[1].pos.z;
    for (let t = 0; t < 15; t++) {
      stepSimulation(sim, {
        abc_on: { ...EMPTY_CONTROL_INPUT, moveForward: 1, boost: true, jump: true },
        abc_off: { ...EMPTY_CONTROL_INPUT, moveForward: 1, boost: true, jump: true },
        abh_on: { ...EMPTY_CONTROL_INPUT, moveForward: 1, boost: true, jump: true },
      });
    }
    expect(sim.mechs[0].pos.z).toBeGreaterThan(2.5);
    expect(sim.mechs[1].pos.z).toBeCloseTo(zStartAbcOff, 4);
    expect(sim.mechs[2].pos.z).toBeGreaterThan(1.0);
    expect(sim.mechs[0].pos.z).toBeGreaterThan(sim.mechs[2].pos.z);

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
    const shooterBp = structuredClone(PRESET_ABC);
    shooterBp.parts.rightArmWeapon = 'ac5';
    const sim = createSimulation({
      seed: 314,
      rules: { arenaPreset: 'urban_pillars', maxSeconds: 30 },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: shooterBp },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: PRESET_ABC },
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
    const abcJumpBp = { ...structuredClone(PRESET_ABC), boosterEnabled: true };
    const sim = createSimulation({
      seed: 404,
      rules: { arenaPreset: 'urban_pillars', maxSeconds: 30 },
      entries: [
        { id: 'pivot', name: 'Pivot', teamId: 'A', blueprint: abcJumpBp },
        { id: 'mover', name: 'Mover', teamId: 'B', blueprint: abcJumpBp },
        { id: 'light_run', name: 'LightRun', teamId: 'C', blueprint: PRESET_ABL },
        { id: 'heavy_still', name: 'HeavyStill', teamId: 'D', blueprint: abcJumpBp },
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
    const meBp = structuredClone(PRESET_ABC);
    meBp.parts.rightArmWeapon = 'ac5';
    const sim = createSimulation({
      seed: 515,
      rules: { arenaPreset: 'urban_pillars', maxSeconds: 30 },
      entries: [
        { id: 'me', name: 'Me', teamId: 'A', blueprint: meBp },
        { id: 'east', name: 'East', teamId: 'B', blueprint: PRESET_ABL },
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

  it('separates 800m optical FOV+LOS vision from target-RCS 360-deg radar, preserves allySpotted, and supports indirect LRM fire', () => {
    const observerBp = structuredClone(PRESET_ABC);
    observerBp.parts.rightArmWeapon = 'ac5';
    observerBp.parts.rightShoulderWeapon = 'lrm5';
    const ablNoEcm = {
      ...PRESET_ABL,
      ecmEnabled: false,
      parts: { ...PRESET_ABL.parts, leftShoulderWeapon: 'shd_none' },
    };
    const sim = createSimulation({
      seed: 616,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200, maxSeconds: 30 },
      entries: [
        { id: 'me', name: 'Me', teamId: 'A', blueprint: observerBp },
        { id: 'ally', name: 'Ally', teamId: 'A', blueprint: ablNoEcm },
        { id: 'behind_light', name: 'BehindLight', teamId: 'B', blueprint: ablNoEcm },
        { id: 'covered_light', name: 'CoveredLight', teamId: 'B', blueprint: ablNoEcm },
        { id: 'covered_assault', name: 'CoveredHeavy', teamId: 'B', blueprint: PRESET_ABH },
        { id: 'far_visible', name: 'FarVisible', teamId: 'B', blueprint: PRESET_ABH },
      ],
    });
    // Wall blocks optical LOS due North from (600, 600)
    sim.terrain.obstacles = [
      { id: 'wall', x: 540, y: 490, width: 120, height: 25, baseZ: 0, topZ: 28 },
    ];
    sim.mechs[0].pos = { x: 600, y: 600, z: 0 };
    sim.mechs[0].yawDeg = 0; // Looking North (-Y), FOV ±53° (106°)
    sim.mechs[1].pos = { x: 820, y: 340, z: 0 }; // Ally east of wall angled NW so it spots covered_assault (55° off) but not covered_light (75° off)
    sim.mechs[1].yawDeg = 325;
    sim.mechs[2].pos = { x: 600, y: 710, z: 0 }; // 110m South (behind FOV, within Light 120m RCS)
    sim.mechs[3].pos = { x: 600, y: 420, z: 0 }; // 180m North behind wall (outside Light 120m RCS -> undetected)
    sim.mechs[4].pos = { x: 600, y: 340, z: 0 }; // 260m North behind wall (inside Assault 400m RCS -> omni detected)
    sim.mechs[5].pos = { x: 920, y: 260, z: 0 }; // ~467m NE (~43.3° bearing, clears wall x=540..660, inside 800m ±53° FOV+LOS)

    const sensor = buildMechSensorState(sim, 'me');
    // Only far_visible is optically visible (within 800m + ±53° FOV + LOS)
    expect(sensor.visibleEnemies.map((e) => e.id)).toEqual(['far_visible']);
    // covered_light (180m behind wall, 120m RCS) is NOT detected; behind_light (110m), covered_assault (260m, 400m RCS), and far_visible ARE in radarContacts
    expect(sensor.radarContacts.map((c) => c.id).sort()).toEqual([
      'behind_light',
      'covered_assault',
      'far_visible',
    ]);
    const assaultContact = sensor.radarContacts.find((c) => c.id === 'covered_assault')!;
    expect(assaultContact.inVisualFov).toBe(true);
    expect(assaultContact.hasLineOfSight).toBe(false);
    expect(assaultContact.allySpotted).toBe(true);

    // Direct-fire AC/5 cannot fire at radar-only covered target, AND LRM-5 refuses indirect fire BEFORE lock completes
    stepSimulation(sim, {
      me: {
        ...EMPTY_CONTROL_INPUT,
        fireRightArm: true,
        fireRightShoulder: true,
        lockTargetId: 'covered_assault',
      },
    });
    expect(sim.projectiles.some((p) => p.slot === 'rightArm')).toBe(false);
    expect(sim.projectiles.some((p) => p.slot === 'rightShoulder')).toBe(false);
    expect(sim.mechs[0].lockComplete).toBe(false);

    // Accumulate lock-on (~1.8s = 56 ticks) against covered_assault -> lock completes and LRM-5 fires indirect lofted salvo!
    for (let t = 0; t < 56; t++) {
      stepSimulation(sim, {
        me: {
          ...EMPTY_CONTROL_INPUT,
          lockTargetId: 'covered_assault',
        },
      });
    }
    expect(sim.mechs[0].lockComplete).toBe(true);
    stepSimulation(sim, {
      me: {
        ...EMPTY_CONTROL_INPUT,
        fireRightArm: true,
        fireRightShoulder: true,
        lockTargetId: 'covered_assault',
      },
    });
    expect(sim.projectiles.some((p) => p.slot === 'rightArm')).toBe(false);
    expect(sim.projectiles.some((p) => p.slot === 'rightShoulder' && p.kind === 'lrm_homing')).toBe(true);
  });

  it('supports LRM Stream vs Salvo mode, 2-stage lofted climb, ECM/BAP/PPC EMP, and Ballistic/Laser AMS interception', () => {
    // 1. LRM Stream vs Salvo + 2-stage lofted arc
    const streamBp = structuredClone(PRESET_ABC);
    streamBp.parts.rightShoulderWeapon = 'lrm5';
    streamBp.lrmFireMode = 'stream';
    const salvoBp = structuredClone(PRESET_ABC);
    salvoBp.parts.rightShoulderWeapon = 'lrm5';
    salvoBp.lrmFireMode = 'salvo';

    const simStream = createSimulation({
      seed: 101,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'stream', name: 'Stream', teamId: 'A', blueprint: streamBp },
        { id: 'salvo', name: 'Salvo', teamId: 'A', blueprint: salvoBp },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: PRESET_ABH },
      ],
    });
    simStream.terrain.obstacles = [];
    simStream.mechs[0].pos = { x: 600, y: 800, z: 0 };
    simStream.mechs[0].yawDeg = 0;
    simStream.mechs[1].pos = { x: 640, y: 800, z: 0 };
    simStream.mechs[1].yawDeg = 0;
    simStream.mechs[2].pos = { x: 600, y: 200, z: 0 };

    for (let t = 0; t < 40; t++) {
      stepSimulation(simStream, {
        stream: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'target' },
        salvo: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'target' },
      });
    }
    expect(simStream.mechs[0].lockComplete).toBe(true);
    stepSimulation(simStream, {
      stream: { ...EMPTY_CONTROL_INPUT, fireRightShoulder: true, lockTargetId: 'target' },
      salvo: { ...EMPTY_CONTROL_INPUT, fireRightShoulder: true, lockTargetId: 'target' },
    });
    // Salvo spawns all 5 immediately; Stream spawns 1 and queues 4
    expect(simStream.projectiles.filter((p) => p.ownerId === 'salvo')).toHaveLength(5);
    expect(simStream.projectiles.filter((p) => p.ownerId === 'stream')).toHaveLength(1);
    expect(simStream.mechs[0].salvoQueue[0]?.remainingShots).toBe(4);
    expect(simStream.projectiles[0].loftTicksRemaining).toBeGreaterThan(0);

    // Step 12 ticks -> stream has fired all 5 staggered missiles
    for (let t = 0; t < 15; t++) {
      stepSimulation(simStream, {
        stream: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'target' },
        salvo: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'target' },
      });
    }
    expect(simStream.projectiles.filter((p) => p.ownerId === 'stream').length).toBe(5);

    // 2. ECM bubble halves omni RCS, blocks allySpotted, doubles lock time; BAP counters ECM; PPC hit disrupts ECM for 4.0s
    const ecmTargetBp = {
      ...structuredClone(PRESET_ABL), // Light 120m RCS, ECM ON -> 60m RCS
      ecmEnabled: true,
      parts: { ...PRESET_ABL.parts, leftShoulderWeapon: 'shd_none' },
    };
    const obsNoBapBp = structuredClone(PRESET_ABC);
    obsNoBapBp.parts.rightArmWeapon = 'ppc';
    const obsBapBp = structuredClone(PRESET_ABH);
    obsBapBp.parts.leftShoulderWeapon = 'ams_bap_pod';

    const ecmSim = createSimulation({
      seed: 202,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'obs', name: 'Obs', teamId: 'A', blueprint: obsNoBapBp },
        { id: 'spotter', name: 'Spotter', teamId: 'A', blueprint: PRESET_ABC },
        { id: 'bapObs', name: 'BapObs', teamId: 'C', blueprint: obsBapBp },
        { id: 'ecmFoe', name: 'EcmFoe', teamId: 'B', blueprint: ecmTargetBp },
      ],
    });
    ecmSim.terrain.obstacles = [
      { id: 'wall', x: 540, y: 500, width: 120, height: 20, baseZ: 0, topZ: 28 },
    ];
    ecmSim.mechs[0].pos = { x: 600, y: 600, z: 0 }; // 90m south of wall -> no LOS to ecmFoe
    ecmSim.mechs[0].yawDeg = 0;
    ecmSim.mechs[1].pos = { x: 820, y: 400, z: 0 }; // Spotter has clear LOS to ecmFoe at (600, 400)
    ecmSim.mechs[1].yawDeg = 270;
    ecmSim.mechs[2].pos = { x: 420, y: 400, z: 0 }; // BAP 180m West of ecmFoe (< 240m BAP range)
    ecmSim.mechs[2].yawDeg = 90;
    ecmSim.mechs[3].pos = { x: 600, y: 400, z: 0 }; // 200m North of obs, 90m would be blocked -> 200m > 60m halved RCS

    // Without BAP: spotter sees ecmFoe, but ECM blocks allySpotted sharing to obs (at 200m behind wall)
    const obsSensor = buildMechSensorState(ecmSim, 'obs');
    expect(obsSensor.radarContacts.some((c) => c.id === 'ecmFoe')).toBe(false);

    // Move obs within 110m (<= 120m proximity break) with clear LOS -> lock requires ~1.2s (not 2.4s)
    // First test ECM doubling lock time at 200m with clear LOS:
    ecmSim.terrain.obstacles = [];
    const obsSensorLos = buildMechSensorState(ecmSim, 'obs');
    expect(obsSensorLos.visibleEnemies.some((e) => e.id === 'ecmFoe')).toBe(true);
    for (let t = 0; t < 40; t++) {
      stepSimulation(ecmSim, {
        obs: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'ecmFoe' },
      });
    }
    // 40 ticks (~1.33s): normal 1.2s would be locked, but ECM 2x requires 2.4s -> NOT locked yet!
    expect(ecmSim.mechs[0].lockComplete).toBe(false);
    // BAP observer locks cleanly within 0.9s (1.2s * 0.75)
    for (let t = 0; t < 30; t++) {
      stepSimulation(ecmSim, {
        bapObs: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'ecmFoe' },
      });
    }
    expect(ecmSim.mechs[2].lockComplete).toBe(true);

    // PPC hit disrupts ecmFoe ECM for 120 ticks (4.0s)
    ecmSim.mechs[0].pos = { x: 600, y: 480, z: 0 };
    ecmSim.mechs[0].yawDeg = 0;
    ecmSim.mechs[3].pos = { x: 600, y: 400, z: 0 };
    stepSimulation(ecmSim, {
      obs: { ...EMPTY_CONTROL_INPUT, fireRightArm: true, lockTargetId: 'ecmFoe' },
    });
    for (let t = 0; t < 15; t++) {
      stepSimulation(ecmSim, {});
      if (ecmSim.mechs[3].ecmDisruptedTicks > 0) break;
    }
    expect(ecmSim.mechs[3].ecmDisruptedTicks).toBeGreaterThan(0);
    expect(buildMechSensorState(ecmSim, 'ecmFoe').ecmActive).toBe(false);

    // 3. Ballistic AMS (ammo, 0 heat) & Laser AMS (unlimited ammo, +heat) intercept incoming missiles
    const balAmsBp = structuredClone(PRESET_ABH);
    balAmsBp.parts.leftShoulderWeapon = 'ams_ballistic';
    const lasAmsBp = structuredClone(PRESET_ABH);
    lasAmsBp.parts.leftShoulderWeapon = 'ams_laser';

    const amsSim = createSimulation({
      seed: 303,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'balAms', name: 'BalAMS', teamId: 'A', blueprint: balAmsBp },
        { id: 'lasAms', name: 'LasAMS', teamId: 'A', blueprint: lasAmsBp },
        { id: 'lrmBoat', name: 'LrmBoat', teamId: 'B', blueprint: salvoBp },
      ],
    });
    amsSim.terrain.obstacles = [];
    amsSim.mechs[0].pos = { x: 560, y: 400, z: 0 };
    amsSim.mechs[1].pos = { x: 640, y: 400, z: 0 };
    amsSim.mechs[2].pos = { x: 600, y: 700, z: 0 };
    amsSim.mechs[2].yawDeg = 0;

    // Spawn incoming LRM projectiles close to both AMS mechs
    amsSim.projectiles.push(
      {
        id: 901,
        ownerId: 'lrmBoat',
        teamId: 'B',
        slot: 'rightShoulder',
        weaponId: 'lrm5',
        kind: 'lrm_homing',
        pos: { x: 560, y: 440, z: 8 },
        vel: { x: 0, y: -100, z: 0 },
        gravity: 1,
        damage: 10,
        canRicochet: false,
        ricochetAngleDeg: 89,
        homingTurnDegPerSec: 0,
        targetId: 'balAms',
        distanceTraveled: 100,
        optimalRange: 750,
        maxRange: 900,
        ttlTicks: 30,
        hp: 1,
        loftTicksRemaining: 0,
      },
      {
        id: 902,
        ownerId: 'lrmBoat',
        teamId: 'B',
        slot: 'rightShoulder',
        weaponId: 'lrm5',
        kind: 'lrm_homing',
        pos: { x: 640, y: 440, z: 8 },
        vel: { x: 0, y: -100, z: 0 },
        gravity: 1,
        damage: 10,
        canRicochet: false,
        ricochetAngleDeg: 89,
        homingTurnDegPerSec: 0,
        targetId: 'lasAms',
        distanceTraveled: 100,
        optimalRange: 750,
        maxRange: 900,
        ttlTicks: 30,
        hp: 1,
        loftTicksRemaining: 0,
      }
    );

    const balAmmoBefore = amsSim.mechs[0].weapons.leftShoulder.ammoRemaining;
    stepSimulation(amsSim, {});
    expect(amsSim.lastTickEvents.filter((e) => e.type === 'missile_intercepted')).toHaveLength(2);
    expect(amsSim.mechs[0].weapons.leftShoulder.ammoRemaining).toBe(balAmmoBefore - 1);
    expect(amsSim.mechs[0].heat).toBe(0);
    expect(amsSim.mechs[1].heat).toBeGreaterThan(0);
  });

  it('lands locked LRM salvos and streams reliably across direct, indirect cover-clearing, and moving-target trajectories', () => {
    // A. Direct 600m locked Stream & Salvo LRM-5 both hit target
    const streamBp = structuredClone(PRESET_ABC);
    streamBp.parts.rightShoulderWeapon = 'lrm5';
    streamBp.lrmFireMode = 'stream';
    const salvoBp = structuredClone(PRESET_ABC);
    salvoBp.parts.rightShoulderWeapon = 'lrm5';
    salvoBp.lrmFireMode = 'salvo';

    const noAmsHeavy = structuredClone(PRESET_ABH);
    noAmsHeavy.parts.leftShoulderWeapon = 'shd_none';
    const directSim = createSimulation({
      seed: 410,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'stream', name: 'Stream', teamId: 'A', blueprint: streamBp },
        { id: 'salvo', name: 'Salvo', teamId: 'A', blueprint: salvoBp },
        { id: 'tgt', name: 'Target', teamId: 'B', blueprint: noAmsHeavy },
      ],
    });
    directSim.terrain.obstacles = [];
    directSim.mechs[0].pos = { x: 580, y: 800, z: 0 };
    directSim.mechs[0].yawDeg = 0;
    directSim.mechs[1].pos = { x: 620, y: 800, z: 0 };
    directSim.mechs[1].yawDeg = 0;
    directSim.mechs[2].pos = { x: 600, y: 200, z: 0 };

    for (let t = 0; t < 40; t++) {
      stepSimulation(directSim, {
        stream: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'tgt' },
        salvo: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'tgt' },
      });
    }
    stepSimulation(directSim, {
      stream: { ...EMPTY_CONTROL_INPUT, fireRightShoulder: true, lockTargetId: 'tgt' },
      salvo: { ...EMPTY_CONTROL_INPUT, fireRightShoulder: true, lockTargetId: 'tgt' },
    });

    let streamHits = 0;
    let salvoHits = 0;
    for (let t = 0; t < 190; t++) {
      stepSimulation(directSim, {
        stream: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'tgt' },
        salvo: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'tgt' },
      });
      for (const ev of directSim.lastTickEvents) {
        if (ev.type === 'hit' && ev.targetId === 'tgt') {
          if (ev.actorId === 'stream') streamHits += 1;
          if (ev.actorId === 'salvo') salvoHits += 1;
        }
      }
    }
    expect(streamHits).toBeGreaterThanOrEqual(3);
    expect(salvoHits).toBeGreaterThanOrEqual(3);
    expect(directSim.mechs[2].damageTaken).toBeGreaterThan(30);

    // B. Indirect LRM-5 clears 28m obstacle wall at 260m and lands on covered target
    const indirectSim = createSimulation({
      seed: 411,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: salvoBp },
        {
          id: 'spotter',
          name: 'Spotter',
          teamId: 'A',
          blueprint: {
            ...PRESET_ABL,
            ecmEnabled: false,
            parts: { ...PRESET_ABL.parts, leftShoulderWeapon: 'shd_none' },
          },
        },
        { id: 'covered', name: 'Covered', teamId: 'B', blueprint: noAmsHeavy },
      ],
    });
    indirectSim.terrain.obstacles = [
      { id: 'wall', x: 540, y: 490, width: 120, height: 25, baseZ: 0, topZ: 28 },
    ];
    indirectSim.mechs[0].pos = { x: 600, y: 600, z: 0 };
    indirectSim.mechs[0].yawDeg = 0;
    indirectSim.mechs[1].pos = { x: 820, y: 340, z: 0 };
    indirectSim.mechs[1].yawDeg = 270;
    indirectSim.mechs[2].pos = { x: 600, y: 340, z: 0 };

    for (let t = 0; t < 60; t++) {
      stepSimulation(indirectSim, {
        shooter: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'covered' },
      });
    }
    expect(indirectSim.mechs[0].lockComplete).toBe(true);
    stepSimulation(indirectSim, {
      shooter: { ...EMPTY_CONTROL_INPUT, fireRightShoulder: true, lockTargetId: 'covered' },
    });
    let indirectHits = 0;
    for (let t = 0; t < 130; t++) {
      stepSimulation(indirectSim, {
        shooter: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'covered' },
      });
      indirectHits += indirectSim.lastTickEvents.filter(
        (ev) => ev.type === 'hit' && ev.actorId === 'shooter' && ev.targetId === 'covered'
      ).length;
    }
    expect(indirectHits).toBeGreaterThanOrEqual(2);
    expect(indirectSim.mechs[2].damageTaken).toBeGreaterThan(12);

    // C. Direct locked LRM-5 hits perpendicularly moving Light target at ~400m
    const moverSim = createSimulation({
      seed: 412,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: salvoBp },
        {
          id: 'runner',
          name: 'Runner',
          teamId: 'B',
          blueprint: {
            ...PRESET_ABL,
            ecmEnabled: false,
            parts: { ...PRESET_ABL.parts, leftShoulderWeapon: 'shd_none' },
          },
        },
      ],
    });
    moverSim.terrain.obstacles = [];
    moverSim.mechs[0].pos = { x: 600, y: 800, z: 0 };
    moverSim.mechs[0].yawDeg = 0;
    moverSim.mechs[1].pos = { x: 520, y: 400, z: 0 };
    moverSim.mechs[1].yawDeg = 90;

    for (let t = 0; t < 40; t++) {
      stepSimulation(moverSim, {
        shooter: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'runner' },
        runner: { ...EMPTY_CONTROL_INPUT, moveForward: 1 },
      });
    }
    expect(moverSim.mechs[0].lockComplete).toBe(true);
    stepSimulation(moverSim, {
      shooter: { ...EMPTY_CONTROL_INPUT, fireRightShoulder: true, lockTargetId: 'runner' },
      runner: { ...EMPTY_CONTROL_INPUT, moveForward: 1 },
    });
    let moverHits = 0;
    for (let t = 0; t < 150; t++) {
      stepSimulation(moverSim, {
        shooter: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'runner' },
        runner: { ...EMPTY_CONTROL_INPUT, moveForward: 1 },
      });
      moverHits += moverSim.lastTickEvents.filter(
        (ev) => ev.type === 'hit' && ev.actorId === 'shooter' && ev.targetId === 'runner'
      ).length;
    }
    expect(moverHits).toBeGreaterThanOrEqual(1);
    expect(moverSim.mechs[1].damageTaken).toBeGreaterThan(5);
  });

  it('supports per-slot extra ammo bins, keeps energy blade, and removes buckler shield and lrm20', () => {
    expect(ARM_WEAPONS.some((w) => w.id === 'buckler_shield')).toBe(false);
    expect(SHOULDER_WEAPONS.some((w) => w.id === 'lrm20')).toBe(false);
    const blade = ARM_WEAPONS.find((w) => w.id === 'laser_blade');
    expect(blade).toBeDefined();
    expect(blade!.kind).toBe('melee');

    const legacyLrm20Bp = structuredClone(PRESET_ABC);
    legacyLrm20Bp.parts.rightShoulderWeapon = 'lrm20';
    expect(validateAndRepairMechBlueprint(legacyLrm20Bp).parts.rightShoulderWeapon).toBe('lrm15');

    const baseAmmoBp = structuredClone(PRESET_ABC);
    baseAmmoBp.parts.rightArmWeapon = 'ac5';
    baseAmmoBp.parts.rightShoulderWeapon = 'lrm5';
    baseAmmoBp.extraAmmo = {};
    const baseStats = computeMechStats(baseAmmoBp);
    const upAmmoBp = structuredClone(baseAmmoBp);
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
        { id: 'e', name: 'E', teamId: 'B', blueprint: PRESET_ABL },
      ],
    });
    expect(sim.mechs[0].weapons.rightArm.ammoRemaining).toBe(105);
    expect(sim.mechs[0].weapons.rightShoulder.ammoRemaining).toBe(48);
  });

  it('burns laser damage over burnDurationSec, spreads across twisting target parts, and sweeps off when shooter twists away', () => {
    // Single medium_laser (damage 28, range 280, maxRange 420, burnDurationSec 0.7 => 21 ticks)
    const singleLaserAbc = structuredClone(PRESET_ABC);
    singleLaserAbc.parts.leftArmWeapon = 'medium_laser';
    singleLaserAbc.weaponMountCounts = undefined;
    const sim = createSimulation({
      seed: 808,
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: singleLaserAbc },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: PRESET_ABH },
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
    expect(target.damageTaken).toBeGreaterThan(23);
    expect(target.damageTaken).toBeLessThanOrEqual(28.5);

    // Shooter twists sharply away right after firing -> beam sweeps off-target and deals reduced total damage
    const sim2 = createSimulation({
      seed: 809,
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: singleLaserAbc },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: PRESET_ABH },
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
    // 1. Laser falloff: medium_laser optimal=280, max=420 -> at 350m multiplier is 0.5 (~14 total dmg)
    const singleLaserBp = structuredClone(PRESET_ABC);
    singleLaserBp.parts.leftArmWeapon = 'medium_laser';
    singleLaserBp.weaponMountCounts = undefined;
    const laserSim = createSimulation({
      seed: 901,
      rules: { arenaWidth: 1000, arenaDepth: 1000 },
      entries: [
        { id: 's', name: 'S', teamId: 'A', blueprint: singleLaserBp },
        { id: 't', name: 'T', teamId: 'B', blueprint: PRESET_ABH },
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
    expect(laserSim.mechs[1].damageTaken).toBeGreaterThan(10);
    expect(laserSim.mechs[1].damageTaken).toBeLessThan(18);

    // 2. Falloff curve + Ballistic falloff: gauss_rifle optimal=540, max=900 -> at 630m multiplier is 0.75 (~57 dmg vs 76 base)
    expect(computeRangeFalloffMultiplier(300, 380, 680)).toBe(1);
    expect(computeRangeFalloffMultiplier(530, 380, 680)).toBeCloseTo(0.5, 4);
    expect(computeRangeFalloffMultiplier(700, 380, 680)).toBe(0);

    const gaussBp = structuredClone(PRESET_ABH);
    gaussBp.parts.rightArmWeapon = 'gauss_rifle';
    const gaussSim = createSimulation({
      seed: 905,
      rules: { arenaWidth: 1000, arenaDepth: 1000 },
      entries: [
        { id: 's', name: 'S', teamId: 'A', blueprint: gaussBp },
        { id: 't', name: 'T', teamId: 'B', blueprint: PRESET_ABH },
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
    expect(gaussSim.mechs[1].damageTaken).toBeGreaterThan(45);
    expect(gaussSim.mechs[1].damageTaken).toBeLessThan(68);
  });

  it('supports multi-mount weapons (M-Laser x3 / AC5 x2), combined AMS+BAP pod, slot ECM destruction, and shared torso armor caps', () => {
    // 1. Multi-mount weight, heat, ammo, beams, projectiles, and damage
    const multiBp = structuredClone(PRESET_ABH);
    multiBp.parts.rightArmWeapon = 'ac5';
    multiBp.parts.leftArmWeapon = 'medium_laser';
    multiBp.parts.rightShoulderWeapon = 'lrm10';
    multiBp.parts.leftShoulderWeapon = 'ams_bap_pod';
    multiBp.weaponMountCounts = { rightArm: 2, leftArm: 3 };
    const multiStats = computeMechStats(multiBp);
    expect(multiStats.weaponsWeight).toBeCloseTo(5.5 * 2 + 2.0 * 3 + 7.0 + 3.0, 2);

    const ecmSlotTarget = {
      ...structuredClone(PRESET_ABL),
      ecmEnabled: false,
      parts: { ...PRESET_ABL.parts, leftShoulderWeapon: 'ecm_suite' },
    };
    const sim = createSimulation({
      seed: 950,
      rules: { arenaWidth: 1000, arenaDepth: 1000 },
      entries: [
        { id: 'multi', name: 'Multi', teamId: 'A', blueprint: multiBp },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: ecmSlotTarget },
      ],
    });
    sim.terrain.obstacles = [];
    sim.terrain.heightAmplitude = 0;
    sim.mechs[0].pos = { x: 500, y: 500, z: 0 };
    sim.mechs[0].yawDeg = 0;
    sim.mechs[1].pos = { x: 500, y: 380, z: 0 }; // 120m North (inside close range & optimal)
    sim.mechs[1].yawDeg = 180;

    const ammoBefore = sim.mechs[0].weapons.rightArm.ammoRemaining;
    stepSimulation(sim, {
      multi: { ...EMPTY_CONTROL_INPUT, fireRightArm: true, fireLeftArm: true, lockTargetId: 'target' },
    });
    // AC/5 x2 spawns 2 projectiles & consumes 2 ammo; M-Laser x3 spawns 3 beams; total heat ~ 12 + 33 - diss
    expect(sim.mechs[0].weapons.rightArm.ammoRemaining).toBe(ammoBefore - 2);
    expect(sim.projectiles.filter((p) => p.ownerId === 'multi' && p.slot === 'rightArm')).toHaveLength(2);
    expect(sim.activeBeams.filter((b) => b.ownerId === 'multi' && b.slot === 'leftArm')).toHaveLength(3);
    expect(sim.mechs[0].heat).toBeGreaterThan(40);

    // 2. ams_bap_pod provides both BAP (counters ECM) & AMS interception, and slot ECM stops when leftShoulder is destroyed
    const ecmMech = sim.mechs[1];
    expect(isMechEcmActive(ecmMech)).toBe(true);
    expect(isMechBapActive(sim.mechs[0])).toBe(true);
    expect(isMechAmsActive(sim.mechs[0])).toBe(true);

    const lShdHit = testProjectileHitMech(
      { x: 500 + 1.5, y: 390, z: 6.5 },
      { x: 500 + 1.5, y: 370, z: 6.5 },
      ecmMech.pos,
      ecmMech.yawDeg,
      getMechTorsoWorldYaw(ecmMech),
      ecmMech.stats.sizeScale
    );
    expect(lShdHit?.partId).toBe('leftShoulder');
    applyDamageToMechParts(ecmMech, lShdHit!, 400, DEFAULT_MATCH_RULES);
    expect(ecmMech.parts.leftShoulder.destroyed).toBe(true);
    expect(isMechEcmActive(ecmMech)).toBe(false);

    // 3. Shared front+rear torso armor cap validation
    const overTorso = structuredClone(PRESET_ABC);
    overTorso.armor.torsoFront = 280;
    overTorso.armor.torsoRear = 80; // 360 > 320 cap
    const overStats = computeMechStats(overTorso);
    expect(overStats.valid).toBe(false);
    expect(overStats.validationErrors.some((e) => e.includes('中央胴の前後装甲合計'))).toBe(true);
  });

  it('supports per-slot LRM fire modes (salvo vs stream) on different shoulder mounts', () => {
    const bp = structuredClone(PRESET_ABC);
    bp.parts.rightShoulderWeapon = 'lrm5';
    bp.parts.leftShoulderWeapon = 'lrm5';
    bp.lrmFireMode = 'salvo';
    bp.lrmFireModes = {
      rightShoulder: 'salvo',
      leftShoulder: 'stream',
    };

    const sim = createSimulation({
      seed: 909,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'lrmer', name: 'LRM', teamId: 'A', blueprint: bp },
        { id: 'tgt', name: 'TGT', teamId: 'B', blueprint: PRESET_ABH },
      ],
    });
    sim.terrain.obstacles = [];
    sim.mechs[0].pos = { x: 600, y: 800, z: 0 };
    sim.mechs[0].yawDeg = 0;
    sim.mechs[1].pos = { x: 600, y: 300, z: 0 };
    sim.mechs[1].yawDeg = 180;

    for (let t = 0; t < 40; t++) {
      stepSimulation(sim, {
        lrmer: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'tgt' },
      });
    }
    expect(sim.mechs[0].lockComplete).toBe(true);

    stepSimulation(sim, {
      lrmer: {
        ...EMPTY_CONTROL_INPUT,
        fireRightShoulder: true,
        fireLeftShoulder: true,
        lockTargetId: 'tgt',
      },
    });

    expect(sim.projectiles.filter((p) => p.ownerId === 'lrmer' && p.slot === 'rightShoulder')).toHaveLength(5);
    expect(sim.projectiles.filter((p) => p.ownerId === 'lrmer' && p.slot === 'leftShoulder')).toHaveLength(1);
    const queued = sim.mechs[0].salvoQueue.filter((q) => q.slot === 'leftShoulder');
    expect(queued).toHaveLength(1);
    expect(queued[0].remainingShots).toBe(4);
  });

  it('supports 3-direction timed jump jets (forward, vertical, backward) and airborne Jump-Turn bonus', () => {
    const jumpAbc = { ...structuredClone(PRESET_ABC), boosterEnabled: true };
    const sim = createSimulation({
      seed: 910,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'fwd', name: 'Fwd', teamId: 'A', blueprint: jumpAbc },
        { id: 'vert', name: 'Vert', teamId: 'B', blueprint: jumpAbc },
        { id: 'back', name: 'Back', teamId: 'C', blueprint: jumpAbc },
        { id: 'turn_boost', name: 'TurnBoost', teamId: 'D', blueprint: jumpAbc },
        { id: 'turn_coast', name: 'TurnCoast', teamId: 'E', blueprint: jumpAbc },
      ],
    });
    sim.terrain.obstacles = [];
    sim.terrain.heightAmplitude = 0;

    for (let i = 0; i < sim.mechs.length; i++) {
      sim.mechs[i].pos = { x: 200 + i * 160, y: 600, z: 0 };
      sim.mechs[i].yawDeg = 0; // Facing North (-Y)
    }

    // Trigger 0.8s burn on tick 0 for fwd / vert / back, and 1.0s burn for Jump-Turn comparison
    stepSimulation(sim, {
      fwd: { ...EMPTY_CONTROL_INPUT, jump: true, boost: true, jumpDir: 'forward', jumpBurnSec: 0.9 },
      vert: { ...EMPTY_CONTROL_INPUT, jump: true, boost: true, jumpDir: 'vertical', jumpBurnSec: 0.8 },
      back: { ...EMPTY_CONTROL_INPUT, jump: true, boost: true, jumpDir: 'backward', jumpBurnSec: 0.8 },
      turn_boost: { ...EMPTY_CONTROL_INPUT, jump: true, boost: true, jumpDir: 'vertical', jumpBurnSec: 1.0 },
      turn_coast: { ...EMPTY_CONTROL_INPUT, jump: true, boost: true, jumpDir: 'vertical', jumpBurnSec: 0.25 },
    });

    let maxZFwd = 0;
    let maxZVert = 0;
    let deltaYawBoost = 0;
    let deltaYawCoast = 0;

    for (let t = 1; t < 85; t++) {
      const prevBoostYaw = sim.mechs[3].yawDeg;
      const prevCoastYaw = sim.mechs[4].yawDeg;
      // Measure turning between tick 20..45 when turn_boost is still burning and turn_coast is coasting
      const measureTurn = t >= 20 && t < 45;
      stepSimulation(sim, {
        fwd: EMPTY_CONTROL_INPUT,
        vert: EMPTY_CONTROL_INPUT,
        back: EMPTY_CONTROL_INPUT,
        turn_boost: measureTurn ? { ...EMPTY_CONTROL_INPUT, turnYaw: 1 } : EMPTY_CONTROL_INPUT,
        turn_coast: measureTurn ? { ...EMPTY_CONTROL_INPUT, turnYaw: 1 } : EMPTY_CONTROL_INPUT,
      });
      maxZFwd = Math.max(maxZFwd, sim.mechs[0].pos.z);
      maxZVert = Math.max(maxZVert, sim.mechs[1].pos.z);
      if (measureTurn) {
        deltaYawBoost += Math.abs(sim.mechs[3].yawDeg - prevBoostYaw);
        deltaYawCoast += Math.abs(sim.mechs[4].yawDeg - prevCoastYaw);
      }
    }

    // Forward clears 14m mesa height and moves North (-Y)
    expect(maxZFwd).toBeGreaterThan(14.5);
    expect(sim.mechs[0].pos.y).toBeLessThan(580);
    // Vertical reaches >= 15m with much less horizontal travel than forward
    expect(maxZVert).toBeGreaterThan(15);
    expect(Math.abs(600 - sim.mechs[1].pos.y)).toBeLessThan(Math.abs(600 - sim.mechs[0].pos.y) * 0.5);
    // Backward jumps South (+Y), opposite yaw
    expect(sim.mechs[2].pos.y).toBeGreaterThan(610);
    // Jump-Turn: active booster burn turns faster in air than coasting
    expect(deltaYawBoost).toBeGreaterThan(deltaYawCoast * 1.15);
  });

  it('cuts LRM guidance on lock loss, enforces 0 damage inside 120m minRange, and intercepts >=4 missiles with enhanced AMS', () => {
    // 1. Lock loss during flight drops projectile homingTurnDegPerSec to 0
    const lrm5Bp = structuredClone(PRESET_ABC);
    lrm5Bp.parts.rightShoulderWeapon = 'lrm5';
    const lockSim = createSimulation({
      seed: 911,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: lrm5Bp },
        { id: 'tgt', name: 'Target', teamId: 'B', blueprint: PRESET_ABH },
      ],
    });
    lockSim.terrain.obstacles = [];
    lockSim.mechs[0].pos = { x: 600, y: 900, z: 0 };
    lockSim.mechs[0].yawDeg = 0;
    lockSim.mechs[1].pos = { x: 600, y: 300, z: 0 };

    for (let t = 0; t < 40; t++) {
      stepSimulation(lockSim, { shooter: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'tgt' } });
    }
    stepSimulation(lockSim, {
      shooter: { ...EMPTY_CONTROL_INPUT, fireRightShoulder: true, lockTargetId: 'tgt' },
    });
    expect(lockSim.projectiles.some((p) => p.kind === 'lrm_homing' && p.homingTurnDegPerSec > 0)).toBe(true);

    // Drop lock input for >0.8s (30 ticks = 1.0s)
    for (let t = 0; t < 30; t++) {
      stepSimulation(lockSim, { shooter: { ...EMPTY_CONTROL_INPUT, lockTargetId: null } });
    }
    expect(lockSim.mechs[0].lockComplete).toBe(false);
    const inFlight = lockSim.projectiles.filter((p) => p.kind === 'lrm_homing');
    expect(inFlight.length).toBeGreaterThan(0);
    expect(inFlight.every((p) => p.homingTurnDegPerSec === 0)).toBe(true);

    // 2. MinRange < 120m deals 0 damage even when hitting target
    const closeBp = structuredClone(lrm5Bp);
    closeBp.lrmFireMode = 'salvo';
    const closeSim = createSimulation({
      seed: 912,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: closeBp },
        { id: 'tgt', name: 'Target', teamId: 'B', blueprint: PRESET_ABH },
      ],
    });
    closeSim.terrain.obstacles = [];
    closeSim.mechs[0].pos = { x: 600, y: 600, z: 0 };
    closeSim.mechs[0].yawDeg = 0;
    closeSim.mechs[1].pos = { x: 600, y: 510, z: 0 }; // 90m < 120m minRange

    for (let t = 0; t < 40; t++) {
      stepSimulation(closeSim, { shooter: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'tgt' } });
    }
    stepSimulation(closeSim, {
      shooter: { ...EMPTY_CONTROL_INPUT, fireRightShoulder: true, lockTargetId: 'tgt' },
    });
    for (let t = 0; t < 40; t++) {
      stepSimulation(closeSim, { shooter: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'tgt' } });
    }
    expect(closeSim.mechs[1].damageTaken).toBe(0);

    // 3. Enhanced AMS (105m, 0.14s CD) intercepts >= 4 missiles from incoming LRM10 salvo at 350m
    const lrm10Bp = structuredClone(PRESET_ABC);
    lrm10Bp.parts.rightShoulderWeapon = 'lrm10';
    lrm10Bp.lrmFireMode = 'salvo';
    const amsDefBp = structuredClone(PRESET_ABC);
    amsDefBp.parts.leftShoulderWeapon = 'ams_ballistic';
    const amsTestSim = createSimulation({
      seed: 913,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'shooter', name: 'Shooter', teamId: 'A', blueprint: lrm10Bp },
        { id: 'defender', name: 'Defender', teamId: 'B', blueprint: amsDefBp },
      ],
    });
    amsTestSim.terrain.obstacles = [];
    amsTestSim.mechs[0].pos = { x: 600, y: 750, z: 0 };
    amsTestSim.mechs[0].yawDeg = 0;
    amsTestSim.mechs[1].pos = { x: 600, y: 400, z: 0 }; // 350m away

    for (let t = 0; t < 40; t++) {
      stepSimulation(amsTestSim, { shooter: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'defender' } });
    }
    stepSimulation(amsTestSim, {
      shooter: { ...EMPTY_CONTROL_INPUT, fireRightShoulder: true, lockTargetId: 'defender' },
    });
    let interceptedCount = 0;
    for (let t = 0; t < 120; t++) {
      stepSimulation(amsTestSim, { shooter: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'defender' } });
      interceptedCount += amsTestSim.lastTickEvents.filter((e) => e.type === 'missile_intercepted').length;
    }
    expect(interceptedCount).toBeGreaterThanOrEqual(4);
  });

  it('keeps shared arm/shoulder weapons consistent, caps single-salvo damage <= 100, and scales base cooling monotonically', () => {
    for (const armSpec of ARM_WEAPONS) {
      if (armSpec.damage <= 0 || armSpec.burstCount <= 0) continue;
      expect(armSpec.damage * armSpec.burstCount).toBeLessThanOrEqual(100);
      const shoulderSpec = SHOULDER_WEAPONS.find((w) => w.id === armSpec.id);
      if (shoulderSpec) {
        expect(shoulderSpec.damage).toBe(armSpec.damage);
        expect(shoulderSpec.cooldownSec).toBe(armSpec.cooldownSec);
        expect(shoulderSpec.heatCost).toBe(armSpec.heatCost);
        expect(shoulderSpec.range).toBe(armSpec.range);
        expect(shoulderSpec.maxRange).toBe(armSpec.maxRange);
      }
    }
    for (const shoulderSpec of SHOULDER_WEAPONS) {
      if (shoulderSpec.damage <= 0 || shoulderSpec.burstCount <= 0) continue;
      expect(shoulderSpec.damage * shoulderSpec.burstCount).toBeLessThanOrEqual(100);
    }

    for (let i = 1; i < MECH_CHASSIS_CATALOG.length; i++) {
      expect(MECH_CHASSIS_CATALOG[i].baseHeatDissipation).toBeGreaterThan(
        MECH_CHASSIS_CATALOG[i - 1].baseHeatDissipation
      );
    }
  });

  it('disperses 15% shock damage to adjacent parts on AC20/PPC hits, drifts lasers across parts, and supports legs/arms aimPoints', () => {
    // 1. Direct hitbox splash dispersion (15% split to intact adjacent parts, total damage preserved)
    const targetOnly = createSimulation({
      seed: 101,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 800, arenaDepth: 800 },
      entries: [{ id: 'tgt', name: 'Target', teamId: 'B', blueprint: structuredClone(PRESET_ABC) }],
    }).mechs[0];
    const torsoBefore = targetOnly.parts.torso.frontArmor;
    const rShdBefore = targetOnly.parts.rightShoulder.frontArmor;
    const lShdBefore = targetOnly.parts.leftShoulder.frontArmor;
    const directTorsoHit = testProjectileHitMech(
      { x: targetOnly.pos.x, y: targetOnly.pos.y - 20, z: targetOnly.pos.z + 6.7 },
      { x: targetOnly.pos.x, y: targetOnly.pos.y + 5, z: targetOnly.pos.z + 6.7 },
      targetOnly.pos,
      0,
      0,
      targetOnly.stats.sizeScale
    );
    expect(directTorsoHit?.partId).toBe('torso');
    const splashRes = applyDamageToMechParts(targetOnly, directTorsoHit!, 100, DEFAULT_MATCH_RULES, 0.15);
    expect(splashRes.appliedDamage).toBeCloseTo(100, 4);
    expect(torsoBefore - targetOnly.parts.torso.frontArmor).toBeCloseTo(85, 4);
    expect(rShdBefore - targetOnly.parts.rightShoulder.frontArmor).toBeCloseTo(7.5, 4);
    expect(lShdBefore - targetOnly.parts.leftShoulder.frontArmor).toBeCloseTo(7.5, 4);

    // 2. AC20 & PPC in live simulation trigger adjacent splash dispersion on impact
    const ac20Bp = structuredClone(PRESET_ABC);
    ac20Bp.parts.rightArmWeapon = 'ac20';
    ac20Bp.parts.leftArmWeapon = 'ppc';
    ac20Bp.parts.rightShoulderWeapon = 'shd_none';
    ac20Bp.parts.leftShoulderWeapon = 'shd_none';
    const heavySim = createSimulation({
      seed: 202,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 800, arenaDepth: 800 },
      entries: [
        { id: 'heavy', name: 'Heavy', teamId: 'A', blueprint: ac20Bp },
        { id: 'dummy', name: 'Dummy', teamId: 'B', blueprint: structuredClone(PRESET_ABC) },
      ],
    });
    heavySim.terrain.obstacles = [];
    heavySim.terrain.heightAmplitude = 0;
    heavySim.mechs[0].pos = { x: 400, y: 460, z: 0 };
    heavySim.mechs[0].yawDeg = 0;
    heavySim.mechs[1].pos = { x: 400, y: 400, z: 0 }; // 60m North
    heavySim.mechs[1].yawDeg = 180;

    stepSimulation(heavySim, {
      heavy: { ...EMPTY_CONTROL_INPUT, fireRightArm: true, lockTargetId: 'dummy' },
    });
    for (let t = 0; t < 20; t++) {
      stepSimulation(heavySim, { heavy: EMPTY_CONTROL_INPUT, dummy: EMPTY_CONTROL_INPUT });
    }
    const dParts = heavySim.mechs[1].parts;
    const damagedUpperCount = ['torso', 'rightShoulder', 'leftShoulder', 'rightArm', 'leftArm'].filter(
      (p) => {
        const ps = dParts[p as keyof typeof dParts];
        return ps.kind === 'dual'
          ? ps.frontArmor < ps.maxFrontArmor
          : ps.armor < ps.maxArmor;
      }
    ).length;
    expect(damagedUpperCount).toBeGreaterThanOrEqual(2);

    // 3. Laser burn drift spreads damage across >1 part when firing while moving/against strafing target
    const laserBp = structuredClone(PRESET_ABC);
    laserBp.parts.rightArmWeapon = 'large_laser';
    laserBp.parts.leftArmWeapon = 'arm_none';
    laserBp.parts.rightShoulderWeapon = 'shd_none';
    laserBp.parts.leftShoulderWeapon = 'shd_none';
    const driftSim = createSimulation({
      seed: 303,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1000, arenaDepth: 1000 },
      entries: [
        { id: 'las', name: 'Laser', teamId: 'A', blueprint: laserBp },
        { id: 'tgt', name: 'Target', teamId: 'B', blueprint: structuredClone(PRESET_ABC) },
      ],
    });
    driftSim.terrain.obstacles = [];
    driftSim.terrain.heightAmplitude = 0;
    driftSim.mechs[0].pos = { x: 500, y: 550, z: 0 };
    driftSim.mechs[0].yawDeg = 0;
    driftSim.mechs[1].pos = { x: 500, y: 400, z: 0 }; // 150m North
    driftSim.mechs[1].yawDeg = 180;

    const hitPartsSeen = new Set<string>();
    for (let volley = 0; volley < 3; volley++) {
      driftSim.mechs[0].weapons.rightArm.cooldownRemaining = 0;
      driftSim.mechs[0].heat = 0;
      stepSimulation(driftSim, {
        las: {
          ...EMPTY_CONTROL_INPUT,
          moveForward: 1,
          fireRightArm: true,
          lockTargetId: 'tgt',
        },
        tgt: { ...EMPTY_CONTROL_INPUT, moveForward: 1, turnYaw: 0.4 },
      });
      for (const ev of driftSim.lastTickEvents) {
        if (ev.type === 'hit' && ev.partId) hitPartsSeen.add(ev.partId);
      }
      for (let t = 0; t < 30; t++) {
        stepSimulation(driftSim, {
          las: { ...EMPTY_CONTROL_INPUT, moveForward: 1, lockTargetId: 'tgt' },
          tgt: { ...EMPTY_CONTROL_INPUT, moveForward: 1, turnYaw: 0.4 },
        });
        for (const ev of driftSim.lastTickEvents) {
          if (ev.type === 'hit' && ev.partId) hitPartsSeen.add(ev.partId);
        }
      }
    }
    expect(hitPartsSeen.size).toBeGreaterThanOrEqual(2);

    // 4. aimPoint: 'legs' hits target legs, aimPoint: 'arms' hits target arms/shoulders
    const sniperBp = structuredClone(PRESET_ABC);
    sniperBp.parts.rightArmWeapon = 'medium_laser';
    sniperBp.parts.leftArmWeapon = 'arm_none';
    sniperBp.parts.rightShoulderWeapon = 'shd_none';
    sniperBp.parts.leftShoulderWeapon = 'shd_none';
    const aimSim = createSimulation({
      seed: 404,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 800, arenaDepth: 800 },
      entries: [
        { id: 'sniper', name: 'Sniper', teamId: 'A', blueprint: sniperBp },
        { id: 'dummy', name: 'Dummy', teamId: 'B', blueprint: structuredClone(PRESET_ABC) },
      ],
    });
    aimSim.terrain.obstacles = [];
    aimSim.terrain.heightAmplitude = 0;
    aimSim.mechs[0].pos = { x: 400, y: 500, z: 0 };
    aimSim.mechs[0].yawDeg = 0;
    aimSim.mechs[1].pos = { x: 400, y: 410, z: 0 }; // 90m North
    aimSim.mechs[1].yawDeg = 180;

    stepSimulation(aimSim, {
      sniper: {
        ...EMPTY_CONTROL_INPUT,
        fireRightArm: true,
        lockTargetId: 'dummy',
        aimPoint: 'legs',
      },
    });
    const legHits: string[] = [];
    for (let t = 0; t < 25; t++) {
      for (const ev of aimSim.lastTickEvents) {
        if (ev.type === 'hit' && ev.partId) legHits.push(ev.partId);
      }
      stepSimulation(aimSim, { sniper: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'dummy' } });
    }
    expect(legHits.some((p) => p === 'rightLeg' || p === 'leftLeg')).toBe(true);

    aimSim.mechs[0].weapons.rightArm.cooldownRemaining = 0;
    aimSim.mechs[0].heat = 0;
    stepSimulation(aimSim, {
      sniper: {
        ...EMPTY_CONTROL_INPUT,
        fireRightArm: true,
        lockTargetId: 'dummy',
        aimPoint: 'arms',
      },
    });
    const armHits: string[] = [];
    for (let t = 0; t < 25; t++) {
      for (const ev of aimSim.lastTickEvents) {
        if (ev.type === 'hit' && ev.partId) armHits.push(ev.partId);
      }
      stepSimulation(aimSim, { sniper: { ...EMPTY_CONTROL_INPUT, lockTargetId: 'dummy' } });
    }
    expect(
      armHits.some(
        (p) => p === 'rightArm' || p === 'leftArm' || p === 'rightShoulder' || p === 'leftShoulder'
      )
    ).toBe(true);
  });

  it('triggers critical internal structure damage for mg_light (1/2) and lbx_shotgun (~1/3) only after armor is stripped', () => {
    const critBp = structuredClone(PRESET_ABC);
    critBp.parts.rightArmWeapon = 'mg_light';
    critBp.parts.leftArmWeapon = 'lbx_shotgun';
    critBp.parts.rightShoulderWeapon = 'shd_none';
    critBp.parts.leftShoulderWeapon = 'shd_none';

    const sim = createSimulation({
      seed: 707,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 800, arenaDepth: 800 },
      entries: [
        { id: 'critter', name: 'Critter', teamId: 'A', blueprint: critBp },
        { id: 'target', name: 'Target', teamId: 'B', blueprint: structuredClone(PRESET_ABC) },
      ],
    });
    sim.terrain.obstacles = [];
    sim.terrain.heightAmplitude = 0;
    sim.mechs[0].pos = { x: 400, y: 450, z: 0 };
    sim.mechs[0].yawDeg = 0;
    sim.mechs[1].pos = { x: 400, y: 400, z: 0 }; // 50m North
    sim.mechs[1].yawDeg = 180;

    // Phase 1: Armor intact -> no critical hits on MG / Shotgun volleys
    stepSimulation(sim, {
      critter: { ...EMPTY_CONTROL_INPUT, fireRightArm: true, fireLeftArm: true, lockTargetId: 'target' },
    });
    const intactCrits: SimCombatEvent[] = [];
    for (let t = 0; t < 18; t++) {
      stepSimulation(sim, { critter: EMPTY_CONTROL_INPUT, target: EMPTY_CONTROL_INPUT });
      intactCrits.push(
        ...sim.lastTickEvents.filter((e) => e.type === 'hit' && e.detail === 'critical')
      );
    }
    expect(intactCrits).toHaveLength(0);

    // Phase 2: Strip front armor of target upper parts -> both MG and Shotgun land boosted critical hits
    const tParts = sim.mechs[1].parts;
    tParts.torso.frontArmor = 0;
    tParts.rightShoulder.frontArmor = 0;
    tParts.leftShoulder.frontArmor = 0;
    tParts.rightArm.armor = 0;
    tParts.leftArm.armor = 0;
    tParts.head.armor = 0;
    tParts.torso.structure = 500;
    tParts.rightShoulder.structure = 500;
    tParts.leftShoulder.structure = 500;

    const critEvents: SimCombatEvent[] = [];
    for (let volley = 0; volley < 6; volley++) {
      sim.mechs[0].weapons.rightArm.cooldownRemaining = 0;
      sim.mechs[0].weapons.leftArm.cooldownRemaining = 0;
      stepSimulation(sim, {
        critter: { ...EMPTY_CONTROL_INPUT, fireRightArm: true, fireLeftArm: true, lockTargetId: 'target' },
      });
      for (let t = 0; t < 18; t++) {
        stepSimulation(sim, { critter: EMPTY_CONTROL_INPUT, target: EMPTY_CONTROL_INPUT });
        critEvents.push(
          ...sim.lastTickEvents.filter((e) => e.type === 'hit' && e.detail === 'critical')
        );
      }
    }

    const mgCrits = critEvents.filter((e) => e.weaponId === 'mg_light');
    const sgCrits = critEvents.filter((e) => e.weaponId === 'lbx_shotgun');
    expect(mgCrits.length).toBeGreaterThanOrEqual(1);
    expect(sgCrits.length).toBeGreaterThanOrEqual(1);
    expect(mgCrits.some((e) => (e.damage ?? 0) > 6)).toBe(true); // base 5 -> ~11
    expect(sgCrits.some((e) => (e.damage ?? 0) > 15)).toBe(true); // base 12 -> ~22.2
  });
});
