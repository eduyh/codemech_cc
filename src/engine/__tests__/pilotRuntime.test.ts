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

    // 2. Remove flanker, frontEnemy visible with ammo -> dispatches S1
    sim.mechs[2].pos.x = 550;
    const rt2 = createPilotRuntimeState(DEFAULT_PILOT_PROFILE);
    const outMain = evaluatePilotTick(
      DEFAULT_PILOT_PROFILE,
      rt2,
      buildMechSensorState(sim, player.id),
      player,
      sim
    );
    expect(outMain.activeSubroutineSlot).toBe('S1');

    // 3. Deplete rightArm ammo -> dispatches S2 backup weapons
    player.weapons.rightArm.ammoRemaining = 0;
    const rt3 = createPilotRuntimeState(DEFAULT_PILOT_PROFILE);
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
});
