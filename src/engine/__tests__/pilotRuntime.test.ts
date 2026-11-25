import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PILOT_PROFILE,
  PILOT_AGGRESSIVE,
  PILOT_SNIPER_TACTICIAN,
  STARTER_MECHS,
  STARTER_PILOTS,
} from '../../data/presets';
import { MatchParticipantEntry } from '../../types/mech';
import { buildMechSensorState, createSimulation, stepSimulation } from '../mechSim';
import { createPilotRuntimeState, evaluatePilotTick } from '../pilotRuntime';

function createThreeMechSim(seed = 101) {
  const sim = createSimulation({
    seed,
    rules: { arenaPreset: 'urban_pillars' },
    entries: [
      { id: 'player', name: 'Player', teamId: 'A', blueprint: STARTER_MECHS[0] },
      { id: 'frontEnemy', name: 'FrontEnemy', teamId: 'B', blueprint: STARTER_MECHS[0] },
      { id: 'flankEnemy', name: 'FlankEnemy', teamId: 'B', blueprint: STARTER_MECHS[1] },
    ],
  });
  sim.terrain.obstacles = [];

  sim.mechs[0].pos = { x: 300, y: 300, z: 0 };
  sim.mechs[0].yawDeg = 0;

  sim.mechs[1].pos = { x: 300, y: 80, z: 0 };
  sim.mechs[1].yawDeg = 180;

  sim.mechs[2].pos = { x: 410, y: 300, z: 0 };
  sim.mechs[2].yawDeg = 270;

  return sim;
}

