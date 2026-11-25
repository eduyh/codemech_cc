import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import pkg from '../package.json';
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
import {
  computeMechStats,
  getArmWeaponSpec,
  getControlTierSpec,
  getResolvedWeaponGroups,
  getShoulderWeaponSpec,
  isPassiveModuleSpec,
} from './data/parts';
import { DEFAULT_PILOT_PROFILE, PRESET_VANGUARD, STARTER_MECHS, STARTER_PILOTS } from './data/presets';
import {
  SavedCustomMech,
  deleteSavedCustomMech,
  extractCustomTagFromName,
  formatCustomMechName,
  getBaseMechName,
  isStarterMechId,
  loadSavedCustomMechs,
  normalizeCustomTag,
  saveCustomMech,
} from './utils/customMechStorage';
import {
  ROM_CATEGORY_SPECS,
  deleteUserRom,
  findRomById,
  formatRomLabel,
  getAllRoms,
  getRomCategory,
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
  MECH_SUBROUTINE_SLOT_SPECS,
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
  WEAPON_GROUP_IDS,
  WeaponGroupId,
  WeaponSlotId,
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
  playerPilot: PilotProfile,
  opponentOverride?: { blueprint: MechBlueprint; pilot?: PilotProfile }
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
      const useOpponentOverride = !isPlayer && formatId === '1v1' && Boolean(opponentOverride);
      const mechBp = isPlayer
        ? playerMech
        : useOpponentOverride
          ? opponentOverride!.blueprint
          : STARTER_MECHS[(t * fmt.perTeam + m + 1) % STARTER_MECHS.length];
      const pilot = isPlayer
        ? playerPilot
        : useOpponentOverride && opponentOverride!.pilot
          ? opponentOverride!.pilot
          : STARTER_PILOTS[(t + m) % STARTER_PILOTS.length];

      entries.push({
        id,
        name: isPlayer
          ? `★${mechBp.name}`
          : useOpponentOverride
            ? mechBp.name
            : `T${t + 1}-${m + 1}`,
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
  const [starterEdited, setStarterEdited] = useState(false);
  const [setupTag, setSetupTag] = useState(() => extractCustomTagFromName(playerMech.name));
  const [setupSaveNotice, setSetupSaveNotice] = useState('');
  const setupNoticeTimerRef = useRef<number | null>(null);
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
  const [opponentMechId, setOpponentMechId] = useState<string>(
    () => STARTER_MECHS[1]?.id ?? STARTER_MECHS[0].id
  );

  const initialSetup = useRef(
    buildMatchSetup('1v1', 'plains_ridge', PRESET_VANGUARD, 2026, DEFAULT_PILOT_PROFILE, {
      blueprint: resolveMechBlueprintRoms(
        structuredClone(STARTER_MECHS[1] ?? STARTER_MECHS[0]),
        getAllRoms(loadUserRoms())
      ),
    })
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
  const opponentMechIdRef = useRef<string>(opponentMechId);
  opponentMechIdRef.current = opponentMechId;

  const [renderTick, setRenderTick] = useState(0);
  const [playerDebugTrace, setPlayerDebugTrace] = useState<PilotDebugTrace | null>(null);

  useEffect(() => {
    setSetupTag(extractCustomTagFromName(playerMech.name));
  }, [playerMech.id, playerMech.name]);

  useEffect(() => {
    return () => {
      if (setupNoticeTimerRef.current !== null) {
        window.clearTimeout(setupNoticeTimerRef.current);
      }
    };
  }, []);

  const flashSetupNotice = useCallback((msg: string) => {
    setSetupSaveNotice(msg);
    if (setupNoticeTimerRef.current !== null) {
      window.clearTimeout(setupNoticeTimerRef.current);
    }
    setupNoticeTimerRef.current = window.setTimeout(() => {
      setSetupSaveNotice('');
      setupNoticeTimerRef.current = null;
    }, 2800);
  }, []);

  const resolveOpponentOverride = useCallback(
    (oppId: string): { blueprint: MechBlueprint; pilot?: PilotProfile } => {
      const custom = savedMechs.find((m) => m.id === oppId);
      if (custom) {
        const bp = resolveMechBlueprintRoms(structuredClone(custom.blueprint), allRoms);
        const matchedPilot = custom.pilotId
          ? allPilots.find((p) => p.id === custom.pilotId)
          : undefined;
        return {
          blueprint: bp,
          pilot: matchedPilot ? structuredClone(matchedPilot) : undefined,
        };
      }
      const starter =
        STARTER_MECHS.find((m) => m.id === oppId) ?? STARTER_MECHS[1] ?? STARTER_MECHS[0];
      return {
        blueprint: resolveMechBlueprintRoms(structuredClone(starter), allRoms),
      };
    },
    [savedMechs, allRoms, allPilots]
  );

  const resetMatch = useCallback(
    (
      nextFormat = formatId,
      nextArena = arenaPreset,
      nextMech = playerMechRef.current,
      nextSeed = seed,
      autoPlay = false,
      nextPilot = playerPilotRef.current,
      nextOpponentId = opponentMechIdRef.current
    ) => {
      const oppOverride =
        nextFormat === '1v1' ? resolveOpponentOverride(nextOpponentId) : undefined;
      const setup = buildMatchSetup(
        nextFormat,
        nextArena,
        nextMech,
        nextSeed,
        nextPilot,
        oppOverride
      );
      simRef.current = setup.sim;
      pilotProfilesRef.current = setup.pilotProfiles;
      pilotRuntimesRef.current = setup.pilotRuntimes;
      setFocusedMechId('mech_0_0');
      setPlayerDebugTrace(null);
      setPlaying(autoPlay);
      setRenderTick((n) => n + 1);
    },
    [formatId, arenaPreset, seed, resolveOpponentOverride]
  );

  const handleUpdatePlayerMech = useCallback(
    (nextMech: MechBlueprint) => {
      setPlayerMech(nextMech);
      playerMechRef.current = nextMech;
      if (isStarterMechId(nextMech.id)) {
        setStarterEdited(true);
      }
      if (simRef.current.tick === 0) {
        resetMatch(formatId, arenaPreset, nextMech, seed);
      }
    },
    [formatId, arenaPreset, seed, resetMatch]
  );

  const handleLoadMechBlueprint = useCallback(
    (bp: MechBlueprint, pilotId?: string) => {
      const cloned = resolveMechBlueprintRoms(structuredClone(bp), allRoms);
      setPlayerMech(cloned);
      playerMechRef.current = cloned;
      setStarterEdited(false);
      const matchedPilot = pilotId ? allPilots.find((p) => p.id === pilotId) : undefined;
      if (matchedPilot) {
        const clonedPilot = structuredClone(matchedPilot);
        setPlayerPilot(clonedPilot);
        playerPilotRef.current = clonedPilot;
        resetMatch(formatId, arenaPreset, cloned, seed, false, clonedPilot);
      } else {
        resetMatch(formatId, arenaPreset, cloned, seed);
      }
    },
    [allRoms, allPilots, formatId, arenaPreset, seed, resetMatch]
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
      const res = saveCustomMech(
        savedMechs,
        playerMechRef.current,
        tag,
        Date.now(),
        playerPilotRef.current.id
      );
      setSavedMechs(res.nextList);
      setStarterEdited(false);
      const savedClone = resolveMechBlueprintRoms(structuredClone(res.saved.blueprint), allRoms);
      setPlayerMech(savedClone);
      playerMechRef.current = savedClone;
      resetMatch(formatId, arenaPreset, savedClone, seed);
      return { saved: res.saved, updated: res.updated };
    },
    [savedMechs, allRoms, formatId, arenaPreset, seed, resetMatch]
  );

  const handleMountSetupRom = useCallback(
    (slotId: MechSubroutineSlotId, value: string) => {
      const cur = playerMechRef.current;
      const nextRomSlots: Partial<Record<MechSubroutineSlotId, string | null>> = {
        ...(cur.romSlots ?? {}),
        [slotId]: value === '__none__' ? null : value,
      };
      const nextMech = resolveMechBlueprintRoms(
        {
          ...cur,
          romSlots: nextRomSlots,
        },
        allRoms
      );
      handleUpdatePlayerMech(nextMech);
    },
    [allRoms, handleUpdatePlayerMech]
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
  const playerStats = useMemo(() => computeMechStats(playerMech), [playerMech]);
  const playerResolvedGroups = useMemo(() => getResolvedWeaponGroups(playerMech), [playerMech]);
  const playerEquippedWeapons = useMemo(() => {
    const ra = getArmWeaponSpec(playerMech.parts.rightArmWeapon);
    const la = getArmWeaponSpec(playerMech.parts.leftArmWeapon);
    const rs = getShoulderWeaponSpec(playerMech.parts.rightShoulderWeapon);
    const ls = getShoulderWeaponSpec(playerMech.parts.leftShoulderWeapon);
    return {
      rightArm: { spec: ra, equipped: ra.id !== 'arm_none', passive: isPassiveModuleSpec(ra) },
      leftArm: { spec: la, equipped: la.id !== 'arm_none', passive: isPassiveModuleSpec(la) },
      rightShoulder: { spec: rs, equipped: rs.id !== 'shd_none', passive: isPassiveModuleSpec(rs) },
      leftShoulder: { spec: ls, equipped: ls.id !== 'shd_none', passive: isPassiveModuleSpec(ls) },
    };
  }, [playerMech.parts]);

  const togglePlayerWeaponGroupMember = useCallback(
    (groupId: WeaponGroupId, slot: WeaponSlotId) => {
      const cur = playerResolvedGroups[groupId];
      const nextMembers = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot];
      handleUpdatePlayerMech({
        ...playerMechRef.current,
        weaponGroups: {
          ...playerResolvedGroups,
          [groupId]: nextMembers,
        },
      });
    },
    [playerResolvedGroups, handleUpdatePlayerMech]
  );

  const isStarterMech = isStarterMechId(playerMech.id);
  const isStarterDirty = isStarterMech && starterEdited;
  const isGarageFull = studioTab === 'garage';
  const effectiveOpponentMechId =
    savedMechs.some((m) => m.id === opponentMechId) ||
    STARTER_MECHS.some((m) => m.id === opponentMechId)
      ? opponentMechId
      : STARTER_MECHS[1]?.id ?? STARTER_MECHS[0].id;

  return (
    <div className="cm-studio">
      <header className="cm-topbar">
        <div className="cm-brand">
          <span className="cm-badge-icon" aria-hidden="true">
            <Cpu size={20} />
          </span>
          <div>
            <h1 className="cm-title">CodeMech.py</h1>
            <p className="cm-subtitle">ver{pkg.version}</p>
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
                ? 'プログラム (6×6 / 4×4×6枠)'
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
              allPilots={allPilots}
              userPilots={userPilots}
              isStarterDirty={isStarterDirty}
              onChange={handleUpdatePlayerMech}
              onSaveCustomMech={handleSaveCustomMech}
              onLoadBlueprint={handleLoadMechBlueprint}
              onDeleteCustomMech={handleDeleteCustomMech}
              onSelectPilot={(found) => {
                handleSelectPilot(found);
                if (isStarterMech) setStarterEdited(true);
              }}
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
              <div className="cm-ai-setup-card">
                <div className="cm-ai-setup-head">
                  <span>機体・AI・ルーチンセットアップ</span>
                  {playerStats.overweight && (
                    <span className="cm-ai-setup-overweight">重量超過</span>
                  )}
                </div>

                <div
                  className="cm-mech-select-row"
                  title="現在の搭乗機体を切り替えます（ユーザー機体は保存時のパイロット設定も復元）"
                >
                  <select
                    aria-label="搭乗機体選択"
                    value={playerMech.id}
                    onChange={(e) => {
                      const custom = savedMechs.find((m) => m.id === e.target.value);
                      if (custom) {
                        handleLoadMechBlueprint(custom.blueprint, custom.pilotId);
                        return;
                      }
                      const bp = STARTER_MECHS.find((m) => m.id === e.target.value);
                      if (bp) {
                        handleLoadMechBlueprint(bp);
                      }
                    }}
                  >
                    {savedMechs.length > 0 && (
                      <optgroup label="ユーザー機体">
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

                  <button
                    type="button"
                    className="cm-btn-primary-xs"
                    disabled={isStarterMech}
                    title={
                      isStarterMech
                        ? '標準機体は上書きできません。下の欄から新規ユーザー機体として保存してください'
                        : '現在のユーザー機体に上書き保存します'
                    }
                    onClick={() => {
                      const res = handleSaveCustomMech(setupTag);
                      setSetupTag(res.saved.tag);
                      const codeLabel = res.saved.blueprint.name.split(' ')[0] ?? res.saved.tag;
                      flashSetupNotice(`保存: ${codeLabel}`);
                    }}
                  >
                    保存
                  </button>
                  {setupSaveNotice && <span className="cm-save-notice">{setupSaveNotice}</span>}
                </div>

                {isStarterMech && (
                  <>
                    {isStarterDirty && (
                      <div className="cm-starter-save-guide cm-starter-save-guide--compact">
                        標準機体「{getBaseMechName(playerMech.chassisId)}」を編集中です。上書きできないため、識別名（半角3文字以内）を付けて新規ユーザー機体として保存してください。
                      </div>
                    )}
                    <div className="cm-starter-save-row">
                      <input
                        type="text"
                        className="cm-tag-input"
                        maxLength={3}
                        inputMode="text"
                        value={setupTag}
                        placeholder="C1等"
                        aria-label="ユーザー機体識別名（半角3文字まで）"
                        onChange={(e) => setSetupTag(normalizeCustomTag(e.target.value))}
                      />
                      <button
                        type="button"
                        className={`cm-btn-primary-xs ${isStarterDirty ? 'is-attention' : ''}`}
                        onClick={() => {
                          const res = handleSaveCustomMech(setupTag);
                          setSetupTag(res.saved.tag);
                          const codeLabel = res.saved.blueprint.name.split(' ')[0] ?? res.saved.tag;
                          flashSetupNotice(`新規保存: ${codeLabel}`);
                        }}
                      >
                        新規ユーザー機体として保存
                      </button>
                    </div>
                  </>
                )}

                <div className="cm-wgroup-quick-panel">
                  <div className="cm-wgroup-quick-note">
                    武装グループ (G1〜G4・ガレージ連動)
                  </div>
                  <div className="cm-wgroup-matrix">
                    {(
                      [
                        { slot: 'rightArm', label: '右腕' },
                        { slot: 'leftArm', label: '左腕' },
                        { slot: 'rightShoulder', label: '右胴' },
                        { slot: 'leftShoulder', label: '左胴' },
                      ] as const
                    ).map((row) => {
                      const info = playerEquippedWeapons[row.slot];
                      const activeUsable = info.equipped && !info.passive;
                      return (
                        <div
                          key={row.slot}
                          className={`cm-wgroup-row ${activeUsable ? '' : 'is-empty-slot'}`}
                        >
                          <span className="cm-wgroup-slot-label">
                            <b>{row.label}</b>: {info.equipped ? info.spec.name : '未装備'}
                          </span>
                          <div className="cm-wgroup-btns">
                            {WEAPON_GROUP_IDS.map((gid) => {
                              const active = playerResolvedGroups[gid].includes(row.slot);
                              return (
                                <button
                                  key={gid}
                                  type="button"
                                  disabled={info.passive}
                                  className={`cm-wgroup-btn ${
                                    active ? `is-active is-${gid.toLowerCase()}` : ''
                                  }`}
                                  onClick={() => togglePlayerWeaponGroupMember(gid, row.slot)}
                                >
                                  {gid}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <label
                  className="cm-ai-pilot-row"
                  style={!playerTierSpec.pilotEnabled ? { opacity: 0.55 } : undefined}
                  title={
                    playerTierSpec.pilotEnabled
                      ? 'パイロット 6×6 の AI を選択します'
                      : 'ロボット単体制御モード中はパイロット AI 未使用です'
                  }
                >
                  <span>パイロットAI</span>
                  <select
                    aria-label="パイロットAI選択"
                    disabled={!playerTierSpec.pilotEnabled}
                    value={playerPilot.id}
                    onChange={(e) => {
                      const found = allPilots.find((p) => p.id === e.target.value);
                      if (found) {
                        handleSelectPilot(found);
                        if (isStarterMech) setStarterEdited(true);
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

                <div className="cm-ai-rom-grid">
                  {MECH_SUBROUTINE_SLOT_SPECS.map((spec) => {
                    const slotEnabled = playerTierSpec.enabledSlots.includes(spec.slotId);
                    const refId = playerMech.romSlots?.[spec.slotId];
                    const inlineSub = playerMech.subroutines.find((s) => s.slotId === spec.slotId);
                    const resolvedRom =
                      typeof refId === 'string' ? findRomById(allRoms, refId) : undefined;
                    const isMissingRef = typeof refId === 'string' && !resolvedRom;
                    const selectValue =
                      refId === null
                        ? '__none__'
                        : typeof refId === 'string'
                          ? refId
                          : inlineSub
                            ? '__inline__'
                            : '__none__';
                    const userRomList = allRoms.filter((r) => !r.builtIn);
                    return (
                      <label
                        key={spec.slotId}
                        className={`cm-ai-rom-slot ${!slotEnabled ? 'is-disabled' : ''}`}
                      >
                        <span className="cm-ai-rom-slot-lbl">{spec.slotId}</span>
                        <select
                          aria-label={`${spec.slotId} ルーチン選択`}
                          disabled={!slotEnabled}
                          value={selectValue}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '__inline__') return;
                            handleMountSetupRom(spec.slotId, v);
                          }}
                        >
                          <option value="__none__">未搭載</option>
                          {selectValue === '__inline__' && inlineSub && (
                            <option value="__inline__">直接編集: {inlineSub.name}</option>
                          )}
                          {isMissingRef && typeof refId === 'string' && (
                            <option value={refId}>⚠ 欠損 ({refId})</option>
                          )}
                          {userRomList.length > 0 && (
                            <optgroup label="自作ルーチン">
                              {userRomList.map((r) => {
                                const cSpec = ROM_CATEGORY_SPECS.find(
                                  (c) => c.id === getRomCategory(r)
                                );
                                return (
                                  <option key={r.id} value={r.id}>
                                    [{cSpec?.short ?? '制'}] {formatRomLabel(r)}
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                          {ROM_CATEGORY_SPECS.map((cat) => {
                            const list = allRoms.filter(
                              (r) => r.builtIn && getRomCategory(r) === cat.id
                            );
                            if (list.length === 0) return null;
                            return (
                              <optgroup key={cat.id} label={`標準ルーチン・${cat.label}`}>
                                {list.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    [{cat.short}] {formatRomLabel(r)}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="cm-sim-control-card">
                <div className="cm-battle-cfg-bar">
                <div className="cm-battle-cfg-row">
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

                  {formatId === '1v1' && (
                    <label className="cm-ctl" title="1v1 の対戦相手機体を選択します">
                      <span>相手機体</span>
                      <select
                        aria-label="対戦相手機体選択"
                        value={effectiveOpponentMechId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setOpponentMechId(v);
                          resetMatch(
                            formatId,
                            arenaPreset,
                            playerMech,
                            seed,
                            false,
                            playerPilot,
                            v
                          );
                        }}
                      >
                        {savedMechs.length > 0 && (
                          <optgroup label="ユーザー機体">
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
                  )}
                </div>

                <div className="cm-battle-cfg-row">
                  <label className="cm-ctl">
                    <span>マップ</span>
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

                  <div className="cm-sim-clock">
                    {sim.terrain.width}×{sim.terrain.depth}m ・ Tick {sim.tick} / {sim.time.toFixed(1)}s
                    {sim.finished && (
                      <span className="cm-winner-pill">
                        勝者: {sim.winnerTeamId}
                      </span>
                    )}
                  </div>
                </div>
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
