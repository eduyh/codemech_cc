import { CURRICULUM_MISSIONS } from '../data/curriculum';
import { computeMechStats, getEffectiveSubroutineGridSize } from '../data/parts';
import {
  DEFAULT_PILOT_PROFILE,
  PILOT_BASIC_HEAVY,
  PRESET_ABH,
  PRESET_ABL,
} from '../data/presets';
import {
  CurriculumStepId,
  MatchParticipantEntry,
  MechBlueprint,
  MechControlInput,
  PilotProfile,
  SIM_TPS,
} from '../types/mech';
import type { ReplayPackageData } from '../utils/shareMech';
import { buildBattleCommentary } from './battlefield';
import { buildMechSensorState, createSimulation, stepSimulation } from './mechSim';
import { createPilotRuntimeState, evaluatePilotTick } from './pilotRuntime';

export interface CurriculumCheckItem {
  label: string;
  ok: boolean;
}

export interface CurriculumVerifyResult {
  missionId: CurriculumStepId;
  passed: boolean;
  checklist: CurriculumCheckItem[];
  summaryText: string;
  durationSec: number;
  replay: ReplayPackageData;
}

function makeTrainingTargetMech(
  base: MechBlueprint,
  armorScale: number,
  name: string
): MechBlueprint {
  const clone = structuredClone(base);
  clone.name = name;
  clone.armor = {
    head: Math.round(clone.armor.head * armorScale),
    torsoFront: Math.round(clone.armor.torsoFront * armorScale),
    torsoRear: Math.round(clone.armor.torsoRear * armorScale),
    rightShoulderFront: Math.round(clone.armor.rightShoulderFront * armorScale),
    rightShoulderRear: Math.round(clone.armor.rightShoulderRear * armorScale),
    leftShoulderFront: Math.round(clone.armor.leftShoulderFront * armorScale),
    leftShoulderRear: Math.round(clone.armor.leftShoulderRear * armorScale),
    rightArm: Math.round(clone.armor.rightArm * armorScale),
    leftArm: Math.round(clone.armor.leftArm * armorScale),
    rightLeg: Math.round(clone.armor.rightLeg * armorScale),
    leftLeg: Math.round(clone.armor.leftLeg * armorScale),
  };
  return clone;
}

