import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import pkg from '../../package.json';
import {
  Check,
  Copy,
  Cpu,
  Download,
  Lock,
  Maximize2,
  Menu,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  StepForward,
  Swords,
  Trash2,
  Trophy,
  Upload,
  User,
  X,
} from 'lucide-react';
import { DEFAULT_PILOT_PROFILE, STARTER_MECHS, STARTER_PILOTS } from '../data/presets';
import {
  BattlefieldMatchSummary,
  BattlefieldRosterEntry,
  LeagueStandingRow,
  createSimFromReplay,
  groupRosterIntoTeams,
  runHeadlessBattlefieldMatch,
  runShortLeague,
  runTournament,
  validateTeamTonnageRules,
} from '../engine/battlefield';
import { buildMechSensorState, createSimulation, stepSimulation } from '../engine/mechSim';
import { PilotRuntimeState, evaluatePilotTick } from '../engine/pilotRuntime';
import { ArenaPresetId, MAX_MECHS, MechControlInput, PilotProfile, SIM_TPS, SimState } from '../types/mech';
import {
  SavedCustomMech,
  formatCustomMechName,
  formatMechDropdownLabel,
  loadSavedCustomMechs,
} from '../utils/customMechStorage';
import { getAllPilots, loadUserPilots } from '../utils/pilotLibrary';
import { getAllRoms, loadUserRoms } from '../utils/romLibrary';
import {
  BattlefieldFormat,
  BattlefieldRuleConfig,
  DEFAULT_BATTLEFIELD_RULE,
  ReplayPackageData,
  decodeReplayCode,
  decodeRuleCode,
  deduplicateExtractedCandidates,
  encodeRuleCode,
  extractMechCodesFromText,
  formatReplayCardText,
  parseMechFileText,
  parseReplayFileText,
  serializeReplayFile,
} from '../utils/shareMech';
import {
  SavedTeamEntry,
  TEAM_SQUAD_SIZE,
  buildRandomSquad,
  consumeQueuedBattlefieldTeamId,
  getMechChassisTonnage,
  loadSavedTeams,
  resolveTeamMemberAssets,
} from '../utils/teamStorage';
import {
  UserProfile,
  loadUserProfile,
  resolveUniqueTeamName,
  saveUserProfile,
} from '../utils/userProfile';
import { StudioMenuDrawer } from './StudioMenuDrawer';
import { MechCanvas3D } from './MechCanvas3D';
import { MechPartsHud } from './MechPartsHud';
import { MvpArenaCanvas } from './MvpArenaCanvas';
import { battleAudio } from '../utils/battleAudio';

const RENDER_INTERVAL_MS = 1000 / SIM_TPS;

function buildSampleRoster(teamCount: number, perTeam: number): BattlefieldRosterEntry[] {
  const list: BattlefieldRosterEntry[] = [];
  for (let t = 0; t < teamCount; t++) {
    for (let m = 0; m < perTeam; m++) {
      const bp = structuredClone(STARTER_MECHS[(t * perTeam + m) % STARTER_MECHS.length]);
      const pilot = structuredClone(
        STARTER_PILOTS.find((p) => p.id === bp.defaultPilotId) ??
          STARTER_PILOTS[(t + m) % STARTER_PILOTS.length]
      );
      bp.name = `${bp.name.split(' ')[1] ?? bp.name}-${t + 1}${m + 1}`;
      list.push({
        id: `sample_${t}_${m}_${Date.now().toString(36)}`,
        mech: bp,
        pilot,
        teamTag: teamCount === perTeam && perTeam === 1 ? '' : `T${t + 1}班`,
        battleOnly: false,
        sourceLabel: 'サンプル',
      });
    }
  }
  return list;
}

