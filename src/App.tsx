import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Cpu,
  Grid2X2,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Shuffle,
  StepForward,
  Swords,
  Wrench,
} from 'lucide-react';
import { CurriculumPanel } from './components/CurriculumPanel';
import { GridProgramEditor } from './components/GridProgramEditor';
import { MechCanvas3D } from './components/MechCanvas3D';
import { MechGarage } from './components/MechGarage';
import { MechPartsHud } from './components/MechPartsHud';
import { MvpArenaCanvas } from './components/MvpArenaCanvas';
import { ShareModal } from './components/ShareModal';
import { CURRICULUM_MISSIONS } from './data/curriculum';
import { getControlTierSpec } from './data/parts';
import { DEFAULT_PILOT_PROFILE, PRESET_VANGUARD, STARTER_MECHS, STARTER_PILOTS } from './data/presets';
import {
  SavedCustomMech,
  deleteSavedCustomMech,
  formatCustomMechName,
  loadSavedCustomMechs,
  saveCustomMech,
} from './utils/customMechStorage';
import {
  deleteUserRom,
  getAllRoms,
  loadUserRoms,
  resolveMechBlueprintRoms,
  saveUserRom,
} from './utils/romLibrary';
import {
  deleteUserPilot,
  getAllPilots,
  loadUserPilots,
  saveUserPilot,
} from './utils/pilotLibrary';
import { createSimFromReplay } from './engine/battlefield';
import { buildMechSensorState, createSimulation, stepSimulation } from './engine/mechSim';
import {
  PilotRuntimeState,
  createPilotRuntimeState,
  evaluatePilotTick,
} from './engine/pilotRuntime';
import {
  ArenaPresetId,
  MatchParticipantEntry,
  MechBlueprint,
  MechControlInput,
  MechSubroutineCell,
  MechSubroutineSlotId,
  PilotDebugTrace,
  PilotGridCell,
  PilotProfile,
  ProgramRomEntry,
  RomCategory,
  SIM_TPS,
  SimState,
} from './types/mech';

type FormatId = '1v1' | '3x3' | '2x6' | '3x4' | '4x3' | '6x2' | 'br12';

const FORMAT_OPTIONS: Array<{ id: FormatId; label: string; teams: number; perTeam: number }> = [
  { id: '1v1', label: '1v1 (2機・学習向け)', teams: 2, perTeam: 1 },
  { id: '3x3', label: '3機×3チーム (9機)', teams: 3, perTeam: 3 },
  { id: '2x6', label: '2機×6チーム (12機)', teams: 6, perTeam: 2 },
  { id: '3x4', label: '3機×4チーム (12機)', teams: 4, perTeam: 3 },
  { id: '4x3', label: '4機×3チーム (12機)', teams: 3, perTeam: 4 },
  { id: '6x2', label: '6機×2チーム (12機)', teams: 2, perTeam: 6 },
  { id: 'br12', label: '12機バトロワ', teams: 12, perTeam: 1 },
];

const ARENA_OPTIONS: Array<{ id: ArenaPresetId; label: string }> = [
  { id: 'plains_ridge', label: '中央稜線 (ハルダウン)' },
  { id: 'twin_mesas', label: '双子メサ高台' },
  { id: 'urban_pillars', label: '市街地ピラー遮蔽' },
  { id: 'valley_basin', label: '外周高台盆地' },
];

const RENDER_INTERVAL_MS = 1000 / SIM_TPS;

function buildMatchSetup(
  formatId: FormatId,
  arenaPreset: ArenaPresetId,
  playerMech: MechBlueprint,
  seed: number,
  playerPilot: PilotProfile
): {
  sim: SimState;
  pilotProfiles: Record<string, PilotProfile>;
  pilotRuntimes: Record<string, PilotRuntimeState>;
} {
  const fmt = FORMAT_OPTIONS.find((f) => f.id === formatId) ?? FORMAT_OPTIONS[0];
  const entries: MatchParticipantEntry[] = [];
  const pilotProfiles: Record<string, PilotProfile> = {};
  const pilotRuntimes: Record<string, PilotRuntimeState> = {};

  for (let t = 0; t < fmt.teams; t++) {
    for (let m = 0; m < fmt.perTeam; m++) {
      const id = `mech_${t}_${m}`;
      const isPlayer = t === 0 && m === 0;
      const mechBp = isPlayer
        ? playerMech
        : STARTER_MECHS[(t * fmt.perTeam + m + 1) % STARTER_MECHS.length];
      const pilot = isPlayer
        ? playerPilot
        : STARTER_PILOTS[(t + m) % STARTER_PILOTS.length];

      entries.push({
        id,
        name: isPlayer ? `★${mechBp.name}` : `T${t + 1}-${m + 1}`,
        teamId: `T${t + 1}`,
        blueprint: mechBp,
        pilot,
      });
      pilotProfiles[id] = pilot;
      pilotRuntimes[id] = createPilotRuntimeState(pilot);
    }
  }

  const sim = createSimulation({
    seed,
    rules: { arenaPreset, maxSeconds: 240 },
    entries,
  });

  return { sim, pilotProfiles, pilotRuntimes };
}

