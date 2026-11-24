import {
  MAX_MECHS,
  MatchParticipantEntry,
  MechBlueprint,
  PilotProfile,
  SIM_TPS,
  SimState,
} from '../types/mech';
import type {
  BattlefieldFormat,
  BattlefieldRuleConfig,
  ReplayPackageData,
} from '../utils/shareMech';
import { deriveEntityRngSeed, normalizeMatchSeed } from './math';
import { buildMechSensorState, createSimulation, stepSimulation } from './mechSim';
import {
  PilotRuntimeState,
  createPilotRuntimeState,
  evaluatePilotTick,
} from './pilotRuntime';
import { computeRecommendedArenaSize } from './terrain';

export interface BattlefieldRosterEntry {
  id: string;
  mech: MechBlueprint;
  pilot: PilotProfile;
  teamTag: string;
  battleOnly: boolean;
  sourceLabel: string;
}

export interface BattlefieldTeamUnit {
  teamId: string;
  teamName: string;
  members: BattlefieldRosterEntry[];
}

export interface BattlefieldTeamStat {
  teamId: string;
  teamName: string;
  aliveCount: number;
  totalCount: number;
  damageDealt: number;
  kills: number;
}

export interface BattlefieldMatchSummary {
  id: string;
  label: string;
  seed: number;
  winnerTeamId: string;
  winnerTeamName: string;
  durationSec: number;
  totalTicks: number;
  highlights: string[];
  summaryText: string;
  replay: ReplayPackageData;
  teamStats: BattlefieldTeamStat[];
}

export interface LeagueStandingRow {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  kills: number;
  damageDealt: number;
}

const PART_JA: Record<string, string> = {
  head: '頭部',
  torso: '中央胴',
  rightShoulder: '右胴',
  leftShoulder: '左胴',
  rightArm: '右腕',
  leftArm: '左腕',
  rightLeg: '右脚',
  leftLeg: '左脚',
};

export function groupRosterIntoTeams(
  roster: BattlefieldRosterEntry[],
  format: BattlefieldFormat,
  teamUnitSize: number
): BattlefieldTeamUnit[] {
  const capped = roster.slice(0, MAX_MECHS);
  if (capped.length === 0) return [];

  if (format === 'battle_royale') {
    return capped.map((entry, idx) => ({
      teamId: `T${idx + 1}`,
      teamName: entry.mech.name,
      members: [entry],
    }));
  }

  const tagged = new Map<string, BattlefieldRosterEntry[]>();
  const untagged: BattlefieldRosterEntry[] = [];

  for (const entry of capped) {
    const tag = entry.teamTag.trim();
    if (tag) {
      if (!tagged.has(tag)) tagged.set(tag, []);
      tagged.get(tag)!.push(entry);
    } else {
      untagged.push(entry);
    }
  }

  const teams: BattlefieldTeamUnit[] = [];
  let teamIdx = 1;

  for (const [tag, members] of tagged.entries()) {
    teams.push({
      teamId: `T${teamIdx}`,
      teamName: tag,
      members,
    });
    teamIdx += 1;
  }

  const size = Math.max(1, teamUnitSize);
  for (let i = 0; i < untagged.length; i += size) {
    const chunk = untagged.slice(i, i + size);
    teams.push({
      teamId: `T${teamIdx}`,
      teamName: `第${teamIdx}小隊`,
      members: chunk,
    });
    teamIdx += 1;
  }

  return teams;
}

export function buildBattleCommentary(
  sim: SimState,
  teamNameById: Record<string, string>
): { highlights: string[]; summaryText: string } {
  const highlights: string[] = [];
  const nameById = Object.fromEntries(sim.mechs.map((m) => [m.id, m.name]));

  let ricochetCount = 0;
  let overheatCount = 0;

  for (const ev of sim.events) {
    if (ev.type === 'ricochet') {
      ricochetCount += 1;
    } else if (ev.type === 'en_overheat') {
      overheatCount += 1;
    } else if (ev.type === 'part_destroyed' && ev.partId && highlights.length < 8) {
      const tgt = nameById[ev.targetId ?? ''] ?? ev.targetId ?? '';
      highlights.push(
        `[${(ev.tick / SIM_TPS).toFixed(1)}s] ${tgt} の${PART_JA[ev.partId] ?? ev.partId}が破壊！`
      );
    } else if (ev.type === 'mech_destroyed') {
      const atk = nameById[ev.actorId] ?? '戦場ダメージ';
      const tgt = nameById[ev.targetId ?? ''] ?? '';
      if (ev.detail === 'heat_meltdown') {
        highlights.push(`[${(ev.tick / SIM_TPS).toFixed(1)}s] ${tgt} が過熱により熱融解（自壊）`);
      } else {
        const reason = ev.detail === 'head_destroyed' ? '頭部貫通' : 'コア撃破';
        highlights.push(
          `[${(ev.tick / SIM_TPS).toFixed(1)}s] ${atk} が ${tgt} を撃破（${reason}）`
        );
      }
    }
  }

  if (ricochetCount > 0) {
    highlights.push(`傾斜装甲による跳弾が計 ${ricochetCount} 回発生`);
  }
  if (overheatCount > 0) {
    highlights.push(`熱シャットダウンが計 ${overheatCount} 回発生`);
  }

  const mvp = sim.mechs
    .slice()
    .sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt)[0];

  const winnerLabel =
    sim.winnerTeamId && sim.winnerTeamId !== 'draw'
      ? teamNameById[sim.winnerTeamId] ?? sim.winnerTeamId
      : '引き分け';

  const mvpLine = mvp
    ? ` / 最多戦果: ${mvp.name} (${mvp.kills}撃破・与ダメ ${Math.round(mvp.damageDealt)})`
    : '';
  const summaryText = `試合時間 ${sim.time.toFixed(1)}秒 (${sim.tick} Tick) — 勝者: ${winnerLabel}${mvpLine}`;

  return {
    highlights: highlights.slice(0, 12),
    summaryText,
  };
}

