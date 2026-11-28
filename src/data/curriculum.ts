import {
  ArenaPresetId,
  CurriculumStepId,
  MechBlueprint,
  MechControlTier,
  MechSubroutineCell,
  PilotProfile,
} from '../types/mech';
import {
  DEFAULT_PILOT_PROFILE,
  PILOT_BASIC,
  PRESET_ABH,
  PRESET_ABL,
  PRESET_ABC,
} from './presets';
import {
  buildBasicDirectFireCells,
  buildBasicS1FireCells,
  buildBasicS2LrmCells,
  buildBasicS3MoveCells,
  buildBasicS5CloseCells,
} from './romTemplates';

export type CurriculumPartId = 'part1_basics' | 'part2_tactics';

export interface CurriculumPartMeta {
  id: CurriculumPartId;
  label: string;
  subtitle: string;
}

export interface CurriculumLessonMeta {
  lessonNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  part: CurriculumPartId;
  durationMin: 60;
  title: string;
  summary: string;
}

export interface CurriculumMissionSpec {
  id: CurriculumStepId;
  part: CurriculumPartId;
  lessonNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  stageCode: string;
  stepNumber: number;
  controlTier: MechControlTier;
  title: string;
  subtitle: string;
  csConcept: string;
  goal: string;
  hint: string;
  modelSolutionSummary: string;
  arenaPreset: ArenaPresetId;
  seed: number;
  maxSeconds: number;
  buildBrokenStarter: () => { mech: MechBlueprint; pilot: PilotProfile };
  buildModelSolution: () => { mech: MechBlueprint; pilot: PilotProfile };
}

export const CURRICULUM_PARTS: readonly CurriculumPartMeta[] = [
  {
    id: 'part1_basics',
    label: '第1部：プログラミング基礎（60分×4コマ）',
    subtitle: '順次処理・条件分岐・ループ＆状態制御・関数化/引数を風船と陣とりマスで習得',
  },
  {
    id: 'part2_tactics',
    label: '第2部：CodeMech戦術システム（60分×4コマ）',
    subtitle: '部位装甲・腰ひねり・武器クリティカル・電子戦・180t小隊編成まで実践攻略',
  },
];

export const CURRICULUM_LESSONS: readonly CurriculumLessonMeta[] = [
  {
    lessonNumber: 1,
    part: 'part1_basics',
    durationMin: 60,
    title: '第1コマ：順次処理と命令の並び順',
    summary: '4×4単体パネルで「進む→狙う→撃つ」の順序と矢印配線ループを学ぶ',
  },
  {
    lessonNumber: 2,
    part: 'part1_basics',
    durationMin: 60,
    title: '第2コマ：条件分岐 (if/else) としきい値',
    summary: '距離分岐・障害物ジャンプ・視界索敵で状況に応じた行動分岐を組む',
  },
  {
    lessonNumber: 3,
    part: 'part1_basics',
    durationMin: 60,
    title: '第3コマ：ループ・冷却ヒステリシス・状態切替',
    summary: '無駄な待機を排した連射ループ、75%/45%冷却ループ、停止占領を組む',
  },
  {
    lessonNumber: 4,
    part: 'part1_basics',
    durationMin: 60,
    title: '第4コマ：階層AI・サブルーチン引数 (ARG)',
    summary: 'パイロット6×6から4×4サブルーチンを呼び分け、ARG引数でROMを再利用する',
  },
  {
    lessonNumber: 5,
    part: 'part2_tactics',
    durationMin: 60,
    title: '第5コマ：部位装甲・腰ひねり防御・狙点 (胴/脚/腕)',
    summary: '背面回り込み・脚部破壊・右脆い検知による腰ひねり盾受けと腕もぎを実践',
  },
  {
    lessonNumber: 6,
    part: 'part2_tactics',
    durationMin: 60,
    title: '第6コマ：武装個性・クリティカル・機体設計',
    summary: '装甲剥離＋MGクリティカルコンボ、ガレージ改修、アウトレンジ距離維持',
  },
  {
    lessonNumber: 7,
    part: 'part2_tactics',
    durationMin: 60,
    title: '第7コマ：電子戦 (RCS/ECM/BAP) ＆ ミサイル戦',
    summary: '僚機スポッター曲射LRM、AMS＋被ミサイル回避、BAP/PPCによるECM突破',
  },
  {
    lessonNumber: 8,
    part: 'part2_tactics',
    durationMin: 60,
    title: '第8コマ：汎用パイロット・180t小隊 ＆ 修了戦',
    summary: '軽量/重量機へのAI乗り換え、180t 3機小隊構築、バトルフィールド本戦へ',
  },
];

function cloneWithS1(
  base: MechBlueprint,
  name: string,
  tier: MechControlTier,
  cells: MechSubroutineCell[]
): MechBlueprint {
  const mech = structuredClone(base);
  mech.name = name;
  mech.controlTier = tier;
  if (mech.romSlots) delete mech.romSlots.S1;
  mech.subroutines = mech.subroutines.map((s) =>
    s.slotId === 'S1'
      ? {
          slotId: 'S1',
          name: `${name} (S1)`,
          gridSize: 4,
          cells,
        }
      : s
  );
  return mech;
}

function makeUnusedPilot(id = 'pilot_direct_unused'): PilotProfile {
  return structuredClone(DEFAULT_PILOT_PROFILE);
  void id;
}

