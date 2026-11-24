import { describe, expect, it } from 'vitest';
import { PRESET_VANGUARD, STARTER_MECHS } from '../../data/presets';
import { MechSubroutine } from '../../types/mech';
import { buildMechSensorState, createSimulation, EMPTY_CONTROL_INPUT, stepSimulation } from '../mechSim';
import { startSubroutineExec, stepSubroutineExecution } from '../subroutineRunner';

describe('subroutineRunner (6x6 & 4x4 Mech OS routines)', () => {
  it('executes 6x6 latched leg/torso movement and auto-returns on empty cell', () => {
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

    const s1 = PRESET_VANGUARD.subroutines.find((s) => s.slotId === 'S1')!;
    expect(s1.gridSize).toBe(6);

    const exec = startSubroutineExec(s1);
    const sensor = buildMechSensorState(sim, me.id);
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
    expect(exec.latchedLeg?.op).toBe('move_maintain');
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
        { id: 'enemy', name: 'Enemy', teamId: 'B', blueprint: STARTER_MECHS[1] },
      ],
    });
    sim.terrain.obstacles = [];
    const me = sim.mechs[0];
    me.pos = { x: 250, y: 250, z: 0 };
    me.yawDeg = 0;
    sim.mechs[1].pos = { x: 250, y: 120, z: 0 };

    // 1. Custom torso twist angle (positive and negative, clamped by chassis torsoTwistMaxDeg)
    const twistSub: MechSubroutine = {
      slotId: 'S4',
      name: '任意角度ツイスト',
      gridSize: 4,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'torso_twist_angle', dir: 'E', param: -42 },
        { row: 0, col: 2, op: 'wait', dir: 'S', durationSec: 0.2 },
      ],
    };
    const twistExec = startSubroutineExec(twistSub);
    const sensor = buildMechSensorState(sim, me.id);
    const ctrl1 = { ...EMPTY_CONTROL_INPUT };
    stepSubroutineExecution(twistSub, twistExec, ctrl1, sensor, me, sim, null, 1);
    expect(twistExec.latchedTorso).toEqual({ op: 'torso_twist_angle', param: -42 });
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
    stepSubroutineExecution(clampSub, clampExec, ctrl2, sensor, me, sim, null, 1);
    expect(ctrl2.torsoTwistOffsetDeg).toBe(me.stats.torsoTwistMaxDeg);

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
});