describe('Pilot 6x6 & 5-slot Subroutine Runtime', () => {
  it('routes heat hysteresis loop (heat > 85% -> call_s4 until heat < 45%) cleanly', () => {
    const sim = createThreeMechSim();
    const player = sim.mechs[0];
    const runtime = createPilotRuntimeState(DEFAULT_PILOT_PROFILE);

    // Trigger high heat > 85%
    player.heat = player.maxHeat * 0.9;
    const out1 = evaluatePilotTick(
      DEFAULT_PILOT_PROFILE,
      runtime,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(runtime.flagA).toBe(true);
    expect(out1.activeSubroutineSlot).toBe('S4');

    // Keep cooling until activeCall finishes while heat is still 60% (>= 45%): stays in S4 loop!
    player.heat = player.maxHeat * 0.6;
    let sawRepeatS4 = false;
    for (let t = 0; t < 25; t++) {
      sim.tick += 1;
      const out = evaluatePilotTick(
        DEFAULT_PILOT_PROFILE,
        runtime,
        buildMechSensorState(sim, player.id),
        player,
        sim
      );
      if (out.activeSubroutineSlot === 'S4' && runtime.pilotCol === 2) {
        sawRepeatS4 = true;
      }
    }
    expect(sawRepeatS4).toBe(true);

    // Drop heat below 45% -> clears flagA after current S4 completes and returns to combat routing
    player.heat = player.maxHeat * 0.3;
    for (let t = 0; t < 25; t++) {
      sim.tick += 1;
      evaluatePilotTick(
        DEFAULT_PILOT_PROFILE,
        runtime,
        buildMechSensorState(sim, player.id),
        player,
        sim
      );
    }
    expect(runtime.flagA).toBe(false);
  });

  it('dispatches flank intercept (S5), sight combat (S1), and backup ammo switch (S2)', () => {
    const sim = createThreeMechSim();
    const player = sim.mechs[0];

    // 1. Flank enemy < 150m -> dispatches S5
    const rt1 = createPilotRuntimeState(DEFAULT_PILOT_PROFILE);
    const outFlank = evaluatePilotTick(
      DEFAULT_PILOT_PROFILE,
      rt1,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outFlank.activeSubroutineSlot).toBe('S5');

    // 2. Remove flanker, frontEnemy visible with ammo -> dispatches S3 (movement update) then S1 (attack)
    sim.mechs[2].pos.x = 550;
    const rt2 = createPilotRuntimeState(DEFAULT_PILOT_PROFILE);
    const outMove = evaluatePilotTick(
      DEFAULT_PILOT_PROFILE,
      rt2,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outMove.activeSubroutineSlot).toBe('S3');
    expect(rt2.latchedLeg?.op).toBe('move_approach');
    sim.tick += 1;
    const outMain = evaluatePilotTick(
      DEFAULT_PILOT_PROFILE,
      rt2,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outMain.activeSubroutineSlot).toBe('S1');

    // 3. Deplete rightArm ammo -> dispatches S3 then S2 backup weapons
    player.weapons.rightArm.ammoRemaining = 0;
    const rt3 = createPilotRuntimeState(DEFAULT_PILOT_PROFILE);
    const outMove3 = evaluatePilotTick(
      DEFAULT_PILOT_PROFILE,
      rt3,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outMove3.activeSubroutineSlot).toBe('S3');
    sim.tick += 1;
    const outBackup = evaluatePilotTick(
      DEFAULT_PILOT_PROFILE,
      rt3,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outBackup.activeSubroutineSlot).toBe('S2');
  });

  it('supports override_on on PILOT_AGGRESSIVE and runs 12-mech simultaneous battle', () => {
    const simProbe = createThreeMechSim();
    const player = simProbe.mechs[0];
    player.heat = player.maxHeat * 0.95;
    const aggRt = createPilotRuntimeState(PILOT_AGGRESSIVE);
    const outAgg = evaluatePilotTick(
      PILOT_AGGRESSIVE,
      aggRt,
      buildMechSensorState(simProbe, player.id),
      player,
      simProbe
    );
    expect(outAgg.control.overrideShutdown).toBe(true);
    expect(outAgg.activeSubroutineSlot).toBe('S5');

    // 12-mech (3 mechs x 4 teams) grid-driven battle
    const entries: MatchParticipantEntry[] = [];
    for (let t = 0; t < 4; t++) {
      for (let m = 0; m < 3; m++) {
        entries.push({
          id: `u_${t}_${m}`,
          name: `U${t}-${m}`,
          teamId: `T${t}`,
          blueprint: STARTER_MECHS[(t * 3 + m) % STARTER_MECHS.length],
          pilot: STARTER_PILOTS[(t + m) % STARTER_PILOTS.length],
        });
      }
    }

    const sim = createSimulation({ seed: 42, entries });
    const runtimes = Object.fromEntries(
      entries.map((e) => [e.id, createPilotRuntimeState(e.pilot ?? DEFAULT_PILOT_PROFILE)])
    );
    const profiles = Object.fromEntries(
      entries.map((e) => [e.id, e.pilot ?? PILOT_SNIPER_TACTICIAN])
    );

    for (let t = 0; t < 300; t++) {
      const ctrls: Record<string, ReturnType<typeof evaluatePilotTick>['control']> = {};
      for (const m of sim.mechs) {
        if (!m.alive) continue;
        const sensor = buildMechSensorState(sim, m.id);
        ctrls[m.id] = evaluatePilotTick(profiles[m.id], runtimes[m.id], sensor, m, sim).control;
      }
      stepSimulation(sim, ctrls);
      if (sim.finished) break;
    }

    expect(sim.events.some((e) => e.type === 'fire')).toBe(true);
    expect(sim.mechs.every((m) => Number.isFinite(m.pos.x) && Number.isFinite(m.heat))).toBe(true);
  });

  it('transfers the same Pilot 6x6 cleanly across different mech chassis and subroutines', () => {
    for (const bp of STARTER_MECHS) {
      const sim = createSimulation({
        seed: 77,
        rules: { arenaPreset: 'plains_ridge' },
        entries: [
          { id: 'tx', name: bp.name, teamId: 'A', blueprint: bp, pilot: DEFAULT_PILOT_PROFILE },
          { id: 'foe', name: 'Foe', teamId: 'B', blueprint: STARTER_MECHS[1], pilot: PILOT_AGGRESSIVE },
        ],
      });
      const rt = createPilotRuntimeState(DEFAULT_PILOT_PROFILE);
      for (let t = 0; t < 45; t++) {
        const m0 = sim.mechs[0];
        if (!m0.alive) break;
        const out = evaluatePilotTick(
          DEFAULT_PILOT_PROFILE,
          rt,
          buildMechSensorState(sim, 'tx'),
          m0,
          sim
        );
        stepSimulation(sim, { tx: out.control });
        expect(Number.isFinite(m0.pos.x)).toBe(true);
      }
    }
  });

  it('bypasses Pilot 6x6 and loops S1 directly in direct_4x4 (ignoring >=4 out-of-bounds cells) and direct_6x6', () => {
    // 1. direct_4x4: empty pilot + out-of-bounds cell at (0,4) must be ignored
    const bp4 = structuredClone(STARTER_MECHS[0]);
    bp4.controlTier = 'direct_4x4';
    bp4.subroutines = bp4.subroutines.map((s) =>
      s.slotId === 'S1'
        ? {
            slotId: 'S1',
            name: 'Direct 4x4',
            gridSize: 6,
            cells: [
              { row: 0, col: 0, op: 'start', dir: 'E' },
              { row: 0, col: 1, op: 'move_approach', dir: 'E' },
              { row: 0, col: 2, op: 'torso_track', dir: 'E' },
              { row: 0, col: 3, op: 'fire_group_1', dir: 'E', durationSec: 0.45 },
              // Out of 4x4 bounds -> must NOT be executed
              { row: 0, col: 4, op: 'emergency_cool', dir: 'S', durationSec: 0.8 },
            ],
          }
        : s
    );
    const emptyPilot = {
      version: 2,
      id: 'empty_pilot',
      name: 'Empty Pilot',
      grid: { gridSize: 6 as const, cells: [{ row: 0, col: 0, op: 'start' as const, dir: 'E' as const }] },
    };

    const sim4 = createThreeMechSim(123);
    sim4.mechs[0].blueprint = bp4;
    const rt4 = createPilotRuntimeState(emptyPilot);
    let sawFire = false;
    let sawCool = false;
    let sawPilotCell = false;
    for (let t = 0; t < 40; t++) {
      sim4.tick += 1;
      const out = evaluatePilotTick(
        emptyPilot,
        rt4,
        buildMechSensorState(sim4, sim4.mechs[0].id),
        sim4.mechs[0],
        sim4
      );
      if (out.activePilotCell !== null) sawPilotCell = true;
      if (out.activeSubroutineSlot === 'S1' && out.control.fireRightArm) sawFire = true;
      if (out.control.emergencyCool) sawCool = true;
      expect(out.activeSubroutineCell?.col ?? 0).toBeLessThan(4);
    }
    expect(sawPilotCell).toBe(false);
    expect(sawFire).toBe(true);
    expect(sawCool).toBe(false);

    // 2. Legacy direct_6x6 maps cleanly to direct_4x4 without breaking
    const bp6 = structuredClone(STARTER_MECHS[0]);
    bp6.controlTier = 'direct_6x6';
    const sim6 = createThreeMechSim(124);
    sim6.mechs[0].blueprint = bp6;
    const rt6 = createPilotRuntimeState(emptyPilot);
    const out6 = evaluatePilotTick(
      emptyPilot,
      rt6,
      buildMechSensorState(sim6, sim6.mechs[0].id),
      sim6.mechs[0],
      sim6
    );
    expect(out6.activePilotCell).toBeNull();
    expect(out6.activeSubroutineSlot).toBe('S1');
  });

  it('persists latchedLeg/latchedTorso across CALLs and passes ARG into useArg cells', () => {
    const bp = structuredClone(STARTER_MECHS[0]);
    bp.subroutines = [
      {
        slotId: 'S1',
        name: '攻撃のみ',
        gridSize: 4,
        cells: [
          { row: 0, col: 0, op: 'start', dir: 'E' },
          { row: 0, col: 1, op: 'fire_group_1', dir: 'S', durationSec: 0.25 },
        ],
      },
      ...bp.subroutines.filter((s) => s.slotId !== 'S1' && s.slotId !== 'S3' && s.slotId !== 'S4'),
      {
        slotId: 'S3',
        name: '間合い制御',
        gridSize: 4,
        cells: [
          { row: 0, col: 0, op: 'start', dir: 'E' },
          { row: 0, col: 1, op: 'move_circle', dir: 'E', param: 150, useArg: true, direction: 'left' },
          { row: 0, col: 2, op: 'return', dir: 'S' },
        ],
      },
      {
        slotId: 'S4',
        name: '盾ひねり',
        gridSize: 4,
        cells: [
          { row: 0, col: 0, op: 'start', dir: 'E' },
          { row: 0, col: 1, op: 'torso_twist_r', dir: 'E', param: 50, useArg: true },
          { row: 0, col: 2, op: 'wait', dir: 'S', durationSec: 0.15 },
        ],
      },
    ];

    const modularPilot = {
      version: 2 as const,
      id: 'pilot_modular',
      name: 'Modular Pilot',
      grid: {
        gridSize: 6 as const,
        cells: [
          { row: 0, col: 0, op: 'start' as const, dir: 'E' as const },
          { row: 0, col: 1, op: 'call_s3' as const, dir: 'E' as const, param: 110, durationSec: 0.3 },
          { row: 0, col: 2, op: 'call_s4' as const, dir: 'E' as const, param: 60, durationSec: 0.2 },
          { row: 0, col: 3, op: 'call_s1' as const, dir: 'S' as const, durationSec: 0.25 },
        ],
      },
    };

    const sim = createThreeMechSim(200);
    const me = sim.mechs[0];
    me.blueprint = bp;
    const rt = createPilotRuntimeState(modularPilot);

    // Tick 0: CALL S3(arg=110) updates latchedLeg and returns
    const tick0 = evaluatePilotTick(modularPilot, rt, buildMechSensorState(sim, me.id), me, sim);
    expect(tick0.activeSubroutineSlot).toBe('S3');
    expect(rt.latchedLeg).toEqual({ op: 'move_circle', param: 110, direction: 'left' });

    // Next tick: CALL S4(arg=60) has NO move_* chip, yet keeps move_circle(110, left) while twisting!
    const tick1 = evaluatePilotTick(modularPilot, rt, buildMechSensorState(sim, me.id), me, sim);
    expect(tick1.activeSubroutineSlot).toBe('S4');
    expect(rt.latchedLeg).toEqual({ op: 'move_circle', param: 110, direction: 'left' });
    expect(rt.latchedTorso).toEqual({ op: 'torso_twist_r', param: 60 });
    expect(tick1.control.moveForward).toBeGreaterThan(0);

    // Wait for S4 to finish, then verify CALL S1 inherits both move_circle and torso_twist_r
    let sawS1WithMove = false;
    for (let t = 0; t < 15; t++) {
      sim.tick += 1;
      const out = evaluatePilotTick(modularPilot, rt, buildMechSensorState(sim, me.id), me, sim);
      if (out.activeSubroutineSlot === 'S1' && out.control.moveForward > 0) {
        sawS1WithMove = true;
        break;
      }
    }
    expect(sawS1WithMove).toBe(true);
  });
});