export const CURRICULUM_MISSIONS: readonly CurriculumMissionSpec[] = [
  /* ======================================================================== */
  /* PART 1: プログラミング基礎 (1-1 .. 4-3)                                   */
  /* ======================================================================== */
  {
    id: 'p1_1_capture_walk',
    part: 'part1_basics',
    lessonNumber: 1,
    stageCode: '1-1',
    stepNumber: 1,
    controlTier: 'direct_4x4',
    title: '1-1: 前進して陣とりマスを確保せよ',
    subtitle: '最初のプログラム！STARTから矢印をつないで目的地まで歩こう',
    csConcept: '順次処理とラッチ制御 (START → 接近)',
    goal: '4×4 パネル (S1) に「接近」を入れて陣とりマス A (北 200m) へ移動し、2.0秒間確保して 100% にする',
    hint: 'START マスの右どなり (1行2列) に「移動:接近」を置き、向きを矢印でつないでみましょう。「接近」は一度通ると次の移動命令まで自動で目標へ向かい続けます。',
    modelSolutionSummary: '(0,0) START(→) → (0,1) 接近(↓) の最短構成で北の陣とりマスへ移動し、自動停止して 100% 占領します。',
    arenaPreset: 'urban_pillars',
    seed: 10101,
    maxSeconds: 60,
    buildBrokenStarter: () => ({
      mech: cloneWithS1(PRESET_ABC, '訓練1号機 (1-1)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_stop', dir: 'S' },
      ]),
      pilot: makeUnusedPilot(),
    }),
    buildModelSolution: () => ({
      mech: cloneWithS1(PRESET_ABC, '訓練1号機 模範 (1-1)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_approach', dir: 'S' },
      ]),
      pilot: makeUnusedPilot(),
    }),
  },
  {
    id: 'p1_2_balloon_pop',
    part: 'part1_basics',
    lessonNumber: 1,
    stageCode: '1-2',
    stepNumber: 2,
    controlTier: 'direct_4x4',
    title: '1-2: 風船割り入門 (移動→照準→射撃)',
    subtitle: '「近づいて・腰を向けて・撃つ」の 3ステップを並べよう',
    csConcept: '順次実行とアクチュエータ連携 (脚・腰・武装)',
    goal: '4×4 (S1) に移動・腰追尾・G1射撃を含む 3 マス以上を並べ、固定バルーンを撃破する',
    hint: '(1,1) START(→) → (1,2) 移動:接近(→) → (1,3) 腰:敵追尾(→) → (1,4) 撃:G1(↓) のように一列につないで再生してみましょう。',
    modelSolutionSummary: '移動・腰追尾・G1射撃の 3 命令を横一列につなぐことで、バルーンへ接近しながらレーザーを命中させて撃破します。',
    arenaPreset: 'urban_pillars',
    seed: 10102,
    maxSeconds: 80,
    buildBrokenStarter: () => ({
      mech: cloneWithS1(PRESET_ABC, '訓練2号機 (1-2)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_stop', dir: 'E' },
        { row: 0, col: 2, op: 'wait', dir: 'S', durationSec: 0.6 },
      ]),
      pilot: makeUnusedPilot(),
    }),
    buildModelSolution: () => ({
      mech: cloneWithS1(PRESET_ABC, '訓練2号機 模範 (1-2)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_approach', dir: 'E' },
        { row: 0, col: 2, op: 'torso_track', dir: 'E' },
        { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
      ]),
      pilot: makeUnusedPilot(),
    }),
  },
  {
    id: 'p1_3_debug_order',
    part: 'part1_basics',
    lessonNumber: 1,
    stageCode: '1-3',
    stepNumber: 3,
    controlTier: 'direct_4x4',
    title: '1-3: 壊れたロボを直せ (3連バルーン)',
    subtitle: '命令の順番と腰の向きがズレているバグ機体を修理しよう',
    csConcept: 'デバッグ（命令順・ラッチ上書きの修正）',
    goal: '壊れた 4×4 プログラムを直し、3つの固定バルーンすべてを時間内に撃破する',
    hint: 'バグ入り機体は「腰:左ひねり」を入れた後に「停止」したまま撃つため、的の方を向いていません。「左ひねり」を「腰:敵追尾」に、「停止」を「移動:接近」に直してみましょう。',
    modelSolutionSummary: '腰を固定ひねりから「腰:敵追尾」へ、停止を「接近」へ直すことで、3つのバルーンを順にロックして撃破できます。',
    arenaPreset: 'urban_pillars',
    seed: 10103,
    maxSeconds: 100,
    buildBrokenStarter: () => {
      const m = cloneWithS1(PRESET_ABC, 'バグ修理機 (1-3)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'torso_twist_l', dir: 'E' },
        { row: 0, col: 2, op: 'move_stop', dir: 'E' },
        { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.5 },
      ]);
      m.parts.rightShoulderWeapon = 'medium_laser';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightShoulder'],
        G2: ['rightShoulder'],
        G3: ['rightShoulder'],
        G4: ['rightShoulder'],
      };
      return { mech: m, pilot: makeUnusedPilot() };
    },
    buildModelSolution: () => {
      const m = cloneWithS1(PRESET_ABC, '修理完了機 模範 (1-3)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_approach', dir: 'E' },
        { row: 0, col: 2, op: 'torso_track', dir: 'E' },
        { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.4 },
      ]);
      m.parts.rightShoulderWeapon = 'medium_laser';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightShoulder'],
        G2: ['rightShoulder'],
        G3: ['rightShoulder'],
        G4: ['rightShoulder'],
      };
      return { mech: m, pilot: makeUnusedPilot() };
    },
  },
  {
    id: 'p1_4_range_branch',
    part: 'part1_basics',
    lessonNumber: 2,
    stageCode: '2-1',
    stepNumber: 4,
    controlTier: 'direct_4x4',
    title: '2-1: 距離で武器を使い分けろ (if/else)',
    subtitle: '近距離用レーザー (G1) と長距離ミサイル (G2) を距離条件で切り替える',
    csConcept: '条件分岐 (if_enemy_dist_lt) としきい値設定',
    goal: '4×4 (S1) に「敵距離<150?」等の条件分岐を組み、至近バルーン (90m) と遠距離バルーン (360m) を両方撃破する',
    hint: 'G2 の遠距離ミサイルは 120m 未満だと不発になります！ 「敵距離<150?」で YES (↓) なら「撃:G1 (小レーザー)」、NO (→) なら「撃:G2 (LRM)」へつなぎ、どちらも配線 (wire) で「腰:敵追尾」へ戻しましょう。',
    modelSolutionSummary: '距離<150m判定で近距離バルーンをG1小レーザー、遠距離バルーンをG2 LRMで撃ち分け、2周目以降も配線で腰追尾へ戻します。',
    arenaPreset: 'plains_ridge',
    seed: 10201,
    maxSeconds: 100,
    buildBrokenStarter: () => {
      const m = cloneWithS1(PRESET_ABC, '武器分岐訓練機 (2-1)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_stop', dir: 'E' },
        { row: 0, col: 2, op: 'torso_track', dir: 'E' },
        // Bug: always fires G2 (LRM has minRange 120m!) so the 90m near balloon blocks everything
        { row: 0, col: 3, op: 'fire_group_2', dir: 'S', durationSec: 0.5 },
      ]);
      m.parts.rightArmWeapon = 'small_laser';
      m.parts.leftArmWeapon = 'arm_none';
      m.parts.rightShoulderWeapon = 'shd_none';
      m.parts.leftShoulderWeapon = 'lrm10';
      m.weaponGroups = {
        G1: ['rightArm'],
        G2: ['leftShoulder'],
        G3: ['rightArm'],
        G4: ['rightArm', 'leftShoulder'],
      };
      return { mech: m, pilot: makeUnusedPilot() };
    },
    buildModelSolution: () => {
      const m = cloneWithS1(PRESET_ABC, '武器分岐 模範 (2-1)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'torso_track', dir: 'E' },
        { row: 0, col: 2, op: 'if_enemy_dist_lt', dir: 'S', elseDir: 'E', param: 150 },
        { row: 0, col: 3, op: 'fire_group_2', dir: 'S', durationSec: 0.45 },
        { row: 1, col: 2, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
        { row: 1, col: 3, op: 'wire', dir: 'S' },
        { row: 2, col: 3, op: 'wire', dir: 'W' },
        { row: 2, col: 2, op: 'wire', dir: 'W' },
        { row: 2, col: 1, op: 'wire', dir: 'N' },
        { row: 1, col: 1, op: 'move_stop', dir: 'N' },
      ]);
      m.parts.rightArmWeapon = 'small_laser';
      m.parts.leftArmWeapon = 'arm_none';
      m.parts.rightShoulderWeapon = 'shd_none';
      m.parts.leftShoulderWeapon = 'lrm10';
      m.weaponGroups = {
        G1: ['rightArm'],
        G2: ['leftShoulder'],
        G3: ['rightArm'],
        G4: ['rightArm', 'leftShoulder'],
      };
      return { mech: m, pilot: makeUnusedPilot() };
    },
  },
  {
    id: 'p1_5_jump_wall',
    part: 'part1_basics',
    lessonNumber: 2,
    stageCode: '2-2',
    stepNumber: 5,
    controlTier: 'direct_4x4',
    title: '2-2: 障害物を跳び越えて屋上陣とり！',
    subtitle: '「前に壁がある?」で検知してジャンプジェットで 15m ビルの屋上へ登れ',
    csConcept: 'センサ分岐 (if_obstacle_ahead) と立体的移動',
    goal: '「前に障害物?」→「跳躍 (move_jump)」を 4×4 (S1) に組み込み、高さ 15m 建物の屋上陣とりマスを確保する',
    hint: 'ビルの壁にぶつかって止まってしまいます。(1,2)移動:接近 → (1,3)前に障害物?(YES↓ / NO←) → YES先(2,3)に「跳躍 (前方)」を置いて左と上へ配線で戻しましょう。',
    modelSolutionSummary: '「接近」で屋上マス直下へ進み、壁に近づくと「前に障害物?」が YES になって前方ジャンプを発動し、屋上へ着地して確保します。',
    arenaPreset: 'urban_pillars',
    seed: 10202,
    maxSeconds: 60,
    buildBrokenStarter: () => {
      const m = cloneWithS1(PRESET_ABL, '壁前足止め機 (2-2)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_approach', dir: 'S' },
      ]);
      m.boosterEnabled = true;
      return { mech: m, pilot: makeUnusedPilot() };
    },
    buildModelSolution: () => {
      const m = cloneWithS1(PRESET_ABL, '屋上跳躍 模範 (2-2)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_approach', dir: 'E' },
        { row: 0, col: 2, op: 'if_obstacle_ahead', dir: 'S', elseDir: 'W' },
        { row: 1, col: 2, op: 'move_jump', dir: 'W', jumpDir: 'forward', durationSec: 0.75 },
        { row: 1, col: 1, op: 'wire', dir: 'N' },
      ]);
      m.boosterEnabled = true;
      return { mech: m, pilot: makeUnusedPilot() };
    },
  },
  {
    id: 'p1_6_moving_balloons',
    part: 'part1_basics',
    lessonNumber: 2,
    stageCode: '2-3',
    stepNumber: 6,
    controlTier: 'direct_4x4',
    title: '2-3: 逃げ回る 2 つの風船を追い詰めろ',
    subtitle: '視界分岐と追従・腰追尾で移動する標的を捉え続ける',
    csConcept: '視界センサ分岐 (if_enemy_in_sight) と動的追尾',
    goal: '4×4 (S1) に視界分岐 (`if_enemy_in_sight`) を組み込み、移動する 2つのバルーンを撃破する',
    hint: 'バルーンが左右に逃げると射界から外れます。「視界に敵?」が YES なら接近＋腰追尾＋射撃、NO なら接近で車体を旋回させて視界に入れましょう。',
    modelSolutionSummary: '敵が視界にいなくても接近旋回で正面に捉え直し、視界に入った瞬間に腰追尾＋G1射撃を行う分岐ループで 2機とも撃破します。',
    arenaPreset: 'plains_ridge',
    seed: 10203,
    maxSeconds: 110,
    buildBrokenStarter: () => ({
      mech: cloneWithS1(PRESET_ABC, '固定砲台バグ機 (2-3)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_stop', dir: 'E' },
        { row: 0, col: 2, op: 'torso_center', dir: 'E' },
        { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.5 },
      ]),
      pilot: makeUnusedPilot(),
    }),
    buildModelSolution: () => ({
      mech: cloneWithS1(PRESET_ABC, '移動追尾 模範 (2-3)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
        { row: 0, col: 2, op: 'move_approach', dir: 'E' },
        { row: 0, col: 3, op: 'torso_track', dir: 'S' },
        { row: 1, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.35 },
        { row: 2, col: 3, op: 'wire', dir: 'W' },
        { row: 2, col: 2, op: 'wire', dir: 'W' },
        { row: 2, col: 1, op: 'wire', dir: 'N' },
        { row: 1, col: 1, op: 'move_approach', dir: 'E' },
        { row: 1, col: 2, op: 'torso_track', dir: 'S' },
      ]),
      pilot: makeUnusedPilot(),
    }),
  },
  {
    id: 'p1_7_rapid_loop',
    part: 'part1_basics',
    lessonNumber: 3,
    stageCode: '3-1',
    stepNumber: 7,
    controlTier: 'direct_4x4',
    title: '3-1: 無駄待ちを削る連射判定ループ',
    subtitle: '固定 wait を消して「G1可? (if_group_1_ready)」の高速ポーリングに書き換えよう',
    csConcept: 'イベント駆動ポーリングとループ最適化',
    goal: '待機 (wait) を使わず「G1可?」の判定ループを組み、制限時間 26秒以内に高耐久バルーンを撃破する',
    hint: 'バグ機体は 1発撃つごとに 2.5秒の `待機 (wait)` を挟むため時間切れになります。待機マスの代わりに「G1可?」を置き、YES→撃:G1、NO→腰追尾へ戻すと最短間隔で連射できます！',
    modelSolutionSummary: '無駄な固定 2.5秒ウェイトを削り、`if_group_1_ready` でクールダウン完了を即検知して中口径レーザーを最速回転させることで 26秒以内に撃破します。',
    arenaPreset: 'urban_pillars',
    seed: 10301,
    maxSeconds: 26,
    buildBrokenStarter: () => {
      const m = cloneWithS1(PRESET_ABC, '遅すぎ待機機 (3-1)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_approach', dir: 'E' },
        { row: 0, col: 2, op: 'torso_track', dir: 'E' },
        { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.4 },
        { row: 1, col: 3, op: 'wait', dir: 'S', durationSec: 2.8 },
        { row: 2, col: 3, op: 'wait', dir: 'W', durationSec: 2.0 },
        { row: 2, col: 2, op: 'wire', dir: 'W' },
        { row: 2, col: 1, op: 'wire', dir: 'N' },
        { row: 1, col: 1, op: 'wire', dir: 'N' },
      ]);
      m.parts.rightArmWeapon = 'medium_laser';
      m.parts.leftArmWeapon = 'medium_laser';
      m.parts.rightShoulderWeapon = 'shd_none';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightArm', 'leftArm'],
        G2: ['rightArm'],
        G3: ['leftArm'],
        G4: ['rightArm', 'leftArm'],
      };
      return { mech: m, pilot: makeUnusedPilot() };
    },
    buildModelSolution: () => {
      const m = cloneWithS1(PRESET_ABC, '高速連射ループ 模範 (3-1)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_approach', dir: 'E' },
        { row: 0, col: 2, op: 'torso_track', dir: 'E' },
        { row: 0, col: 3, op: 'if_group_1_ready', dir: 'S', elseDir: 'W' },
        { row: 1, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.35 },
        { row: 2, col: 3, op: 'wire', dir: 'W' },
        { row: 2, col: 2, op: 'wire', dir: 'W' },
        { row: 2, col: 1, op: 'wire', dir: 'N' },
        { row: 1, col: 1, op: 'wire', dir: 'N' },
      ]);
      m.parts.rightArmWeapon = 'medium_laser';
      m.parts.leftArmWeapon = 'medium_laser';
      m.parts.rightShoulderWeapon = 'shd_none';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightArm', 'leftArm'],
        G2: ['rightArm'],
        G3: ['leftArm'],
        G4: ['rightArm', 'leftArm'],
      };
      return { mech: m, pilot: makeUnusedPilot() };
    },
  },
  {
    id: 'p1_8_heat_hysteresis',
    part: 'part1_basics',
    lessonNumber: 3,
    stageCode: '3-2',
    stepNumber: 8,
    controlTier: 'direct_4x4',
    title: '3-2: 熱暴走を防ぐヒステリシス制御',
    subtitle: '50%で冷却開始、25%を下回るまで冷やし切る状態ループを 4×4 で組め',
    csConcept: 'ヒステリシス制御（2段階しきい値ループ）',
    goal: '4×4 (S1) に「熱>%」「熱<%」「緊急冷却」を組み合わせ、熱シャットダウン・過熱ダメージ 0 回で 3つのバルーンを撃破する',
    hint: '3門同時発射 (G1) は 1射で大きく発熱します！バグ機体は OVERRIDE ON のまま撃ち続けて自爆するため、OVERRIDE ON を消して「熱>50%?」の YES(↓) 先に「緊急冷却(↓) → 熱<25%?(NO↑なら緊急冷却へ戻る / YES←で戦線復帰)」のヒステリシス・ループを組みましょう！',
    modelSolutionSummary: '1射の発熱量を見越して熱>50%で早めに冷却ループへ入り、熱<25%まで `emergency_cool` を繰り返すヒステリシスにより、一度も停止せず3標的を撃破します。',
    arenaPreset: 'twin_mesas',
    seed: 10302,
    maxSeconds: 140,
    buildBrokenStarter: () => {
      const m = cloneWithS1(PRESET_ABC, 'ABC (高発熱仕様)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'override_on', dir: 'E' },
        { row: 0, col: 2, op: 'move_approach', dir: 'E' },
        { row: 0, col: 3, op: 'torso_track', dir: 'S' },
        { row: 1, col: 3, op: 'fire_group_1', dir: 'N', durationSec: 0.55 },
      ]);
      m.extraHeatSinks = 0;
      m.weaponMountCounts = undefined;
      m.parts.rightArmWeapon = 'large_laser';
      m.parts.leftArmWeapon = 'medium_laser';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightArm', 'leftArm', 'rightShoulder'],
        G2: ['rightShoulder'],
        G3: ['rightArm'],
        G4: ['rightArm', 'leftArm', 'rightShoulder'],
      };
      m.armor = {
        ...m.armor,
        torsoFront: 200,
        rightShoulderFront: 105,
        leftShoulderFront: 105,
      };
      return { mech: m, pilot: makeUnusedPilot() };
    },
    buildModelSolution: () => {
      const m = cloneWithS1(PRESET_ABC, 'ABC 高発熱冷却 模範 (3-2)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'if_heat_above', dir: 'S', elseDir: 'E', param: 48 },
        { row: 0, col: 2, op: 'move_approach', dir: 'E' },
        { row: 0, col: 3, op: 'torso_track', dir: 'S' },
        { row: 1, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
        { row: 2, col: 3, op: 'wire', dir: 'S' },
        { row: 3, col: 3, op: 'wire', dir: 'W' },
        { row: 3, col: 2, op: 'wire', dir: 'W' },
        { row: 3, col: 1, op: 'wire', dir: 'W' },
        { row: 3, col: 0, op: 'wire', dir: 'N' },
        // Hysteresis cooling loop: cool until heat < 25%
        { row: 1, col: 1, op: 'emergency_cool', dir: 'S', durationSec: 0.45 },
        { row: 2, col: 1, op: 'if_heat_below', dir: 'W', elseDir: 'N', param: 25 },
        { row: 2, col: 0, op: 'wire', dir: 'N' },
        { row: 1, col: 0, op: 'wire', dir: 'N' },
      ]);
      m.extraHeatSinks = 0;
      m.weaponMountCounts = undefined;
      m.parts.rightArmWeapon = 'large_laser';
      m.parts.leftArmWeapon = 'medium_laser';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightArm', 'leftArm', 'rightShoulder'],
        G2: ['rightShoulder'],
        G3: ['rightArm'],
        G4: ['rightArm', 'leftArm', 'rightShoulder'],
      };
      m.armor = {
        ...m.armor,
        torsoFront: 200,
        rightShoulderFront: 105,
        leftShoulderFront: 105,
      };
      return { mech: m, pilot: makeUnusedPilot() };
    },
  },
  {
    id: 'p1_9_zone_and_pop',
    part: 'part1_basics',
    lessonNumber: 3,
    stageCode: '3-3',
    stepNumber: 9,
    controlTier: 'direct_4x4',
    title: '3-3: 陣地を踏み止まって狙撃せよ',
    subtitle: '移動しっぱなしで素通りしないよう、距離条件で「停止占領＆射撃」へ切り替えよ',
    csConcept: 'フェーズ遷移制御（接近フェーズ → 陣地維持射撃）',
    goal: '4×4 (S1) に「敵距離<240?」と「停止 (move_stop)」を入れ、陣とりマス A (4.5秒) を素早く確保しつつ前方バルーンを撃破する',
    hint: 'そのまま接近を続けると陣とりマス A を素通りして制限時間 (20秒) に間に合いません。「敵距離<240?」が YES のときに「停止」を入れて陣とりマス内に踏み止まりながら G1 レーザーでバルーンを撃ちましょう！',
    modelSolutionSummary: 'バルーンとの距離 240m 未満（陣とりマス A 内）で `move_stop` へ切り替えることで、素通りせず最短で占領 100% と撃破を同時に達成します。',
    arenaPreset: 'urban_pillars',
    seed: 10303,
    maxSeconds: 20,
    buildBrokenStarter: () => ({
      mech: cloneWithS1(PRESET_ABC, '素通り暴走機 (3-3)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_approach', dir: 'E' },
        { row: 0, col: 2, op: 'torso_track', dir: 'E' },
        { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
      ]),
      pilot: makeUnusedPilot(),
    }),
    buildModelSolution: () => ({
      mech: cloneWithS1(PRESET_ABC, '陣地狙撃 模範 (3-3)', 'direct_4x4', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'if_enemy_dist_lt', dir: 'S', elseDir: 'E', param: 240 },
        { row: 0, col: 2, op: 'move_approach', dir: 'E' },
        { row: 0, col: 3, op: 'torso_track', dir: 'S' },
        { row: 1, col: 1, op: 'move_stop', dir: 'E' },
        { row: 1, col: 2, op: 'torso_track', dir: 'E' },
        { row: 1, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
        { row: 2, col: 3, op: 'wire', dir: 'W' },
        { row: 2, col: 2, op: 'wire', dir: 'W' },
        { row: 2, col: 1, op: 'wire', dir: 'W' },
        { row: 2, col: 0, op: 'wire', dir: 'N' },
        { row: 1, col: 0, op: 'wire', dir: 'N' },
      ]),
      pilot: makeUnusedPilot(),
    }),
  },
  {
    id: 'p1_10_pilot_6x6',
    part: 'part1_basics',
    lessonNumber: 4,
    stageCode: '4-1',
    stepNumber: 10,
    controlTier: 'pilot_full',
    title: '4-1: パイロット 6×6 デビュー（配線の修理）',
    subtitle: 'ここから上位AI (6×6) を搭載！壊れた呼び出し配線を直して S1 と S3 を使い分けろ',
    csConcept: '階層制御 (メイン 6×6 → サブルーチン 4×4)',
    goal: 'パイロット 6×6 で 2 つ以上のサブルーチン (CALL S1 と S3) を呼び分け、訓練標的に勝利する',
    hint: 'バグ入り課題では「視界に敵?」が YES なのに S3 (移動のみ) を呼び出し、NO の先が空のまま止まっています。YES→CALL S1 (交戦)、NO→CALL S3 (索敵移動) に直しましょう！',
    modelSolutionSummary: '敵が視界にいれば `CALL S1` で攻撃し、見失ったら `CALL S3` で索敵移動する2分岐メインルーチンにより勝利します。',
    arenaPreset: 'plains_ridge',
    seed: 10401,
    maxSeconds: 150,
    buildBrokenStarter: () => {
      const mech = structuredClone(PRESET_ABC);
      mech.controlTier = 'pilot_full';
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p1_10_pilot',
        name: '4-1 バグ入りパイロット',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 1, col: 1, op: 'call_s3', dir: 'S', target: 'main', durationSec: 0.6 },
          ],
        },
      };
      return { mech, pilot };
    },
    buildModelSolution: () => {
      const mech = structuredClone(PRESET_ABC);
      mech.controlTier = 'pilot_full';
      return { mech, pilot: structuredClone(PILOT_BASIC) };
    },
  },
  {
    id: 'p1_11_subroutine_arg',
    part: 'part1_basics',
    lessonNumber: 4,
    stageCode: '4-2',
    stepNumber: 11,
    controlTier: 'pilot_full',
    title: '4-2: 引数 ARG で 1 つの ROM を使い回せ',
    subtitle: '同じ距離維持サブルーチン (S3) に、パイロットから違う目標距離 ARG を渡そう',
    csConcept: '関数パラメータ（仮引数 ARG と実引数渡し）',
    goal: 'サブルーチン S3 内で `ARG使用 (useArg)` を有効化し、パイロット 6×6 から異なる `param` で呼び出して 2つの標的バルーンを撃破する',
    hint: '機体 S3 は「目標距離 (ARG使用)」の「維持」だけを作っておき、パイロット 6×6 側で「熱>55%? → CALL S3 (ARG=260)」と「通常 → CALL S3 (ARG=130)」のように引数を変えて呼んでみましょう（過熱時は CALL S4 も忘れずに）。',
    modelSolutionSummary: '機体 S3 に `useArg: true` の `move_maintain` を定義し、パイロットが状況に応じて ARG=260 と ARG=130 を切り替えながら 2つの標的バルーンを撃破します。',
    arenaPreset: 'plains_ridge',
    seed: 10402,
    maxSeconds: 140,
    buildBrokenStarter: () => {
      const mech = structuredClone(PRESET_ABC);
      mech.controlTier = 'pilot_full';
      if (mech.romSlots) delete mech.romSlots.S3;
      mech.subroutines = mech.subroutines.map((s) =>
        s.slotId === 'S3'
          ? {
              slotId: 'S3',
              name: '固定距離ROM (ARG未使用)',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                // Bug: stops instead of using ARG to close/maintain range!
                { row: 0, col: 1, op: 'move_stop', dir: 'S', param: 450, useArg: false },
              ],
            }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p1_11_pilot',
        name: '4-2 ARG未設定パイロット',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s3', dir: 'S', target: 'nearest', durationSec: 0.5 },
          ],
        },
      };
      return { mech, pilot };
    },
    buildModelSolution: () => {
      const mech = structuredClone(PRESET_ABC);
      mech.controlTier = 'pilot_full';
      if (mech.romSlots) delete mech.romSlots.S3;
      mech.subroutines = mech.subroutines.map((s) =>
        s.slotId === 'S3'
          ? {
              slotId: 'S3',
              name: '汎用距離制御 (ARG)',
              gridSize: 4,
              cells: buildBasicS3MoveCells(200),
            }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'sol_p1_11_pilot',
        name: '4-2 ARG引渡し 模範',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 78 },
            { row: 1, col: 1, op: 'call_s4', dir: 'E', target: 'nearest', durationSec: 0.5 },
            { row: 1, col: 2, op: 'if_heat_below', dir: 'E', elseDir: 'W', param: 45 },
            { row: 2, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 50 },
            { row: 2, col: 1, op: 'call_s3', dir: 'E', target: 'nearest', param: 260, durationSec: 0.3 },
            { row: 2, col: 2, op: 'call_s1', dir: 'E', target: 'nearest', durationSec: 0.5 },
            { row: 3, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 3, col: 1, op: 'call_s3', dir: 'E', target: 'nearest', param: 130, durationSec: 0.3 },
            { row: 3, col: 2, op: 'call_s1', dir: 'E', target: 'nearest', durationSec: 0.55 },
            { row: 4, col: 0, op: 'call_s3', dir: 'E', target: 'nearest', param: 150, durationSec: 0.5 },
          ],
        },
      };
      return { mech, pilot };
    },
  },
  {
    id: 'p1_12_part1_exam',
    part: 'part1_basics',
    lessonNumber: 4,
    stageCode: '4-3',
    stepNumber: 12,
    controlTier: 'pilot_full',
    title: '4-3: Part 1 卒業試験 (1vs1 模擬戦)',
    subtitle: '第1部で学んだ順次・分岐・ループ・サブルーチン呼び分けの総まとめ！',
    csConcept: '第1部 総合課題（6×6 ＋ 4×4 完全自律制御）',
    goal: 'パイロット 6×6 で 2 つ以上のサブルーチンを呼び分け、熱暴走せず 1vs1 訓練機 (LLB改) に勝利する',
    hint: 'バグ入り機体は S1 が空で熱監視もありません。これまでの知識を総動員して「熱管理」「索敵 (S3/S2)」「交戦 (S1)」のフローチャートを完成させましょう。',
    modelSolutionSummary: '熱監視ループ (S4)＋距離/視界による S3 接近と S1/S2 攻撃の組み合わせで、軽量訓練機を安定撃破します。',
    arenaPreset: 'plains_ridge',
    seed: 10403,
    maxSeconds: 180,
    buildBrokenStarter: () => {
      const mech = structuredClone(PRESET_ABC);
      mech.controlTier = 'pilot_full';
      if (mech.romSlots) delete mech.romSlots.S1;
      mech.subroutines = mech.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: '未実装 S1',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'wait', dir: 'S', durationSec: 1.0 },
              ],
            }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p1_12_pilot',
        name: '4-3 卒業試験スタート',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.6 },
          ],
        },
      };
      return { mech, pilot };
    },
    buildModelSolution: () => {
      const mech = structuredClone(PRESET_ABC);
      mech.controlTier = 'pilot_full';
      if (mech.romSlots) delete mech.romSlots.S1;
      mech.subroutines = mech.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: '基本攻撃 (4×4)',
              gridSize: 4,
              cells: buildBasicS1FireCells(),
            }
          : s
      );
      return { mech, pilot: structuredClone(PILOT_BASIC) };
    },
  },

  /* ======================================================================== */
  /* PART 2: CodeMech 戦術＆ゲームシステム (5-1 .. 8-3)                        */
  /* ======================================================================== */
  {
    id: 'p2_1_flank_rear',
    part: 'part2_tactics',
    lessonNumber: 5,
    stageCode: '5-1',
    stepNumber: 13,
    controlTier: 'pilot_full',
    title: '5-1: 重装甲砲台の背面を狙え！',
    subtitle: '正面装甲 420 の要塞砲台に対し、「旋回移動 (move_circle)」で薄い背面へ回り込め',
    csConcept: '前後二重装甲システムと側面・背面機動 (Flanking)',
    goal: 'サブルーチン内に「旋回移動 (`move_circle`)」を組み込み、正面極厚・背面極薄 (15) の固定砲台を 55秒以内に撃破する',
    hint: '正面から「接近」や「停止」で撃ち合っても 420 もの前装甲は抜けません！ S3 と S1 に `移動:旋回 (move_circle, 距離45m)` を設定し、高速旋回で側面〜背面へ回り込んで撃破しましょう。',
    modelSolutionSummary: '機敏な軽量機体 LLB に `move_circle (param: 45)` と `torso_track`＋連続射撃を組むことで、旋回が追いつかない重砲台の背面装甲 15 を撃ち抜きます。',
    arenaPreset: 'urban_pillars',
    seed: 20501,
    maxSeconds: 85,
    buildBrokenStarter: () => {
      const mech = cloneWithS1(PRESET_ABC, '正面突撃機 (5-1)', 'pilot_full', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_stop', dir: 'E' },
        { row: 0, col: 2, op: 'torso_track', dir: 'E' },
        { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
      ]);
      mech.parts.rightArmWeapon = 'medium_laser';
      mech.parts.leftArmWeapon = 'medium_laser';
      mech.parts.rightShoulderWeapon = 'shd_none';
      mech.parts.leftShoulderWeapon = 'shd_none';
      mech.weaponGroups = { G1: ['rightArm', 'leftArm'], G2: ['rightArm'], G3: ['leftArm'], G4: ['rightArm', 'leftArm'] };
      if (mech.romSlots) delete mech.romSlots.S3;
      mech.subroutines = mech.subroutines.map((s) =>
        s.slotId === 'S3'
          ? {
              slotId: 'S3',
              name: '正面突撃 (バグ)',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'move_approach', dir: 'S' },
              ],
            }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p2_1_pilot',
        name: '5-1 正面特攻パイロット',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s3', dir: 'E', target: 'main', durationSec: 0.35 },
            { row: 1, col: 1, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.55 },
          ],
        },
      };
      return { mech, pilot };
    },
    buildModelSolution: () => {
      const mech = cloneWithS1(PRESET_ABC, '背面強襲 模範 (5-1)', 'pilot_full', [
        { row: 0, col: 0, op: 'start', dir: 'E' },
        { row: 0, col: 1, op: 'move_circle', dir: 'E', param: 60, direction: 'right' },
        { row: 0, col: 2, op: 'torso_track', dir: 'E' },
        { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.4 },
      ]);
      mech.parts.rightArmWeapon = 'medium_laser';
      mech.parts.leftArmWeapon = 'medium_laser';
      mech.parts.rightShoulderWeapon = 'shd_none';
      mech.parts.leftShoulderWeapon = 'shd_none';
      mech.weaponGroups = { G1: ['rightArm', 'leftArm'], G2: ['rightArm'], G3: ['leftArm'], G4: ['rightArm', 'leftArm'] };
      if (mech.romSlots) delete mech.romSlots.S3;
      mech.subroutines = mech.subroutines.map((s) =>
        s.slotId === 'S3'
          ? {
              slotId: 'S3',
              name: '背面旋回 (4×4)',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'move_circle', dir: 'E', param: 60, direction: 'right' },
                { row: 0, col: 2, op: 'torso_track', dir: 'S' },
              ],
            }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'sol_p2_1_pilot',
        name: '5-1 背面強襲 模範',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 80 },
            { row: 1, col: 1, op: 'call_s4', dir: 'E', target: 'nearest', durationSec: 0.5 },
            { row: 1, col: 2, op: 'if_heat_below', dir: 'E', elseDir: 'W', param: 45 },
            { row: 2, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 2, col: 1, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.55 },
            { row: 3, col: 0, op: 'call_s3', dir: 'S', target: 'main', durationSec: 0.55 },
          ],
        },
      };
      return { mech, pilot };
    },
  },
  {
    id: 'p2_2_leg_sweep',
    part: 'part2_tactics',
    lessonNumber: 5,
    stageCode: '5-2',
    stepNumber: 14,
    controlTier: 'pilot_full',
    title: '5-2: 狙点「脚」で高速機の足を折れ！',
    subtitle: '射撃マスの狙点 (aimPoint) を「脚」に設定し、機動力奪取から撃破につなげよ',
    csConcept: '部位狙い (aimPoint: legs) と脚部破壊ペナルティ',
    goal: '射撃命令の狙点を `legs (脚)` に設定し、敵高速機の脚部を破壊した上で撃破する',
    hint: '敵の胴体は厚く、素早く回避してきます。S1 の `撃:G1` マスの「狙点」プロパティを **`脚`** に変更してみましょう。左右いずれかの脚が壊れると敵は急減速します！',
    modelSolutionSummary: 'S1 の射撃マスの狙点を `aimPoint: "legs"` に設定し、中〜近距離からレーザーを脚へ集中させて脚部破壊→撃破を達成します。',
    arenaPreset: 'plains_ridge',
    seed: 20502,
    maxSeconds: 130,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.parts.rightArmWeapon = 'medium_laser';
      m.parts.leftArmWeapon = 'medium_laser';
      m.parts.rightShoulderWeapon = 'shd_none';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightArm', 'leftArm'],
        G2: ['rightArm'],
        G3: ['leftArm'],
        G4: ['rightArm', 'leftArm'],
      };
      if (m.romSlots) delete m.romSlots.S1;
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: '胴撃ちバグ (5-2)',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'move_stop', dir: 'E' },
                { row: 0, col: 2, op: 'torso_track', dir: 'E' },
                { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.5, aimPoint: 'torso' },
              ],
            }
          : s
      );
      return { mech: m, pilot: structuredClone(PILOT_BASIC) };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.parts.rightArmWeapon = 'medium_laser';
      m.parts.leftArmWeapon = 'medium_laser';
      m.parts.rightShoulderWeapon = 'shd_none';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightArm', 'leftArm'],
        G2: ['rightArm'],
        G3: ['leftArm'],
        G4: ['rightArm', 'leftArm'],
      };
      if (m.romSlots) delete m.romSlots.S1;
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: '脚部掃射 (4×4)',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'move_approach', dir: 'E' },
                { row: 0, col: 2, op: 'torso_track', dir: 'E' },
                { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45, aimPoint: 'legs' },
              ],
            }
          : s
      );
      return { mech: m, pilot: structuredClone(PILOT_BASIC) };
    },
  },
  {
    id: 'p2_3_arm_shield',
    part: 'part2_tactics',
    lessonNumber: 5,
    stageCode: '5-3',
    stepNumber: 15,
    controlTier: 'pilot_full',
    title: '5-3: 狙点「腕」＆ 腰ひねり盾受け',
    subtitle: 'ダメージを受けた右半身を「右脆い? → 腰ひねり」で隠し、敵の主砲腕をもぎ取れ',
    csConcept: '非対称ダメージ分散 (Torso Twist Shielding) ＋ 武装無力化',
    goal: '「右脆い?」＋「腰ひねり」防御と狙点 `arms (腕)` を組み合わせ、敵主砲の右腕を破壊しつつ勝利する',
    hint: '自機は右半身の装甲が薄く、正面を受け続けると大破します。S5 (防御) に「右脆い? → 腰ひねり右 (厚い左半身を盾にする) / NO → 腰ひねり左」を組み、攻撃時は S1 の狙点を **`腕`** にして敵の武装を奪いましょう！',
    modelSolutionSummary: '攻撃時は狙点 `arms` で敵の右腕主砲を早期破壊し、敵の攻撃や被弾時は `if_right_armor_weaker` で厚い左腕側を前に向ける盾受けを組み勝利します。',
    arenaPreset: 'urban_pillars',
    seed: 20503,
    maxSeconds: 120,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABH);
      m.controlTier = 'pilot_full';
      m.name = '盾受け訓練機 (5-3)';
      m.parts.rightArmWeapon = 'medium_laser';
      m.parts.leftArmWeapon = 'medium_laser';
      m.parts.rightShoulderWeapon = 'shd_none';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightArm', 'leftArm'],
        G2: ['rightArm'],
        G3: ['leftArm'],
        G4: ['rightArm', 'leftArm'],
      };
      m.armor = {
        ...m.armor,
        rightArm: 35,
        rightShoulderFront: 35,
        leftArm: 140,
        leftShoulderFront: 140,
      };
      if (m.romSlots) {
        delete m.romSlots.S1;
        delete m.romSlots.S5;
      }
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: '防御なし正面撃ち',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'move_approach', dir: 'E' },
                { row: 0, col: 2, op: 'torso_track', dir: 'E' },
                { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.5, aimPoint: 'torso' },
              ],
            }
          : s.slotId === 'S5'
            ? {
                slotId: 'S5',
                name: '未実装防御 S5',
                gridSize: 4,
                cells: [
                  { row: 0, col: 0, op: 'start', dir: 'E' },
                  { row: 0, col: 1, op: 'torso_center', dir: 'S' },
                ],
              }
            : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p2_3_pilot',
        name: '5-3 棒立ちパイロット',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.6 },
          ],
        },
      };
      return { mech: m, pilot };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABH);
      m.controlTier = 'pilot_full';
      m.name = '盾受け＆腕もぎ 模範 (5-3)';
      m.parts.rightArmWeapon = 'medium_laser';
      m.parts.leftArmWeapon = 'medium_laser';
      m.parts.rightShoulderWeapon = 'shd_none';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightArm', 'leftArm'],
        G2: ['rightArm'],
        G3: ['leftArm'],
        G4: ['rightArm', 'leftArm'],
      };
      m.armor = {
        ...m.armor,
        rightArm: 35,
        rightShoulderFront: 35,
        leftArm: 140,
        leftShoulderFront: 140,
      };
      if (m.romSlots) {
        delete m.romSlots.S1;
        delete m.romSlots.S5;
      }
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: '腕狙い掃射 (4×4)',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'move_approach', dir: 'E' },
                { row: 0, col: 2, op: 'torso_track', dir: 'E' },
                { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45, aimPoint: 'arms' },
              ],
            }
          : s.slotId === 'S5'
            ? {
                slotId: 'S5',
                name: '腰ひねり盾受け (4×4)',
                gridSize: 4,
                cells: [
                  { row: 0, col: 0, op: 'start', dir: 'E' },
                  { row: 0, col: 1, op: 'if_right_armor_weaker', dir: 'S', elseDir: 'E' },
                  { row: 0, col: 2, op: 'torso_twist_l', dir: 'S' },
                  { row: 1, col: 1, op: 'torso_twist_r', dir: 'S' },
                ],
              }
            : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'sol_p2_3_pilot',
        name: '5-3 盾受け＆腕もぎ 模範',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_incoming_fire', dir: 'E', elseDir: 'S' },
            { row: 1, col: 1, op: 'call_s5', dir: 'S', target: 'attacker', durationSec: 0.4 },
            { row: 2, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 2, col: 1, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.55 },
            { row: 3, col: 0, op: 'call_s3', dir: 'S', target: 'main', param: 170, durationSec: 0.5 },
          ],
        },
      };
      return { mech: m, pilot };
    },
  },
  {
    id: 'p2_4_crit_combo',
    part: 'part2_tactics',
    lessonNumber: 6,
    stageCode: '6-1',
    stepNumber: 16,
    controlTier: 'pilot_full',
    title: '6-1: 装甲剥離 → 内部クリティカル追撃',
    subtitle: 'レーザーで外装を剥がし、マシンガン / 散弾砲の 1/2・1/3 内部クリティカルを叩き込め',
    csConcept: '武器シナジー（レーザー外装削り＋MG/散弾の内部構造 CRIT!）',
    goal: 'レーザー＋`mg_light` または `lbx_shotgun` を併用する G1/G2 連携を組み、構造極厚の演習機を撃破する',
    hint: 'バグ機体は近距離のマシンガン (G2) しか撃たないため外装装甲で弾かれ続けます。先に G1 (大口径レーザー) で装甲を剥がしつつ、接近して G2 (`mg_light` / `lbx_shotgun`) も連動させ、内部構造への `CRIT!` ダメージを引き出しましょう！',
    modelSolutionSummary: '遠・中距離は G1 の `large_laser` で外装を焼き切り、160m 以内に接近したら G1 と G2 (`mg_light`) の両方を連射して内部クリティカルで一気に撃破します。',
    arenaPreset: 'urban_pillars',
    seed: 20601,
    maxSeconds: 95,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.name = 'CRIT訓練機 (6-1)';
      m.parts.rightArmWeapon = 'mg_light';
      m.parts.leftArmWeapon = 'arm_none';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightShoulder'],
        G2: ['rightArm'],
        G3: ['rightShoulder'],
        G4: ['rightArm', 'rightShoulder'],
      };
      if (m.romSlots) delete m.romSlots.S1;
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: 'MG単独バグ (6-1)',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'move_stop', dir: 'E' },
                { row: 0, col: 2, op: 'torso_track', dir: 'E' },
                // Bug: only fires G2 (mg_light) without G1 laser or closing in!
                { row: 0, col: 3, op: 'fire_group_2', dir: 'S', durationSec: 0.5 },
              ],
            }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p2_4_pilot',
        name: '6-1 MG単独バグAI',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.7 },
          ],
        },
      };
      return { mech: m, pilot };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.name = '装甲剥離CRIT 模範 (6-1)';
      m.parts.rightArmWeapon = 'mg_light';
      m.parts.leftArmWeapon = 'arm_none';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightShoulder'],
        G2: ['rightArm'],
        G3: ['rightShoulder'],
        G4: ['rightArm', 'rightShoulder'],
      };
      if (m.romSlots) delete m.romSlots.S1;
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: '剥離＋CRIT追撃 (4×4)',
              gridSize: 4,
              cells: buildBasicDirectFireCells(),
            }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'sol_p2_4_pilot',
        name: '6-1 CRIT連携 模範',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 80 },
            { row: 1, col: 1, op: 'call_s4', dir: 'E', target: 'nearest', durationSec: 0.5 },
            { row: 1, col: 2, op: 'if_heat_below', dir: 'E', elseDir: 'W', param: 45 },
            { row: 2, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 2, col: 1, op: 'call_s3', dir: 'E', target: 'main', param: 110, durationSec: 0.25 },
            { row: 2, col: 2, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.55 },
            { row: 3, col: 0, op: 'call_s3', dir: 'S', target: 'main', param: 110, durationSec: 0.5 },
          ],
        },
      };
      return { mech: m, pilot };
    },
  },
  {
    id: 'p2_5_garage_rebuild',
    part: 'part2_tactics',
    lessonNumber: 6,
    stageCode: '6-2',
    stepNumber: 17,
    controlTier: 'pilot_full',
    title: '6-2: 欠陥機リビルド（ガレージ設計実習）',
    subtitle: '重量超過＆背面偏重＆冷却不足の欠陥機体を「機体ガレージ」で正常に改修せよ',
    csConcept: 'パラメータ整合性（トン数上限・前後装甲比・冷却設計）',
    goal: '機体が積載上限内で有効 (`valid`)、中央胴 前装甲 > 後装甲 かつ 放熱シンク ≥ 1 で、演習機に勝利する',
    hint: 'バグ入り機体は軽量シャーシ (`35t`) に `AC/20` を積んで重量オーバーし、前装甲も `25` しかありません。「機体ガレージ」で中量級 `ABC (55t)` にするか軽量武装に変え、前装甲を厚く＋追加ヒートシンクを1つ以上積んで勝利しましょう！',
    modelSolutionSummary: '積載 55t 以内のバランスの取れた `ABC-T1` ベース（`torsoFront: 200 > torsoRear: 50`・`extraHeatSinks: 1`）へ再構成することで安定した火力と耐久を発揮します。',
    arenaPreset: 'urban_pillars',
    seed: 20602,
    maxSeconds: 140,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABL);
      m.controlTier = 'pilot_full';
      m.name = '欠陥過積載機 (6-2)';
      m.extraHeatSinks = 0;
      m.parts.rightArmWeapon = 'ac20';
      m.parts.leftArmWeapon = 'ac10';
      m.armor = {
        ...m.armor,
        torsoFront: 25,
        torsoRear: 100,
      };
      return { mech: m, pilot: structuredClone(PILOT_BASIC) };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.name = 'リビルド完了機 模範 (6-2)';
      m.extraHeatSinks = 1;
      return { mech: m, pilot: structuredClone(PILOT_BASIC) };
    },
  },
  {
    id: 'p2_6_range_control',
    part: 'part2_tactics',
    lessonNumber: 6,
    stageCode: '6-3',
    stepNumber: 18,
    controlTier: 'pilot_full',
    title: '6-3: 適正射程コントロール（引き撃ち）',
    subtitle: '近接超火力 AC/20 機の射程外 (260m+) を保ち、レーザーで安全に撃ち勝て',
    csConcept: 'フィードバック距離制御 (`move_maintain` / `move_retreat`)',
    goal: '「距離維持 (`move_maintain`)」または「後退 (`move_retreat`)」を用いてアウトレンジ戦を徹底し、AC/20 重機動機に勝利する',
    hint: '敵の `AC/20` は射程 190m 以内で驚異的な破壊力を持ちますが、260m 以上離れれば大口径レーザーで一方的に攻撃できます。S3 や S5 の移動距離パラメータを **`280〜320`** に設定し、S5 に `敵距離<230? → 後退` を入れてみましょう！',
    modelSolutionSummary: '近距離突入を避け、`move_maintain (param: 310)` と `if_enemy_dist_lt(240) → move_retreat` で相手の間合いに入らず撃破します。',
    arenaPreset: 'plains_ridge',
    seed: 20603,
    maxSeconds: 150,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightShoulder'],
        G2: ['rightShoulder'],
        G3: ['rightShoulder'],
        G4: ['rightShoulder'],
      };
      if (m.romSlots) {
        delete m.romSlots.S1;
        delete m.romSlots.S3;
      }
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S3'
          ? {
              slotId: 'S3',
              name: '無謀なゼロ距離突撃',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'move_approach', dir: 'S' },
              ],
            }
          : s.slotId === 'S1'
            ? {
                slotId: 'S1',
                name: '接近射撃 (バグ)',
                gridSize: 4,
                cells: [
                  { row: 0, col: 0, op: 'start', dir: 'E' },
                  { row: 0, col: 1, op: 'move_approach', dir: 'E' },
                  { row: 0, col: 2, op: 'torso_track', dir: 'E' },
                  { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.5 },
                ],
              }
            : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p2_6_pilot',
        name: '6-3 至近突撃バグAI',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.6 },
          ],
        },
      };
      return { mech: m, pilot };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightShoulder'],
        G2: ['rightShoulder'],
        G3: ['rightShoulder'],
        G4: ['rightShoulder'],
      };
      if (m.romSlots) {
        delete m.romSlots.S1;
        delete m.romSlots.S3;
        delete m.romSlots.S5;
      }
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: '遠距離引き撃ち (4×4)',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'move_maintain', dir: 'E', param: 310 },
                { row: 0, col: 2, op: 'torso_track', dir: 'E' },
                { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.45 },
              ],
            }
          : s.slotId === 'S3'
            ? {
                slotId: 'S3',
                name: '距離維持310 (4×4)',
                gridSize: 4,
                cells: buildBasicS3MoveCells(310),
              }
            : s.slotId === 'S5'
              ? {
                  slotId: 'S5',
                  name: '危険時後退 (4×4)',
                  gridSize: 4,
                  cells: [
                    { row: 0, col: 0, op: 'start', dir: 'E' },
                    { row: 0, col: 1, op: 'move_retreat', dir: 'E' },
                    { row: 0, col: 2, op: 'torso_track', dir: 'E' },
                    { row: 0, col: 3, op: 'fire_group_1', dir: 'S', durationSec: 0.4 },
                  ],
                }
              : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'sol_p2_6_pilot',
        name: '6-3 アウトレンジ 模範',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 80 },
            { row: 1, col: 1, op: 'call_s4', dir: 'E', target: 'nearest', durationSec: 0.5 },
            { row: 1, col: 2, op: 'if_heat_below', dir: 'E', elseDir: 'W', param: 45 },
            { row: 2, col: 0, op: 'if_enemy_dist_lt', dir: 'E', elseDir: 'S', param: 240 },
            { row: 2, col: 1, op: 'call_s5', dir: 'S', target: 'main', durationSec: 0.5 },
            { row: 3, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 3, col: 1, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.55 },
            { row: 4, col: 0, op: 'call_s3', dir: 'S', target: 'main', param: 310, durationSec: 0.5 },
          ],
        },
      };
      return { mech: m, pilot };
    },
  },
  {
    id: 'p2_7_indirect_lrm',
    part: 'part2_tactics',
    lessonNumber: 7,
    stageCode: '7-1',
    stepNumber: 19,
    controlTier: 'pilot_full',
    title: '7-1: 遮蔽越し曲射ミサイル (LRM)',
    subtitle: '中央の 34m 巨大尖塔の向こう側にいる敵を、前衛僚機のスポッター連携＋曲射で撃破せよ',
    csConcept: 'データリンク間接照準 (`if_target_locked` + LRM 曲射)',
    goal: 'LRM (遠距離ミサイル) を用いて遮蔽奥に隠れた固定標的を撃破する（味方スポッターが視界を提供）',
    hint: '中央に高さ 34m の尖塔があるため、直接レーザーは遮蔽に吸われます。前衛の僚機が敵を捕捉しているため、`レーダー圏内 (if_enemy_on_radar)` で `CALL S2`（腰を敵方向へ向けてロック完了後に LRM 発射）を呼べば頭上を越えて曲射命中します！',
    modelSolutionSummary: '味方スカウトのデータリンクによりレーダー捕捉された敵に対し、`if_enemy_on_radar → CALL S2` でロック完了＋曲射 LRM を叩き込みます。',
    arenaPreset: 'twin_mesas',
    seed: 20701,
    maxSeconds: 95,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.parts.rightArmWeapon = 'arm_none';
      m.parts.leftArmWeapon = 'arm_none';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'lrm15';
      m.extraAmmo = { leftShoulder: 2 };
      m.weaponGroups = {
        G1: ['rightShoulder'],
        G2: ['leftShoulder'],
        G3: ['rightShoulder'],
        G4: ['leftShoulder'],
      };
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p2_7_pilot',
        name: '7-1 直接視界依存バグ',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            // Bug: stands still and only fires direct laser when in visual LOS (blocked by 34m spire!)
            { row: 1, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 1, col: 1, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.6 },
          ],
        },
      };
      return { mech: m, pilot };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.parts.rightArmWeapon = 'arm_none';
      m.parts.leftArmWeapon = 'arm_none';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'lrm15';
      m.extraAmmo = { leftShoulder: 2 };
      m.weaponGroups = {
        G1: ['rightShoulder'],
        G2: ['leftShoulder'],
        G3: ['rightShoulder'],
        G4: ['leftShoulder'],
      };
      if (m.romSlots) delete m.romSlots.S2;
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S2'
          ? {
              slotId: 'S2',
              name: '遮蔽曲射 LRM (4×4)',
              gridSize: 4,
              cells: buildBasicS2LrmCells(),
            }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'sol_p2_7_pilot',
        name: '7-1 LRM曲射 模範',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 80 },
            { row: 1, col: 1, op: 'call_s4', dir: 'E', target: 'nearest', durationSec: 0.5 },
            { row: 1, col: 2, op: 'if_heat_below', dir: 'E', elseDir: 'W', param: 45 },
            { row: 2, col: 0, op: 'if_enemy_on_radar', dir: 'E', elseDir: 'S' },
            { row: 2, col: 1, op: 'call_s2', dir: 'S', target: 'main', durationSec: 0.7 },
          ],
        },
      };
      return { mech: m, pilot };
    },
  },
  {
    id: 'p2_8_ams_defense',
    part: 'part2_tactics',
    lessonNumber: 7,
    stageCode: '7-2',
    stepNumber: 20,
    controlTier: 'pilot_full',
    title: '7-2: ミサイル弾幕を捌け (AMS＋緊急回避)',
    subtitle: '飛来する LRM 弾幕を AMS 迎撃＋「被ミサイル?」回避で凌ぎながら接近撃破せよ',
    csConcept: '受動防御モジュール (AMS) ＋ 脅威検知回避 (`if_incoming_missile`)',
    goal: 'AMS 系装備を搭載し、パイロットに「被ミサイル?」回避分岐を組み込んで LRM 弾幕機を撃破する',
    hint: 'バグ機体は AMS も回避判定もなく、棒立ちでミサイルを直撃し続けます。「機体ガレージ」の左胴に `ミサイル迎撃機関砲 AMS` (または `レーザーAMS` / `複合ポッド`) を装備し、パイロット 6×6 に「被ミサイル? → CALL S5 (回避・突撃)」を入れましょう！',
    modelSolutionSummary: '左胴に `ams_ballistic` を装備してミサイルを自動撃墜しつつ、`if_incoming_missile → move_evade` で飛来弾を振り切って接近撃破します。',
    arenaPreset: 'plains_ridge',
    seed: 20702,
    maxSeconds: 120,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.name = 'AMSなし訓練機 (7-2)';
      m.parts.rightArmWeapon = 'medium_laser';
      m.parts.leftArmWeapon = 'arm_none';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'shd_none';
      m.weaponGroups = {
        G1: ['rightShoulder', 'rightArm'],
        G2: ['rightArm'],
        G3: ['rightShoulder'],
        G4: ['rightShoulder', 'rightArm'],
      };
      m.armor = {
        ...m.armor,
        torsoFront: 80,
        rightShoulderFront: 50,
        leftShoulderFront: 50,
      };
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p2_8_pilot',
        name: '7-2 回避なしAI',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 1, col: 1, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.6 },
          ],
        },
      };
      return { mech: m, pilot };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.name = 'AMS迎撃 模範 (7-2)';
      m.parts.rightArmWeapon = 'medium_laser';
      m.parts.leftArmWeapon = 'arm_none';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'ams_ballistic';
      m.weaponGroups = {
        G1: ['rightShoulder', 'rightArm'],
        G2: ['rightArm'],
        G3: ['rightShoulder'],
        G4: ['rightShoulder', 'rightArm'],
      };
      m.armor = {
        ...m.armor,
        torsoFront: 80,
        rightShoulderFront: 50,
        leftShoulderFront: 50,
      };
      if (m.romSlots) delete m.romSlots.S5;
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S5'
          ? {
              slotId: 'S5',
              name: 'ミサイル緊急回避 (4×4)',
              gridSize: 4,
              cells: buildBasicS5CloseCells(),
            }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'sol_p2_8_pilot',
        name: '7-2 AMS＋回避 模範',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 80 },
            { row: 1, col: 1, op: 'call_s4', dir: 'E', target: 'nearest', durationSec: 0.5 },
            { row: 1, col: 2, op: 'if_heat_below', dir: 'E', elseDir: 'W', param: 45 },
            { row: 2, col: 0, op: 'if_incoming_missile', dir: 'E', elseDir: 'S' },
            { row: 2, col: 1, op: 'call_s5', dir: 'S', target: 'main', durationSec: 0.45 },
            { row: 3, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 3, col: 1, op: 'call_s3', dir: 'E', target: 'main', param: 170, durationSec: 0.3 },
            { row: 3, col: 2, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.55 },
            { row: 4, col: 0, op: 'call_s3', dir: 'S', target: 'main', param: 170, durationSec: 0.5 },
          ],
        },
      };
      return { mech: m, pilot };
    },
  },
  {
    id: 'p2_9_ecm_hunter',
    part: 'part2_tactics',
    lessonNumber: 7,
    stageCode: '7-3',
    stepNumber: 21,
    controlTier: 'pilot_full',
    title: '7-3: ステルス ECM 機を暴いて撃墜せよ',
    subtitle: 'BAP 索敵モジュールまたは PPC (EMP妨害) を装備し、ECM 潜伏スカウトを無力化せよ',
    csConcept: '電子戦対抗手段 (ECCM: BAP 探知＆PPC EMP)',
    goal: 'BAP (`bap_probe` / 複合BAPポッド) または `ppc` を装備し、ECM ステルス機に勝利する',
    hint: 'ECM ステルス機は全周レーダー探知距離を半減させ、遠距離でのロックを妨害します。「機体ガレージ」で `bap_probe` (または `ams_bap_pod` / `lams_bap_pod`) を装備して 240m 内の ECM を無効化するか、`ppc` 直撃で ECM を停止させ、S3 接近＋S1 で仕留めましょう！',
    modelSolutionSummary: '左胴に `bap_probe` を搭載し、右腕 `ppc` の EMP 効果と合わせて ECM ステルスを完全に暴き、S3 接近＋S1 で撃破します。',
    arenaPreset: 'plains_ridge',
    seed: 20703,
    maxSeconds: 120,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.name = '対ECM未対策機 (7-3)';
      m.parts.rightArmWeapon = 'arm_none';
      m.parts.leftArmWeapon = 'arm_none';
      m.parts.rightShoulderWeapon = 'shd_none';
      m.parts.leftShoulderWeapon = 'lrm10';
      m.weaponGroups = {
        G1: ['leftShoulder'],
        G2: ['leftShoulder'],
        G3: ['leftShoulder'],
        G4: ['leftShoulder'],
      };
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p2_9_pilot',
        name: '7-3 対ECM失敗AI',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s2', dir: 'S', target: 'main', durationSec: 0.6 },
          ],
        },
      };
      return { mech: m, pilot };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      m.name = 'BAP対ECMハンター 模範 (7-3)';
      m.parts.rightArmWeapon = 'ppc';
      m.parts.leftArmWeapon = 'medium_laser';
      m.parts.rightShoulderWeapon = 'large_laser';
      m.parts.leftShoulderWeapon = 'bap_probe';
      m.extraHeatSinks = 2;
      m.weaponGroups = {
        G1: ['rightArm', 'leftArm', 'rightShoulder'],
        G2: ['rightShoulder'],
        G3: ['rightArm'],
        G4: ['rightArm', 'leftArm', 'rightShoulder'],
      };
      return { mech: m, pilot: structuredClone(PILOT_BASIC) };
    },
  },
  {
    id: 'p2_10_pilot_transfer',
    part: 'part2_tactics',
    lessonNumber: 8,
    stageCode: '8-1',
    stepNumber: 22,
    controlTier: 'pilot_full',
    title: '8-1: 汎用パイロット乗り換え試験 (軽量＆重量)',
    subtitle: '1つのパイロット 6×6 AI が異なる機体 (LLB 軽量機 / XHD 重量機) でも正しく動くようにせよ',
    csConcept: '抽象化とポリモーフィズム（機種非依存の S1..S5 インタフェース）',
    goal: '同一のパイロット 6×6 AI で「軽量機 LLB 戦」と「重量機 XHD 戦」の両方に連続勝利する',
    hint: '特定の武器名ではなく、`CALL S1` (主交戦)・`CALL S3` (索敵)・`CALL S4` (冷却)・`CALL S5` (近接/防御) という共通インタフェースで呼べば、1人のパイロットがどの機体に乗ってもその機体のベスト戦術を実行します！',
    modelSolutionSummary: '機種を問わない汎用スロットインタフェース (S1:攻撃 / S3:移動 / S4:冷却) を使う 6×6 AI により、軽量高機動機 LLB と重火力機 XHD のどちらに搭乗しても勝てる汎用 AI を実現します。',
    arenaPreset: 'plains_ridge',
    seed: 20801,
    maxSeconds: 150,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p2_10_pilot',
        name: '8-1 不完全パイロット',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s4', dir: 'S', target: 'main', durationSec: 0.7 },
          ],
        },
      };
      return { mech: m, pilot };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      const pilot: PilotProfile = {
        version: 2,
        id: 'sol_p2_10_pilot',
        name: '8-1 汎用乗り換え 模範',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_heat_above', dir: 'E', elseDir: 'S', param: 80 },
            { row: 1, col: 1, op: 'call_s4', dir: 'E', target: 'nearest', durationSec: 0.55 },
            { row: 1, col: 2, op: 'if_heat_below', dir: 'E', elseDir: 'W', param: 45 },
            { row: 2, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 2, col: 1, op: 'call_s3', dir: 'E', target: 'nearest', param: 170, durationSec: 0.25 },
            { row: 2, col: 2, op: 'call_s1', dir: 'S', target: 'nearest', durationSec: 0.55 },
            { row: 3, col: 0, op: 'call_s3', dir: 'S', target: 'nearest', param: 170, durationSec: 0.5 },
          ],
        },
      };
      return { mech: m, pilot };
    },
  },
  {
    id: 'p2_11_squad_180t',
    part: 'part2_tactics',
    lessonNumber: 8,
    stageCode: '8-2',
    stepNumber: 23,
    controlTier: 'pilot_full',
    title: '8-2: 180t 規制 3機小隊戦テスト',
    subtitle: '自機 + 僚機 2機 (LLB 35t + ABC 55t) の合計 180t 以内で 3vs3 小隊戦を制覇せよ',
    csConcept: 'システム統合・トン数制約 (≤180t) 下でのロール分担',
    goal: '自機 ≤ 90t (僚機 LLB 35t + ABC 55t と合計 180t 以内) で 3種類以上のサブルーチンを呼び分け、3vs3 模擬戦に勝利する',
    hint: '100t 級など重すぎる機体は合計 180t 規制に収まりません (自機 ≤ 90t)。さらにパイロット 6×6 に 3種類以上のサブルーチン呼出し（例: S1, S3, S4 または S2/S5）を入れて僚機と連携勝利しましょう！',
    modelSolutionSummary: '55t 中量級 ABC（合計 145t ≤ 180t）＋汎用3種以上コールパイロットにより、軽量・中量・重装のチーム連携で 3vs3 に勝利します。',
    arenaPreset: 'plains_ridge',
    seed: 20802,
    maxSeconds: 180,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p2_11_pilot',
        name: '8-2 未連携パイロット',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s4', dir: 'S', target: 'main', durationSec: 0.7 },
          ],
        },
      };
      return { mech: m, pilot };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      return { mech: m, pilot: structuredClone(PILOT_BASIC) };
    },
  },
  {
    id: 'p2_12_graduation_match',
    part: 'part2_tactics',
    lessonNumber: 8,
    stageCode: '8-3',
    stepNumber: 24,
    controlTier: 'pilot_full',
    title: '8-3: 修了記念バトルフィールド 3vs3 決戦',
    subtitle: '全 24 ステージ集大成！正規 180t 小隊を率いて強豪 3機小隊を打ち破れ',
    csConcept: '総合エンジニアリング（設計 × 階層制御 × 連携）',
    goal: '自機 ≤ 90t (合計 ≤ 180t) かつ有効な階層 AI で、修了決戦 3vs3 に勝利しクリアコードを発行する',
    hint: 'ここまで学んだすべての技術（適切な熱処理、距離制御、3種以上のサブルーチン呼び分け、有効な機体設計）を投入して、敵 3機小隊 (LLB + ABC + XHD) に挑みましょう。クリア後は右メニューからコールサイン設定・バックアップやバトルフィールド参戦も可能です！',
    modelSolutionSummary: '熱管理・距離維持・近接切替・複数スロット連携を備えた完成版 `ABC-T1 + PILOT_BASIC` により、180t 規制下の 3vs3 決戦を制覇します。',
    arenaPreset: 'twin_mesas',
    seed: 20803,
    maxSeconds: 200,
    buildBrokenStarter: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      if (m.romSlots) delete m.romSlots.S1;
      m.subroutines = m.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: '停止バグ S1',
              gridSize: 4,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'wait', dir: 'S', durationSec: 1.0 },
              ],
            }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_p2_12_pilot',
        name: '8-3 初期状態',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.7 },
          ],
        },
      };
      return { mech: m, pilot };
    },
    buildModelSolution: () => {
      const m = structuredClone(PRESET_ABC);
      m.controlTier = 'pilot_full';
      return { mech: m, pilot: structuredClone(PILOT_BASIC) };
    },
  },
];
