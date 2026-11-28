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
  validateTeamTonnageRules,
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

  it('enforces 180t cap on manual teams while allowing 1.35x (243t) on random squads', () => {
    const heavyMech = STARTER_MECHS[2]; // 75t
    const midMech = STARTER_MECHS[0]; // 55t
    const makeMember = (id: string, mech: typeof heavyMech, teamTag: string, isRandomGenerated = false): BattlefieldRosterEntry => ({
      id,
      mech: structuredClone(mech),
      pilot: structuredClone(STARTER_PILOTS[0]),
      teamTag,
      battleOnly: false,
      sourceLabel: 'test',
      isRandomGenerated,
    });

    // Manual 75+75+55 = 205t > 180t -> violation
    const manualOver = [
      makeMember('a1', heavyMech, 'OverManual', false),
      makeMember('a2', heavyMech, 'OverManual', false),
      makeMember('a3', midMech, 'OverManual', false),
    ];
    // Random 75+75+75 = 225t <= 243t (180 * 1.35) -> allowed
    const randomOk = [
      makeMember('r1', heavyMech, 'RandomOk', true),
      makeMember('r2', heavyMech, 'RandomOk', true),
      makeMember('r3', heavyMech, 'RandomOk', true),
    ];
    const teams = groupRosterIntoTeams([...manualOver, ...randomOk], 'team_match', 3);
    const res = validateTeamTonnageRules(teams, {
      ...DEFAULT_BATTLEFIELD_RULE,
      maxTeamTonnage: 180,
      randomTeamTonnageMultiplier: 1.35,
    });
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].teamName).toBe('OverManual');
    expect(res.violations[0].overBy).toBe(25);
  });

  it('automatically splits and deduplicates colliding team tags by UUID, author, or sequence', () => {
    const makeEntry = (
      id: string,
      teamTag: string,
      authorName: string,
      authorId?: string
    ): BattlefieldRosterEntry => ({
      id,
      mech: {
        ...structuredClone(STARTER_MECHS[0]),
        authorName,
        ...(authorId ? { authorId } : {}),
      },
      pilot: structuredClone(STARTER_PILOTS[0]),
      teamTag,
      battleOnly: false,
      sourceLabel: 'test',
    });

    // Case A: Two different default "Commander" users (different UUIDs) share the same tag -> splits cleanly by short UUID
    const byUuidRoster = [
      makeEntry('c1', '第1小隊', 'Commander', 'aaaa1111-0000-4000-8000-000000000001'),
      makeEntry('c2', '第1小隊', 'Commander', 'aaaa1111-0000-4000-8000-000000000001'),
      makeEntry('c3', '第1小隊', 'Commander', 'aaaa1111-0000-4000-8000-000000000001'),
      makeEntry('d1', '第1小隊', 'Commander', 'bbbb2222-0000-4000-8000-000000000002'),
      makeEntry('d2', '第1小隊', 'Commander', 'bbbb2222-0000-4000-8000-000000000002'),
      makeEntry('d3', '第1小隊', 'Commander', 'bbbb2222-0000-4000-8000-000000000002'),
    ];
    const splitByUuid = groupRosterIntoTeams(byUuidRoster, 'team_match', 3);
    expect(splitByUuid).toHaveLength(2);
    expect(splitByUuid.map((t) => t.teamName)).toEqual(['第1小隊-AAAA', '第1小隊-BBBB']);

    // Case B: 2 distinct authors without UUID both submitted with colliding tag "第1小隊" -> splits into 2 teams
    const byAuthorRoster = [
      makeEntry('a1', '第1小隊', 'Alpha'),
      makeEntry('a2', '第1小隊', 'Alpha'),
      makeEntry('a3', '第1小隊', 'Alpha'),
      makeEntry('b1', '第1小隊', 'Bravo'),
      makeEntry('b2', '第1小隊', 'Bravo'),
      makeEntry('b3', '第1小隊', 'Bravo'),
    ];
    const splitByAuthor = groupRosterIntoTeams(byAuthorRoster, 'team_match', 3);
    expect(splitByAuthor).toHaveLength(2);
    expect(splitByAuthor.map((t) => t.teamName)).toEqual(['第1小隊-Alpha', '第1小隊-Bravo']);
    expect(splitByAuthor.every((t) => t.members.length === 3)).toBe(true);

    // Case C: colliding tag without distinct authors or UUIDs -> splits numerically by teamUnitSize
    const anonymousRoster = Array.from({ length: 6 }, (_, i) =>
      makeEntry(`x${i}`, '共通小隊', 'CodeMech Official')
    );
    const splitNum = groupRosterIntoTeams(anonymousRoster, 'team_match', 3);
    expect(splitNum).toHaveLength(2);
    expect(splitNum.map((t) => t.teamName)).toEqual(['共通小隊-1', '共通小隊-2']);
  });
});