export function createSimFromReplay(replay: ReplayPackageData): {
  sim: SimState;
  pilotProfiles: Record<string, PilotProfile>;
  pilotRuntimes: Record<string, PilotRuntimeState>;
} {
  const entries: MatchParticipantEntry[] = replay.participants.slice(0, MAX_MECHS).map((p) => ({
    id: p.id,
    name: p.name,
    teamId: p.teamId,
    blueprint: p.mech,
    pilot: p.pilot,
  }));

  const sim = createSimulation({
    seed: replay.matchSeed,
    rules: replay.rules,
    entries,
  });

  const pilotProfiles: Record<string, PilotProfile> = {};
  const pilotRuntimes: Record<string, PilotRuntimeState> = {};
  for (const p of replay.participants.slice(0, MAX_MECHS)) {
    pilotProfiles[p.id] = p.pilot;
    pilotRuntimes[p.id] = createPilotRuntimeState(p.pilot);
  }

  return { sim, pilotProfiles, pilotRuntimes };
}

export function runHeadlessBattlefieldMatch(
  teams: BattlefieldTeamUnit[],
  rule: BattlefieldRuleConfig,
  seed: number,
  matchLabel = '模擬試合'
): { finalState: SimState; summary: BattlefieldMatchSummary } {
  const normalizedSeed = normalizeMatchSeed(seed);
  const participants: ReplayPackageData['participants'] = [];
  const teamNameById: Record<string, string> = {};

  for (const team of teams) {
    teamNameById[team.teamId] = team.teamName;
    for (let mIdx = 0; mIdx < team.members.length; mIdx++) {
      if (participants.length >= MAX_MECHS) break;
      const member = team.members[mIdx];
      participants.push({
        id: `${team.teamId}_${mIdx}_${member.id}`,
        name: member.mech.name,
        teamId: team.teamId,
        mech: member.mech,
        pilot: member.pilot,
        battleOnly: member.battleOnly || undefined,
      });
    }
  }

  const arenaSize = computeRecommendedArenaSize(participants.length);
  const replay: ReplayPackageData = {
    title: matchLabel,
    recordedAt: new Date().toISOString(),
    matchSeed: normalizedSeed,
    rules: {
      maxSeconds: rule.maxSeconds,
      friendlyFire: rule.friendlyFire,
      headDestructionKills: rule.headDestructionKills,
      arenaPreset: rule.arenaPreset,
      arenaWidth: arenaSize,
      arenaDepth: arenaSize,
    },
    participants,
  };

  const { sim, pilotProfiles, pilotRuntimes } = createSimFromReplay(replay);
  const maxTicks = Math.ceil(rule.maxSeconds * SIM_TPS) + 5;

  for (let t = 0; t < maxTicks && !sim.finished; t++) {
    const controls: Record<string, ReturnType<typeof evaluatePilotTick>['control']> = {};
    for (const mech of sim.mechs) {
      if (!mech.alive) continue;
      const sensor = buildMechSensorState(sim, mech.id);
      const out = evaluatePilotTick(
        pilotProfiles[mech.id],
        pilotRuntimes[mech.id],
        sensor,
        mech,
        sim
      );
      controls[mech.id] = out.control;
    }
    stepSimulation(sim, controls);
  }

  const teamStats: BattlefieldTeamStat[] = teams.map((team) => {
    const teamMechs = sim.mechs.filter((m) => m.teamId === team.teamId);
    return {
      teamId: team.teamId,
      teamName: team.teamName,
      aliveCount: teamMechs.filter((m) => m.alive).length,
      totalCount: teamMechs.length,
      damageDealt: teamMechs.reduce((acc, m) => acc + m.damageDealt, 0),
      kills: teamMechs.reduce((acc, m) => acc + m.kills, 0),
    };
  });

  const winnerTeamId = sim.winnerTeamId ?? 'draw';
  const winnerTeamName =
    winnerTeamId !== 'draw' ? teamNameById[winnerTeamId] ?? winnerTeamId : '引き分け';

  const commentary = buildBattleCommentary(sim, teamNameById);

  return {
    finalState: sim,
    summary: {
      id: `match_${normalizedSeed}_${participants.length}`,
      label: matchLabel,
      seed: normalizedSeed,
      winnerTeamId,
      winnerTeamName,
      durationSec: sim.time,
      totalTicks: sim.tick,
      highlights: commentary.highlights,
      summaryText: commentary.summaryText,
      replay,
      teamStats,
    },
  };
}