function makeBasicTrainingPilot(desiredRange = 200): PilotProfile {
  return {
    version: 2,
    id: 'pilot_training_target',
    name: '訓練用標的AI',
    grid: {
      gridSize: 6,
      cells: [
        { row: 0, col: 0, op: 'start', dir: 'S' },
        { row: 1, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
        { row: 1, col: 1, op: 'call_s3', dir: 'E', target: 'main', param: desiredRange, durationSec: 0.3 },
        { row: 1, col: 2, op: 'call_s1', dir: 'S', target: 'main', durationSec: desiredRange > 180 ? 0.65 : 0.55 },
        { row: 2, col: 0, op: 'call_s3', dir: 'S', target: 'main', param: desiredRange, durationSec: 0.55 },
      ],
    },
  };
}

export function verifyCurriculumMission(
  missionId: CurriculumStepId,
  playerMech: MechBlueprint,
  playerPilot: PilotProfile
): CurriculumVerifyResult {
  const spec = CURRICULUM_MISSIONS.find((m) => m.id === missionId) ?? CURRICULUM_MISSIONS[0];
  const stats = computeMechStats(playerMech);
  const checklist: CurriculumCheckItem[] = [];

  checklist.push({
    label: '機体が積載・装甲上限内で有効である',
    ok: stats.valid,
  });

  const pilotCells = playerPilot.grid?.cells ?? [];
  const distinctCalls = new Set(
    pilotCells
      .filter((c) => c.op.startsWith('call_s'))
      .map((c) => c.op)
  );

  if (missionId === 'step0_robot_4x4') {
    const s1 = playerMech.subroutines.find((s) => s.slotId === 'S1');
    const effSize = Math.min(4, getEffectiveSubroutineGridSize(playerMech, 'S1'));
    const s1Active = (s1?.cells ?? []).filter(
      (c) =>
        c.row >= 0 &&
        c.row < effSize &&
        c.col >= 0 &&
        c.col < effSize &&
        c.op !== 'empty' &&
        c.op !== 'start' &&
        c.op !== 'wire'
    );
    const hasMove = s1Active.some((c) => c.op.startsWith('move_') && c.op !== 'move_stop');
    const hasTorso = s1Active.some((c) => c.op.startsWith('torso_'));
    const hasFire = s1Active.some((c) => c.op.startsWith('fire_'));
    checklist.push({
      label: 'ロボット S1 (4×4 枠内) に移動・腰照準・射撃を含む 3 マス以上の行動が組まれている',
      ok: s1Active.length >= 3 && hasMove && hasTorso && hasFire,
    });
  } else if (missionId === 'step0b_robot_6x6') {
    const s1 = playerMech.subroutines.find((s) => s.slotId === 'S1');
    const effSize = getEffectiveSubroutineGridSize(playerMech, 'S1');
    const s1Active = (s1?.cells ?? []).filter(
      (c) =>
        c.row >= 0 &&
        c.row < effSize &&
        c.col >= 0 &&
        c.col < effSize &&
        c.op !== 'empty' &&
        c.op !== 'start' &&
        c.op !== 'wire'
    );
    const hasBranch = s1Active.some((c) => c.op.startsWith('if_'));
    checklist.push({
      label: 'ロボット S1 (4×4 枠内) に条件分岐 (if) を含む 5 マス以上の戦術がある',
      ok: effSize === 4 && s1Active.length >= 5 && hasBranch,
    });
  } else if (missionId === 'step1_pilot_routing') {
    checklist.push({
      label: 'パイロット 6×6 で 2 種類以上のサブルーチン (CALL S*) を呼び分けている',
      ok: distinctCalls.size >= 2,
    });
  } else if (missionId === 'step2_heat_hysteresis') {
    const hasHeatBranch = pilotCells.some((c) => c.op === 'if_heat_above');
    const hasCooling = pilotCells.some(
      (c) => c.op === 'call_s4' || c.op === 'emergency_cool'
    );
    checklist.push({
      label: 'パイロット 6×6 に熱量分岐 (熱>%) と冷却行動が組み込まれている',
      ok: hasHeatBranch && hasCooling,
    });
  } else if (missionId === 'step3_subroutine_4x4') {
    const subs4 = playerMech.subroutines.filter(
      (s) => s.slotId === 'S3' || s.slotId === 'S4' || s.slotId === 'S5'
    );
    const hasRich4x4 = subs4.some(
      (s) =>
        s.cells.filter((c) => c.op !== 'empty' && c.op !== 'start' && c.op !== 'wire').length >= 4
    );
    checklist.push({
      label: '機体 4×4 枠 (S3〜S5) のいずれかに 4 マス以上の行動が組まれている',
      ok: hasRich4x4,
    });
  } else if (missionId === 'step4_assemble_and_6x6') {
    checklist.push({
      label: '中央胴の前装甲が後装甲より厚く配分されている',
      ok: playerMech.armor.torsoFront > playerMech.armor.torsoRear,
    });
    const s1 = playerMech.subroutines.find((s) => s.slotId === 'S1');
    const s1Active = (s1?.cells ?? []).filter(
      (c) =>
        c.row >= 0 &&
        c.row < 4 &&
        c.col >= 0 &&
        c.col < 4 &&
        c.op !== 'empty' &&
        c.op !== 'start' &&
        c.op !== 'wire'
    );
    const s1HasBranch = s1Active.some((c) => c.op.startsWith('if_'));
    checklist.push({
      label: 'S1 (4×4) に分岐を含む 5 マス以上の主交戦アルゴリズムがある',
      ok: s1Active.length >= 5 && s1HasBranch,
    });
  } else if (missionId === 'step5_transfer_squad') {
    checklist.push({
      label: 'パイロット 6×6 で 3 種類以上の機体サブルーチン (S1〜S5) を呼び分けている',
      ok: distinctCalls.size >= 3,
    });
  }

  // Build mission participants
  const entries: MatchParticipantEntry[] = [
    {
      id: 'player',
      name: playerMech.name,
      teamId: 'T_PLAYER',
      blueprint: playerMech,
      pilot: playerPilot,
    },
  ];

  const trainingPilot = makeBasicTrainingPilot();
  if (missionId === 'step0_robot_4x4') {
    entries.push({
      id: 'enemy_1',
      name: '基礎訓練標的',
      teamId: 'T_ENEMY',
      blueprint: makeTrainingTargetMech(PRESET_ABL, 0.35, '基礎訓練標的'),
      pilot: trainingPilot,
    });
  } else if (missionId === 'step0b_robot_6x6') {
    entries.push({
      id: 'enemy_1',
      name: '応用訓練スカウト',
      teamId: 'T_ENEMY',
      blueprint: makeTrainingTargetMech(PRESET_ABL, 0.5, '応用訓練スカウト'),
      pilot: trainingPilot,
    });
  } else if (missionId === 'step1_pilot_routing') {
    entries.push({
      id: 'enemy_1',
      name: '訓練用スカウト',
      teamId: 'T_ENEMY',
      blueprint: makeTrainingTargetMech(PRESET_ABL, 0.55, '訓練用スカウト'),
      pilot: trainingPilot,
    });
  } else if (missionId === 'step2_heat_hysteresis') {
    entries.push({
      id: 'enemy_1',
      name: '演習用スカウト',
      teamId: 'T_ENEMY',
      blueprint: makeTrainingTargetMech(PRESET_ABL, 0.52, '演習用スカウト'),
      pilot: trainingPilot,
    });
  } else if (missionId === 'step3_subroutine_4x4') {
    entries.push({
      id: 'enemy_1',
      name: '訓練用重スカウト',
      teamId: 'T_ENEMY',
      blueprint: makeTrainingTargetMech(PRESET_ABL, 0.5, '訓練用重スカウト'),
      pilot: trainingPilot,
    });
  } else if (missionId === 'step4_assemble_and_6x6') {
    entries.push({
      id: 'enemy_1',
      name: '市街地演習機',
      teamId: 'T_ENEMY',
      blueprint: makeTrainingTargetMech(PRESET_ABL, 0.45, '市街地演習機'),
      pilot: trainingPilot,
    });
  } else {
    // step5: 2v2 squad battle
    entries.push({
      id: 'ally_1',
      name: '僚機 XHD',
      teamId: 'T_PLAYER',
      blueprint: PRESET_ABH,
      pilot: PILOT_BASIC_HEAVY,
    });
    entries.push({
      id: 'enemy_1',
      name: '軽強襲機 LLB',
      teamId: 'T_ENEMY',
      blueprint: makeTrainingTargetMech(PRESET_ABL, 0.4, '軽強襲機 LLB'),
      pilot: makeBasicTrainingPilot(140),
    });
    const trainingHeavy = makeTrainingTargetMech(PRESET_ABH, 0.3, '重火力機2号');
    trainingHeavy.parts.rightArmWeapon = 'large_laser';
    trainingHeavy.parts.leftArmWeapon = 'arm_none';
    trainingHeavy.parts.rightShoulderWeapon = 'shd_none';
    trainingHeavy.parts.leftShoulderWeapon = 'shd_none';
    trainingHeavy.weaponMountCounts = undefined;
    trainingHeavy.weaponGroups = {
      G1: ['rightArm'],
      G2: ['rightArm'],
      G3: ['rightArm'],
      G4: ['rightArm'],
    };
    entries.push({
      id: 'enemy_2',
      name: '重火力機2号',
      teamId: 'T_ENEMY',
      blueprint: trainingHeavy,
      pilot: makeBasicTrainingPilot(210),
    });
  }

  const replay: ReplayPackageData = {
    title: spec.title,
    recordedAt: new Date().toISOString(),
    matchSeed: spec.seed,
    rules: {
      maxSeconds: spec.maxSeconds,
      friendlyFire: false,
      headDestructionKills: true,
      arenaPreset: spec.arenaPreset,
      arenaWidth: 600,
      arenaDepth: 600,
    },
    participants: entries.map((e) => ({
      id: e.id,
      name: e.name,
      teamId: e.teamId,
      mech: e.blueprint,
      pilot: e.pilot ?? DEFAULT_PILOT_PROFILE,
    })),
  };

  const sim = createSimulation({
    seed: spec.seed,
    rules: replay.rules,
    entries,
  });
  const runtimes = Object.fromEntries(
    entries.map((e) => [e.id, createPilotRuntimeState(e.pilot ?? DEFAULT_PILOT_PROFILE)])
  );
  const profiles = Object.fromEntries(
    entries.map((e) => [e.id, e.pilot ?? DEFAULT_PILOT_PROFILE])
  );

  let s1Triggered = 0;
  let sub4Triggered = 0;
  const maxTicks = Math.ceil(spec.maxSeconds * SIM_TPS) + 5;

  for (let t = 0; t < maxTicks && !sim.finished; t++) {
    const controls: Record<string, MechControlInput> = {};
    for (const mech of sim.mechs) {
      if (!mech.alive) continue;
      const sensor = buildMechSensorState(sim, mech.id);
      const out = evaluatePilotTick(profiles[mech.id], runtimes[mech.id], sensor, mech, sim);
      controls[mech.id] = out.control;
      if (mech.id === 'player') {
        if (out.activeSubroutineSlot === 'S1') s1Triggered += 1;
        if (
          out.activeSubroutineSlot === 'S3' ||
          out.activeSubroutineSlot === 'S4' ||
          out.activeSubroutineSlot === 'S5'
        ) {
          sub4Triggered += 1;
        }
      }
    }
    stepSimulation(sim, controls);
  }

  if (missionId === 'step3_subroutine_4x4') {
    checklist.push({
      label: '模擬戦で 4×4 サブルーチン (S3〜S5) が実際に実行された',
      ok: sub4Triggered > 0,
    });
  } else if (missionId === 'step4_assemble_and_6x6') {
    checklist.push({
      label: '模擬戦で S1 (4×4) 主交戦ルーチンが実行された',
      ok: s1Triggered > 0,
    });
  } else if (missionId === 'step2_heat_hysteresis') {
    const playerRuntimeMech = sim.mechs.find((m) => m.id === 'player');
    checklist.push({
      label: '熱暴走（ヒートメルトダウン）を起こさずに戦い抜いた',
      ok: playerRuntimeMech?.destroyedReason !== 'heat_meltdown',
    });
  } else if (missionId === 'step5_transfer_squad') {
    const transferSim = createSimulation({
      seed: spec.seed + 1,
      rules: { maxSeconds: 10, arenaPreset: spec.arenaPreset },
      entries: [
        { id: 'tx_player', name: '乗換機', teamId: 'T_PLAYER', blueprint: PRESET_ABH, pilot: playerPilot },
        { id: 'tx_enemy', name: '標的', teamId: 'T_ENEMY', blueprint: PRESET_ABL, pilot: trainingPilot },
      ],
    });
    const txRt = createPilotRuntimeState(playerPilot);
    let txValid = true;
    for (let t = 0; t < 30; t++) {
      const m0 = transferSim.mechs[0];
      const m1 = transferSim.mechs[1];
      if (!m0.alive || !m1.alive) break;
      const out0 = evaluatePilotTick(
        playerPilot,
        txRt,
        buildMechSensorState(transferSim, 'tx_player'),
        m0,
        transferSim
      );
      stepSimulation(transferSim, { tx_player: out0.control });
      if (!Number.isFinite(m0.pos.x)) txValid = false;
    }
    checklist.push({
      label: '別機体 (XHD) へのパイロット 6×6 乗り換え適性確認',
      ok: txValid,
    });
  }

  const wonMatch = sim.winnerTeamId === 'T_PLAYER';
  checklist.push({
    label: '指定シードの模擬戦に勝利した',
    ok: wonMatch,
  });

  const passed = checklist.every((c) => c.ok);
  const commentary = buildBattleCommentary(sim, {
    T_PLAYER: 'プレイヤー側',
    T_ENEMY: '演習相手',
  });

  return {
    missionId,
    passed,
    checklist,
    summaryText: commentary.summaryText,
    durationSec: sim.time,
    replay,
  };
}
