import { describe, expect, it } from 'vitest';
import { PRESET_VANGUARD, STARTER_MECHS } from '../../data/presets';
import { MechSubroutine } from '../../types/mech';
import { buildMechSensorState, createSimulation, EMPTY_CONTROL_INPUT, stepSimulation } from '../mechSim';
import { startSubroutineExec, stepSubroutineExecution } from '../subroutineRunner';

describe('subroutineRunner (6x6 & 4x4 Mech OS routines)', () => {
  it('executes modular 4x4 S3 movement latch + S1 attack routine and auto-returns cleanly', () => {
    const sim = createSimulation({
      seed: 10,
      entries: [
        { id: 'me', name: 'Me', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 'enemy', name: 'Enemy', teamId: 'B', blueprint: STARTER_MECHS[1] },
      ],
    });
    sim.terrain.obstacles = [];
    const me = sim.mechs[0];
    me.pos = { x: 300, y: 200, z: 0 };
    me.yawDeg = 180;
    sim.mechs[1].pos = { x: 300, y: 350, z: 0 };

    const s3 = PRESET_VANGUARD.subroutines.find((s) => s.slotId === 'S3')!;
    const s1 = PRESET_VANGUARD.subroutines.find((s) => s.slotId === 'S1')!;
    expect(s3.gridSize).toBe(4);
    expect(s1.gridSize).toBe(4);

    const sensor = buildMechSensorState(sim, me.id);
    const exec3 = startSubroutineExec(s3, false, 4, { callArg: 120 });
    const ctrlMove = { ...EMPTY_CONTROL_INPUT };
    const res3 = stepSubroutineExecution(s3, exec3, ctrlMove, sensor, me, sim, sensor.nearestEnemy, 1);
    expect(res3.completed).toBe(true);
    expect(exec3.latchedLeg?.op).toBe('move_approach');

    const exec = startSubroutineExec(s1, false, 4, {
      latchedLeg: exec3.latchedLeg,
      latchedTorso: exec3.latchedTorso,
    });
    let completed = false;
    let sawFireRightArm = false;

    for (let t = 0; t < 40; t++) {
      const ctrl = { ...EMPTY_CONTROL_INPUT };
      const res = stepSubroutineExecution(s1, exec, ctrl, sensor, me, sim, sensor.nearestEnemy, 1);
      if (ctrl.fireRightArm) sawFireRightArm = true;
      if (res.completed) {
        completed = true;
        break;
      }
    }

    expect(completed).toBe(true);
    expect(sawFireRightArm).toBe(true);
    expect(exec.latchedLeg?.op).toBe('move_approach');
    expect(exec.latchedTorso?.op).toBe('torso_track');
  });

  it('waits for waist twist alignment during fire chip and advances immediately once fired', () => {
    const sim = createSimulation({
      seed: 20,
      entries: [
        { id: 'me', name: 'Me', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 'enemy', name: 'Enemy', teamId: 'B', blueprint: STARTER_MECHS[1] },
      ],
    });
    sim.terrain.obstacles = [];
    const me = sim.mechs[0];
    me.pos = { x: 250, y: 300, z: 0 };
    me.yawDeg = 0;
    me.torsoYawOffsetDeg = -60; // Twisted 60 deg West while enemy is East (150 deg away from torso!)
    sim.mechs[1].pos = { x: 360, y: 260, z: 0 }; // NE/E (~70 deg) -> initially outside +/-45 arm arc

    const sub: MechSubroutine = {
      slotId: 'S3',
      name: 'ツイスト反撃テスト',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'fire_right_arm', dir: 'E', durationSec: 0.9 },
        { row: 0, col: 2, op: 'torso_twist_r', dir: 'E' },
        { row: 0, col: 3, op: 'wait', dir: 'S', durationSec: 0.2 },
      ],
    };

    const exec = startSubroutineExec(sub);
    let firedTick = -1;
    let twistedAfterShot = false;

    for (let t = 0; t < 45; t++) {
      const sensor = buildMechSensorState(sim, me.id);
      const ctrl = { ...EMPTY_CONTROL_INPUT };
      const target = sensor.nearestEnemy ?? sensor.nearestRadarEnemy;
      stepSubroutineExecution(sub, exec, ctrl, sensor, me, sim, target, 1);
      stepSimulation(sim, { me: ctrl, enemy: EMPTY_CONTROL_INPUT });

      if (firedTick === -1 && sim.lastTickEvents.some((e) => e.type === 'fire')) {
        firedTick = t;
      }
      if (firedTick !== -1 && exec.latchedTorso?.op === 'torso_twist_r') {
        twistedAfterShot = true;
      }
    }

    expect(firedTick).toBeGreaterThan(0);
    expect(twistedAfterShot).toBe(true);
  });

  it('evaluates if_right_armor_weaker and guards against infinite wire loops', () => {
    const sim = createSimulation({
      seed: 30,
      entries: [
        { id: 'me', name: 'Me', teamId: 'A', blueprint: PRESET_VANGUARD },
        { id: 'enemy', name: 'Enemy', teamId: 'B', blueprint: STARTER_MECHS[1] },
      ],
    });
    const me = sim.mechs[0];
    me.parts.rightShoulder.frontArmor = 10;
    me.parts.leftShoulder.frontArmor = 120;

    const armorSub: MechSubroutine = {
      slotId: 'S4',
      name: '装甲分岐',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'if_right_armor_weaker', dir: 'E', elseDir: 'S' },
        { row: 0, col: 2, op: 'torso_twist_r', dir: 'E' },
        { row: 1, col: 1, op: 'torso_twist_l', dir: 'S' },
      ],
    };

    const exec1 = startSubroutineExec(armorSub);
    const sensor = buildMechSensorState(sim, me.id);
    stepSubroutineExecution(armorSub, exec1, { ...EMPTY_CONTROL_INPUT }, sensor, me, sim, null, 1);
    expect(exec1.latchedTorso?.op).toBe('torso_twist_r');

    const loopSub: MechSubroutine = {
      slotId: 'S5',
      name: 'Loop',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'wire', dir: 'S' },
        { row: 1, col: 1, op: 'wire', dir: 'W' },
        { row: 1, col: 0, op: 'wire', dir: 'N' },
      ],
    };
    const loopExec = startSubroutineExec(loopSub);
    const res = stepSubroutineExecution(
      loopSub,
      loopExec,
      { ...EMPTY_CONTROL_INPUT },
      sensor,
      me,
      sim,
      null,
      1
    );
    expect(res.completed).toBe(true);
  });

  it('supports parameterized torso_twist_angle (clamped to chassis max) and weapon groups G1..G4', () => {
    const bp = structuredClone(PRESET_VANGUARD);
    bp.weaponGroups = {
      G1: ['rightArm', 'leftArm'],
      G2: ['rightShoulder'],
      G3: ['rightArm'],
      G4: ['leftArm'],
    };

    const sim = createSimulation({
      seed: 40,
      entries: [
        { id: 'me', name: 'Me', teamId: 'A', blueprint: bp },
        { id: 'enemy', name: 'Enemy', teamId: 'B', blueprint: STARTER_MECHS[2] }, // Fortress (400m omni RCS)
      ],
    });
    sim.terrain.obstacles = [];
    const me = sim.mechs[0];
    me.pos = { x: 250, y: 250, z: 0 };
    me.yawDeg = 0;
    sim.mechs[1].pos = { x: 250, y: 120, z: 0 };

    // 1. Threat-relative torso twist (moves perpendicular at yawDeg=90 while enemy is North bearingDeg=0 on radar)
    me.yawDeg = 90;
    const sensorThreat = buildMechSensorState(sim, me.id);
    const threatTarget = sensorThreat.nearestEnemy ?? sensorThreat.nearestRadarEnemy;
    expect(threatTarget).not.toBeNull();

    const twistSub: MechSubroutine = {
      slotId: 'S4',
      name: '敵基準ツイスト',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'torso_twist_angle', dir: 'E', param: -42 },
        { row: 0, col: 2, op: 'wait', dir: 'S', durationSec: 0.2 },
      ],
    };
    const twistExec = startSubroutineExec(twistSub);
    const ctrlThreat = { ...EMPTY_CONTROL_INPUT };
    stepSubroutineExecution(
      twistSub,
      twistExec,
      ctrlThreat,
      sensorThreat,
      me,
      sim,
      threatTarget,
      1
    );
    expect(twistExec.latchedTorso).toEqual({ op: 'torso_twist_angle', param: -42 });
    expect(ctrlThreat.torsoTargetYaw).toBeCloseTo(318, 0);

    // Explicit torso_twist_r & torso_twist_l with useArg
    const twistRightSub: MechSubroutine = {
      slotId: 'S4',
      name: '右ひねりARG',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'torso_twist_r', dir: 'E', param: 55, useArg: true },
        { row: 0, col: 2, op: 'wait', dir: 'S', durationSec: 0.2 },
      ],
    };
    const ctrlRightArg = { ...EMPTY_CONTROL_INPUT };
    stepSubroutineExecution(
      twistRightSub,
      startSubroutineExec(twistRightSub, false, 4, { callArg: 70 }),
      ctrlRightArg,
      sensorThreat,
      me,
      sim,
      threatTarget,
      1
    );
    expect(ctrlRightArg.torsoTargetYaw).toBeCloseTo(70, 0);

    // Fallback to leg-relative twist when no enemy/threat is present
    sim.mechs[1].pos = { x: 250, y: 1200, z: 0 };
    const sensorNoThreat = buildMechSensorState(sim, me.id);
    const ctrl1 = { ...EMPTY_CONTROL_INPUT };
    stepSubroutineExecution(twistSub, startSubroutineExec(twistSub), ctrl1, sensorNoThreat, me, sim, null, 1);
    expect(ctrl1.torsoTwistOffsetDeg).toBe(-42);

    const clampSub: MechSubroutine = {
      slotId: 'S4',
      name: 'クランプテスト',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'torso_twist_angle', dir: 'E', param: 135 },
        { row: 0, col: 2, op: 'wait', dir: 'S', durationSec: 0.2 },
      ],
    };
    const clampExec = startSubroutineExec(clampSub);
    const ctrl2 = { ...EMPTY_CONTROL_INPUT };
    stepSubroutineExecution(clampSub, clampExec, ctrl2, sensorNoThreat, me, sim, null, 1);
    expect(ctrl2.torsoTwistOffsetDeg).toBe(me.stats.torsoTwistMaxDeg);

    // Restore enemy position for weapon group test below
    sim.mechs[1].pos = { x: 250, y: 120, z: 0 };
    me.yawDeg = 0;
    const sensor = buildMechSensorState(sim, me.id);

    // 2. Weapon group G1 readiness check + simultaneous group fire
    const groupSub: MechSubroutine = {
      slotId: 'S5',
      name: 'G1発射',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'if_group_1_ready', dir: 'E', elseDir: 'S' },
        { row: 0, col: 2, op: 'fire_group_1', dir: 'S', durationSec: 0.4 },
      ],
    };
    const groupExec = startSubroutineExec(groupSub);
    const ctrl3 = { ...EMPTY_CONTROL_INPUT };
    stepSubroutineExecution(
      groupSub,
      groupExec,
      ctrl3,
      sensor,
      me,
      sim,
      sensor.nearestEnemy,
      1
    );
    expect(ctrl3.fireRightArm).toBe(true);
    expect(ctrl3.fireLeftArm).toBe(true);
    expect(ctrl3.fireRightShoulder).toBe(false);
  });

  it('aligns if_group_1_ready with LOS blocking and optimal-to-max extended range', () => {
    const bp = structuredClone(PRESET_VANGUARD); // G1 = rightArm (AC/5: opt 380, max 680) + leftArm (M-Laser: opt 280, max 420)
    const sim = createSimulation({
      seed: 55,
      rules: { arenaPreset: 'urban_pillars', arenaWidth: 1200, arenaDepth: 1200 },
      entries: [
        { id: 'me', name: 'Me', teamId: 'A', blueprint: bp },
        { id: 'enemy', name: 'Enemy', teamId: 'B', blueprint: STARTER_MECHS[2] }, // Fortress (400m omni RCS)
      ],
    });
    sim.terrain.obstacles = [
      { id: 'wall', x: 550, y: 490, width: 100, height: 25, baseZ: 0, topZ: 28 },
    ];
    const me = sim.mechs[0];
    const enemy = sim.mechs[1];
    me.pos = { x: 600, y: 600, z: 0 };
    me.yawDeg = 0;

    const branchSub: MechSubroutine = {
      slotId: 'S5',
      name: 'G1判定',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'if_group_1_ready', dir: 'E', elseDir: 'S' },
        { row: 0, col: 2, op: 'fire_group_1', dir: 'S', durationSec: 0.4 },
        { row: 1, col: 1, op: 'wait', dir: 'S', durationSec: 0.2 },
      ],
    };

    // 1. Blocked by wall at 200m (in omni radar, no LOS) -> false (skips fire)
    enemy.pos = { x: 600, y: 400, z: 0 };
    let sensor = buildMechSensorState(sim, me.id);
    const ctrlBlocked = { ...EMPTY_CONTROL_INPUT };
    stepSubroutineExecution(
      branchSub,
      startSubroutineExec(branchSub),
      ctrlBlocked,
      sensor,
      me,
      sim,
      sensor.nearestRadarEnemy,
      1
    );
    expect(ctrlBlocked.fireRightArm).toBe(false);

    // 2. Clear LOS in extended falloff range (450m: beyond AC/5 optimal 380m, within max 680m) -> true!
    sim.terrain.obstacles = [];
    enemy.pos = { x: 600, y: 150, z: 0 };
    sensor = buildMechSensorState(sim, me.id);
    const ctrlExtended = { ...EMPTY_CONTROL_INPUT };
    stepSubroutineExecution(
      branchSub,
      startSubroutineExec(branchSub),
      ctrlExtended,
      sensor,
      me,
      sim,
      sensor.nearestEnemy,
      1
    );
    expect(ctrlExtended.fireRightArm).toBe(true);

    // 3. Beyond maxRange (700m > 680m) -> false
    enemy.pos = { x: 600, y: -100, z: 0 };
    sensor = buildMechSensorState(sim, me.id);
    const ctrlOut = { ...EMPTY_CONTROL_INPUT };
    stepSubroutineExecution(
      branchSub,
      startSubroutineExec(branchSub),
      ctrlOut,
      sensor,
      me,
      sim,
      sensor.nearestEnemy,
      1
    );
    expect(ctrlOut.fireRightArm).toBe(false);
  });
});
