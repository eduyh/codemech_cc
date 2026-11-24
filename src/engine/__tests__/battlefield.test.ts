import { describe, expect, it } from 'vitest';
import { STARTER_MECHS, STARTER_PILOTS } from '../../data/presets';
import {
  BattlefieldRosterEntry,
  buildBattleCommentary,
  createSimFromReplay,
  groupRosterIntoTeams,
  runHeadlessBattlefieldMatch,
  runShortLeague,
  runTournament,
} from '../battlefield';
import { buildMechSensorState, createSimulation, stepSimulation } from '../mechSim';
import { evaluatePilotTick } from '../pilotRuntime';
import {
  DEFAULT_BATTLEFIELD_RULE,
  decodeReplayCode,
  decodeRuleCode,
  deduplicateExtractedCandidates,
  encodeReplayCode,
  encodeRuleCode,
  extractMechCodesFromText,
  formatMechSubmissionText,
} from '../../utils/shareMech';

function makeRoster(count: number): BattlefieldRosterEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r_${i}`,
    mech: { ...structuredClone(STARTER_MECHS[i % STARTER_MECHS.length]), name: `M-${i + 1}`, authorName: `User${i}` },
    pilot: structuredClone(STARTER_PILOTS[i % STARTER_PILOTS.length]),
    teamTag: `Team${(i % 4) + 1}`,
    battleOnly: i % 2 === 1,
    sourceLabel: 'test',
  }));
}

describe('battlefield tournament, short league, commentary & E2E closed-network replay', () => {
  it('completes full closed-network flow (CMR1- -> 12 mechs chat log -> match -> CMW1- -> exact replay)', () => {
    // 1. Distribute rule via CMR1-
    const ruleCode = encodeRuleCode({
      title: '期末大会テスト',
      rule: {
        ...DEFAULT_BATTLEFIELD_RULE,
        format: 'team_match',
        arenaPreset: 'plains_ridge',
        maxSeconds: 20,
        teamUnitSize: 3,
      },
    });
    const { rule } = decodeRuleCode(ruleCode);

    // 2. Collect 12 mech submissions (mix of CMM1- and CMM1B-) from chat log
    const rawRoster = makeRoster(12);
    const chatLog = rawRoster
      .map((entry) =>
        formatMechSubmissionText({
          mech: entry.mech,
          pilot: entry.pilot,
          battleOnly: entry.battleOnly,
          teamTag: entry.teamTag,
        })
      )
      .join('\n\n');

    const extracted = extractMechCodesFromText(chatLog);
    expect(extracted.warnings).toEqual([]);
    const deduped = deduplicateExtractedCandidates(extracted.candidates, 'latest');
    expect(deduped).toHaveLength(12);

    const roster: BattlefieldRosterEntry[] = deduped.map((c, idx) => ({
      id: `sub_${idx}`,
      mech: c.mech,
      pilot: c.pilot,
      teamTag: c.teamTag,
      battleOnly: c.battleOnly,
      sourceLabel: 'chat',
    }));

    const teams = groupRosterIntoTeams(roster, rule.format, rule.teamUnitSize);
    expect(teams).toHaveLength(4);
    expect(teams.every((t) => t.members.length === 3)).toBe(true);

    // 3. Run match & encode CMW1- replay
    const { finalState, summary } = runHeadlessBattlefieldMatch(teams, rule, 20261124, '12機団体戦');
    expect(summary.summaryText).toContain('勝者:');
    expect(summary.totalTicks).toBeGreaterThan(0);

    const replayCode = encodeReplayCode(summary.replay);
    const decodedReplay = decodeReplayCode(replayCode);

    // 4. Re-simulate from decoded replay and assert bit-exact match state
    const { sim, pilotProfiles, pilotRuntimes } = createSimFromReplay(decodedReplay);
    for (let t = 0; t < summary.totalTicks; t++) {
      const ctrls: Record<string, ReturnType<typeof evaluatePilotTick>['control']> = {};
      for (const m of sim.mechs) {
        if (!m.alive) continue;
        const sensor = buildMechSensorState(sim, m.id);
        ctrls[m.id] = evaluatePilotTick(pilotProfiles[m.id], pilotRuntimes[m.id], sensor, m, sim).control;
      }
      stepSimulation(sim, ctrls);
    }

    expect(sim.tick).toBe(finalState.tick);
    expect(sim.winnerTeamId).toBe(finalState.winnerTeamId);
    expect(sim.mechs.map((m) => ({ pos: m.pos, parts: m.parts }))).toEqual(
      finalState.mechs.map((m) => ({ pos: m.pos, parts: m.parts }))
    );
  });

  it('runs single-elimination tournament and short league across 4 teams', () => {
    const roster = makeRoster(8);
    const teams = groupRosterIntoTeams(roster, 'tournament', 2);
    expect(teams).toHaveLength(4);

    const shortRule = { ...DEFAULT_BATTLEFIELD_RULE, maxSeconds: 12, leagueMaxRounds: 3 };
    const tourney = runTournament(teams, shortRule, 500);
    expect(tourney.rounds).toHaveLength(2);
    expect(tourney.rounds[0]).toHaveLength(2);
    expect(tourney.rounds[1]).toHaveLength(1);
    expect(tourney.championTeamName).toBeTruthy();

    const league = runShortLeague(teams, { ...shortRule, format: 'short_league' }, 500);
    expect(league.matches).toHaveLength(6); // 4 teams * 3 rounds / 2 = 6 matches
    expect(league.standings).toHaveLength(4);
    expect(league.standings[0].points).toBeGreaterThanOrEqual(league.standings[1].points);
  });

  it('reports heat_meltdown explicitly in battle commentary', () => {
    const sim = createSimulation({
      seed: 77,
      entries: [
        { id: 'm1', name: '過熱テスト機', teamId: 'T1', blueprint: STARTER_MECHS[0] },
        { id: 'm2', name: '標的機', teamId: 'T2', blueprint: STARTER_MECHS[1] },
      ],
    });
    sim.events.push({
      tick: 90,
      type: 'mech_destroyed',
      actorId: 'm1',
      targetId: 'm1',
      pos: { x: 0, y: 0, z: 0 },
      detail: 'heat_meltdown',
    });
    const commentary = buildBattleCommentary(sim, { T1: 'T1', T2: 'T2' });
    expect(commentary.highlights.some((h) => h.includes('熱融解'))).toBe(true);
    expect(commentary.highlights.some((h) => h.includes('コア撃破'))).toBe(false);
  });
});
