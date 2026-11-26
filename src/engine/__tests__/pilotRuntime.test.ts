import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PILOT_PROFILE,
  PILOT_BASIC,
  PILOT_BASIC_HEAVY,
  PILOT_BASIC_LIGHT,
  PRESET_ABC,
  PRESET_ABH,
  PRESET_ABL,
  STARTER_MECHS,
  STARTER_PILOTS,
} from '../../data/presets';
import { MatchParticipantEntry, PilotProfile } from '../../types/mech';
import { buildMechSensorState, createSimulation, stepSimulation } from '../mechSim';
import { createPilotRuntimeState, evaluatePilotTick } from '../pilotRuntime';

function createThreeMechSim(seed = 101) {
  const sim = createSimulation({
    seed,
    rules: { arenaPreset: 'urban_pillars' },
    entries: [
      { id: 'player', name: 'Player', teamId: 'A', blueprint: PRESET_ABC },
      { id: 'frontEnemy', name: 'FrontEnemy', teamId: 'B', blueprint: PRESET_ABH },
      { id: 'flankEnemy', name: 'FlankEnemy', teamId: 'B', blueprint: PRESET_ABL },
    ],
  });
  sim.terrain.obstacles = [];

  sim.mechs[0].pos = { x: 300, y: 300, z: 0 };
  sim.mechs[0].yawDeg = 0;

  sim.mechs[1].pos = { x: 300, y: 80, z: 0 };
  sim.mechs[1].yawDeg = 180;

  sim.mechs[2].pos = { x: 350, y: 300, z: 0 };
  sim.mechs[2].yawDeg = 270;

  return sim;
}