export function runTournament(
  teams: BattlefieldTeamUnit[],
  rule: BattlefieldRuleConfig,
  baseSeed: number
): { rounds: BattlefieldMatchSummary[][]; championTeamName: string } {
  if (teams.length === 0) return { rounds: [], championTeamName: '-' };
  if (teams.length === 1) return { rounds: [], championTeamName: teams[0].teamName };

  const rounds: BattlefieldMatchSummary[][] = [];
  let current = teams.slice();
  let roundIdx = 0;

  while (current.length > 1) {
    const roundMatches: BattlefieldMatchSummary[] = [];
    const winners: BattlefieldTeamUnit[] = [];

    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 >= current.length) {
        winners.push(current[i]);
        continue;
      }
      const a = current[i];
      const b = current[i + 1];
      const matchSeed = deriveEntityRngSeed(baseSeed, roundIdx * 100 + i);
      const { summary } = runHeadlessBattlefieldMatch(
        [a, b],
        rule,
        matchSeed,
        `R${roundIdx + 1}: ${a.teamName} vs ${b.teamName}`
      );
      roundMatches.push(summary);

      if (summary.winnerTeamId === b.teamId) {
        winners.push(b);
      } else if (summary.winnerTeamId === a.teamId) {
        winners.push(a);
      } else {
        // Tie-breaker on draw: higher damage dealt, else team A
        const statA = summary.teamStats.find((s) => s.teamId === a.teamId);
        const statB = summary.teamStats.find((s) => s.teamId === b.teamId);
        winners.push((statB?.damageDealt ?? 0) > (statA?.damageDealt ?? 0) ? b : a);
      }
    }

    rounds.push(roundMatches);
    current = winners;
    roundIdx += 1;
  }

  return {
    rounds,
    championTeamName: current[0]?.teamName ?? '-',
  };
}

export function runShortLeague(
  teams: BattlefieldTeamUnit[],
  rule: BattlefieldRuleConfig,
  baseSeed: number
): { matches: BattlefieldMatchSummary[]; standings: LeagueStandingRow[] } {
  const standingsMap = new Map<string, LeagueStandingRow>(
    teams.map((t) => [
      t.teamId,
      {
        teamId: t.teamId,
        teamName: t.teamName,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        kills: 0,
        damageDealt: 0,
      },
    ])
  );

  // Build round-robin schedule using circle method
  const list = teams.slice();
  const hasBye = list.length % 2 === 1;
  if (hasBye) {
    list.push({ teamId: '__BYE__', teamName: 'BYE', members: [] });
  }

  const totalRounds = Math.min(rule.leagueMaxRounds, Math.max(0, list.length - 1));
  const matches: BattlefieldMatchSummary[] = [];

  for (let r = 0; r < totalRounds; r++) {
    for (let i = 0; i < list.length / 2; i++) {
      const a = list[i];
      const b = list[list.length - 1 - i];
      if (a.teamId === '__BYE__' || b.teamId === '__BYE__') continue;

      const matchSeed = deriveEntityRngSeed(baseSeed, r * 100 + i);
      const { summary } = runHeadlessBattlefieldMatch(
        [a, b],
        rule,
        matchSeed,
        `節${r + 1}: ${a.teamName} vs ${b.teamName}`
      );
      matches.push(summary);

      const rowA = standingsMap.get(a.teamId)!;
      const rowB = standingsMap.get(b.teamId)!;
      const statA = summary.teamStats.find((s) => s.teamId === a.teamId);
      const statB = summary.teamStats.find((s) => s.teamId === b.teamId);

      rowA.played += 1;
      rowB.played += 1;
      rowA.kills += statA?.kills ?? 0;
      rowB.kills += statB?.kills ?? 0;
      rowA.damageDealt += statA?.damageDealt ?? 0;
      rowB.damageDealt += statB?.damageDealt ?? 0;

      if (summary.winnerTeamId === a.teamId) {
        rowA.wins += 1;
        rowA.points += 3;
        rowB.losses += 1;
      } else if (summary.winnerTeamId === b.teamId) {
        rowB.wins += 1;
        rowB.points += 3;
        rowA.losses += 1;
      } else {
        rowA.draws += 1;
        rowB.draws += 1;
        rowA.points += 1;
        rowB.points += 1;
      }
    }

    // Rotate all except index 0
    if (list.length > 2) {
      const last = list.pop()!;
      list.splice(1, 0, last);
    }
  }

  const standings = Array.from(standingsMap.values()).sort(
    (a, b) => b.points - a.points || b.kills - a.kills || b.damageDealt - a.damageDealt
  );

  return { matches, standings };
}