type StudioTab = 'program' | 'garage' | 'curriculum';

export default function App() {
  const [formatId, setFormatId] = useState<FormatId>('1v1');
  const [arenaPreset, setArenaPreset] = useState<ArenaPresetId>('plains_ridge');
  const [userRoms, setUserRoms] = useState<ProgramRomEntry[]>(() => loadUserRoms());
  const allRoms = useMemo(() => getAllRoms(userRoms), [userRoms]);
  const [userPilots, setUserPilots] = useState<PilotProfile[]>(() => loadUserPilots());
  const allPilots = useMemo(() => getAllPilots(userPilots), [userPilots]);
  const [playerMech, setPlayerMech] = useState<MechBlueprint>(() =>
    resolveMechBlueprintRoms(structuredClone(PRESET_VANGUARD), getAllRoms(loadUserRoms()))
  );
  const [savedMechs, setSavedMechs] = useState<SavedCustomMech[]>(() => loadSavedCustomMechs());
  const [seed, setSeed] = useState(2026);
  const [playerPilot, setPlayerPilot] = useState<PilotProfile>(() =>
    structuredClone(DEFAULT_PILOT_PROFILE)
  );
  const [studioTab, setStudioTab] = useState<StudioTab>('program');
  const [shareOpen, setShareOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [focusedMechId, setFocusedMechId] = useState('mech_0_0');

  const initialSetup = useRef(
    buildMatchSetup('1v1', 'plains_ridge', PRESET_VANGUARD, 2026, DEFAULT_PILOT_PROFILE)
  );
  const simRef = useRef<SimState>(initialSetup.current.sim);
  const pilotProfilesRef = useRef<Record<string, PilotProfile>>(initialSetup.current.pilotProfiles);
  const pilotRuntimesRef = useRef<Record<string, PilotRuntimeState>>(
    initialSetup.current.pilotRuntimes
  );
  const playerPilotRef = useRef<PilotProfile>(playerPilot);
  playerPilotRef.current = playerPilot;
  const playerMechRef = useRef<MechBlueprint>(playerMech);
  playerMechRef.current = playerMech;

  const [renderTick, setRenderTick] = useState(0);
  const [playerDebugTrace, setPlayerDebugTrace] = useState<PilotDebugTrace | null>(null);

  const resetMatch = useCallback(
    (
      nextFormat = formatId,
      nextArena = arenaPreset,
      nextMech = playerMechRef.current,
      nextSeed = seed,
      autoPlay = false,
      nextPilot = playerPilotRef.current
    ) => {
      const setup = buildMatchSetup(
        nextFormat,
        nextArena,
        nextMech,
        nextSeed,
        nextPilot
      );
      simRef.current = setup.sim;
      pilotProfilesRef.current = setup.pilotProfiles;
      pilotRuntimesRef.current = setup.pilotRuntimes;
      setFocusedMechId('mech_0_0');
      setPlayerDebugTrace(null);
      setPlaying(autoPlay);
      setRenderTick((n) => n + 1);
    },
    [formatId, arenaPreset, seed]
  );

  const handleUpdatePlayerMech = useCallback(
    (nextMech: MechBlueprint) => {
      setPlayerMech(nextMech);
      playerMechRef.current = nextMech;
      if (simRef.current.tick === 0) {
        resetMatch(formatId, arenaPreset, nextMech, seed);
      }
    },
    [formatId, arenaPreset, seed, resetMatch]
  );

  const handleLoadMechBlueprint = useCallback(
    (bp: MechBlueprint) => {
      const cloned = resolveMechBlueprintRoms(structuredClone(bp), allRoms);
      setPlayerMech(cloned);
      playerMechRef.current = cloned;
      resetMatch(formatId, arenaPreset, cloned, seed);
    },
    [allRoms, formatId, arenaPreset, seed, resetMatch]
  );

  const handleSaveUserRom = useCallback(
    (input: {
      id?: string;
      name: string;
      category?: RomCategory;
      gridSize: 4 | 6;
      cells: MechSubroutineCell[];
      slotId?: MechSubroutineSlotId;
    }) => {
      const res = saveUserRom(userRoms, {
        id: input.id,
        name: input.name,
        category: input.category,
        gridSize: 4,
        cells: input.cells,
      });
      setUserRoms(res.nextList);
      const nextAllRoms = getAllRoms(res.nextList);
      const cur = playerMechRef.current;
      const nextBpInput: MechBlueprint = input.slotId
        ? {
            ...cur,
            romSlots: {
              ...(cur.romSlots ?? {}),
              [input.slotId]: res.saved.id,
            },
          }
        : cur;
      const nextMech = resolveMechBlueprintRoms(nextBpInput, nextAllRoms);
      setPlayerMech(nextMech);
      playerMechRef.current = nextMech;
      if (simRef.current.tick === 0) {
        resetMatch(formatId, arenaPreset, nextMech, seed);
      }
      return { saved: res.saved, updated: res.updated };
    },
    [userRoms, formatId, arenaPreset, seed, resetMatch]
  );

  const handleDeleteUserRom = useCallback(
    (romId: string) => {
      const nextUserRoms = deleteUserRom(userRoms, romId);
      setUserRoms(nextUserRoms);
      const nextAllRoms = getAllRoms(nextUserRoms);
      const nextMech = resolveMechBlueprintRoms(playerMechRef.current, nextAllRoms);
      setPlayerMech(nextMech);
      playerMechRef.current = nextMech;
      if (simRef.current.tick === 0) {
        resetMatch(formatId, arenaPreset, nextMech, seed);
      }
    },
    [userRoms, formatId, arenaPreset, seed, resetMatch]
  );

  const handleSaveCustomMech = useCallback(
    (tag: string) => {
      const res = saveCustomMech(savedMechs, playerMechRef.current, tag);
      setSavedMechs(res.nextList);
      const savedClone = resolveMechBlueprintRoms(structuredClone(res.saved.blueprint), allRoms);
      setPlayerMech(savedClone);
      playerMechRef.current = savedClone;
      resetMatch(formatId, arenaPreset, savedClone, seed);
      return { saved: res.saved, updated: res.updated };
    },
    [savedMechs, allRoms, formatId, arenaPreset, seed, resetMatch]
  );

  const handleDeleteCustomMech = useCallback(
    (id: string) => {
      setSavedMechs((prev) => deleteSavedCustomMech(prev, id));
    },
    []
  );

  const handleUpdatePlayerPilot = useCallback(
    (nextPilot: PilotProfile) => {
      setPlayerPilot(nextPilot);
      playerPilotRef.current = nextPilot;
      if (simRef.current.tick === 0) {
        resetMatch(formatId, arenaPreset, playerMechRef.current, seed, false, nextPilot);
      }
    },
    [formatId, arenaPreset, seed, resetMatch]
  );

  const handleSelectPilot = useCallback(
    (selected: PilotProfile) => {
      handleUpdatePlayerPilot(structuredClone(selected));
    },
    [handleUpdatePlayerPilot]
  );

  const handleSaveUserPilot = useCallback(
    (input: { id?: string; name: string; cells: PilotGridCell[] }) => {
      const res = saveUserPilot(userPilots, input);
      setUserPilots(res.nextList);
      handleUpdatePlayerPilot(structuredClone(res.saved));
      return { saved: res.saved, updated: res.updated };
    },
    [userPilots, handleUpdatePlayerPilot]
  );

  const handleDeleteUserPilot = useCallback(
    (pilotId: string) => {
      const nextList = deleteUserPilot(userPilots, pilotId);
      setUserPilots(nextList);
      if (playerPilotRef.current.id === pilotId) {
        handleUpdatePlayerPilot(structuredClone(DEFAULT_PILOT_PROFILE));
      }
    },
    [userPilots, handleUpdatePlayerPilot]
  );

  const advanceOneTick = useCallback(() => {
    const sim = simRef.current;
    if (sim.finished) {
      setPlaying(false);
      return;
    }

    const controls: Record<string, MechControlInput> = {};
    let nextTrace: PilotDebugTrace | null = null;

    for (const mech of sim.mechs) {
      if (!mech.alive) continue;
      const isPlayerMech = mech.id === 'mech_0_0' || mech.id === 'player';
      const profile = isPlayerMech
        ? playerPilotRef.current
        : pilotProfilesRef.current[mech.id] ?? DEFAULT_PILOT_PROFILE;
      const runtime = pilotRuntimesRef.current[mech.id];
      const sensor = buildMechSensorState(sim, mech.id);
      const out = evaluatePilotTick(profile, runtime, sensor, mech, sim);
      controls[mech.id] = out.control;
      if (isPlayerMech) {
        nextTrace = out.debugTrace;
      }
    }

    stepSimulation(sim, controls);
    setPlayerDebugTrace(nextTrace);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    let lastFrameTime = performance.now();

    const loop = (now: number) => {
      if (now - lastFrameTime >= RENDER_INTERVAL_MS) {
        lastFrameTime = now - ((now - lastFrameTime) % RENDER_INTERVAL_MS);
        for (let i = 0; i < speed; i++) {
          if (simRef.current.finished) break;
          advanceOneTick();
        }
        setRenderTick((n) => n + 1);
        if (simRef.current.finished) {
          setPlaying(false);
          return;
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [playing, speed, advanceOneTick]);

  const sim = simRef.current;
  const focusedMech = sim.mechs.find((m) => m.id === focusedMechId) ?? sim.mechs[0];
  const playerSimMech = sim.mechs.find((m) => m.id === 'mech_0_0' || m.id === 'player');
  const livePlayerSensor = playerSimMech ? buildMechSensorState(sim, playerSimMech.id) : null;
  const recentEvents = sim.events.slice(-8).reverse();
  const playerTierSpec = getControlTierSpec(playerMech.controlTier);
  const isGarageFull = studioTab === 'garage';

  return (
    <div className="cm-studio">
      <header className="cm-topbar">
        <div className="cm-brand">
          <span className="cm-badge-icon" aria-hidden="true">
            <Cpu size={20} />
          </span>
          <div>
            <h1 className="cm-title">CodeMech.py</h1>
            <p className="cm-subtitle">
              ver0.1.0 — 3D メック戦＆階層グリッドプログラミング教材 (パイロット 6×6 ＋ 4×4 ROM 最大5枠)
            </p>
          </div>
        </div>

        <div className="cm-topbar-nav">
          <div className="cm-studio-tabs" role="tablist">
            <button
              type="button"
              className={studioTab === 'program' ? 'cm-studio-tab is-active' : 'cm-studio-tab'}
              onClick={() => setStudioTab('program')}
            >
              <Grid2X2 size={15} />{' '}
              {playerTierSpec.pilotEnabled
                ? 'プログラム (6×6 / 4×4×5枠)'
                : `プログラム (${playerTierSpec.shortLabel})`}
            </button>
            <button
              type="button"
              className={studioTab === 'garage' ? 'cm-studio-tab is-active' : 'cm-studio-tab'}
              onClick={() => {
                setPlaying(false);
                setStudioTab('garage');
              }}
            >
              <Wrench size={15} /> 機体ガレージ
            </button>
            <a className="cm-studio-tab cm-studio-tab--arena" href="?app=battlefield">
              <Swords size={15} /> バトルフィールド
            </a>
            <button
              type="button"
              className={studioTab === 'curriculum' ? 'cm-studio-tab is-active' : 'cm-studio-tab'}
              onClick={() => setStudioTab('curriculum')}
            >
              <Award size={15} /> 学習課題 ({CURRICULUM_MISSIONS.length}問)
            </button>
          </div>

          <button
            type="button"
            className="cm-btn-secondary"
            onClick={() => setShareOpen(true)}
          >
            <Share2 size={15} /> 共有・読込
          </button>
        </div>
      </header>

      <main className={`cm-workspace ${isGarageFull ? 'is-garage-full' : ''}`}>
        <div className="cm-col-left">
          {studioTab === 'program' && (
            <GridProgramEditor
              pilot={playerPilot}
              allPilots={allPilots}
              mech={playerMech}
              allRoms={allRoms}
              debugTrace={playerDebugTrace}
              liveSensor={livePlayerSensor}
              onChangePilot={handleUpdatePlayerPilot}
              onSelectPilot={handleSelectPilot}
              onSavePilot={handleSaveUserPilot}
              onDeletePilot={handleDeleteUserPilot}
              onChangeMech={handleUpdatePlayerMech}
              onSaveRom={handleSaveUserRom}
              onDeleteRom={handleDeleteUserRom}
            />
          )}

          {studioTab === 'garage' && (
            <MechGarage
              blueprint={playerMech}
              savedMechs={savedMechs}
              allRoms={allRoms}
              pilot={playerPilot}
              onChange={handleUpdatePlayerMech}
              onSaveCustomMech={handleSaveCustomMech}
              onLoadBlueprint={handleLoadMechBlueprint}
              onDeleteCustomMech={handleDeleteCustomMech}
            />
          )}

          {studioTab === 'curriculum' && (
            <CurriculumPanel
              playerMech={playerMech}
              playerPilot={playerPilot}
              onLoadBrokenStarter={(brokenMech, brokenPilot, mArena, mSeed) => {
                setPlayerMech(brokenMech);
                playerMechRef.current = brokenMech;
                setPlayerPilot(brokenPilot);
                playerPilotRef.current = brokenPilot;
                setFormatId('1v1');
                setArenaPreset(mArena);
                setSeed(mSeed);
                resetMatch('1v1', mArena, brokenMech, mSeed, false, brokenPilot);
                setStudioTab('program');
              }}
              onPlayMissionReplay={(replay) => {
                const built = createSimFromReplay(replay);
                simRef.current = built.sim;
                pilotProfilesRef.current = built.pilotProfiles;
                pilotRuntimesRef.current = built.pilotRuntimes;
                setFocusedMechId(built.sim.mechs[0]?.id ?? 'player');
                setPlayerDebugTrace(null);
                setPlaying(true);
                setRenderTick((n) => n + 1);
              }}
            />
          )}
        </div>

        {!isGarageFull && (
          <div className="cm-col-right">
            <section className="cm-panel">
              <div className="cm-battle-cfg-bar">
                <label className="cm-ctl">
                  <span>対戦形式</span>
                  <select
                    value={formatId}
                    onChange={(e) => {
                      const v = e.target.value as FormatId;
                      setFormatId(v);
                      resetMatch(v, arenaPreset, playerMech, seed);
                    }}
                  >
                    {FORMAT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="cm-ctl">
                  <span>地形</span>
                  <select
                    value={arenaPreset}
                    onChange={(e) => {
                      const v = e.target.value as ArenaPresetId;
                      setArenaPreset(v);
                      resetMatch(formatId, v, playerMech, seed);
                    }}
                  >
                    {ARENA_OPTIONS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="cm-ctl" title="現在のパイロット 6×6 を保ったまま搭乗機体を乗り換えます">
                  <span>搭乗機体(乗換)</span>
                  <select
                    value={playerMech.id}
                    onChange={(e) => {
                      const custom = savedMechs.find((m) => m.id === e.target.value);
                      if (custom) {
                        handleLoadMechBlueprint(custom.blueprint);
                        return;
                      }
                      const bp = STARTER_MECHS.find((m) => m.id === e.target.value);
                      if (bp) {
                        handleLoadMechBlueprint(bp);
                      }
                    }}
                  >
                    {savedMechs.length > 0 && (
                      <optgroup label="保存済みカスタム">
                        {savedMechs.map((m) => (
                          <option key={m.id} value={m.id}>
                            {formatCustomMechName(m.baseName, m.tag)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="標準機体">
                      {STARTER_MECHS.map((bp) => (
                        <option key={bp.id} value={bp.id}>
                          {bp.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>

                <label
                  className="cm-ctl"
                  style={!playerTierSpec.pilotEnabled ? { opacity: 0.52 } : undefined}
                  title={
                    playerTierSpec.pilotEnabled
                      ? 'パイロット 6×6 の AI 雛形を切り替えます'
                      : 'ロボット単体制御モード中はパイロット AI 未使用です'
                  }
                >
                  <span>AI雛形{!playerTierSpec.pilotEnabled ? ' (単体中)' : ''}</span>
                  <select
                    disabled={!playerTierSpec.pilotEnabled}
                    value={playerPilot.id}
                    onChange={(e) => {
                      const found = allPilots.find((p) => p.id === e.target.value);
                      if (found) {
                        handleSelectPilot(found);
                      }
                    }}
                  >
                    {!allPilots.some((p) => p.id === playerPilot.id) && (
                      <option value={playerPilot.id}>{playerPilot.name}</option>
                    )}
                    {userPilots.length > 0 && (
                      <optgroup label="自作パイロット">
                        {userPilots.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="標準パイロット">
                      {STARTER_PILOTS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>

                <label className="cm-ctl cm-ctl--seed">
                  <span>Seed</span>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => {
                      const s = Number(e.target.value) || 1;
                      setSeed(s);
                      resetMatch(formatId, arenaPreset, playerMech, s);
                    }}
                  />
                  <button
                    type="button"
                    className="cm-icon-btn"
                    onClick={() => {
                      const next = ((seed * 1664525 + 1013904223) >>> 0) % 100000;
                      setSeed(next);
                      resetMatch(formatId, arenaPreset, playerMech, next);
                    }}
                    title="シード変更"
                  >
                    <Shuffle size={14} />
                  </button>
                </label>
              </div>

              <div className="cm-sim-bar">
                <div className="cm-sim-btns">
                  <button
                    type="button"
                    className="cm-btn-primary"
                    onClick={() => {
                      if (!playing && sim.finished) {
                        resetMatch(formatId, arenaPreset, playerMechRef.current, seed, true);
                        return;
                      }
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? <Pause size={15} /> : <Play size={15} />}
                    {playing ? '一時停止' : '模擬戦再生'}
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
                    onClick={() => resetMatch()}
                  >
                    <RotateCcw size={15} /> リセット
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
                  {sim.terrain.width}×{sim.terrain.depth}m ・ Tick {sim.tick} / {sim.time.toFixed(1)}s
                  {sim.finished && (
                    <span className="cm-winner-pill">
                      勝者: {sim.winnerTeamId}
                    </span>
                  )}
                </div>
              </div>

              <div className="cm-arena-wrap">
                {viewMode === '3d' ? (
                  <MechCanvas3D
                    simState={sim}
                    renderTick={renderTick}
                    focusedMechId={focusedMechId}
                    onSelectMech={setFocusedMechId}
                  />
                ) : (
                  <MvpArenaCanvas
                    simState={sim}
                    renderTick={renderTick}
                    focusedMechId={focusedMechId}
                    onSelectMech={setFocusedMechId}
                  />
                )}

                <div className="cm-roster-strip">
                  {sim.mechs.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setFocusedMechId(m.id)}
                      className={`cm-roster-pill ${
                        m.id === focusedMechId ? 'is-selected' : ''
                      } ${!m.alive ? 'is-dead' : ''}`}
                    >
                      <span>{m.name}</span>
                      <small>{m.teamId}</small>
                    </button>
                  ))}
                </div>
              </div>

              <MechPartsHud mech={focusedMech} />

              <div className="cm-event-log">
                <div className="cm-event-title">戦況ログ (直近)</div>
                {recentEvents.length === 0 ? (
                  <div className="cm-event-empty">再生ボタンを押すと模擬戦ログが表示されます</div>
                ) : (
                  recentEvents.map((ev, i) => (
                    <div key={`${ev.tick}-${i}`} className="cm-event-row">
                      <span>T{ev.tick}</span>
                      <span>{ev.type}</span>
                      <span>
                        {ev.actorId} {ev.targetId ? `→ ${ev.targetId}` : ''}{' '}
                        {ev.partId ? `[${ev.partId}${ev.face && ev.face !== 'all' ? `:${ev.face}` : ''}]` : ''}{' '}
                        {ev.damage ? `${Math.round(ev.damage)}dmg` : ''}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      <ShareModal
        open={shareOpen}
        mech={playerMech}
        pilot={playerPilot}
        onClose={() => setShareOpen(false)}
        onImportMechAndPilot={(nextMech, nextPilot) => {
          setPlayerMech(nextMech);
          playerMechRef.current = nextMech;
          setPlayerPilot(nextPilot);
          playerPilotRef.current = nextPilot;
          resetMatch(formatId, arenaPreset, nextMech, seed, false, nextPilot);
        }}
        onImportPilotOnly={(nextPilot) => {
          setPlayerPilot(nextPilot);
          playerPilotRef.current = nextPilot;
          resetMatch(formatId, arenaPreset, playerMechRef.current, seed, false, nextPilot);
        }}
      />
    </div>
  );
}