describe('Pilot 6x6 & 5-slot Subroutine Runtime', () => {
  it('routes heat hysteresis loop (heat > 80% -> call_s4 until heat < 45%) cleanly', () => {
    const sim = createThreeMechSim();
    const player = sim.mechs[0];
    const runtime = createPilotRuntimeState(PILOT_BASIC);

    // Trigger high heat > 80%
    player.heat = player.maxHeat * 0.85;
    const out1 = evaluatePilotTick(
      PILOT_BASIC,
      runtime,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(out1.activeSubroutineSlot).toBe('S4');

    // Keep cooling until activeCall finishes while heat is still 60% (>= 45%): loops back to S4
    player.heat = player.maxHeat * 0.6;
    let sawRepeatS4 = false;
    for (let t = 0; t < 25; t++) {
      sim.tick += 1;
      const out = evaluatePilotTick(
        PILOT_BASIC,
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

    // Drop heat below 45% -> exits cooling loop and dispatches combat routine
    player.heat = player.maxHeat * 0.3;
    let exitedCoolLoop = false;
    for (let t = 0; t < 25; t++) {
      sim.tick += 1;
      const out = evaluatePilotTick(
        PILOT_BASIC,
        runtime,
        buildMechSensorState(sim, player.id),
        player,
        sim
      );
      if (out.activeSubroutineSlot !== 'S4') {
        exitedCoolLoop = true;
        break;
      }
    }
    expect(exitedCoolLoop).toBe(true);
  });

  it('dispatches close intercept (S5), sight combat (S3+S1), and radar indirect LRM (S3+S2)', () => {
    const sim = createThreeMechSim();
    const player = sim.mechs[0];

    // 1. Visible enemy < 120m -> dispatches S5
    sim.mechs[1].pos = { x: 300, y: 210, z: 0 };
    const rt1 = createPilotRuntimeState(PILOT_BASIC);
    const outClose = evaluatePilotTick(
      PILOT_BASIC,
      rt1,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outClose.activeSubroutineSlot).toBe('S5');

    // 2. Restore frontEnemy to 220m North and move flanker far away -> dispatches S3 (movement) then S1 (attack)
    sim.mechs[1].pos = { x: 300, y: 80, z: 0 };
    sim.mechs[2].pos.x = 1200;
    const rt2 = createPilotRuntimeState(PILOT_BASIC);
    const outMove = evaluatePilotTick(
      PILOT_BASIC,
      rt2,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outMove.activeSubroutineSlot).toBe('S3');
    expect(rt2.latchedLeg?.op).toBe('move_approach');
    sim.tick += 1;
    const outMain = evaluatePilotTick(
      PILOT_BASIC,
      rt2,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outMain.activeSubroutineSlot).toBe('S1');

    // 3. Turn away (enemy out of sight, still on radar) -> dispatches S3 then S2 LRM
    player.yawDeg = 180;
    const rt3 = createPilotRuntimeState(PILOT_BASIC);
    const outMove3 = evaluatePilotTick(
      PILOT_BASIC,
      rt3,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outMove3.activeSubroutineSlot).toBe('S3');
    sim.tick += 1;
    const outRadar = evaluatePilotTick(
      PILOT_BASIC,
      rt3,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outRadar.activeSubroutineSlot).toBe('S2');
  });

  it('dispatches class-specific routines for PILOT_BASIC_LIGHT and PILOT_BASIC_HEAVY', () => {
    const sim = createThreeMechSim(150);
    const light = sim.mechs[2]; // ABL (Team B)
    light.heat = 0;
    sim.mechs[0].pos = { x: 350, y: 120, z: 0 }; // Team A enemy 180m North in sight (>= 120m)
    light.yawDeg = 0;
    const lightRt = createPilotRuntimeState(PILOT_BASIC_LIGHT);
    const lightMove = evaluatePilotTick(
      PILOT_BASIC_LIGHT,
      lightRt,
      buildMechSensorState(sim, light.id),
      light,
      sim
    );
    expect(lightMove.activeSubroutineSlot).toBe('S3');
    expect(lightRt.latchedLeg?.op).toBe('move_circle');

    // Heavy pilot reacts to incoming fire with S5 shield twist
    const heavy = sim.mechs[1];
    heavy.lastHitTick = sim.tick;
    heavy.lastHitRelBearingDeg = 0;
    const heavyRt = createPilotRuntimeState(PILOT_BASIC_HEAVY);
    const heavyOut = evaluatePilotTick(
      PILOT_BASIC_HEAVY,
      heavyRt,
      buildMechSensorState(sim, heavy.id),
      heavy,
      sim
    );
    expect(heavyOut.activeSubroutineSlot).toBe('S5');
  });

  it('supports override_on on pilot grid and runs 12-mech simultaneous battle', () => {
    const simProbe = createThreeMechSim();
    const player = simProbe.mechs[0];
    player.heat = player.maxHeat * 0.95;
    const overridePilot: PilotProfile = {
      version: 2,
      id: 'pilot_override_test',
      name: 'Override Test',
      grid: {
        gridSize: 6,
        cells: [
          { row: 0, col: 0, op: 'start', dir: 'S' },
          { row: 1, col: 0, op: 'override_on', dir: 'E' },
          { row: 1, col: 1, op: 'call_s5', dir: 'E', target: 'nearest', durationSec: 0.5 },
        ],
      },
    };
    const aggRt = createPilotRuntimeState(overridePilot);
    const outAgg = evaluatePilotTick(
      overridePilot,
      aggRt,
      buildMechSensorState(simProbe, player.id),
      player,
      simProbe
    );
    expect(outAgg.control.overrideShutdown).toBe(true);
    expect(outAgg.activeSubroutineSlot).toBe('S5');

    // 12-mech (3 mechs x 4 teams) grid-driven battle using only ABC/ABL/ABH and basic pilots
    const entries: MatchParticipantEntry[] = [];
    for (let t = 0; t < 4; t++) {
      for (let m = 0; m < 3; m++) {
        const bp = STARTER_MECHS[(t * 3 + m) % STARTER_MECHS.length];
        const pilot = STARTER_PILOTS.find((p) => p.id === bp.defaultPilotId) ?? DEFAULT_PILOT_PROFILE;
        entries.push({
          id: `u_${t}_${m}`,
          name: `U${t}-${m}`,
          teamId: `T${t}`,
          blueprint: bp,
          pilot,
        });
      }
    }

    const sim = createSimulation({ seed: 42, entries });
    const runtimes = Object.fromEntries(
      entries.map((e) => [e.id, createPilotRuntimeState(e.pilot ?? DEFAULT_PILOT_PROFILE)])
    );
    const profiles = Object.fromEntries(
      entries.map((e) => [e.id, e.pilot ?? DEFAULT_PILOT_PROFILE])
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
          { id: 'foe', name: 'Foe', teamId: 'B', blueprint: STARTER_MECHS[1], pilot: PILOT_BASIC_LIGHT },
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
    const bp4 = structuredClone(PRESET_ABC);
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
      if (out.activeSubroutineSlot === 'S1' && out.control.fireRightShoulder) sawFire = true;
      if (out.control.emergencyCool) sawCool = true;
      expect(out.activeSubroutineCell?.col ?? 0).toBeLessThan(4);
    }
    expect(sawPilotCell).toBe(false);
    expect(sawFire).toBe(true);
    expect(sawCool).toBe(false);

    const bp6 = structuredClone(PRESET_ABC);
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
    const bp = structuredClone(PRESET_ABC);
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

    const tick0 = evaluatePilotTick(modularPilot, rt, buildMechSensorState(sim, me.id), me, sim);
    expect(tick0.activeSubroutineSlot).toBe('S3');
    expect(rt.latchedLeg).toEqual({ op: 'move_circle', param: 110, direction: 'left' });

    const tick1 = evaluatePilotTick(modularPilot, rt, buildMechSensorState(sim, me.id), me, sim);
    expect(tick1.activeSubroutineSlot).toBe('S4');
    expect(rt.latchedLeg).toEqual({ op: 'move_circle', param: 110, direction: 'left' });
    expect(rt.latchedTorso).toEqual({ op: 'torso_twist_r', param: 60 });
    expect(tick1.control.moveForward).toBeGreaterThan(0);

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