export function BattlefieldApp() {
  const backHref = window.location.pathname.endsWith('battlefield.html')
    ? './index.html'
    : '?app=studio';

  const [savedTeams, setSavedTeams] = useState<SavedTeamEntry[]>(() => loadSavedTeams());
  const [savedMechs, setSavedMechs] = useState<SavedCustomMech[]>(() => loadSavedCustomMechs());
  const [userRoms, setUserRoms] = useState(() => loadUserRoms());
  const allRoms = useMemo(() => getAllRoms(userRoms), [userRoms]);
  const [userPilots, setUserPilots] = useState(() => loadUserPilots());
  const allPilots = useMemo(() => getAllPilots(userPilots), [userPilots]);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => loadUserProfile());
  const [menuOpen, setMenuOpen] = useState(false);

  const squadPool = useMemo(() => {
    const customPool = savedMechs.map((m) =>
      resolveTeamMemberAssets(
        { mechId: m.id, pilotId: m.pilotId ?? DEFAULT_PILOT_PROFILE.id },
        savedMechs,
        allPilots,
        allRoms
      )
    );
    const starterPool = STARTER_MECHS.map((bp) =>
      resolveTeamMemberAssets(
        { mechId: bp.id, pilotId: bp.defaultPilotId ?? DEFAULT_PILOT_PROFILE.id },
        savedMechs,
        allPilots,
        allRoms
      )
    );
    return [...customPool, ...starterPool];
  }, [savedMechs, allPilots, allRoms]);

  const [selectedLocalTeamId, setSelectedLocalTeamId] = useState<string>(() => loadSavedTeams()[0]?.id ?? '');
  const [selectedLocalMechId, setSelectedLocalMechId] = useState<string>(
    () => loadSavedCustomMechs()[0]?.id ?? STARTER_MECHS[0].id
  );
  const [localTagInput, setLocalTagInput] = useState('自作班');

  const initialQueuedBoot = useMemo(() => {
    const queuedId = consumeQueuedBattlefieldTeamId();
    if (!queuedId) return null;
    const teams = loadSavedTeams();
    const found = teams.find((t) => t.id === queuedId);
    if (!found) return null;
    const localMechs = loadSavedCustomMechs();
    const roms = getAllRoms(loadUserRoms());
    const pilots = getAllPilots(loadUserPilots());
    const pool = [
      ...localMechs.map((m) =>
        resolveTeamMemberAssets(
          { mechId: m.id, pilotId: m.pilotId ?? DEFAULT_PILOT_PROFILE.id },
          localMechs,
          pilots,
          roms
        )
      ),
      ...STARTER_MECHS.map((bp) =>
        resolveTeamMemberAssets(
          { mechId: bp.id, pilotId: bp.defaultPilotId ?? DEFAULT_PILOT_PROFILE.id },
          localMechs,
          pilots,
          roms
        )
      ),
    ];
    const teamEntries: BattlefieldRosterEntry[] = found.members.map((mem, idx) => {
      const assets = resolveTeamMemberAssets(mem, localMechs, pilots, roms);
      return {
        id: `local_${found.id}_${idx}_${Date.now().toString(36)}`,
        mech: assets.mech,
        pilot: assets.pilot,
        teamTag: found.name,
        battleOnly: false,
        sourceLabel: 'ローカルチーム',
      };
    });
    const enemyPicked = buildRandomSquad(
      pool,
      TEAM_SQUAD_SIZE,
      DEFAULT_BATTLEFIELD_RULE.maxTeamTonnage,
      DEFAULT_BATTLEFIELD_RULE.randomTeamTonnageMultiplier
    );
    const enemyEntries: BattlefieldRosterEntry[] = enemyPicked.map((a, idx) => ({
      id: `rand_boot_${idx}_${Date.now().toString(36)}`,
      mech: structuredClone(a.mech),
      pilot: structuredClone(a.pilot),
      teamTag: 'ランダム敵部隊',
      battleOnly: false,
      sourceLabel: 'ランダム編成',
      isRandomGenerated: true,
    }));
    return {
      teamName: found.name,
      roster: [...teamEntries, ...enemyEntries],
    };
  }, []);

  const [roster, setRoster] = useState<BattlefieldRosterEntry[]>(
    () => initialQueuedBoot?.roster ?? buildSampleRoster(4, 3)
  );
  const [rule, setRule] = useState<BattlefieldRuleConfig>(DEFAULT_BATTLEFIELD_RULE);
  const [seed, setSeed] = useState(2026);

  const [bulkInput, setBulkInput] = useState('');
  const [dedupMode, setDedupMode] = useState<'latest' | 'all'>('latest');
  const [ruleCodeInput, setRuleCodeInput] = useState('');
  const [replayCodeInput, setReplayCodeInput] = useState('');
  const [notice, setNotice] = useState<string | null>(() =>
    initialQueuedBoot
      ? `スタジオからチーム「${initialQueuedBoot.teamName}」をエントリーし、ランダム敵部隊と対戦準備しました。`
      : null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [expanded2D, setExpanded2D] = useState(false);
  const [focusedMechId, setFocusedMechId] = useState('');
  const [renderTick, setRenderTick] = useState(0);

  const [liveSummary, setLiveSummary] = useState<BattlefieldMatchSummary | null>(null);
  const [tournamentRounds, setTournamentRounds] = useState<BattlefieldMatchSummary[][] | null>(null);
  const [championName, setChampionName] = useState<string | null>(null);
  const [leagueResult, setLeagueResult] = useState<{
    matches: BattlefieldMatchSummary[];
    standings: LeagueStandingRow[];
  } | null>(null);

  const simRef = useRef<SimState | null>(null);
  const slowMoUntilRef = useRef(0);
  const profilesRef = useRef<Record<string, PilotProfile>>({});
  const runtimesRef = useRef<Record<string, PilotRuntimeState>>({});
  const activeReplayRef = useRef<ReplayPackageData | null>(null);

  const loadReplayIntoStage = useCallback((replay: ReplayPackageData, autoPlay = false) => {
    const built = createSimFromReplay(replay);
    simRef.current = built.sim;
    slowMoUntilRef.current = 0;
    profilesRef.current = built.pilotProfiles;
    runtimesRef.current = built.pilotRuntimes;
    activeReplayRef.current = replay;
    setFocusedMechId(built.sim.mechs[0]?.id ?? '');
    setPlaying(autoPlay);
    setRenderTick((n) => n + 1);
  }, []);

  const groupedTeams = useMemo(
    () => groupRosterIntoTeams(roster, rule.format, rule.teamUnitSize),
    [roster, rule.format, rule.teamUnitSize]
  );
  const tonnageValidation = useMemo(
    () => validateTeamTonnageRules(groupedTeams, rule),
    [groupedTeams, rule]
  );

  const startLiveMatch = useCallback(
    (overrideRoster?: BattlefieldRosterEntry[], overrideRule?: BattlefieldRuleConfig) => {
      battleAudio.unlock();
      setErrorMsg(null);
      const targetRoster = overrideRoster ?? roster;
      const targetRule = overrideRule ?? rule;
      if (targetRoster.length < 2) {
        setErrorMsg('対戦には最低 2 機のエントリーが必要です。');
        return;
      }
      const teams = groupRosterIntoTeams(targetRoster, targetRule.format, targetRule.teamUnitSize);
      if (teams.length < 2) {
        setErrorMsg('対戦可能な 2 チーム以上が必要です（チームタグや人数を確認してください）。');
        return;
      }
      const { violations } = validateTeamTonnageRules(teams, targetRule);
      if (violations.length > 0) {
        const msg = violations
          .map((v) => `${v.teamName}(${v.totalTonnage}/${v.effectiveCap}t)`)
          .join('、');
        setErrorMsg(`チーム重量上限オーバーのため開始できません: ${msg}`);
        return;
      }

      const matchSeed = targetRule.randomizeSeedPerMatch
        ? ((seed * 1664525 + 1013904223 + Date.now()) >>> 0) % 1000000
        : seed;
      if (targetRule.randomizeSeedPerMatch) setSeed(matchSeed);

      const { summary } = runHeadlessBattlefieldMatch(teams, targetRule, matchSeed, 'ライブ観戦試合');
      setLiveSummary(summary);
      loadReplayIntoStage(summary.replay, true);
    },
    [roster, rule, seed, loadReplayIntoStage]
  );

  // Initialize first stage preview once
  useEffect(() => {
    if (!simRef.current && roster.length >= 2) {
      const teams = groupRosterIntoTeams(roster, rule.format, rule.teamUnitSize);
      const { summary } = runHeadlessBattlefieldMatch(teams, rule, seed, '初期プレビュー戦');
      setLiveSummary(summary);
      loadReplayIntoStage(summary.replay, false);
    }
  }, [roster, rule, seed, loadReplayIntoStage]);

  const advanceOneTick = useCallback(() => {
    const sim = simRef.current;
    if (!sim || sim.finished) {
      setPlaying(false);
      return;
    }
    const controls: Record<string, MechControlInput> = {};
    for (const mech of sim.mechs) {
      if (!mech.alive) continue;
      const profile = profilesRef.current[mech.id];
      const runtime = runtimesRef.current[mech.id];
      const sensor = buildMechSensorState(sim, mech.id);
      controls[mech.id] = evaluatePilotTick(profile, runtime, sensor, mech, sim).control;
    }
    stepSimulation(sim, controls);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const inSlowMo = now < slowMoUntilRef.current;
      const stepInterval = inSlowMo ? RENDER_INTERVAL_MS * 3.4 : RENDER_INTERVAL_MS;
      if (now - lastTime >= stepInterval) {
        lastTime = now - ((now - lastTime) % stepInterval);
        const maxSteps = inSlowMo ? 1 : speed;
        for (let i = 0; i < maxSteps; i++) {
          if (!simRef.current || simRef.current.finished) break;
          advanceOneTick();
          if (simRef.current.lastTickEvents.some((ev) => ev.type === 'mech_destroyed')) {
            slowMoUntilRef.current = Math.max(slowMoUntilRef.current, now + 650);
            break;
          }
        }
        setRenderTick((n) => n + 1);
        if (!simRef.current || simRef.current.finished) {
          setPlaying(false);
          return;
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [playing, speed, advanceOneTick]);

  useEffect(() => {
    if (!expanded2D) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded2D(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded2D]);

  const handleBulkExtract = () => {
    setErrorMsg(null);
    setNotice(null);
    const res = extractMechCodesFromText(bulkInput);
    const deduped = deduplicateExtractedCandidates(res.candidates, dedupMode);
    if (deduped.length === 0) {
      setErrorMsg(res.warnings[0]?.reason ?? '有効な機体コード (CMM1- / CMM1B-) が見つかりませんでした。');
      return;
    }
    const existingTags = Array.from(
      new Set(roster.map((r) => r.teamTag.trim()).filter(Boolean))
    );
    const tagRemap = new Map<string, string>();
    const adjustedTags: string[] = [];
    const newEntries: BattlefieldRosterEntry[] = deduped.map((c, idx) => {
      const rawTag = c.teamTag.trim();
      let finalTag = rawTag;
      if (rawTag) {
        if (!tagRemap.has(rawTag)) {
          const unique = resolveUniqueTeamName(rawTag, existingTags);
          tagRemap.set(rawTag, unique);
          existingTags.push(unique);
          if (unique !== rawTag) {
            adjustedTags.push(`${rawTag}→${unique}`);
          }
        }
        finalTag = tagRemap.get(rawTag)!;
      }
      return {
        id: `imp_${Date.now().toString(36)}_${idx}`,
        mech: c.mech,
        pilot: c.pilot,
        teamTag: finalTag,
        battleOnly: c.battleOnly,
        sourceLabel: c.battleOnly ? '非公開コード' : 'チャット取込',
      };
    });
    setRoster((prev) => [...prev, ...newEntries].slice(0, MAX_MECHS));
    const warnMsg =
      res.warnings.length > 0 ? `（警告 ${res.warnings.length} 件: ${res.warnings[0].reason}）` : '';
    const adjMsg =
      adjustedTags.length > 0 ? `（重複チーム名を自動調整: ${adjustedTags.join(', ')}）` : '';
    setNotice(`${newEntries.length} 機をエントリーへ追加しました。${adjMsg}${warnMsg}`);
    setBulkInput('');
  };

  const handleAddLocalTeam = () => {
    setErrorMsg(null);
    setNotice(null);
    const team = savedTeams.find((t) => t.id === selectedLocalTeamId);
    if (!team) {
      setErrorMsg('追加できる保存済みローカルチームがありません。スタジオの「チーム編成」タブで保存してください。');
      return;
    }
    const existingTags = Array.from(
      new Set(roster.map((r) => r.teamTag.trim()).filter(Boolean))
    );
    const uniqueTag = resolveUniqueTeamName(team.name, existingTags);
    const entries: BattlefieldRosterEntry[] = team.members.map((mem, idx) => {
      const assets = resolveTeamMemberAssets(mem, savedMechs, allPilots, allRoms);
      return {
        id: `local_${team.id}_${idx}_${Date.now().toString(36)}`,
        mech: assets.mech,
        pilot: assets.pilot,
        teamTag: uniqueTag,
        battleOnly: false,
        sourceLabel: 'ローカルチーム',
      };
    });
    setRoster((prev) => [...prev, ...entries].slice(0, MAX_MECHS));
    const renamedNote =
      uniqueTag !== team.name ? `（重複回避のため「${uniqueTag}」へ自動調整）` : '';
    setNotice(
      `ローカルチーム「${uniqueTag}」(${entries.length}機) を出場プールへ追加しました。${renamedNote}`
    );
  };

  const handleAddLocalSingleMech = () => {
    setErrorMsg(null);
    setNotice(null);
    const custom = savedMechs.find((m) => m.id === selectedLocalMechId);
    const assets = resolveTeamMemberAssets(
      {
        mechId: selectedLocalMechId,
        pilotId: custom?.pilotId ?? DEFAULT_PILOT_PROFILE.id,
      },
      savedMechs,
      allPilots,
      allRoms
    );
    const entry: BattlefieldRosterEntry = {
      id: `local_single_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      mech: assets.mech,
      pilot: assets.pilot,
      teamTag: localTagInput.trim() || '自作班',
      battleOnly: false,
      sourceLabel: custom ? '自作機体' : '標準機体',
    };
    setRoster((prev) => [...prev, entry].slice(0, MAX_MECHS));
    setNotice(`「${assets.mech.name}」(${getMechChassisTonnage(assets.mech)}t) を追加しました。`);
  };

  const handleAddRandomSquad = () => {
    setErrorMsg(null);
    setNotice(null);
    const size = Math.max(1, Math.min(3, rule.format === 'battle_royale' ? 1 : rule.teamUnitSize || 3));
    const picked = buildRandomSquad(
      squadPool,
      size,
      rule.maxTeamTonnage,
      rule.randomTeamTonnageMultiplier
    );
    const randTag = `ランダム${((Date.now() / 100) | 0) % 90 + 10}班`;
    const entries: BattlefieldRosterEntry[] = picked.map((a, idx) => ({
      id: `rand_${Date.now().toString(36)}_${idx}`,
      mech: structuredClone(a.mech),
      pilot: structuredClone(a.pilot),
      teamTag: randTag,
      battleOnly: false,
      sourceLabel: 'ランダム編成',
      isRandomGenerated: true,
    }));
    const tonSum = entries.reduce((acc, e) => acc + getMechChassisTonnage(e.mech), 0);
    setRoster((prev) => [...prev, ...entries].slice(0, MAX_MECHS));
    setNotice(
      `ランダム小隊「${randTag}」(${entries.length}機 / 計${tonSum}t) を追加しました（ランダム許容 ${Math.round(rule.randomTeamTonnageMultiplier * 100)}%）。`
    );
  };

  const handleQuickLocalRandom3v3 = () => {
    setErrorMsg(null);
    setNotice(null);
    const team = savedTeams.find((t) => t.id === selectedLocalTeamId) ?? savedTeams[0];
    const allyEntries: BattlefieldRosterEntry[] = team
      ? team.members.map((mem, idx) => {
          const assets = resolveTeamMemberAssets(mem, savedMechs, allPilots, allRoms);
          return {
            id: `ql_ally_${idx}_${Date.now().toString(36)}`,
            mech: assets.mech,
            pilot: assets.pilot,
            teamTag: team.name,
            battleOnly: false,
            sourceLabel: 'ローカルチーム',
          };
        })
      : buildRandomSquad(
          squadPool,
          TEAM_SQUAD_SIZE,
          rule.maxTeamTonnage,
          1.2
        ).map((a, idx) => ({
          id: `ql_ally_${idx}_${Date.now().toString(36)}`,
          mech: structuredClone(a.mech),
          pilot: structuredClone(a.pilot),
          teamTag: '味方ランダム',
          battleOnly: false,
          sourceLabel: 'ランダム編成',
          isRandomGenerated: true,
        }));

    const enemyEntries: BattlefieldRosterEntry[] = buildRandomSquad(
      squadPool,
      TEAM_SQUAD_SIZE,
      rule.maxTeamTonnage,
      rule.randomTeamTonnageMultiplier
    ).map((a, idx) => ({
      id: `ql_enemy_${idx}_${Date.now().toString(36)}`,
      mech: structuredClone(a.mech),
      pilot: structuredClone(a.pilot),
      teamTag: '敵ランダム隊',
      battleOnly: false,
      sourceLabel: 'ランダム編成',
      isRandomGenerated: true,
    }));

    const nextRoster = [...allyEntries, ...enemyEntries];
    const nextRule: BattlefieldRuleConfig = {
      ...rule,
      format: 'team_match',
      teamUnitSize: 3,
      randomizeSeedPerMatch: true,
    };
    setRoster(nextRoster);
    setRule(nextRule);
    startLiveMatch(nextRoster, nextRule);
  };

  const handleRunTournamentOrLeague = () => {
    setErrorMsg(null);
    setNotice(null);
    const teams = groupRosterIntoTeams(roster, rule.format, rule.teamUnitSize);
    if (teams.length < 2) {
      setErrorMsg('大会実行には 2 チーム以上が必要です。');
      return;
    }
    const { violations } = validateTeamTonnageRules(teams, rule);
    if (violations.length > 0) {
      const msg = violations
        .map((v) => `${v.teamName}(${v.totalTonnage}/${v.effectiveCap}t)`)
        .join('、');
      setErrorMsg(`チーム重量上限オーバーのため大会を実行できません: ${msg}`);
      return;
    }
    if (rule.format === 'short_league') {
      const res = runShortLeague(teams, rule, seed);
      setLeagueResult(res);
      setTournamentRounds(null);
      setChampionName(res.standings[0]?.teamName ?? null);
      if (res.matches[0]) {
        setLiveSummary(res.matches[0]);
        loadReplayIntoStage(res.matches[0].replay, false);
      }
      setNotice(`短縮リーグ全 ${res.matches.length} 試合を完了しました。`);
    } else {
      const res = runTournament(teams, rule, seed);
      setTournamentRounds(res.rounds);
      setLeagueResult(null);
      setChampionName(res.championTeamName);
      const finalMatch = res.rounds[res.rounds.length - 1]?.[0];
      if (finalMatch) {
        setLiveSummary(finalMatch);
        loadReplayIntoStage(finalMatch.replay, false);
      }
      setNotice(`トーナメント完了 — 優勝: ${res.championTeamName}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    setNotice(null);
    const added: BattlefieldRosterEntry[] = [];
    for (const file of Array.from(files)) {
      const text = await file.text();
      if (file.name.endsWith('.cmreplay.json') || text.includes('"codemech.replay.v1"')) {
        const rep = parseReplayFileText(text);
        loadReplayIntoStage(rep, true);
        setNotice(`リプレイ「${rep.title}」を読み込み再生します。`);
        return;
      }
      const pkg = parseMechFileText(text);
      added.push({
        id: `file_${Date.now().toString(36)}_${added.length}`,
        mech: pkg.mech,
        pilot: pkg.pilot,
        teamTag: pkg.teamTag ?? '',
        battleOnly: Boolean(pkg.battleOnly),
        sourceLabel: file.name,
      });
    }
    if (added.length > 0) {
      setRoster((prev) => [...prev, ...added].slice(0, MAX_MECHS));
      setNotice(`${added.length} 機のファイルを読み込みました。`);
    }
  };

  const copyText = async (key: string, txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((p) => (p === key ? null : p)), 1500);
    } catch {
      setErrorMsg('クリップボードコピーに失敗しました。');
    }
  };

  const sim = simRef.current ?? createSimulation({
    seed,
    entries: STARTER_MECHS.slice(0, 2).map((bp, i) => ({
      id: `fb_${i}`,
      name: bp.name,
      teamId: `T${i + 1}`,
      blueprint: bp,
    })),
  });
  const focusedMech = sim.mechs.find((m) => m.id === focusedMechId) ?? sim.mechs[0];

  return (
    <div className="cm-studio">
      <header className="cm-topbar">
        <div className="cm-brand">
          <span className="cm-badge-icon cm-badge-icon--arena" aria-hidden="true">
            <Swords size={20} />
          </span>
          <div>
            <h1 className="cm-title">CodeMech.py - BATTLEFIELD</h1>
            <p className="cm-subtitle">ver{pkg.version}</p>
          </div>
        </div>

        <div className="cm-toolbar-controls">
          <a className="cm-link-btn" href={backHref}>
            <Cpu size={15} /> 開発スタジオへ戻る
          </a>
          <button
            type="button"
            className="cm-menu-btn"
            onClick={() => setMenuOpen(true)}
            title={`ユーザー名設定 ＆ バックアップメニュー (UUID: ${userProfile.userId})`}
          >
            <Menu size={16} />
            <User size={14} />
            <span>{userProfile.userName}</span>
          </button>
        </div>
      </header>

      <main className="cm-bf-layout">
        <div className="cm-col-left">
          <section className="cm-panel">
            <div className="cm-panel-head">
              <div>
                <h2 className="cm-panel-title">出場プール ({roster.length}/{MAX_MECHS} 機)</h2>
                <p className="cm-panel-sub">2×6 / 3×4 / 4×3 / 6×2 / 12機バトロワ対応</p>
              </div>
              <div className="cm-preset-bar">
                <button
                  type="button"
                  className="cm-btn-xs"
                  onClick={() => {
                    setRule((r) => ({ ...r, teamUnitSize: 3, maxTeamTonnage: 180 }));
                    setRoster(buildSampleRoster(4, 3));
                  }}
                >
                  3機×4T
                </button>
                <button
                  type="button"
                  className="cm-btn-xs"
                  onClick={() => {
                    setRule((r) => ({ ...r, teamUnitSize: 2, maxTeamTonnage: 120 }));
                    setRoster(buildSampleRoster(6, 2));
                  }}
                >
                  2機×6T
                </button>
                <button
                  type="button"
                  className="cm-btn-xs"
                  onClick={() => {
                    setRule((r) => ({ ...r, teamUnitSize: 6, maxTeamTonnage: 360 }));
                    setRoster(buildSampleRoster(2, 6));
                  }}
                >
                  6機×2T
                </button>
                <button
                  type="button"
                  className="cm-btn-xs"
                  onClick={() => {
                    setRule((r) => ({ ...r, format: 'battle_royale' }));
                    setRoster(buildSampleRoster(12, 1));
                  }}
                >
                  12機BR
                </button>
                <button type="button" className="cm-btn-xs" onClick={() => setRoster([])}>
                  クリア
                </button>
              </div>
            </div>

            <div className="cm-bf-local-bar">
              <div className="cm-subhead">ローカル登録 ＆ ランダムマッチ (規制180t / ランダム1.2〜1.5倍許容)</div>
              <div className="cm-bf-local-row">
                <select
                  aria-label="ローカル保存チーム選択"
                  className="cm-mini-select"
                  value={selectedLocalTeamId}
                  onChange={(e) => setSelectedLocalTeamId(e.target.value)}
                >
                  {savedTeams.length === 0 ? (
                    <option value="">保存チームなし (スタジオで作成)</option>
                  ) : (
                    savedTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.members.length}機)
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  className="cm-btn-xs"
                  disabled={savedTeams.length === 0}
                  onClick={handleAddLocalTeam}
                >
                  <Plus size={12} /> チーム追加
                </button>
                <button
                  type="button"
                  className="cm-btn-xs"
                  onClick={handleAddRandomSquad}
                >
                  <Shuffle size={12} /> ランダム小隊
                </button>
                <button
                  type="button"
                  className="cm-btn-primary-xs"
                  onClick={handleQuickLocalRandom3v3}
                >
                  <Swords size={12} /> 即3vs3ランダム戦
                </button>
              </div>

              <div className="cm-bf-local-row">
                <select
                  aria-label="ローカル機体選択"
                  className="cm-mini-select"
                  value={selectedLocalMechId}
                  onChange={(e) => setSelectedLocalMechId(e.target.value)}
                >
                  {savedMechs.length > 0 && (
                    <optgroup label="自作機体">
                      {savedMechs.map((m) => (
                        <option key={m.id} value={m.id}>
                          {formatMechDropdownLabel(
                            m.chassisId,
                            formatCustomMechName(m.baseName, m.tag)
                          )}{' '}
                          ({getMechChassisTonnage(m.blueprint)}t)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="標準機体">
                    {STARTER_MECHS.map((bp) => (
                      <option key={bp.id} value={bp.id}>
                        {formatMechDropdownLabel(bp.chassisId, bp.name)} (
                        {getMechChassisTonnage(bp)}t)
                      </option>
                    ))}
                  </optgroup>
                </select>
                <input
                  type="text"
                  className="cm-bf-tag-input"
                  value={localTagInput}
                  onChange={(e) => setLocalTagInput(e.target.value)}
                  placeholder="チームタグ"
                />
                <button type="button" className="cm-btn-xs" onClick={handleAddLocalSingleMech}>
                  <Plus size={12} /> 1機追加
                </button>
              </div>
            </div>

            {tonnageValidation.checks.length > 0 && rule.format !== 'battle_royale' && (
              <div className="cm-bf-team-badges">
                {tonnageValidation.checks.map((chk) => (
                  <span
                    key={chk.teamId}
                    className={`cm-bf-team-badge ${
                      !chk.allowed ? 'is-over' : chk.isRandomTeam ? 'is-random' : 'is-ok'
                    }`}
                  >
                    {chk.teamName}: {chk.totalTonnage}
                    {chk.effectiveCap > 0 ? `/${chk.effectiveCap}t` : 't'}
                    {chk.isRandomTeam ? ' (ランダム枠)' : ''}
                    {!chk.allowed ? ' 超過!' : ''}
                  </span>
                ))}
              </div>
            )}

            <div className="cm-bf-roster">
              {roster.map((entry) => (
                <div key={entry.id} className="cm-bf-entry">
                  <span className="cm-bf-name">
                    {entry.battleOnly && (
                      <span title="対戦専用 (非公開)" style={{ display: 'inline-flex' }}>
                        <Lock size={12} />
                      </span>
                    )}
                    {entry.mech.name}
                    <small className="cm-bf-ton"> ({getMechChassisTonnage(entry.mech)}t)</small>
                  </span>
                  <input
                    type="text"
                    className="cm-bf-tag-input"
                    placeholder="チームタグ"
                    value={entry.teamTag}
                    onChange={(e) =>
                      setRoster((prev) =>
                        prev.map((r) => (r.id === entry.id ? { ...r, teamTag: e.target.value } : r))
                      )
                    }
                  />
                  <button
                    type="button"
                    className="cm-icon-btn cm-icon-btn--danger"
                    onClick={() => setRoster((prev) => prev.filter((r) => r.id !== entry.id))}
                    title="除外"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className="cm-bf-import">
              <div className="cm-subhead">チャット／メールログ一括取込 (CMM1- / CMM1B-)</div>
              <textarea
                className="cm-bf-textarea"
                placeholder="Slack / Teams / メールのログ全文をそのまま貼り付けて一括抽出（#チーム名 自動認識）"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
              />
              <div className="cm-bf-import-actions">
                <select
                  className="cm-mini-select"
                  value={dedupMode}
                  onChange={(e) => setDedupMode(e.target.value as 'latest' | 'all')}
                >
                  <option value="latest">重複整理: 最新提出のみ</option>
                  <option value="all">重複もすべて残す</option>
                </select>
                <button type="button" className="cm-btn-primary-xs" onClick={handleBulkExtract}>
                  テキストから一括取込
                </button>
                <label className="cm-btn-xs">
                  <Upload size={12} /> ファイル追加
                  <input
                    type="file"
                    multiple
                    accept=".json,.txt"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            </div>

            <div className="cm-bf-rules">
              <div className="cm-subhead">大会ルール＆進行</div>
              <div className="cm-bf-rule-grid">
                <label className="cm-select-row">
                  <span>対戦形式</span>
                  <select
                    value={rule.format}
                    onChange={(e) => setRule({ ...rule, format: e.target.value as BattlefieldFormat })}
                  >
                    <option value="team_match">チーム戦 (一斉戦)</option>
                    <option value="battle_royale">バトルロイヤル</option>
                    <option value="tournament">トーナメント</option>
                    <option value="short_league">短縮リーグ</option>
                  </select>
                </label>
                <label className="cm-select-row">
                  <span>地形</span>
                  <select
                    value={rule.arenaPreset}
                    onChange={(e) =>
                      setRule({ ...rule, arenaPreset: e.target.value as ArenaPresetId })
                    }
                  >
                    <option value="plains_ridge">中央稜線</option>
                    <option value="twin_mesas">双子メサ</option>
                    <option value="urban_pillars">市街地ピラー</option>
                    <option value="valley_basin">外周高台盆地</option>
                  </select>
                </label>
                <label className="cm-select-row">
                  <span>Seed / 秒</span>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <input
                      type="number"
                      style={{ width: '5rem' }}
                      value={seed}
                      onChange={(e) => setSeed(Number(e.target.value) || 1)}
                    />
                    <input
                      type="number"
                      style={{ width: '4rem' }}
                      value={rule.maxSeconds}
                      onChange={(e) => setRule({ ...rule, maxSeconds: Number(e.target.value) || 120 })}
                    />
                  </div>
                </label>
                <label className="cm-select-row">
                  <span>チーム上限</span>
                  <select
                    value={rule.maxTeamTonnage}
                    onChange={(e) =>
                      setRule({ ...rule, maxTeamTonnage: Number(e.target.value) })
                    }
                  >
                    <option value={180}>180t (3機標準)</option>
                    <option value={165}>165t (厳格)</option>
                    <option value={200}>200t (重装)</option>
                    <option value={120}>120t (2機用)</option>
                    <option value={360}>360t (6機用)</option>
                    <option value={0}>制限なし</option>
                  </select>
                </label>
                <label className="cm-select-row">
                  <span>ランダム許容</span>
                  <select
                    value={rule.randomTeamTonnageMultiplier}
                    onChange={(e) =>
                      setRule({
                        ...rule,
                        randomTeamTonnageMultiplier: Number(e.target.value) || 1.35,
                      })
                    }
                  >
                    <option value={1.2}>1.2倍 ({Math.round(rule.maxTeamTonnage * 1.2)}t)</option>
                    <option value={1.35}>1.35倍 ({Math.round(rule.maxTeamTonnage * 1.35)}t)</option>
                    <option value={1.5}>1.5倍 ({Math.round(rule.maxTeamTonnage * 1.5)}t)</option>
                  </select>
                </label>
                <label className="cm-check-inline">
                  <input
                    type="checkbox"
                    checked={rule.headDestructionKills}
                    onChange={(e) => setRule({ ...rule, headDestructionKills: e.target.checked })}
                  />
                  <span>頭部破壊で即撃破</span>
                </label>
              </div>

              <div className="cm-bf-rule-share">
                <button
                  type="button"
                  className="cm-btn-xs"
                  onClick={() =>
                    copyText(
                      'rule',
                      encodeRuleCode({ title: 'CodeMech 大会公式ルール', rule })
                    )
                  }
                >
                  {copiedKey === 'rule' ? <Check size={12} /> : <Copy size={12} />} ルール配布 (CMR1-)
                </button>
                <input
                  type="text"
                  className="cm-mini-select"
                  placeholder="CMR1-... 貼付"
                  value={ruleCodeInput}
                  onChange={(e) => setRuleCodeInput(e.target.value)}
                />
                <button
                  type="button"
                  className="cm-btn-xs"
                  onClick={() => {
                    try {
                      const decoded = decodeRuleCode(ruleCodeInput);
                      setRule(decoded.rule);
                      setNotice(`ルール「${decoded.title}」を適用しました。`);
                    } catch (err) {
                      setErrorMsg(err instanceof Error ? err.message : 'ルール読込失敗');
                    }
                  }}
                >
                  適用
                </button>
              </div>

              <div className="cm-bf-run-btns">
                <button type="button" className="cm-btn-primary" onClick={() => startLiveMatch()}>
                  <Play size={15} /> ライブ対戦開始 (観戦)
                </button>
                <button
                  type="button"
                  className="cm-btn-secondary"
                  onClick={handleRunTournamentOrLeague}
                >
                  <Trophy size={15} /> 大会一括実行 (トーナメント/リーグ)
                </button>
              </div>
            </div>

            {errorMsg && <div className="cm-error-box">{errorMsg}</div>}
            {notice && <div className="cm-ok-box">{notice}</div>}
          </section>
        </div>

        <div className="cm-col-right">
          <section className="cm-panel">
            <div className="cm-sim-bar">
              <div className="cm-sim-btns">
                <button
                  type="button"
                  className="cm-btn-primary"
                  onClick={() => {
                    battleAudio.unlock();
                    if (!playing && sim.finished && activeReplayRef.current) {
                      loadReplayIntoStage(activeReplayRef.current, true);
                      return;
                    }
                    setPlaying((p) => !p);
                  }}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                  {playing ? '一時停止' : '再生'}
                </button>
                <button
                  type="button"
                  className="cm-btn-secondary"
                  disabled={playing || sim.finished}
                  onClick={() => {
                    advanceOneTick();
                    setRenderTick((n) => n + 1);
                  }}
                >
                  <StepForward size={15} /> +1 Tick
                </button>
                <button
                  type="button"
                  className="cm-btn-secondary"
                  onClick={() => {
                    if (activeReplayRef.current) {
                      loadReplayIntoStage(activeReplayRef.current, false);
                    }
                  }}
                >
                  <RotateCcw size={15} /> 巻き戻し
                </button>
                <div className="cm-seg">
                  {([1, 2, 4] as const).map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      className={speed === sp ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
                      onClick={() => setSpeed(sp)}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>
                <div className="cm-seg">
                  <button
                    type="button"
                    className={viewMode === '3d' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
                    onClick={() => setViewMode('3d')}
                  >
                    3D ビュー
                  </button>
                  <button
                    type="button"
                    className={viewMode === '2d' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
                    onClick={() => setViewMode('2d')}
                  >
                    2D 戦術図
                  </button>
                </div>
              </div>
              <div className="cm-sim-clock">
                T{sim.tick} ({sim.time.toFixed(1)}s)
                {sim.finished && <span className="cm-winner-pill">勝者: {sim.winnerTeamId}</span>}
              </div>
            </div>

            {viewMode === '3d' ? (
              <MechCanvas3D
                simState={sim}
                renderTick={renderTick}
                focusedMechId={focusedMechId}
                onSelectMech={setFocusedMechId}
                onSwitchTo2D={() => setViewMode('2d')}
              />
            ) : (
              <div className="cm-2d-stage">
                <button
                  type="button"
                  className="cm-2d-expand-btn"
                  onClick={() => setExpanded2D(true)}
                  title="2D戦術図を画面いっぱいに大きく表示"
                >
                  <Maximize2 size={13} /> 大きく表示
                </button>
                <MvpArenaCanvas
                  simState={sim}
                  renderTick={renderTick}
                  focusedMechId={focusedMechId}
                  onSelectMech={setFocusedMechId}
                  className="cm-arena-canvas--large"
                />
              </div>
            )}

            <div className="cm-roster-strip" style={{ marginTop: '0.5rem' }}>
              {sim.mechs.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setFocusedMechId(m.id)}
                  className={`cm-roster-pill ${m.id === focusedMechId ? 'is-selected' : ''} ${
                    !m.alive ? 'is-dead' : ''
                  }`}
                >
                  <span>{m.name}</span>
                  <small>{m.teamId}</small>
                </button>
              ))}
            </div>

            <MechPartsHud mech={focusedMech} />

            {liveSummary && (
              <div className="cm-commentary-box">
                <div className="cm-subhead">実況＆総評 — {liveSummary.summaryText}</div>
                <div className="cm-commentary-list">
                  {liveSummary.highlights.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
                <div className="cm-bf-rule-share" style={{ marginTop: '0.45rem' }}>
                  <button
                    type="button"
                    className="cm-btn-xs"
                    onClick={() => copyText('replay', formatReplayCardText(liveSummary.replay))}
                  >
                    {copiedKey === 'replay' ? <Check size={12} /> : <Copy size={12} />} リプレイ (CMW1-)
                  </button>
                  <button
                    type="button"
                    className="cm-btn-xs"
                    onClick={() => {
                      const blob = new Blob([serializeReplayFile(liveSummary.replay)], {
                        type: 'application/json;charset=utf-8',
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `codemech_replay_${liveSummary.seed}.cmreplay.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download size={12} /> .cmreplay.json
                  </button>
                  <input
                    type="text"
                    className="cm-mini-select"
                    placeholder="CMW1-... 貼付で再現"
                    value={replayCodeInput}
                    onChange={(e) => setReplayCodeInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="cm-btn-xs"
                    onClick={() => {
                      try {
                        const rep = decodeReplayCode(replayCodeInput);
                        loadReplayIntoStage(rep, true);
                        setNotice(`リプレイ「${rep.title}」を再現再生します。`);
                      } catch (err) {
                        setErrorMsg(err instanceof Error ? err.message : 'リプレイ読込失敗');
                      }
                    }}
                  >
                    観戦
                  </button>
                </div>
              </div>
            )}

            {tournamentRounds && (
              <div className="cm-commentary-box">
                <div className="cm-subhead">トーナメント結果（優勝: {championName}）</div>
                {tournamentRounds.map((round, rIdx) => (
                  <div key={rIdx} className="cm-bf-round">
                    <strong>第{rIdx + 1}回戦:</strong>
                    {round.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="cm-btn-xs"
                        onClick={() => {
                          setLiveSummary(m);
                          loadReplayIntoStage(m.replay, true);
                        }}
                      >
                        {m.label} → 勝:{m.winnerTeamName} [観戦]
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {leagueResult && (
              <div className="cm-commentary-box">
                <div className="cm-subhead">短縮リーグ順位表（首位: {championName}）</div>
                <table className="cm-standings-table">
                  <thead>
                    <tr>
                      <th>チーム</th>
                      <th>試</th>
                      <th>勝</th>
                      <th>分</th>
                      <th>敗</th>
                      <th>勝点</th>
                      <th>与ダメ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leagueResult.standings.map((row) => (
                      <tr key={row.teamId}>
                        <td>{row.teamName}</td>
                        <td>{row.played}</td>
                        <td>{row.wins}</td>
                        <td>{row.draws}</td>
                        <td>{row.losses}</td>
                        <td>{row.points}</td>
                        <td>{Math.round(row.damageDealt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
      <StudioMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        appVersion={pkg.version}
        userProfile={userProfile}
        onSaveUserName={(raw) => {
          const saved = saveUserProfile(raw);
          setUserProfile(saved);
          return saved;
        }}
        counts={{
          mechs: savedMechs.length,
          pilots: userPilots.length,
          roms: userRoms.length,
          teams: savedTeams.length,
        }}
        onBackupRestored={() => {
          setUserProfile(loadUserProfile());
          const nextTeams = loadSavedTeams();
          setSavedTeams(nextTeams);
          setSavedMechs(loadSavedCustomMechs());
          setUserRoms(loadUserRoms());
          setUserPilots(loadUserPilots());
          if (nextTeams.length > 0 && !selectedLocalTeamId) {
            setSelectedLocalTeamId(nextTeams[0].id);
          }
        }}
      />

      {expanded2D && (
        <div
          className="cm-2d-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="2D 戦術図 拡大表示"
          onClick={() => setExpanded2D(false)}
        >
          <div className="cm-2d-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cm-2d-modal-bar">
              <div className="cm-sim-btns">
                <button
                  type="button"
                  className="cm-btn-primary"
                  onClick={() => {
                    battleAudio.unlock();
                    if (!playing && sim.finished && activeReplayRef.current) {
                      loadReplayIntoStage(activeReplayRef.current, true);
                      return;
                    }
                    setPlaying((p) => !p);
                  }}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                  {playing ? '一時停止' : '再生'}
                </button>
                <button
                  type="button"
                  className="cm-btn-secondary"
                  onClick={() => {
                    if (activeReplayRef.current) {
                      loadReplayIntoStage(activeReplayRef.current, false);
                    }
                  }}
                >
                  <RotateCcw size={15} /> 巻き戻し
                </button>
                <div className="cm-seg">
                  {([1, 2, 4] as const).map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      className={speed === sp ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
                      onClick={() => setSpeed(sp)}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>
                <div className="cm-sim-clock">
                  T{sim.tick} ({sim.time.toFixed(1)}s)
                  {sim.finished && <span className="cm-winner-pill">勝者: {sim.winnerTeamId}</span>}
                </div>
              </div>
              <button
                type="button"
                className="cm-btn-secondary"
                onClick={() => setExpanded2D(false)}
              >
                <X size={15} /> 閉じる
              </button>
            </div>
            <MvpArenaCanvas
              simState={sim}
              renderTick={renderTick}
              focusedMechId={focusedMechId}
              onSelectMech={setFocusedMechId}
              className="cm-arena-canvas--modal"
            />
          </div>
        </div>
      )}
    </div>
  );
}
