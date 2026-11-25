import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Cpu,
  Eye,
  GraduationCap,
  Grid3X3,
  HelpCircle,
  Plus,
  Radar,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  CONTROL_TIER_CATALOG,
  ROM_WEIGHT_4X4,
  getArmWeaponSpec,
  getChassisSpec,
  getControlTierSpec,
  getResolvedWeaponGroups,
  getShoulderWeaponSpec,
  getWeaponGroupSummary,
  isPassiveModuleSpec,
} from '../data/parts';
import {
  GridDir,
  MechBlueprint,
  MechControlTier,
  MechPartId,
  MechSensorState,
  MechSubroutineCell,
  MechSubroutineOp,
  MechSubroutineSlotId,
  PilotDebugTrace,
  PilotGridCell,
  PilotGridOp,
  PilotProfile,
  PilotTargetMode,
  ProgramRomEntry,
  RomCategory,
  WEAPON_GROUP_IDS,
  WeaponGroupId,
  WeaponPartSpec,
  WeaponReadyReason,
  WeaponSlotId,
} from '../types/mech';
import {
  ROM_CATEGORY_SPECS,
  analyzeMechRomCompatibility,
  filterCellsForGrid,
  findRomById,
  formatRomLabel,
  getRomCategory,
  normalizeRomName,
  resolveMechBlueprintRoms,
} from '../utils/romLibrary';
import { isBuiltInPilotId } from '../utils/pilotLibrary';
import {
  formatPilotCellPython,
  formatSubCellPython,
  fullProgramToPython,
  subroutineToPython,
} from '../utils/gridPython';

interface GridProgramEditorProps {
  pilot: PilotProfile;
  allPilots?: readonly PilotProfile[];
  mech: MechBlueprint;
  allRoms: readonly ProgramRomEntry[];
  debugTrace: PilotDebugTrace | null;
  liveSensor: MechSensorState | null;
  onChangePilot: (next: PilotProfile) => void;
  onSelectPilot?: (pilot: PilotProfile) => void;
  onSavePilot?: (input: {
    id?: string;
    name: string;
    cells: PilotGridCell[];
  }) => { saved: PilotProfile; updated: boolean };
  onDeletePilot?: (pilotId: string) => void;
  onChangeMech: (next: MechBlueprint) => void;
  onSaveRom?: (input: {
    id?: string;
    name: string;
    category?: RomCategory;
    gridSize: 4 | 6;
    cells: MechSubroutineCell[];
    slotId?: MechSubroutineSlotId;
  }) => { saved: ProgramRomEntry; updated: boolean };
  onDeleteRom?: (romId: string) => void;
}

type EditorSelection =
  | { kind: 'pilot' }
  | { kind: 'rom'; romId: string }
  | { kind: 'inline'; slotId: MechSubroutineSlotId };
type ChipCat = 'ctrl' | 'branch' | 'call' | 'leg' | 'torso' | 'weapon' | 'emg';
type PilotPaletteFilter = 'all' | 'call' | 'branch' | 'ctrl_emg';
type SubPaletteFilter = 'all' | 'leg' | 'torso' | 'weapon_emg' | 'branch' | 'ctrl';

interface PilotChipMeta {
  op: Exclude<PilotGridOp, 'empty'>;
  short: string;
  label: string;
  cat: ChipCat;
  conceptTag: string;
  execBadge: string;
  tip: string;
  branch?: boolean;
  hasParam?: boolean;
  hasOptionalArg?: boolean;
  paramLabel?: string;
  defaultParam?: number;
  hasTarget?: boolean;
  timed?: boolean;
  defaultDur?: number;
  hasPart?: boolean;
  hasWeaponSlot?: boolean;
}

interface SubChipMeta {
  op: Exclude<MechSubroutineOp, 'empty'>;
  short: string;
  label: string;
  cat: ChipCat;
  conceptTag: string;
  execBadge: string;
  tip: string;
  branch?: boolean;
  hasParam?: boolean;
  paramLabel?: string;
  defaultParam?: number;
  paramMin?: number;
  paramMax?: number;
  paramStep?: number;
  hasDirChoice?: boolean;
  timed?: boolean;
  defaultDur?: number;
  hasWeaponSlot?: boolean;
  weaponSlotKey?: WeaponSlotId;
  weaponGroupKey?: WeaponGroupId;
}

const PILOT_CHIPS: readonly PilotChipMeta[] = [
  // Control & Flags
  {
    op: 'start',
    short: 'START',
    label: '開始点',
    cat: 'ctrl',
    conceptTag: 'エントリーポイント',
    execBadge: '0 tick',
    tip: '毎サイクルの先頭となる開始マスです。矢印方向に最初の判断へ進みます。',
  },
  {
    op: 'wire',
    short: 'WIRE',
    label: '配線 (通過)',
    cat: 'ctrl',
    conceptTag: 'パス通過',
    execBadge: '0 tick',
    tip: '処理を行わず指定方向へそのまま通過します。折り返しや合流ルートを整えるときに使います。',
  },
  {
    op: 'flag_a_on',
    short: 'FLG-A=1',
    label: 'フラグA ON',
    cat: 'ctrl',
    conceptTag: '状態記憶 (Boolean)',
    execBadge: '0 tick',
    tip: 'パイロットの記憶フラグ A を True(1) にします。冷却モード突入などのヒステリシス制御に便利です。',
  },
  {
    op: 'flag_a_off',
    short: 'FLG-A=0',
    label: 'フラグA OFF',
    cat: 'ctrl',
    conceptTag: '状態記憶 (Boolean)',
    execBadge: '0 tick',
    tip: 'パイロットの記憶フラグ A を False(0) に戻します。条件が回復したときの解除に使います。',
  },
  {
    op: 'flag_b_on',
    short: 'FLG-B=1',
    label: 'フラグB ON',
    cat: 'ctrl',
    conceptTag: '状態記憶 (Boolean)',
    execBadge: '0 tick',
    tip: '2つ目の記憶フラグ B を True(1) にします。突撃切替・退避済み記録など自由に使えます。',
  },
  {
    op: 'flag_b_off',
    short: 'FLG-B=0',
    label: 'フラグB OFF',
    cat: 'ctrl',
    conceptTag: '状態記憶 (Boolean)',
    execBadge: '0 tick',
    tip: '記憶フラグ B を False(0) に戻します。',
  },
  // Subroutine Dispatch
  {
    op: 'call_s1',
    short: 'CALL S1',
    label: 'S1 呼出 (4×4)',
    cat: 'call',
    conceptTag: 'サブルーチン呼出',
    execBadge: '最大指定秒',
    tip: '機体枠 S1 (4×4 ROM) を実行します。対象（正面・最寄りなど）と任意の数値引数 ARG を渡せます。',
    hasTarget: true,
    hasOptionalArg: true,
    timed: true,
    defaultDur: 0.7,
  },
  {
    op: 'call_s2',
    short: 'CALL S2',
    label: 'S2 呼出 (4×4)',
    cat: 'call',
    conceptTag: 'サブルーチン呼出',
    execBadge: '最大指定秒',
    tip: '機体枠 S2 (4×4 ROM) を実行します。副武装や盾ひねり防御などを ARG 付きで呼び出せます。',
    hasTarget: true,
    hasOptionalArg: true,
    timed: true,
    defaultDur: 0.65,
  },
  {
    op: 'call_s3',
    short: 'CALL S3',
    label: 'S3 呼出 (4×4)',
    cat: 'call',
    conceptTag: 'サブルーチン呼出',
    execBadge: '最大指定秒',
    tip: '機体枠 S3 (4×4 ROM) を実行します。索敵・間合い制御・高台確保などの移動制御に最適です。',
    hasTarget: true,
    hasOptionalArg: true,
    timed: true,
    defaultDur: 0.65,
  },
  {
    op: 'call_s4',
    short: 'CALL S4',
    label: 'S4 呼出 (4×4)',
    cat: 'call',
    conceptTag: 'サブルーチン呼出',
    execBadge: '最大指定秒',
    tip: '機体枠 S4 (4×4 ROM) を実行します。冷却しながらの斜行回避や盾ひねり防御などに向いています。',
    hasTarget: true,
    hasOptionalArg: true,
    timed: true,
    defaultDur: 0.65,
  },
  {
    op: 'call_s5',
    short: 'CALL S5',
    label: 'S5 呼出 (4×4)',
    cat: 'call',
    conceptTag: 'サブルーチン呼出',
    execBadge: '最大指定秒',
    tip: '機体枠 S5 (4×4 ROM) を実行します。近接迎撃・離脱・トドメの一撃など特化動作向けです。',
    hasTarget: true,
    hasOptionalArg: true,
    timed: true,
    defaultDur: 0.6,
  },
  // Emergency
  {
    op: 'emergency_cool',
    short: '緊急冷却',
    label: '緊急停止冷却',
    cat: 'emg',
    conceptTag: '熱管理アクション',
    execBadge: '時間待機',
    tip: '移動と射撃を止めて放熱を優先します。オーバーヒート直前に呼ぶと安全に冷やせます。',
    timed: true,
    defaultDur: 0.6,
  },
  {
    op: 'override_on',
    short: 'OVER ON',
    label: 'オーバーライド ON',
    cat: 'emg',
    conceptTag: '限界突破フラグ',
    execBadge: '0 tick',
    tip: '熱シャットダウンを無効化し、内部損傷覚悟で動き続けます。トドメの一撃前に有効です。',
  },
  {
    op: 'override_off',
    short: 'OVER OFF',
    label: 'オーバーライド OFF',
    cat: 'emg',
    conceptTag: '安全装置復帰',
    execBadge: '0 tick',
    tip: 'オーバーライドを解除して通常の熱安全停止を有効に戻します。',
  },
  // Branches
  {
    op: 'if_enemy_in_sight',
    short: '視界敵?',
    label: '光学視界に敵?',
    cat: 'branch',
    conceptTag: '条件分岐 (if/else)',
    execBadge: '0 tick',
    tip: '中央胴正面の光学FOV内に遮蔽物なしの敵がいれば T、いなければ F へ進みます。直進射撃の前提に便利です。',
    branch: true,
  },
  {
    op: 'if_enemy_on_radar',
    short: 'レーダ?',
    label: 'レーダー反応?',
    cat: 'branch',
    conceptTag: '条件分岐 (if/else)',
    execBadge: '0 tick',
    tip: '360°レーダー範囲内に敵を捉えていれば T。障害物の裏や背後の敵を察知する索敵に使えます。',
    branch: true,
  },
  {
    op: 'if_enemy_dist_lt',
    short: '距離<?',
    label: '敵距離 < (m)',
    cat: 'branch',
    conceptTag: '数値比較 (if/else)',
    execBadge: '0 tick',
    tip: '最も近い敵との距離が指定(m)より近ければ T。近接戦・ショットガン・離脱判断に使います。',
    branch: true,
    hasParam: true,
    paramLabel: '距離(m)',
    defaultParam: 150,
  },
  {
    op: 'if_enemy_dist_gt',
    short: '距離>?',
    label: '敵距離 > (m)',
    cat: 'branch',
    conceptTag: '数値比較 (if/else)',
    execBadge: '0 tick',
    tip: '敵との距離が指定(m)より遠ければ T。狙撃武器や LRM・接近開始の判定に便利です。',
    branch: true,
    hasParam: true,
    paramLabel: '距離(m)',
    defaultParam: 180,
  },
  {
    op: 'if_enemy_flank',
    short: '側面敵?',
    label: '側面/背後に敵?',
    cat: 'branch',
    conceptTag: '方位センサー分岐',
    execBadge: '0 tick',
    tip: '正面視界外の側面・背後に指定距離未満の敵がいれば T。CALL の対象「側面の敵」と組むと有効です。',
    branch: true,
    hasParam: true,
    paramLabel: '距離(m)',
    defaultParam: 150,
  },
  {
    op: 'if_heat_above',
    short: '熱>?',
    label: '熱量 > (%)',
    cat: 'branch',
    conceptTag: '数値比較 (if/else)',
    execBadge: '0 tick',
    tip: '現在熱量が指定(%)を超えたら T。熱管理とクールダウンルーチンへの分岐に使います。',
    branch: true,
    hasParam: true,
    paramLabel: '熱(%)',
    defaultParam: 85,
  },
  {
    op: 'if_heat_below',
    short: '熱<?',
    label: '熱量 < (%)',
    cat: 'branch',
    conceptTag: '数値比較 (if/else)',
    execBadge: '0 tick',
    tip: '現在熱量が指定(%)より下がったら T。「85%で冷却ON、45%で解除」のヒステリシスに最適です。',
    branch: true,
    hasParam: true,
    paramLabel: '熱(%)',
    defaultParam: 45,
  },
  {
    op: 'if_ammo_empty',
    short: '弾切れ?',
    label: '残弾切れ?',
    cat: 'branch',
    conceptTag: '装備状態分岐',
    execBadge: '0 tick',
    tip: '指定した武装枠（またはいずれかの実弾兵器）が残弾0なら T。代替サブルーチンへの切替に使います。',
    branch: true,
    hasWeaponSlot: true,
  },
  {
    op: 'if_part_destroyed',
    short: '部位破?',
    label: '部位破壊?',
    cat: 'branch',
    conceptTag: '損傷状態分岐',
    execBadge: '0 tick',
    tip: '指定した部位（右腕・左胴など）が破壊されていれば T。片腕やサイド胴を失った後の別武器運用に切り替えます。',
    branch: true,
    hasPart: true,
  },
  {
    op: 'if_torso_hp_below',
    short: '中胴HP<?',
    label: '中央胴HP < (%)',
    cat: 'branch',
    conceptTag: '耐久分岐 (if/else)',
    execBadge: '0 tick',
    tip: '中央胴(コア)の合計耐久（装甲＋構造）が指定(%)未満なら T。終盤の回避・防御戦術切替に有効です。',
    branch: true,
    hasParam: true,
    paramLabel: 'HP(%)',
    defaultParam: 50,
  },
  {
    op: 'if_incoming_fire',
    short: '被弾中?',
    label: '被弾・接近弾?',
    cat: 'branch',
    conceptTag: 'イベント検知',
    execBadge: '0 tick',
    tip: '直前に被弾したか敵弾が近くを飛来中なら T。回避行動や防御ツイストの起動に使います。',
    branch: true,
  },
  {
    op: 'if_target_locked',
    short: 'ロック完了?',
    label: 'ミサイルロック完了?',
    cat: 'branch',
    conceptTag: 'ロックオン判定',
    execBadge: '0 tick',
    tip: '対象への誘導ロックが完了していれば T。ロック後に LRM を発射する制御に使います。',
    branch: true,
  },
  {
    op: 'if_incoming_missile',
    short: 'ミサイル飛来?',
    label: '敵ミサイル接近中?',
    cat: 'branch',
    conceptTag: 'ミサイル警報',
    execBadge: '0 tick',
    tip: '敵の誘導/無誘導ミサイルが180m以内へ接近中なら T。遮蔽退避や回避に有効です。',
    branch: true,
  },
  {
    op: 'if_ecm_jammed',
    short: 'ECM妨害?',
    label: 'ECM妨害圏内?',
    cat: 'branch',
    conceptTag: '電子戦検知',
    execBadge: '0 tick',
    tip: '敵 ECM のジャミング圏内にいるとき T。接近突破や PPC による解除判断に使えます。',
    branch: true,
  },
  {
    op: 'if_enemy_hp_below',
    short: '敵瀕死?',
    label: '敵残HP < (%)',
    cat: 'branch',
    conceptTag: '数値比較 (if/else)',
    execBadge: '0 tick',
    tip: '目標敵の総耐久が指定(%)未満なら T。弱った敵への一斉射撃や近接トドメに使えます。',
    branch: true,
    hasParam: true,
    paramLabel: 'HP(%)',
    defaultParam: 35,
  },
  {
    op: 'if_flag_a',
    short: 'FLG-A?',
    label: 'フラグAがON?',
    cat: 'branch',
    conceptTag: '記憶フラグ分岐',
    execBadge: '0 tick',
    tip: '記憶フラグ A が ON(True) なら T、OFF(False) なら F。熱状態やモード保持に使います。',
    branch: true,
  },
  {
    op: 'if_flag_b',
    short: 'FLG-B?',
    label: 'フラグBがON?',
    cat: 'branch',
    conceptTag: '記憶フラグ分岐',
    execBadge: '0 tick',
    tip: '記憶フラグ B が ON(True) なら T、OFF(False) なら F。',
    branch: true,
  },
];

const SUB_CHIPS: readonly SubChipMeta[] = [
  // Control
  {
    op: 'start',
    short: 'START',
    label: '開始点',
    cat: 'ctrl',
    conceptTag: 'サブルーチン入口',
    execBadge: '0 tick',
    tip: 'CALL で呼ばれたとき最初にここから開始します。',
  },
  {
    op: 'wire',
    short: 'WIRE',
    label: '配線 (通過)',
    cat: 'ctrl',
    conceptTag: 'パス通過',
    execBadge: '0 tick',
    tip: '何もせず次マスへ繋ぎます。4×4 盤面の動線を整理したいときに配置します。',
  },
  {
    op: 'wait',
    short: 'WAIT',
    label: '待機 (保持継続)',
    cat: 'ctrl',
    conceptTag: '時間待機',
    execBadge: '時間待機',
    tip: '直前にセットした「脚」「腰」の状態を維持したまま指定秒数だけ進み続けます。移動しながら間を置くときに使います。',
    timed: true,
    defaultDur: 0.35,
  },
  {
    op: 'return',
    short: 'RETURN',
    label: 'パイロットへ戻る',
    cat: 'ctrl',
    conceptTag: '関数リターン',
    execBadge: '即時帰還',
    tip: 'サブルーチンを終了してパイロット(MAIN)の次のマスへ制御を返します。空マスへ出た場合も自動で RETURN します。',
  },
  // Latched Legs
  {
    op: 'move_approach',
    short: '脚:接近',
    label: '敵へ前進接近',
    cat: 'leg',
    conceptTag: '脚制御 (状態保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で脚を「障害物を避けながら敵へ接近」にセットし即座に次マスへ進みます。CALL を跨いでも次の上書きまで継続します。',
  },
  {
    op: 'move_circle',
    short: '脚:周回',
    label: '周回機動 (左右指定)',
    cat: 'leg',
    conceptTag: '脚制御 (状態保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で敵の周囲を指定距離(m)・指定方向（右回り/左回り）で回り込む移動にセットします。右/左装甲分岐と組むと盾側を外に出せます。',
    hasParam: true,
    paramLabel: '距離(m)',
    defaultParam: 135,
    hasDirChoice: true,
  },
  {
    op: 'move_evade',
    short: '脚:斜行',
    label: '斜行回避機動',
    cat: 'leg',
    conceptTag: '脚制御 (状態保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で敵方位に対し斜め±38°へ素早く切る斜行回避（右斜行／左斜行）にセットします。',
    hasDirChoice: true,
  },
  {
    op: 'move_retreat',
    short: '脚:後退',
    label: '後退離脱',
    cat: 'leg',
    conceptTag: '脚制御 (状態保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で敵に正面を向けたまま距離を取る後退移動にセットします。「敵距離 < ARG?」と組んで間合い維持を作れます。',
  },
  {
    op: 'move_high_ground',
    short: '脚:高台',
    label: '高台/遮蔽回り込み',
    cat: 'leg',
    conceptTag: '脚制御 (状態保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で地形の高台や有利位置へ移動するモードをセットします。索敵や長射程維持に最適です。',
  },
  {
    op: 'move_jump',
    short: '脚:60°跳',
    label: '60°前進ジャンプ',
    cat: 'leg',
    conceptTag: 'ブースター跳躍',
    execBadge: '0 tick保持',
    tip: 'ブースター搭載機で斜め前60°へ前進跳躍します。段差越えや高台乗り上げ、急接近に使えます。',
  },
  {
    op: 'move_stop',
    short: '脚:停止',
    label: '停止 (その場旋回)',
    cat: 'leg',
    conceptTag: '脚制御 (状態保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で移動を停止します（体はその場で敵方向へ旋回可）。精密狙撃や静止防衛時に使います。',
  },
  // Latched Torso
  {
    op: 'torso_track',
    short: '腰:追尾',
    label: '敵を追尾',
    cat: 'torso',
    conceptTag: '腰制御 (状態保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で上半身の腰ツイストを「対象へ自動追尾」にします。脚が周回や斜行中でも上半身だけ敵を狙い続けます。',
  },
  {
    op: 'torso_twist_r',
    short: '腰:右ひね',
    label: '右ひねり防御 (左盾向き)',
    cat: 'torso',
    conceptTag: '腰制御 (敵基準保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で敵（または被弾方向）を基準に上半身を右へ指定角度ひねり、左腕・左胴を盾にして受けます（敵不在時は脚基準）。',
    hasParam: true,
    paramLabel: '角度(°)',
    defaultParam: 55,
    paramMin: 0,
    paramMax: 90,
    paramStep: 5,
  },
  {
    op: 'torso_twist_l',
    short: '腰:左ひね',
    label: '左ひねり防御 (右盾向き)',
    cat: 'torso',
    conceptTag: '腰制御 (敵基準保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で敵（または被弾方向）を基準に上半身を左へ指定角度ひねり、右腕・右胴を盾にして受けます（敵不在時は脚基準）。',
    hasParam: true,
    paramLabel: '角度(°)',
    defaultParam: 55,
    paramMin: 0,
    paramMax: 90,
    paramStep: 5,
  },
  {
    op: 'torso_twist_angle',
    short: '腰:角度',
    label: '角度指定ひねり (敵基準)',
    cat: 'torso',
    conceptTag: '腰制御 (敵基準保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で敵（または被弾方向）を基準に指定角度（左＝マイナス、右＝プラス）へ腰をひねります。敵不在時は脚基準になります。',
    hasParam: true,
    paramLabel: '角度(° 左- / 右+)',
    defaultParam: 55,
    paramMin: -90,
    paramMax: 90,
    paramStep: 5,
  },
  {
    op: 'torso_center',
    short: '腰:正面',
    label: '正面へ戻す',
    cat: 'torso',
    conceptTag: '腰制御 (状態保持)',
    execBadge: '0 tick保持',
    tip: '0 tick で上半身を脚の正面(0°)に戻します。',
  },
  // Weapon Groups & Emergency
  {
    op: 'fire_group_1',
    short: '撃:G1',
    label: '武装グループ G1 を発射',
    cat: 'weapon',
    conceptTag: 'グループ射撃 (照準待ち)',
    execBadge: '発射後即次へ',
    tip: 'G1 に割り当てた武装（1〜4枠同時も可）の照準を待って発射します。ガレージまたは「武装G設定」で割当を変更できます。',
    timed: true,
    defaultDur: 0.45,
    weaponGroupKey: 'G1',
  },
  {
    op: 'fire_group_2',
    short: '撃:G2',
    label: '武装グループ G2 を発射',
    cat: 'weapon',
    conceptTag: 'グループ射撃 (照準待ち)',
    execBadge: '発射後即次へ',
    tip: 'G2 に割り当てた武装を発射します。LRM 等を含めるとレーダー範囲内の敵へ遮蔽越し曲射も行えます。',
    timed: true,
    defaultDur: 0.45,
    weaponGroupKey: 'G2',
  },
  {
    op: 'fire_group_3',
    short: '撃:G3',
    label: '武装グループ G3 を発射',
    cat: 'weapon',
    conceptTag: 'グループ射撃 (照準待ち)',
    execBadge: '発射後即次へ',
    tip: 'G3 に割り当てた武装を発射します。片腕のみ・近接専用など状況別グループに便利です。',
    timed: true,
    defaultDur: 0.4,
    weaponGroupKey: 'G3',
  },
  {
    op: 'fire_group_4',
    short: '撃:G4',
    label: '武装グループ G4 を発射',
    cat: 'weapon',
    conceptTag: 'グループ射撃 (照準待ち)',
    execBadge: '発射後即次へ',
    tip: 'G4 に割り当てた武装を発射します。副武装や連続射撃グループとして活用できます。',
    timed: true,
    defaultDur: 0.4,
    weaponGroupKey: 'G4',
  },
  {
    op: 'fire_alpha',
    short: '一斉斉射',
    label: '全門斉射 (アルファ)',
    cat: 'weapon',
    conceptTag: '全門斉射 (高発熱)',
    execBadge: '発射後即次へ',
    tip: '発射可能な全武器を同時に撃ちます。瞬間火力は最大ですが熱も一気に上がるため、熱確認とセットで使います。',
    timed: true,
    defaultDur: 0.45,
  },
  {
    op: 'emergency_cool',
    short: '緊急冷却',
    label: '停止して放熱',
    cat: 'emg',
    conceptTag: '熱管理アクション',
    execBadge: '時間待機',
    tip: '移動と射撃を止めて指定秒数のあいだ冷却に専念します。',
    timed: true,
    defaultDur: 0.55,
  },
  {
    op: 'override_on',
    short: 'OVER ON',
    label: 'オーバーライド ON',
    cat: 'emg',
    conceptTag: '限界突破フラグ',
    execBadge: '0 tick',
    tip: '熱シャットダウンを無効化します（過熱ダメージに注意）。',
  },
  {
    op: 'override_off',
    short: 'OVER OFF',
    label: 'オーバーライド OFF',
    cat: 'emg',
    conceptTag: '安全装置復帰',
    execBadge: '0 tick',
    tip: '熱シャットダウン保護を再び有効にします。',
  },
  // Branches
  {
    op: 'if_group_1_ready',
    short: 'G1可?',
    label: '武装G1撃てる?',
    cat: 'branch',
    conceptTag: 'グループ射撃可否',
    execBadge: '0 tick',
    tip: 'G1 に含まれるいずれかの武装が冷却完了・弾あり・射程内で発射可能なら T、不可なら F へ進みます。',
    branch: true,
    weaponGroupKey: 'G1',
  },
  {
    op: 'if_group_2_ready',
    short: 'G2可?',
    label: '武装G2撃てる?',
    cat: 'branch',
    conceptTag: 'グループ射撃可否',
    execBadge: '0 tick',
    tip: 'G2 に含まれるいずれかの武装が今すぐ発射可能なら T へ進みます。',
    branch: true,
    weaponGroupKey: 'G2',
  },
  {
    op: 'if_group_3_ready',
    short: 'G3可?',
    label: '武装G3撃てる?',
    cat: 'branch',
    conceptTag: 'グループ射撃可否',
    execBadge: '0 tick',
    tip: 'G3 に含まれるいずれかの武装が今すぐ発射可能なら T へ進みます。',
    branch: true,
    weaponGroupKey: 'G3',
  },
  {
    op: 'if_group_4_ready',
    short: 'G4可?',
    label: '武装G4撃てる?',
    cat: 'branch',
    conceptTag: 'グループ射撃可否',
    execBadge: '0 tick',
    tip: 'G4 に含まれるいずれかの武装が今すぐ発射可能なら T へ進みます。',
    branch: true,
    weaponGroupKey: 'G4',
  },
  {
    op: 'if_enemy_in_sight',
    short: '視界敵?',
    label: '光学視界に敵?',
    cat: 'branch',
    conceptTag: '条件分岐 (if/else)',
    execBadge: '0 tick',
    tip: '中央胴正面の光学FOV内に遮蔽物なしの敵が見えていれば T。壁に遮られていれば F になります。',
    branch: true,
  },
  {
    op: 'if_enemy_dist_lt',
    short: '距離<?',
    label: '敵距離 < (m)',
    cat: 'branch',
    conceptTag: '数値比較 (if/else)',
    execBadge: '0 tick',
    tip: '敵との距離が指定(m)未満なら T。射程に入ったかの判定や、近すぎるときの後退分岐に使います。',
    branch: true,
    hasParam: true,
    paramLabel: '距離(m)',
    defaultParam: 120,
  },
  {
    op: 'if_enemy_dist_gt',
    short: '距離>?',
    label: '敵距離 > (m)',
    cat: 'branch',
    conceptTag: '数値比較 (if/else)',
    execBadge: '0 tick',
    tip: '敵との距離が指定(m)より遠ければ T。長射程武器への切替や距離詰め判断に使います。',
    branch: true,
    hasParam: true,
    paramLabel: '距離(m)',
    defaultParam: 180,
  },
  {
    op: 'if_heat_above',
    short: '熱>?',
    label: '熱量 > (%)',
    cat: 'branch',
    conceptTag: '数値比較 (if/else)',
    execBadge: '0 tick',
    tip: '熱量が指定(%)より高ければ T。撃つ前に熱をチェックして暴発を防ぐ安全ゲートに使います。',
    branch: true,
    hasParam: true,
    paramLabel: '熱(%)',
    defaultParam: 80,
  },
  {
    op: 'if_heat_below',
    short: '熱<?',
    label: '熱量 < (%)',
    cat: 'branch',
    conceptTag: '数値比較 (if/else)',
    execBadge: '0 tick',
    tip: '熱量が指定(%)より低ければ T。「熱に余裕があるときだけ高発熱武器を撃つ」分岐に最適です。',
    branch: true,
    hasParam: true,
    paramLabel: '熱(%)',
    defaultParam: 75,
  },
  {
    op: 'if_right_armor_weaker',
    short: '右脆い?',
    label: '右腕装甲 < 左腕?',
    cat: 'branch',
    conceptTag: '装甲比較分岐',
    execBadge: '0 tick',
    tip: '右腕の残装甲が左腕より少なければ T。損傷した側を隠す方向へツイストや周回を切り替えます。',
    branch: true,
  },
  {
    op: 'if_ammo_empty',
    short: '弾切れ?',
    label: '残弾切れ?',
    cat: 'branch',
    conceptTag: '装備状態分岐',
    execBadge: '0 tick',
    tip: '指定武器（または実弾武器）が残弾0なら T。',
    branch: true,
    hasWeaponSlot: true,
  },
  {
    op: 'if_airborne',
    short: '空中?',
    label: '滞空中?',
    cat: 'branch',
    conceptTag: '機体状態分岐',
    execBadge: '0 tick',
    tip: 'ジャンプジェットで宙に浮いている間は T。着地までの回避や空中射撃の制御に使います。',
    branch: true,
  },
  {
    op: 'if_incoming_fire',
    short: '被弾中?',
    label: '被弾・接近弾?',
    cat: 'branch',
    conceptTag: 'イベント検知',
    execBadge: '0 tick',
    tip: '被弾直後または接近弾を検知したら T。即座に回避カーブや防御ツイストへ分岐します。',
    branch: true,
  },
  {
    op: 'if_target_locked',
    short: 'ロック完了?',
    label: 'ミサイルロック完了?',
    cat: 'branch',
    conceptTag: 'ロックオン判定',
    execBadge: '0 tick',
    tip: '対象への誘導ロックが完了していれば T。LRM の無誘導誤射を防げます。',
    branch: true,
  },
  {
    op: 'if_incoming_missile',
    short: 'ミサイル飛来?',
    label: '敵ミサイル接近中?',
    cat: 'branch',
    conceptTag: 'ミサイル警報',
    execBadge: '0 tick',
    tip: '180m以内で敵ミサイルが接近中なら T。遮蔽へ隠れるか回避行動を取れます。',
    branch: true,
  },
  {
    op: 'if_ecm_jammed',
    short: 'ECM妨害?',
    label: 'ECM妨害圏内?',
    cat: 'branch',
    conceptTag: '電子戦検知',
    execBadge: '0 tick',
    tip: '敵 ECM ジャミング圏内にいるなら T。近接や PPC 攻撃への切替に使えます。',
    branch: true,
  },
];

const ORTHO_PAD_SLOTS: ReadonlyArray<
  | { kind: 'empty'; key: string }
  | { kind: 'center'; key: string }
  | { kind: 'dir'; key: string; dir: GridDir; label: string }
> = [
  { kind: 'empty', key: 'tl' },
  { kind: 'dir', key: 'up', dir: 'N', label: '↑' },
  { kind: 'empty', key: 'tr' },
  { kind: 'dir', key: 'left', dir: 'W', label: '←' },
  { kind: 'center', key: 'mid' },
  { kind: 'dir', key: 'right', dir: 'E', label: '→' },
  { kind: 'empty', key: 'bl' },
  { kind: 'dir', key: 'down', dir: 'S', label: '↓' },
  { kind: 'empty', key: 'br' },
];

const TARGET_OPTIONS: Array<{ value: PilotTargetMode; label: string; short: string }> = [
  { value: 'main', label: '正面主対象', short: '主対象' },
  { value: 'nearest', label: '最寄りの敵', short: '最寄り' },
  { value: 'flank', label: '側面の敵', short: '側面' },
  { value: 'attacker', label: '攻撃してきた敵', short: '攻撃元' },
  { value: 'weakest', label: '残耐久最小', short: '瀕死' },
];

const WEAPON_SLOT_OPTIONS: Array<{ value: WeaponSlotId | ''; label: string; short: string }> = [
  { value: '', label: 'いずれかの武装', short: '全枠' },
  { value: 'rightArm', label: '右腕', short: '右腕' },
  { value: 'leftArm', label: '左腕', short: '左腕' },
  { value: 'rightShoulder', label: '右胴', short: '右胴' },
  { value: 'leftShoulder', label: '左胴', short: '左胴' },
];

const PART_OPTIONS: Array<{ value: MechPartId; label: string; short: string }> = [
  { value: 'rightArm', label: '右腕', short: '右腕' },
  { value: 'leftArm', label: '左腕', short: '左腕' },
  { value: 'rightShoulder', label: '右胴', short: '右胴' },
  { value: 'leftShoulder', label: '左胴', short: '左胴' },
  { value: 'rightLeg', label: '右脚', short: '右脚' },
  { value: 'leftLeg', label: '左脚', short: '左脚' },
  { value: 'torso', label: '中央胴', short: '中央胴' },
  { value: 'head', label: '頭', short: '頭' },
];

const WEAPON_STATUS_LABEL: Record<WeaponReadyReason, { text: string; cls: string }> = {
  ready: { text: '準備OK', cls: 'is-ready' },
  cooldown: { text: '冷却中', cls: 'is-wait' },
  out_of_arc: { text: '射角外', cls: 'is-warn' },
  out_of_range: { text: '射程外', cls: 'is-warn' },
  blocked_los: { text: '遮蔽物', cls: 'is-warn' },
  no_ammo: { text: '弾切れ', cls: 'is-ng' },
  destroyed: { text: '破壊', cls: 'is-ng' },
  shutdown: { text: '熱停止', cls: 'is-ng' },
  none: { text: '-', cls: '' },
};

function stepNext(row: number, col: number, dir: GridDir): { row: number; col: number } {
  if (dir === 'N') return { row: row - 1, col };
  if (dir === 'E') return { row, col: col + 1 };
  if (dir === 'S') return { row: row + 1, col };
  return { row, col: col - 1 };
}

function formatCellParamSummary(
  cell: PilotGridCell | MechSubroutineCell | undefined,
  isMain: boolean
): string {
  if (!cell || cell.op === 'empty') return '';
  const subUseArg = !isMain && Boolean((cell as MechSubroutineCell).useArg);
  if (cell.op === 'if_enemy_dist_lt' || cell.op === 'if_enemy_flank') {
    return subUseArg ? '<ARG' : `<${Math.round(cell.param ?? 150)}m`;
  }
  if (cell.op === 'if_enemy_dist_gt') {
    return subUseArg ? '>ARG' : `>${Math.round(cell.param ?? 180)}m`;
  }
  if (cell.op === 'if_heat_above') {
    return subUseArg ? '>ARG%' : `>${Math.round(cell.param ?? 80)}%`;
  }
  if (cell.op === 'if_heat_below' || cell.op === 'if_torso_hp_below' || cell.op === 'if_enemy_hp_below') {
    return subUseArg ? '<ARG%' : `<${Math.round(cell.param ?? 45)}%`;
  }
  if (cell.op === 'if_ammo_empty') {
    return WEAPON_SLOT_OPTIONS.find((w) => w.value === (cell.weaponSlot ?? ''))?.short ?? '';
  }
  if (isMain) {
    const pCell = cell as PilotGridCell;
    if (pCell.op === 'if_part_destroyed') {
      return PART_OPTIONS.find((p) => p.value === (pCell.partId ?? 'rightArm'))?.short ?? '';
    }
    if (pCell.op.startsWith('call_s')) {
      const tgt = TARGET_OPTIONS.find((t) => t.value === (pCell.target ?? 'main'))?.short ?? '';
      const hasArg = pCell.param !== undefined && Number.isFinite(pCell.param);
      const argStr = hasArg ? `(${Math.round(pCell.param!)})` : '';
      if (tgt && tgt !== '主対象') return `${tgt}${argStr}`;
      return hasArg ? `ARG:${Math.round(pCell.param!)}` : `${(pCell.durationSec ?? 0.65).toFixed(1)}s`;
    }
    if (pCell.op === 'emergency_cool') {
      return `${(pCell.durationSec ?? 0.6).toFixed(1)}s`;
    }
    return '';
  }

  const sCell = cell as MechSubroutineCell;
  if (sCell.op === 'if_enemy_dist_lt' || sCell.op === 'if_enemy_dist_gt') {
    const cmp = sCell.op === 'if_enemy_dist_lt' ? '<' : '>';
    return sCell.useArg ? `${cmp}ARG` : `${cmp}${Math.round(sCell.param ?? 150)}m`;
  }
  if (sCell.op === 'if_heat_above' || sCell.op === 'if_heat_below') {
    const cmp = sCell.op === 'if_heat_above' ? '>' : '<';
    return sCell.useArg ? `${cmp}ARG%` : `${cmp}${Math.round(sCell.param ?? 75)}%`;
  }
  if (sCell.op === 'move_maintain' || sCell.op === 'move_circle') {
    const dist = sCell.useArg ? 'ARG' : `${Math.round(sCell.param ?? 135)}m`;
    if (sCell.op === 'move_circle') {
      return `${dist}${sCell.direction === 'left' ? '左' : '右'}`;
    }
    return dist;
  }
  if (sCell.op === 'move_evade') {
    return sCell.direction === 'left' ? '左斜' : '右斜';
  }
  if (sCell.op === 'torso_twist_r') {
    return `右${sCell.useArg ? 'ARG' : Math.round(sCell.param ?? 55)}°`;
  }
  if (sCell.op === 'torso_twist_l') {
    return `左${sCell.useArg ? 'ARG' : Math.round(sCell.param ?? 55)}°`;
  }
  if (sCell.op === 'torso_twist_angle') {
    if (sCell.useArg) return 'ARG°';
    const deg = Math.round(sCell.param ?? 55);
    return `${deg > 0 ? `+${deg}` : deg}°`;
  }
  if (sCell.op === 'wait' || sCell.op === 'emergency_cool') {
    return `${(sCell.durationSec ?? 0.4).toFixed(2)}s`;
  }
  return '';
}

const LEGACY_SUB_CHIPS: readonly SubChipMeta[] = [
  {
    op: 'move_maintain',
    short: '脚:間合(旧)',
    label: '適正距離維持 (旧)',
    cat: 'leg',
    conceptTag: '脚制御 (互換)',
    execBadge: '0 tick保持',
    tip: '旧形式チップです。現在は「距離<? → 後退 / 接近」を 4×4 ROM に組みます。',
    hasParam: true,
    paramLabel: '距離(m)',
    defaultParam: 170,
  },
  {
    op: 'torso_twist_auto',
    short: '腰:防御(旧)',
    label: '防御ツイスト(旧自動)',
    cat: 'torso',
    conceptTag: '腰制御 (互換)',
    execBadge: '0 tick保持',
    tip: '旧形式の自動防御チップです。現在は「右脆い? → 腰:右ひね / 腰:左ひね」で明示的に組みます。',
  },
  {
    op: 'fire_right_arm',
    short: '撃:右腕',
    label: '右腕武器を発射 (旧)',
    cat: 'weapon',
    conceptTag: '射撃 (互換)',
    execBadge: '発射後即次へ',
    tip: '旧形式の個別枠発射チップです。新規作成時は武装グループ「撃:G1〜G4」がおすすめです。',
    timed: true,
    defaultDur: 0.45,
    weaponSlotKey: 'rightArm',
  },
  {
    op: 'fire_left_arm',
    short: '撃:左腕',
    label: '左腕武器を発射 (旧)',
    cat: 'weapon',
    conceptTag: '射撃 (互換)',
    execBadge: '発射後即次へ',
    tip: '旧形式の個別枠発射チップです。新規作成時は武装グループ「撃:G1〜G4」がおすすめです。',
    timed: true,
    defaultDur: 0.4,
    weaponSlotKey: 'leftArm',
  },
  {
    op: 'fire_right_shoulder',
    short: '撃:右胴',
    label: '右胴武器を発射 (旧)',
    cat: 'weapon',
    conceptTag: '射撃 (互換)',
    execBadge: '発射後即次へ',
    tip: '旧形式の個別枠発射チップです。新規作成時は武装グループ「撃:G1〜G4」がおすすめです。',
    timed: true,
    defaultDur: 0.45,
    weaponSlotKey: 'rightShoulder',
  },
  {
    op: 'fire_left_shoulder',
    short: '撃:左胴',
    label: '左胴武器を発射 (旧)',
    cat: 'weapon',
    conceptTag: '射撃 (互換)',
    execBadge: '発射後即次へ',
    tip: '旧形式の個別枠発射チップです。新規作成時は武装グループ「撃:G1〜G4」がおすすめです。',
    timed: true,
    defaultDur: 0.45,
    weaponSlotKey: 'leftShoulder',
  },
  {
    op: 'if_right_arm_ready',
    short: '右腕可?',
    label: '右腕撃てる? (旧)',
    cat: 'branch',
    conceptTag: '射撃可否 (互換)',
    execBadge: '0 tick',
    tip: '旧形式の個別枠チェックです。新規作成時は「G1可?〜G4可?」が使えます。',
    branch: true,
    weaponSlotKey: 'rightArm',
  },
  {
    op: 'if_left_arm_ready',
    short: '左腕可?',
    label: '左腕撃てる? (旧)',
    cat: 'branch',
    conceptTag: '射撃可否 (互換)',
    execBadge: '0 tick',
    tip: '旧形式の個別枠チェックです。新規作成時は「G1可?〜G4可?」が使えます。',
    branch: true,
    weaponSlotKey: 'leftArm',
  },
  {
    op: 'if_right_shoulder_ready',
    short: '右胴可?',
    label: '右胴撃てる? (旧)',
    cat: 'branch',
    conceptTag: '射撃可否 (互換)',
    execBadge: '0 tick',
    tip: '旧形式の個別枠チェックです。新規作成時は「G1可?〜G4可?」が使えます。',
    branch: true,
    weaponSlotKey: 'rightShoulder',
  },
  {
    op: 'if_left_shoulder_ready',
    short: '左胴可?',
    label: '左胴撃てる? (旧)',
    cat: 'branch',
    conceptTag: '射撃可否 (互換)',
    execBadge: '0 tick',
    tip: '旧形式の個別枠チェックです。新規作成時は「G1可?〜G4可?」が使えます。',
    branch: true,
    weaponSlotKey: 'leftShoulder',
  },
];

function findSubChipMeta(op: MechSubroutineOp | undefined): SubChipMeta | undefined {
  if (!op || op === 'empty') return undefined;
  return SUB_CHIPS.find((m) => m.op === op) ?? LEGACY_SUB_CHIPS.find((m) => m.op === op);
}

interface ArrowConnector {
  key: string;
  from: { row: number; col: number };
  to: { row: number; col: number };
  branch: 'next' | 'yes' | 'no';
  perpOffset: number;
  focused: boolean;
  active: boolean;
}

export function GridProgramEditor({
  pilot,
  allPilots,
  mech,
  allRoms,
  debugTrace,
  liveSensor,
  onChangePilot,
  onSelectPilot,
  onSavePilot,
  onDeletePilot,
  onChangeMech,
  onSaveRom,
  onDeleteRom,
}: GridProgramEditorProps) {
  const [selection, setSelection] = useState<EditorSelection>({ kind: 'pilot' });
  const [romDrafts, setRomDrafts] = useState<
    Record<string, { cells: MechSubroutineCell[]; category: RomCategory }>
  >({});
  const [autoFollow, setAutoFollow] = useState<boolean>(false);
  const [selectedPos, setSelectedPos] = useState<{ row: number; col: number }>({ row: 0, col: 0 });

  const [hoveredPaletteOp, setHoveredPaletteOp] = useState<string | null>(null);
  const [hoveredCellPos, setHoveredCellPos] = useState<{ row: number; col: number } | null>(null);
  const [guideExpanded, setGuideExpanded] = useState<boolean>(true);
  const [guidePosition, setGuidePosition] = useState<'bottom' | 'top'>('bottom');
  const [showInlineDesc, setShowInlineDesc] = useState<boolean>(false);
  const [sidebarTab, setSidebarTab] = useState<'palette' | 'code'>('palette');
  const [pilotFilter, setPilotFilter] = useState<PilotPaletteFilter>('all');
  const [subFilter, setSubFilter] = useState<SubPaletteFilter>('all');
  const [copiedPython, setCopiedPython] = useState<boolean>(false);
  const [dragCellPos, setDragCellPos] = useState<{ row: number; col: number } | null>(null);
  const [showQuickGroups, setShowQuickGroups] = useState<boolean>(false);
  const [romNameDraft, setRomNameDraft] = useState<string>('');
  const [romNotice, setRomNotice] = useState<string | null>(null);
  const romNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (romNoticeTimerRef.current !== null) {
        window.clearTimeout(romNoticeTimerRef.current);
      }
    };
  }, []);

  const flashRomNotice = (msg: string) => {
    setRomNotice(msg);
    if (romNoticeTimerRef.current !== null) {
      window.clearTimeout(romNoticeTimerRef.current);
    }
    romNoticeTimerRef.current = window.setTimeout(() => setRomNotice(null), 2600);
  };

  const chassisSpec = useMemo(() => getChassisSpec(mech.chassisId), [mech.chassisId]);
  const tierSpec = useMemo(() => getControlTierSpec(mech.controlTier), [mech.controlTier]);
  const resolvedGroups = useMemo(() => getResolvedWeaponGroups(mech), [mech]);
  const romIssues = useMemo(
    () => analyzeMechRomCompatibility(mech, allRoms, pilot),
    [mech, allRoms, pilot]
  );

  const mountedSlotsByRomId = useMemo(() => {
    const map: Record<string, MechSubroutineSlotId[]> = {};
    for (const slotId of tierSpec.enabledSlots) {
      const refId = mech.romSlots?.[slotId];
      if (typeof refId !== 'string') continue;
      const rom = findRomById(allRoms, refId);
      if (!rom) continue;
      if (!map[rom.id]) map[rom.id] = [];
      map[rom.id].push(slotId);
    }
    return map;
  }, [tierSpec.enabledSlots, mech.romSlots, allRoms]);

  const inlineSubSlots = useMemo(
    () =>
      tierSpec.enabledSlots.filter(
        (slotId) =>
          mech.romSlots?.[slotId] === undefined &&
          mech.subroutines.some((s) => s.slotId === slotId)
      ),
    [tierSpec.enabledSlots, mech.romSlots, mech.subroutines]
  );

  const sortedAllRoms = useMemo(() => {
    const order: Record<RomCategory, number> = { attack: 0, move: 1, control: 2 };
    return [...allRoms].sort((a, b) => {
      const ca = order[romDrafts[a.id]?.category ?? getRomCategory(a)];
      const cb = order[romDrafts[b.id]?.category ?? getRomCategory(b)];
      if (ca !== cb) return ca - cb;
      if (Boolean(a.builtIn) !== Boolean(b.builtIn)) return a.builtIn ? 1 : -1;
      return 0;
    });
  }, [allRoms, romDrafts]);

  const pilotButtonList = useMemo(() => {
    const base = allPilots && allPilots.length > 0 ? [...allPilots] : [];
    if (!base.some((p) => p.id === pilot.id)) {
      return [pilot, ...base];
    }
    return base;
  }, [allPilots, pilot]);

  const toggleWeaponGroupMember = (groupId: WeaponGroupId, slot: WeaponSlotId) => {
    const cur = resolvedGroups[groupId];
    const nextMembers = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot];
    onChangeMech({
      ...mech,
      weaponGroups: {
        ...resolvedGroups,
        [groupId]: nextMembers,
      },
    });
  };

  useEffect(() => {
    if (!tierSpec.pilotEnabled && selection.kind === 'pilot') {
      const s1Ref = mech.romSlots?.S1;
      const s1Rom = typeof s1Ref === 'string' ? findRomById(allRoms, s1Ref) : undefined;
      if (s1Rom) {
        setSelection({ kind: 'rom', romId: s1Rom.id });
      } else if (inlineSubSlots.length > 0) {
        setSelection({ kind: 'inline', slotId: inlineSubSlots[0] });
      } else if (allRoms[0]) {
        setSelection({ kind: 'rom', romId: allRoms[0].id });
      }
      setHoveredCellPos(null);
      setHoveredPaletteOp(null);
    }
  }, [tierSpec.pilotEnabled, selection.kind, mech.romSlots, allRoms, inlineSubSlots]);

  useEffect(() => {
    if (!autoFollow || !debugTrace) return;
    if (!tierSpec.pilotEnabled) {
      const s1Ref = mech.romSlots?.S1;
      const s1Rom = typeof s1Ref === 'string' ? findRomById(allRoms, s1Ref) : undefined;
      if (s1Rom) setSelection({ kind: 'rom', romId: s1Rom.id });
      else setSelection({ kind: 'inline', slotId: 'S1' });
      return;
    }
    if (debugTrace.activeSubroutineSlot) {
      const ref = mech.romSlots?.[debugTrace.activeSubroutineSlot];
      const rom = typeof ref === 'string' ? findRomById(allRoms, ref) : undefined;
      if (rom) {
        setSelection({ kind: 'rom', romId: rom.id });
      } else {
        setSelection({ kind: 'inline', slotId: debugTrace.activeSubroutineSlot });
      }
    } else if (debugTrace.activePilotCell) {
      setSelection({ kind: 'pilot' });
    }
  }, [
    autoFollow,
    tierSpec.pilotEnabled,
    debugTrace?.activeSubroutineSlot,
    debugTrace?.activePilotCell,
    mech.romSlots,
    allRoms,
  ]);

  const isMain = tierSpec.pilotEnabled && selection.kind === 'pilot';
  const editingCatalogRom =
    selection.kind === 'rom' ? findRomById(allRoms, selection.romId) : undefined;
  const editingInlineSub =
    selection.kind === 'inline'
      ? mech.subroutines.find((s) => s.slotId === selection.slotId)
      : undefined;

  const editingRomMountedSlots = editingCatalogRom
    ? mountedSlotsByRomId[editingCatalogRom.id] ?? []
    : [];
  const editingCategory: RomCategory = editingCatalogRom
    ? romDrafts[editingCatalogRom.id]?.category ?? getRomCategory(editingCatalogRom)
    : editingInlineSub
      ? editingInlineSub.category ?? getRomCategory({ cells: editingInlineSub.cells })
      : 'control';

  const currentRomCells: MechSubroutineCell[] = useMemo(() => {
    if (isMain) return [];
    if (selection.kind === 'rom' && editingCatalogRom) {
      if (romDrafts[editingCatalogRom.id]) {
        return romDrafts[editingCatalogRom.id].cells;
      }
      const mountedSlot = editingRomMountedSlots[0];
      if (mountedSlot) {
        const sub = mech.subroutines.find((s) => s.slotId === mountedSlot);
        if (sub) return sub.cells;
      }
      return editingCatalogRom.cells;
    }
    if (selection.kind === 'inline' && editingInlineSub) {
      return editingInlineSub.cells;
    }
    return [];
  }, [
    isMain,
    selection,
    editingCatalogRom,
    editingInlineSub,
    romDrafts,
    editingRomMountedSlots,
    mech.subroutines,
  ]);

  const gridSize: 4 | 6 = isMain ? 6 : 4;

  useEffect(() => {
    if (isMain) return;
    if (editingCatalogRom) {
      setRomNameDraft(normalizeRomName(editingCatalogRom.name));
    } else if (editingInlineSub) {
      setRomNameDraft(normalizeRomName(editingInlineSub.name.replace(/\s*\([46]×[46]\)$/, '')));
    } else {
      setRomNameDraft('');
    }
  }, [isMain, editingCatalogRom?.id, editingCatalogRom?.name, editingInlineSub?.slotId]);

  const isRomDirty = useMemo(() => {
    if (isMain || !editingCatalogRom) return false;
    const savedCat = getRomCategory(editingCatalogRom);
    if (editingCategory !== savedCat) return true;
    return (
      JSON.stringify(filterCellsForGrid(currentRomCells, 4)) !==
      JSON.stringify(filterCellsForGrid(editingCatalogRom.cells, 4))
    );
  }, [isMain, editingCatalogRom, editingCategory, currentRomCells]);

  const clampedRow = Math.min(selectedPos.row, gridSize - 1);
  const clampedCol = Math.min(selectedPos.col, gridSize - 1);

  const rawCells = isMain ? pilot.grid.cells : currentRomCells;
  const cells = useMemo(
    () =>
      rawCells.filter(
        (c) => c.row >= 0 && c.row < gridSize && c.col >= 0 && c.col < gridSize
      ),
    [rawCells, gridSize]
  );
  const hiddenOutOfBoundsCount = useMemo(
    () =>
      rawCells.filter(
        (c) => c.op !== 'empty' && (c.row >= gridSize || c.col >= gridSize)
      ).length,
    [rawCells, gridSize]
  );
  const selectedCell = cells.find((c) => c.row === clampedRow && c.col === clampedCol);

  const equippedWeapons: Record<WeaponSlotId, { spec: WeaponPartSpec; equipped: boolean; passive: boolean }> = useMemo(() => {
    const ra = getArmWeaponSpec(mech.parts.rightArmWeapon);
    const la = getArmWeaponSpec(mech.parts.leftArmWeapon);
    const rs = getShoulderWeaponSpec(mech.parts.rightShoulderWeapon);
    const ls = getShoulderWeaponSpec(mech.parts.leftShoulderWeapon);
    return {
      rightArm: { spec: ra, equipped: ra.id !== 'arm_none', passive: isPassiveModuleSpec(ra) },
      leftArm: { spec: la, equipped: la.id !== 'arm_none', passive: isPassiveModuleSpec(la) },
      rightShoulder: { spec: rs, equipped: rs.id !== 'shd_none', passive: isPassiveModuleSpec(rs) },
      leftShoulder: { spec: ls, equipped: ls.id !== 'shd_none', passive: isPassiveModuleSpec(ls) },
    };
  }, [
    mech.parts.rightArmWeapon,
    mech.parts.leftArmWeapon,
    mech.parts.rightShoulderWeapon,
    mech.parts.leftShoulderWeapon,
  ]);

  const cellMap = useMemo(() => {
    const map = new Map<string, PilotGridCell | MechSubroutineCell>();
    for (const c of cells) {
      if (c.op !== 'empty') {
        map.set(`${c.row}_${c.col}`, c);
      }
    }
    return map;
  }, [cells]);

  const setPilotCells = (nextCells: PilotGridCell[]) => {
    onChangePilot({
      ...pilot,
      version: 2,
      grid: { gridSize: 6, cells: nextCells },
    });
  };

  const updateCurrentRomState = (
    nextCells: MechSubroutineCell[],
    nextCategory?: RomCategory
  ) => {
    if (selection.kind === 'rom' && editingCatalogRom) {
      const cat = nextCategory ?? editingCategory;
      setRomDrafts((prev) => ({
        ...prev,
        [editingCatalogRom.id]: { cells: nextCells, category: cat },
      }));
      if (editingRomMountedSlots.length > 0) {
        const nextSubs = mech.subroutines.map((s) =>
          editingRomMountedSlots.includes(s.slotId)
            ? { ...s, cells: nextCells, category: cat }
            : s
        );
        onChangeMech({ ...mech, subroutines: nextSubs });
      }
      return;
    }
    if (selection.kind === 'inline' && editingInlineSub) {
      const cat = nextCategory ?? editingCategory;
      const nextSubs = mech.subroutines.map((s) =>
        s.slotId === editingInlineSub.slotId
          ? { ...s, cells: nextCells, category: cat }
          : s
      );
      onChangeMech({ ...mech, subroutines: nextSubs });
    }
  };

  const setSubCells = (nextCells: MechSubroutineCell[]) => {
    updateCurrentRomState(nextCells);
  };

  const handleMountCatalogRom = (slotId: MechSubroutineSlotId) => {
    if (!editingCatalogRom) return;
    const nextBp = resolveMechBlueprintRoms(
      {
        ...mech,
        romSlots: {
          ...(mech.romSlots ?? {}),
          [slotId]: editingCatalogRom.id,
        },
      },
      allRoms
    );
    const draft = romDrafts[editingCatalogRom.id];
    if (draft) {
      nextBp.subroutines = nextBp.subroutines.map((s) =>
        s.slotId === slotId ? { ...s, cells: draft.cells, category: draft.category } : s
      );
    }
    onChangeMech(nextBp);
    flashRomNotice(`${formatRomLabel(editingCatalogRom)} を ${slotId} へ搭載しました`);
  };

  const updatePilotCellAt = (
    row: number,
    col: number,
    patch: Partial<PilotGridCell> & { op?: PilotGridOp }
  ) => {
    const current = pilot.grid.cells.find((c) => c.row === row && c.col === col);
    const base: PilotGridCell = current ?? {
      row,
      col,
      op: 'empty',
      dir: 'S',
    };
    const nextCell: PilotGridCell = { ...base, ...patch, row, col };
    const others = pilot.grid.cells.filter((c) => !(c.row === row && c.col === col));
    setPilotCells(nextCell.op === 'empty' ? others : [...others, nextCell]);
  };

  const updateSubCellAt = (
    row: number,
    col: number,
    patch: Partial<MechSubroutineCell> & { op?: MechSubroutineOp }
  ) => {
    if (isMain || (!editingCatalogRom && !editingInlineSub)) return;
    const current = currentRomCells.find((c) => c.row === row && c.col === col);
    const base: MechSubroutineCell = current ?? {
      row,
      col,
      op: 'empty',
      dir: 'E',
    };
    const nextCell: MechSubroutineCell = { ...base, ...patch, row, col };
    const others = currentRomCells.filter((c) => !(c.row === row && c.col === col));
    setSubCells(nextCell.op === 'empty' ? others : [...others, nextCell]);
  };

  const updatePilotCell = (patch: Partial<PilotGridCell> & { op?: PilotGridOp }) =>
    updatePilotCellAt(clampedRow, clampedCol, patch);

  const updateSubCell = (patch: Partial<MechSubroutineCell> & { op?: MechSubroutineOp }) =>
    updateSubCellAt(clampedRow, clampedCol, patch);

  const clearCellAt = (row: number, col: number) => {
    if (isMain) {
      updatePilotCellAt(row, col, { op: 'empty' });
    } else {
      updateSubCellAt(row, col, { op: 'empty' });
    }
  };

  const assignPilotChipAt = (meta: PilotChipMeta, row: number, col: number) => {
    const existing = pilot.grid.cells.find((c) => c.row === row && c.col === col);
    updatePilotCellAt(row, col, {
      op: meta.op,
      dir: existing && existing.op !== 'empty' ? existing.dir : meta.branch ? 'E' : 'S',
      elseDir: meta.branch ? (existing?.elseDir ?? 'S') : undefined,
      param: meta.hasParam ? (existing?.param ?? meta.defaultParam) : undefined,
      durationSec: meta.timed ? (existing?.durationSec ?? meta.defaultDur) : undefined,
      target: meta.hasTarget ? (existing?.target ?? 'main') : undefined,
      partId: meta.hasPart ? (existing?.partId ?? 'rightArm') : undefined,
      weaponSlot: meta.hasWeaponSlot ? existing?.weaponSlot : undefined,
    });
  };

  const assignSubChipAt = (meta: SubChipMeta, row: number, col: number) => {
    if (isMain || (!editingCatalogRom && !editingInlineSub)) return;
    const existing = currentRomCells.find((c) => c.row === row && c.col === col);
    updateSubCellAt(row, col, {
      op: meta.op,
      dir: existing && existing.op !== 'empty' ? existing.dir : 'E',
      elseDir: meta.branch ? (existing?.elseDir ?? 'S') : undefined,
      param: meta.hasParam ? (existing?.param ?? meta.defaultParam) : undefined,
      useArg: meta.hasParam ? existing?.useArg : undefined,
      durationSec: meta.timed ? (existing?.durationSec ?? meta.defaultDur) : undefined,
      direction: meta.hasDirChoice
        ? existing?.direction === 'left'
          ? 'left'
          : 'right'
        : undefined,
      weaponSlot: meta.hasWeaponSlot ? existing?.weaponSlot : undefined,
    });
  };

  const moveOrSwapCell = (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
    if (fromRow === toRow && fromCol === toCol) return;
    if (isMain) {
      const src = pilot.grid.cells.find((c) => c.row === fromRow && c.col === fromCol);
      if (!src || src.op === 'empty') return;
      const dst = pilot.grid.cells.find((c) => c.row === toRow && c.col === toCol);
      const others = pilot.grid.cells.filter(
        (c) => !(c.row === fromRow && c.col === fromCol) && !(c.row === toRow && c.col === toCol)
      );
      const next: PilotGridCell[] = [...others, { ...src, row: toRow, col: toCol }];
      if (dst && dst.op !== 'empty') {
        next.push({ ...dst, row: fromRow, col: fromCol });
      }
      setPilotCells(next);
    } else if (!isMain && (editingCatalogRom || editingInlineSub)) {
      const src = currentRomCells.find((c) => c.row === fromRow && c.col === fromCol);
      if (!src || src.op === 'empty') return;
      const dst = currentRomCells.find((c) => c.row === toRow && c.col === toCol);
      const others = currentRomCells.filter(
        (c) => !(c.row === fromRow && c.col === fromCol) && !(c.row === toRow && c.col === toCol)
      );
      const next: MechSubroutineCell[] = [...others, { ...src, row: toRow, col: toCol }];
      if (dst && dst.op !== 'empty') {
        next.push({ ...dst, row: fromRow, col: fromCol });
      }
      setSubCells(next);
    }
    setSelectedPos({ row: toRow, col: toCol });
  };

  const isExitEmpty = (r: number, c: number, d: GridDir): boolean => {
    const n = stepNext(r, c, d);
    if (n.row < 0 || n.row >= gridSize || n.col < 0 || n.col >= gridSize) return true;
    const target = cellMap.get(`${n.row}_${n.col}`);
    return !target || target.op === 'empty';
  };

  const formatTargetCoord = (r: number, c: number, d: GridDir): string => {
    const n = stepNext(r, c, d);
    if (isExitEmpty(r, c, d)) {
      return isMain || !tierSpec.pilotEnabled ? '↺ STARTへ' : '⏎ 呼出元へ';
    }
    return `(${n.row + 1}, ${n.col + 1})`;
  };

  const activeRunningPos = useMemo(() => {
    if (!debugTrace) return null;
    if (isMain) return debugTrace.activePilotCell;
    if (!debugTrace.activeSubroutineSlot) return null;
    if (selection.kind === 'inline') {
      return debugTrace.activeSubroutineSlot === selection.slotId
        ? debugTrace.activeSubroutineCell
        : null;
    }
    if (selection.kind === 'rom') {
      const mountedRef = mech.romSlots?.[debugTrace.activeSubroutineSlot];
      const resolvedRom =
        typeof mountedRef === 'string' ? findRomById(allRoms, mountedRef) : undefined;
      if (resolvedRom?.id === selection.romId) {
        return debugTrace.activeSubroutineCell;
      }
    }
    return null;
  }, [debugTrace, isMain, selection, mech.romSlots, allRoms]);

  const connectors: ArrowConnector[] = useMemo(() => {
    const raw: Array<Omit<ArrowConnector, 'perpOffset'>> = [];
    for (const c of cells) {
      if (c.op === 'empty') continue;
      const meta = isMain
        ? PILOT_CHIPS.find((m) => m.op === c.op)
        : findSubChipMeta(c.op as MechSubroutineOp);
      if (!meta) continue;
      if (!isMain && c.op === 'return') continue;

      const isFocused = c.row === clampedRow && c.col === clampedCol;
      const isRunning = activeRunningPos?.row === c.row && activeRunningPos?.col === c.col;

      if (meta.branch) {
        const yesNext = stepNext(c.row, c.col, c.dir);
        if (cellMap.has(`${yesNext.row}_${yesNext.col}`)) {
          raw.push({
            key: `${c.row}_${c.col}_yes`,
            from: { row: c.row, col: c.col },
            to: yesNext,
            branch: 'yes',
            focused: isFocused,
            active: isRunning && debugTrace?.lastBranch?.result === true,
          });
        }
        const noDir = c.elseDir ?? c.dir;
        const noNext = stepNext(c.row, c.col, noDir);
        if (cellMap.has(`${noNext.row}_${noNext.col}`)) {
          raw.push({
            key: `${c.row}_${c.col}_no`,
            from: { row: c.row, col: c.col },
            to: noNext,
            branch: 'no',
            focused: isFocused,
            active: isRunning && debugTrace?.lastBranch?.result === false,
          });
        }
      } else {
        const next = stepNext(c.row, c.col, c.dir);
        if (cellMap.has(`${next.row}_${next.col}`)) {
          raw.push({
            key: `${c.row}_${c.col}_next`,
            from: { row: c.row, col: c.col },
            to: next,
            branch: 'next',
            focused: isFocused,
            active: Boolean(isRunning),
          });
        }
      }
    }

    // Offset opposing bidirectional arrows or duplicate same-edge YES/NO branches
    const pairCounts = new Map<string, number>();
    const edgeSeen = new Map<string, number>();
    for (const r of raw) {
      const a = `${r.from.row},${r.from.col}`;
      const b = `${r.to.row},${r.to.col}`;
      const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`;
      pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
    }

    return raw.map((r) => {
      const a = `${r.from.row},${r.from.col}`;
      const b = `${r.to.row},${r.to.col}`;
      const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`;
      const count = pairCounts.get(pairKey) ?? 1;
      let perpOffset = 0;
      if (count > 1) {
        const sameDirKey = `${a}>${b}`;
        const seen = edgeSeen.get(sameDirKey) ?? 0;
        edgeSeen.set(sameDirKey, seen + 1);
        if (seen > 0) {
          perpOffset = -11;
        } else {
          perpOffset = 10;
        }
      }
      return { ...r, perpOffset };
    });
  }, [cells, cellMap, isMain, clampedRow, clampedCol, activeRunningPos, debugTrace?.lastBranch]);

  const focusedTargetMap = useMemo(() => {
    const map = new Map<string, 'next' | 'yes' | 'no'>();
    if (!selectedCell || selectedCell.op === 'empty') return map;
    const meta = isMain
      ? PILOT_CHIPS.find((m) => m.op === selectedCell.op)
      : findSubChipMeta(selectedCell.op as MechSubroutineOp);
    if (!meta) return map;
    if (meta.branch) {
      const y = stepNext(selectedCell.row, selectedCell.col, selectedCell.dir);
      const n = stepNext(selectedCell.row, selectedCell.col, selectedCell.elseDir ?? selectedCell.dir);
      if (cellMap.has(`${y.row}_${y.col}`)) map.set(`${y.row}_${y.col}`, 'yes');
      if (cellMap.has(`${n.row}_${n.col}`)) map.set(`${n.row}_${n.col}`, 'no');
    } else if (selectedCell.op !== 'return') {
      const nx = stepNext(selectedCell.row, selectedCell.col, selectedCell.dir);
      if (cellMap.has(`${nx.row}_${nx.col}`)) map.set(`${nx.row}_${nx.col}`, 'next');
    }
    return map;
  }, [selectedCell, isMain, cellMap]);

  const selectedPilotMeta =
    isMain && selectedCell
      ? PILOT_CHIPS.find((m) => m.op === selectedCell.op)
      : undefined;
  const selectedSubMeta =
    !isMain && selectedCell
      ? findSubChipMeta(selectedCell.op as MechSubroutineOp)
      : undefined;

  // Resolve target chip for the Learning Guide card (Palette Hover > Grid Hover > Selected Cell)
  const guideData = useMemo(() => {
    if (hoveredPaletteOp) {
      if (isMain) {
        const meta = PILOT_CHIPS.find((m) => m.op === hoveredPaletteOp);
        if (meta) {
          const sampleCell: PilotGridCell = {
            row: 0,
            col: 0,
            op: meta.op,
            dir: meta.branch ? 'E' : 'S',
            elseDir: meta.branch ? 'S' : undefined,
            param: meta.defaultParam,
            durationSec: meta.defaultDur,
            target: meta.hasTarget ? 'main' : undefined,
            partId: meta.hasPart ? 'rightArm' : undefined,
          };
          return {
            meta,
            syntax: formatPilotCellPython(sampleCell),
            weaponSlotKey: undefined as WeaponSlotId | undefined,
            weaponGroupKey: undefined as WeaponGroupId | undefined,
          };
        }
      } else {
        const meta = findSubChipMeta(hoveredPaletteOp as MechSubroutineOp);
        if (meta) {
          const sampleCell: MechSubroutineCell = {
            row: 0,
            col: 0,
            op: meta.op,
            dir: 'E',
            elseDir: meta.branch ? 'S' : undefined,
            param: meta.defaultParam,
            durationSec: meta.defaultDur,
            direction: meta.hasDirChoice ? 'auto' : undefined,
          };
          return {
            meta,
            syntax: formatSubCellPython(sampleCell),
            weaponSlotKey: meta.weaponSlotKey,
            weaponGroupKey: meta.weaponGroupKey,
          };
        }
      }
    }

    const hoveredCell = hoveredCellPos
      ? cellMap.get(`${hoveredCellPos.row}_${hoveredCellPos.col}`)
      : undefined;
    const cellToExplain = hoveredCell ?? (selectedCell && selectedCell.op !== 'empty' ? selectedCell : undefined);
    if (!cellToExplain) return null;

    if (isMain) {
      const pCell = cellToExplain as PilotGridCell;
      const meta = PILOT_CHIPS.find((m) => m.op === pCell.op);
      if (!meta) return null;
      return {
        meta,
        syntax: formatPilotCellPython(pCell),
        weaponSlotKey: undefined as WeaponSlotId | undefined,
        weaponGroupKey: undefined as WeaponGroupId | undefined,
      };
    } else {
      const sCell = cellToExplain as MechSubroutineCell;
      const meta = findSubChipMeta(sCell.op);
      if (!meta) return null;
      return {
        meta,
        syntax: formatSubCellPython(sCell),
        weaponSlotKey: meta.weaponSlotKey,
        weaponGroupKey: meta.weaponGroupKey,
      };
    }
  }, [hoveredPaletteOp, hoveredCellPos, selectedCell, cellMap, isMain]);

  const filteredPilotChips = useMemo(() => {
    if (pilotFilter === 'all') return PILOT_CHIPS;
    if (pilotFilter === 'call') return PILOT_CHIPS.filter((c) => c.cat === 'call');
    if (pilotFilter === 'branch') return PILOT_CHIPS.filter((c) => c.cat === 'branch');
    return PILOT_CHIPS.filter((c) => c.cat === 'ctrl' || c.cat === 'emg');
  }, [pilotFilter]);

  const filteredSubChips = useMemo(() => {
    if (subFilter === 'all') return SUB_CHIPS;
    if (subFilter === 'leg') return SUB_CHIPS.filter((c) => c.cat === 'leg');
    if (subFilter === 'torso') return SUB_CHIPS.filter((c) => c.cat === 'torso');
    if (subFilter === 'weapon_emg') {
      return SUB_CHIPS.filter((c) => c.cat === 'weapon' || c.cat === 'emg');
    }
    if (subFilter === 'branch') return SUB_CHIPS.filter((c) => c.cat === 'branch');
    return SUB_CHIPS.filter((c) => c.cat === 'ctrl');
  }, [subFilter]);

  const pythonPreviewText = useMemo(() => {
    if (selection.kind === 'rom' && editingCatalogRom) {
      const mountedSlot = editingRomMountedSlots[0] ?? 'S1';
      return subroutineToPython(
        {
          slotId: mountedSlot,
          name: formatRomLabel(editingCatalogRom),
          gridSize: 4,
          cells: currentRomCells,
        },
        4,
        !tierSpec.pilotEnabled && mountedSlot === 'S1'
      );
    }
    return fullProgramToPython(pilot, mech);
  }, [
    selection.kind,
    editingCatalogRom,
    editingRomMountedSlots,
    currentRomCells,
    tierSpec.pilotEnabled,
    pilot,
    mech,
  ]);

  const renderOrthoPad = (
    currentDir: GridDir,
    branchType: 'next' | 'yes' | 'no',
    onSelectDir: (d: GridDir) => void
  ) => (
    <div className="cm-ortho-pad">
      {ORTHO_PAD_SLOTS.map((slot) => {
        if (slot.kind === 'empty') {
          return <span key={slot.key} className="cm-ortho-spacer" />;
        }
        if (slot.kind === 'center') {
          return (
            <span key={slot.key} className="cm-ortho-center">
              {branchType === 'yes' ? 'T' : branchType === 'no' ? 'F' : '●'}
            </span>
          );
        }
        const isCurrent = currentDir === slot.dir;
        return (
          <button
            key={slot.key}
            type="button"
            className={`cm-ortho-btn ${isCurrent ? `is-active-${branchType}` : ''}`}
            onClick={() => onSelectDir(slot.dir)}
            title={`方向: ${slot.label}`}
          >
            {slot.label}
          </button>
        );
      })}
    </div>
  );

  const renderLearningGuideCard = () => {
    const equippedInfo = guideData?.weaponSlotKey
      ? equippedWeapons[guideData.weaponSlotKey]
      : undefined;
    const groupInfo = guideData?.weaponGroupKey
      ? getWeaponGroupSummary(mech, guideData.weaponGroupKey)
      : undefined;

    return (
      <div className={`cm-edu-tooltip-card ${guideExpanded ? '' : 'is-collapsed'}`}>
        <div
          className="cm-edu-toolbar"
          onClick={() => setGuideExpanded((v) => !v)}
        >
          <span className="cm-edu-title">
            <GraduationCap size={14} /> コマンド学習ガイド
          </span>
          <div className="cm-edu-controls" onClick={(e) => e.stopPropagation()}>
            {guideExpanded && (
              <button
                type="button"
                className="cm-mini-btn"
                onClick={() => setGuidePosition((p) => (p === 'bottom' ? 'top' : 'bottom'))}
                title="学習ガイドの位置を上下切り替え"
              >
                {guidePosition === 'bottom' ? '▲ 上部へ' : '▼ 盤面下へ'}
              </button>
            )}
            <button
              type="button"
              className={`cm-mini-btn ${guideExpanded ? 'is-active' : ''}`}
              onClick={() => setGuideExpanded((v) => !v)}
            >
              {guideExpanded ? (
                <>
                  閉じる <ChevronUp size={12} />
                </>
              ) : (
                <>
                  開く <ChevronDown size={12} />
                </>
              )}
            </button>
          </div>
        </div>

        {guideExpanded &&
          (guideData ? (
            <div className="cm-edu-body">
              <div className="cm-edu-badges">
                <span className="cm-edu-badge-concept">{guideData.meta.conceptTag}</span>
                <span className="cm-edu-badge-exec">{guideData.meta.execBadge}</span>
                <strong className="cm-edu-chip-title">{guideData.meta.label}</strong>
              </div>
              <pre className="cm-edu-syntax">
                {guideData.syntax}
                {groupInfo
                  ? `  # ${
                      groupInfo.equippedItems.length > 0
                        ? groupInfo.equippedItems
                            .map((i) => `${i.spec.name}${i.mountCount > 1 ? `×${i.mountCount}` : ''}`)
                            .join(' + ')
                        : '未割当'
                    }`
                  : equippedInfo
                    ? `  # ${equippedInfo.equipped ? equippedInfo.spec.name : '未装備'}`
                    : ''}
              </pre>
              <p className="cm-edu-tip">{guideData.meta.tip}</p>
              {groupInfo && (
                <div
                  className={`cm-edu-weapon-note ${
                    groupInfo.equippedItems.length > 0 ? '' : 'is-warn'
                  }`}
                >
                  {groupInfo.equippedItems.length > 0
                    ? `${guideData.weaponGroupKey} 構成: ${groupInfo.equippedItems
                        .map((i) => `${i.spec.name}${i.mountCount > 1 ? `×${i.mountCount}` : ''}`)
                        .join(' + ')}（合計威力 ${groupInfo.totalDamage} / 発熱 ${
                        groupInfo.totalHeat
                      } / 最適 ${groupInfo.minRange}〜${groupInfo.maxRange}m${
                        groupInfo.maxExtendedRange > groupInfo.maxRange
                          ? `・最大 ${groupInfo.maxExtendedRange}m`
                          : ''
                      }${groupInfo.maxBurnSec > 0 ? ` / 照射 ${groupInfo.maxBurnSec}s` : ''}）`
                    : `${guideData.weaponGroupKey} には武装が割り当てられていません。「武装G設定」またはガレージで武器を登録してください。`}
                </div>
              )}
              {equippedInfo && (
                <div className={`cm-edu-weapon-note ${equippedInfo.equipped ? '' : 'is-warn'}`}>
                  {equippedInfo.equipped
                    ? `装備中: ${equippedInfo.spec.name}（威力 ${equippedInfo.spec.damage} / 射程 ${equippedInfo.spec.range}${
                        equippedInfo.spec.maxRange && equippedInfo.spec.maxRange > equippedInfo.spec.range
                          ? `-${equippedInfo.spec.maxRange}`
                          : ''
                      }m${
                        equippedInfo.spec.burnDurationSec
                          ? ` / 照射 ${equippedInfo.spec.burnDurationSec}s`
                          : ''
                      } / 発熱 ${equippedInfo.spec.heatCost} / 冷却 ${equippedInfo.spec.cooldownSec}s）`
                    : 'この武器スロットは現在「未装備」です。ガレージで装備するか、他の武装チップを使ってください。'}
                </div>
              )}
            </div>
          ) : (
            <div className="cm-edu-empty">
              盤面のマスや右のチップにカーソルを合わせると、処理の仕組み（0 tick保持／照準待ちなど）と対応する Python 構文がここに表示されます。
            </div>
          ))}
      </div>
    );
  };

  return (
    <section className="cm-panel cm-grid-studio">
      <div className="cm-panel-head">
        <div>
          <h2 className="cm-panel-title">統合グリッド・プログラミング</h2>
          <p className="cm-panel-sub">
            {tierSpec.pilotEnabled
              ? 'パイロット (6×6) で戦況を見て ARG 付き CALL S1〜S5 を選び、4×4 ROM で脚・腰・武装を動かします'
              : `ロボット単体モード (${tierSpec.slotGridSizes.S1}×${tierSpec.slotGridSizes.S1})：パイロット層なしで S1 パネル 1 枚を直接ループ実行します`}
          </p>
        </div>
        {tierSpec.pilotEnabled ? (
          <label className="cm-field cm-field--inline">
            <span>パイロット名</span>
            <input
              type="text"
              value={pilot.name}
              onChange={(e) => onChangePilot({ ...pilot, name: e.target.value })}
            />
          </label>
        ) : (
          <span className="cm-tier-badge">ロボット単体モード（パイロット未使用）</span>
        )}
      </div>

      {/* Control Tier Switcher Bar */}
      <div className="cm-tier-bar">
        <span className="cm-tier-bar-label">制御段階:</span>
        <div className="cm-seg">
          {CONTROL_TIER_CATALOG.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tierSpec.id === t.id ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
              title={t.description}
              onClick={() => {
                const nextTier: MechControlTier = t.id;
                onChangeMech({ ...mech, controlTier: nextTier });
                if (!t.pilotEnabled) {
                  const s1Ref = mech.romSlots?.S1;
                  const s1Rom =
                    typeof s1Ref === 'string' ? findRomById(allRoms, s1Ref) : undefined;
                  if (s1Rom) setSelection({ kind: 'rom', romId: s1Rom.id });
                  else if (allRoms[0]) setSelection({ kind: 'rom', romId: allRoms[0].id });
                  else setSelection({ kind: 'inline', slotId: 'S1' });
                }
                setHoveredCellPos(null);
                setHoveredPaletteOp(null);
              }}
            >
              {t.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Two-Row Selector: Upper Pilot Row + Lower Color-Coded ROM Row */}
      <div className="cm-selector-stack">
        {tierSpec.pilotEnabled && (
          <div className="cm-selector-row">
            <span className="cm-selector-label">
              <Cpu size={12} /> パイロット 6×6
            </span>
            <div className="cm-pilot-btn-row" role="tablist" aria-label="パイロット一覧">
              {pilotButtonList.map((p) => {
                const isEquipped = p.id === pilot.id;
                const isActive = isMain && isEquipped;
                const isCustom = !isBuiltInPilotId(p.id) && Boolean(allPilots?.some((ap) => ap.id === p.id));
                const isRunning =
                  isEquipped && Boolean(debugTrace?.activePilotCell && !debugTrace.activeSubroutineSlot);
                const shortTitle = p.name.replace(/\s*\(6×6\)$/, '');
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`cm-pilot-btn ${isEquipped ? 'is-equipped' : ''} ${
                      isActive ? 'is-active' : ''
                    } ${isRunning ? 'is-running' : ''}`}
                    title={`${p.name}${isEquipped ? ' (現在の搭乗パイロット)' : ''}`}
                    onClick={() => {
                      if (!isEquipped) {
                        onSelectPilot?.(p);
                      }
                      setSelection({ kind: 'pilot' });
                      setHoveredCellPos(null);
                      setHoveredPaletteOp(null);
                    }}
                  >
                    <span>{shortTitle}</span>
                    {isCustom && <span className="cm-rom-custom-tag">自作</span>}
                  </button>
                );
              })}
              {onSavePilot && (
                <button
                  type="button"
                  className="cm-add-lib-btn"
                  title="新しい空の 6×6 パイロットを作成して編集します"
                  onClick={() => {
                    const res = onSavePilot({
                      name: '新規パイロット',
                      cells: [{ row: 0, col: 0, op: 'start', dir: 'S' }],
                    });
                    setSelection({ kind: 'pilot' });
                    flashRomNotice(`新規パイロット「${res.saved.name}」を作成しました`);
                  }}
                >
                  <Plus size={12} /> 新規
                </button>
              )}
            </div>
          </div>
        )}

        <div className="cm-selector-row">
          <span className="cm-selector-label">
            <Grid3X3 size={12} /> ROM 4×4
          </span>
          <div className="cm-rom-btn-row" role="tablist" aria-label="ROM一覧">
            {inlineSubSlots.map((slotId) => {
              const sub = mech.subroutines.find((s) => s.slotId === slotId);
              if (!sub) return null;
              const cat = sub.category ?? getRomCategory({ cells: sub.cells });
              const isActive = selection.kind === 'inline' && selection.slotId === slotId;
              const isRunning = debugTrace?.activeSubroutineSlot === slotId;
              const hasIssues = romIssues[slotId].length > 0;
              const cleanName = sub.name.replace(/\s*\([46]×[46]\)$/, '') || slotId;
              return (
                <button
                  key={`inline:${slotId}`}
                  type="button"
                  className={`cm-rom-btn is-cat-${cat} ${isActive ? 'is-active' : ''} ${
                    isRunning ? 'is-running' : ''
                  }`}
                  title={`${slotId} 搭載中 (機体直接): ${sub.name}`}
                  onClick={() => {
                    setSelection({ kind: 'inline', slotId });
                    setHoveredCellPos(null);
                    setHoveredPaletteOp(null);
                  }}
                >
                  <span className="cm-rom-chip-top">
                    <span className="cm-rom-chip-slots">
                      <span className="cm-rom-slot-tag">{slotId}</span>
                    </span>
                    {hasIssues && <span className="cm-board-tab-warn">!</span>}
                  </span>
                  <span className="cm-rom-chip-name">{cleanName}</span>
                </button>
              );
            })}

            {sortedAllRoms.map((rom) => {
              const cat = romDrafts[rom.id]?.category ?? getRomCategory(rom);
              const mountedSlots = mountedSlotsByRomId[rom.id] ?? [];
              const isActive = selection.kind === 'rom' && selection.romId === rom.id;
              const isRunning = Boolean(
                debugTrace?.activeSubroutineSlot &&
                  mountedSlots.includes(debugTrace.activeSubroutineSlot)
              );
              const hasIssues = mountedSlots.some((s) => romIssues[s].length > 0);
              const catLabel =
                ROM_CATEGORY_SPECS.find((c) => c.id === cat)?.label ?? '制御系';
              return (
                <button
                  key={rom.id}
                  type="button"
                  className={`cm-rom-btn is-cat-${cat} ${isActive ? 'is-active' : ''} ${
                    isRunning ? 'is-running' : ''
                  }`}
                  title={`${formatRomLabel(rom)} [${catLabel}]${
                    mountedSlots.length > 0 ? ` ・搭載: ${mountedSlots.join(', ')}` : ' ・未搭載'
                  }`}
                  onClick={() => {
                    setSelection({ kind: 'rom', romId: rom.id });
                    setHoveredCellPos(null);
                    setHoveredPaletteOp(null);
                  }}
                >
                  {(mountedSlots.length > 0 || !rom.builtIn || hasIssues) && (
                    <span className="cm-rom-chip-top">
                      <span className="cm-rom-chip-slots">
                        {mountedSlots.map((sl) => (
                          <span key={sl} className="cm-rom-slot-tag">
                            {sl}
                          </span>
                        ))}
                      </span>
                      <span className="cm-rom-chip-flags">
                        {!rom.builtIn && <span className="cm-rom-custom-tag">自作</span>}
                        {hasIssues && <span className="cm-board-tab-warn">!</span>}
                      </span>
                    </span>
                  )}
                  <span className="cm-rom-chip-name">{rom.name}</span>
                </button>
              );
            })}

            {onSaveRom && (
              <button
                type="button"
                className="cm-add-lib-btn cm-rom-add-tile"
                title="新しい 4×4 ROM を作成して編集します"
                onClick={() => {
                  const res = onSaveRom({
                    name: '新規ROM',
                    category: 'attack',
                    gridSize: 4,
                    cells: [{ row: 0, col: 0, op: 'start', dir: 'E' }],
                  });
                  setSelection({ kind: 'rom', romId: res.saved.id });
                  setHoveredCellPos(null);
                  setHoveredPaletteOp(null);
                  flashRomNotice(`新規ROM「${formatRomLabel(res.saved)}」を作成しました`);
                }}
              >
                <Plus size={14} />
                <span>新規ROM</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Execution Trace & Sensor Debug Bar */}
      <div className="cm-live-trace-bar">
        <div className="cm-trace-row">
          <div className="cm-trace-exec">
            <strong>実行トレース:</strong>{' '}
            {!tierSpec.pilotEnabled ? (
              debugTrace?.activeSubroutineCell ? (
                <span className="cm-trace-sub">
                  ロボット {debugTrace.activeSubroutineSlot ?? 'S1'}(
                  {debugTrace.activeSubroutineCell.row + 1},
                  {debugTrace.activeSubroutineCell.col + 1})
                </span>
              ) : (
                '待機中'
              )
            ) : (
              <>
                {debugTrace?.activePilotCell
                  ? `MAIN(${debugTrace.activePilotCell.row + 1},${debugTrace.activePilotCell.col + 1})`
                  : '待機中'}
                {debugTrace?.activeSubroutineSlot && debugTrace.activeSubroutineCell && (
                  <>
                    {' ▶ '}
                    <span className="cm-trace-sub">
                      {debugTrace.activeSubroutineSlot}({debugTrace.activeSubroutineCell.row + 1},
                      {debugTrace.activeSubroutineCell.col + 1})
                    </span>
                  </>
                )}
              </>
            )}
            {debugTrace?.lastBranch && (
              <span className="cm-trace-branch">
                {' '}
                | 分岐[{debugTrace.lastBranch.board}]: {debugTrace.lastBranch.label} →{' '}
                <b>{debugTrace.lastBranch.result ? 'YES' : 'NO'}</b>
              </span>
            )}
          </div>
          <label className="cm-check-inline">
            <input
              type="checkbox"
              checked={autoFollow}
              onChange={(e) => setAutoFollow(e.target.checked)}
            />
            <span>実行中タブへ自動追従</span>
          </label>
        </div>

        <div className="cm-trace-sensors">
          <span>
            <Eye size={12} /> 光学視界: <b>{liveSensor?.visibleEnemies.length ?? 0}</b>
            {liveSensor?.nearestEnemy && ` (${Math.round(liveSensor.nearestEnemy.distance)}m)`}
          </span>
          <span>
            <Radar size={12} /> レーダー: <b>{liveSensor?.radarContacts.length ?? 0}</b>
            {liveSensor?.nearestRadarEnemy && ` (${Math.round(liveSensor.nearestRadarEnemy.distance)}m)`}
          </span>
          <span>
            熱量: <b>{Math.round((liveSensor?.heatRatio ?? 0) * 100)}%</b>
          </span>
          <span>
            腰角: <b>{Math.round(liveSensor?.torsoYawOffsetDeg ?? 0)}°</b>
          </span>
          <span>
            FlagA:<b>{debugTrace?.flagA ? '1' : '0'}</b> B:<b>{debugTrace?.flagB ? '1' : '0'}</b>
          </span>
        </div>

        {debugTrace && (
          <div className="cm-trace-weapons">
            {(
              [
                ['rightArm', '右腕'],
                ['leftArm', '左腕'],
                ['rightShoulder', '右胴'],
                ['leftShoulder', '左胴'],
              ] as const
            ).map(([slot, label]) => {
              const reason = debugTrace.weaponStatuses[slot];
              if (reason === 'none') return null;
              const info = WEAPON_STATUS_LABEL[reason];
              return (
                <span key={slot} className={`cm-wep-debug-pill ${info.cls}`}>
                  {label}: {info.text}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Split: Grid Board + Guide | Inspector + Palette/Code */}
      <div className="cm-studio-grid-layout">
        <div className="cm-grid-board-col">
          {isMain && onSavePilot && (
            <div className="cm-rom-editor-bar">
              <div className="cm-rom-ref-row">
                <span className="cm-rom-kind-pill">
                  {isBuiltInPilotId(pilot.id) ? '標準パイロット' : '自作パイロット'}
                </span>
                <strong className="cm-rom-ref-name">{pilot.name}</strong>
                {romNotice && <span className="cm-save-notice">{romNotice}</span>}
              </div>
              <div className="cm-rom-action-row">
                <button
                  type="button"
                  className="cm-btn-primary-xs"
                  disabled={isBuiltInPilotId(pilot.id) || !allPilots?.some((p) => p.id === pilot.id)}
                  title={
                    !isBuiltInPilotId(pilot.id) && allPilots?.some((p) => p.id === pilot.id)
                      ? '編集中の自作パイロットを上書き保存します'
                      : '標準パイロットは上書きできません。「新規保存」を使ってください'
                  }
                  onClick={() => {
                    const res = onSavePilot({
                      id: pilot.id,
                      name: pilot.name,
                      cells: pilot.grid.cells,
                    });
                    flashRomNotice(`上書き: ${res.saved.name}`);
                  }}
                >
                  パイロット上書き
                </button>
                <button
                  type="button"
                  className="cm-btn-xs"
                  onClick={() => {
                    const res = onSavePilot({
                      name: isBuiltInPilotId(pilot.id) ? `${pilot.name.replace(/\s*\(6×6\)$/, '')}改` : pilot.name,
                      cells: pilot.grid.cells,
                    });
                    flashRomNotice(`新規保存: ${res.saved.name}`);
                  }}
                >
                  新規パイロット保存
                </button>
                {onDeletePilot && (
                  <button
                    type="button"
                    className="cm-btn-xs cm-btn-danger-xs"
                    disabled={isBuiltInPilotId(pilot.id) || !allPilots?.some((p) => p.id === pilot.id)}
                    onClick={() => {
                      const deletedName = pilot.name;
                      onDeletePilot(pilot.id);
                      flashRomNotice(`削除: ${deletedName}`);
                    }}
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
          )}

          {!isMain && (
            <>
              <div className="cm-rom-editor-bar">
                <div className="cm-rom-ref-row">
                  <span className="cm-rom-kind-pill">
                    {editingCatalogRom
                      ? editingCatalogRom.builtIn
                        ? '標準ROM'
                        : '自作ROM'
                      : '直接編集'}
                  </span>
                  <span className={`cm-rom-cat-pill is-cat-${editingCategory}`}>
                    {ROM_CATEGORY_SPECS.find((c) => c.id === editingCategory)?.label ?? '制御系'}
                  </span>
                  <strong className="cm-rom-ref-name">
                    {editingCatalogRom
                      ? formatRomLabel(editingCatalogRom)
                      : `${
                          normalizeRomName(
                            (editingInlineSub?.name ?? 'S1').replace(/\s*\([46]×[46]\)$/, '')
                          ) || editingInlineSub?.slotId || 'S1'
                        } (4×4)`}
                  </strong>
                  <span className="cm-rom-wt-pill">{ROM_WEIGHT_4X4.toFixed(1)}t</span>
                  {editingCatalogRom && editingRomMountedSlots.length > 0 && (
                    <span className="cm-rom-dirty-pill" style={{ borderColor: 'rgba(56, 189, 248, 0.45)', background: 'rgba(14, 116, 144, 0.3)', color: '#bae6fd' }}>
                      搭載: {editingRomMountedSlots.join(', ')}
                    </span>
                  )}
                  {editingCatalogRom && editingRomMountedSlots.length === 0 && (
                    <span className="cm-tag-count">未搭載</span>
                  )}
                  {isRomDirty && <span className="cm-rom-dirty-pill">未保存変更</span>}
                  {romNotice && <span className="cm-save-notice">{romNotice}</span>}
                </div>

                <div className="cm-rom-action-row">
                  <div className="cm-cat-seg" role="group" aria-label="ROM種別カラー">
                    {ROM_CATEGORY_SPECS.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`cm-cat-seg-btn is-cat-${cat.id} ${
                          editingCategory === cat.id ? 'is-active' : ''
                        }`}
                        onClick={() => updateCurrentRomState(currentRomCells, cat.id)}
                        title={`ROM種別を「${cat.label}」に設定`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    className="cm-rom-name-input"
                    maxLength={6}
                    value={romNameDraft}
                    placeholder="ROM名(6文字迄)"
                    aria-label="ROM名（6文字まで）"
                    onChange={(e) => setRomNameDraft(normalizeRomName(e.target.value))}
                  />
                  <span className="cm-tag-count">{Array.from(romNameDraft).length}/6</span>

                  {onSaveRom && (
                    <>
                      <button
                        type="button"
                        className="cm-btn-primary-xs"
                        disabled={!editingCatalogRom || Boolean(editingCatalogRom.builtIn)}
                        title={
                          editingCatalogRom && !editingCatalogRom.builtIn
                            ? '参照中の自作ROMを上書き更新します（他の搭載機体にも反映）'
                            : '標準ROM・未登録は上書きできません。「新規ROM保存」を使ってください'
                        }
                        onClick={() => {
                          if (!editingCatalogRom || editingCatalogRom.builtIn) return;
                          const prevId = editingCatalogRom.id;
                          const res = onSaveRom({
                            id: prevId,
                            name: romNameDraft || editingCatalogRom.name,
                            category: editingCategory,
                            gridSize: 4,
                            cells: currentRomCells,
                          });
                          setRomDrafts((prev) => {
                            const next = { ...prev };
                            delete next[prevId];
                            return next;
                          });
                          setSelection({ kind: 'rom', romId: res.saved.id });
                          flashRomNotice(`上書き: ${formatRomLabel(res.saved)}`);
                        }}
                      >
                        ROM上書き
                      </button>
                      <button
                        type="button"
                        className="cm-btn-xs"
                        title="現在の盤面・色区分を新しい自作ROMとして保存します"
                        onClick={() => {
                          const prevId = editingCatalogRom?.id;
                          const res = onSaveRom({
                            name: romNameDraft || '自作ROM',
                            category: editingCategory,
                            gridSize: 4,
                            cells: currentRomCells,
                            slotId: editingInlineSub?.slotId,
                          });
                          if (prevId) {
                            setRomDrafts((prev) => {
                              const next = { ...prev };
                              delete next[prevId];
                              return next;
                            });
                          }
                          setSelection({ kind: 'rom', romId: res.saved.id });
                          flashRomNotice(`新規保存: ${formatRomLabel(res.saved)}`);
                        }}
                      >
                        新規ROM保存
                      </button>
                    </>
                  )}

                  {onDeleteRom && (
                    <button
                      type="button"
                      className="cm-btn-xs cm-btn-danger-xs"
                      disabled={!editingCatalogRom || Boolean(editingCatalogRom.builtIn)}
                      onClick={() => {
                        if (!editingCatalogRom || editingCatalogRom.builtIn) return;
                        const delId = editingCatalogRom.id;
                        const delLabel = formatRomLabel(editingCatalogRom);
                        onDeleteRom(delId);
                        setRomDrafts((prev) => {
                          const next = { ...prev };
                          delete next[delId];
                          return next;
                        });
                        if (tierSpec.pilotEnabled) {
                          setSelection({ kind: 'pilot' });
                        } else {
                          const fallback = sortedAllRoms.find((r) => r.id !== delId);
                          if (fallback) setSelection({ kind: 'rom', romId: fallback.id });
                        }
                        flashRomNotice(`削除: ${delLabel}`);
                      }}
                    >
                      ROM削除
                    </button>
                  )}

                  {editingCatalogRom && (
                    <select
                      className="cm-rom-mount-select"
                      aria-label="ROMをスロットに搭載"
                      value=""
                      onChange={(e) => {
                        const v = e.target.value as MechSubroutineSlotId | '';
                        if (v) handleMountCatalogRom(v);
                      }}
                    >
                      <option value="">搭載先 (S1〜S5)...</option>
                      {tierSpec.enabledSlots.map((sl) => {
                        const curRef = mech.romSlots?.[sl];
                        const curRom =
                          typeof curRef === 'string' ? findRomById(allRoms, curRef) : undefined;
                        return (
                          <option key={sl} value={sl}>
                            {sl} へ搭載 ({curRom ? `現在: ${curRom.name}` : '未搭載/直接'})
                          </option>
                        );
                      })}
                    </select>
                  )}

                  <button
                    type="button"
                    className={`cm-mini-btn ${showQuickGroups ? 'is-active' : ''}`}
                    onClick={() => setShowQuickGroups((v) => !v)}
                    title="武装グループ G1〜G4 の割当をここから変更できます"
                  >
                    <SlidersHorizontal size={12} /> 武装G設定
                  </button>
                </div>
              </div>

              {(() => {
                const slotsToShow =
                  selection.kind === 'inline'
                    ? [selection.slotId]
                    : editingRomMountedSlots;
                const flatIssues = slotsToShow.flatMap((sl) =>
                  romIssues[sl].map((iss) => ({ slotId: sl, iss }))
                );
                if (flatIssues.length === 0) return null;
                return (
                  <div className="cm-rom-issue-list">
                    {flatIssues.map(({ slotId, iss }, idx) => (
                      <span
                        key={idx}
                        className={`cm-rom-issue ${iss.level === 'error' ? 'is-error' : 'is-warn'}`}
                      >
                        ⚠ [{slotId}] {iss.text}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {showQuickGroups && (
                <div className="cm-wgroup-quick-panel">
                  <div className="cm-wgroup-quick-note">
                    各武器をどのグループ (G1〜G4) で発射するか設定（複数同時も可・ガレージと連動）
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
                      const info = equippedWeapons[row.slot];
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
                              const active = resolvedGroups[gid].includes(row.slot);
                              return (
                                <button
                                  key={gid}
                                  type="button"
                                  disabled={info.passive}
                                  className={`cm-wgroup-btn ${
                                    active ? `is-active is-${gid.toLowerCase()}` : ''
                                  }`}
                                  onClick={() => toggleWeaponGroupMember(gid, row.slot)}
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
              )}
            </>
          )}

          {guidePosition === 'top' && renderLearningGuideCard()}

          <div className="cm-grid-board-wrap">
            <div
              className={gridSize === 6 ? 'cm-chip-grid is-6x6' : 'cm-chip-grid is-4x4'}
              role="grid"
              aria-label={`${isMain ? pilot.name : editingCatalogRom?.name ?? editingInlineSub?.name ?? 'ROM'} フローグリッド`}
            >
              {Array.from({ length: gridSize }, (_, row) =>
                Array.from({ length: gridSize }, (_, col) => {
                  const cell = cellMap.get(`${row}_${col}`);
                  const isEmpty = !cell || cell.op === 'empty';
                  const meta = isMain
                    ? PILOT_CHIPS.find((m) => m.op === cell?.op)
                    : findSubChipMeta(cell?.op as MechSubroutineOp | undefined);

                  const isSelected = clampedRow === row && clampedCol === col;
                  const isRunning = activeRunningPos?.row === row && activeRunningPos?.col === col;
                  const isDimmed = Boolean(activeRunningPos) && !isEmpty && !isRunning;
                  const targetBranch = focusedTargetMap.get(`${row}_${col}`);

                  const shortLabel =
                    isMain && cell?.op.startsWith('call_s')
                      ? `CALL ${cell.op.slice(-2).toUpperCase()}`
                      : meta?.short ?? '';
                  const paramSummary = formatCellParamSummary(cell, isMain);

                  let exitBadge = '';
                  if (!isEmpty && cell && meta) {
                    if (meta.branch) {
                      const yEx = isExitEmpty(row, col, cell.dir);
                      const nEx = isExitEmpty(row, col, cell.elseDir ?? cell.dir);
                      const mark = isMain || !tierSpec.pilotEnabled ? '↺' : '⏎';
                      if (yEx && nEx) exitBadge = `TF${mark}`;
                      else if (yEx) exitBadge = `T${mark}`;
                      else if (nEx) exitBadge = `F${mark}`;
                    } else if (cell.op !== 'return' && isExitEmpty(row, col, cell.dir)) {
                      exitBadge = isMain || !tierSpec.pilotEnabled ? '↺' : '⏎';
                    }
                  }

                  return (
                    <button
                      key={`${row}_${col}`}
                      type="button"
                      draggable={!isEmpty}
                      onDragStart={(e) => {
                        if (isEmpty) return;
                        setDragCellPos({ row, col });
                        e.dataTransfer.setData('text/plain', `cell:${row}:${col}`);
                      }}
                      onDragEnd={() => setDragCellPos(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const payload = e.dataTransfer.getData('text/plain');
                        if (payload.startsWith('palette:')) {
                          const op = payload.slice('palette:'.length);
                          if (isMain) {
                            const pm = PILOT_CHIPS.find((m) => m.op === op);
                            if (pm) assignPilotChipAt(pm, row, col);
                          } else {
                            const sm = SUB_CHIPS.find((m) => m.op === op);
                            if (sm) assignSubChipAt(sm, row, col);
                          }
                          setSelectedPos({ row, col });
                        } else if (payload.startsWith('cell:')) {
                          const [, fr, fc] = payload.split(':');
                          moveOrSwapCell(Number(fr), Number(fc), row, col);
                        } else if (dragCellPos) {
                          moveOrSwapCell(dragCellPos.row, dragCellPos.col, row, col);
                        }
                        setDragCellPos(null);
                      }}
                      onClick={() => setSelectedPos({ row, col })}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        clearCellAt(row, col);
                        setSelectedPos({ row, col });
                      }}
                      onMouseEnter={() => setHoveredCellPos({ row, col })}
                      onMouseLeave={() => setHoveredCellPos(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Delete' || e.key === 'Backspace') {
                          e.preventDefault();
                          clearCellAt(row, col);
                        }
                      }}
                      className={[
                        'cm-gcell',
                        isEmpty ? 'empty-cell' : 'has-chip',
                        !isEmpty && meta ? `cm-cat-${meta.cat}` : '',
                        isSelected ? 'is-selected' : '',
                        isRunning ? 'is-running' : '',
                        isDimmed ? 'is-trace-dimmed' : '',
                        targetBranch ? `is-target-${targetBranch}` : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="cm-cell-coord">
                        {row + 1},{col + 1}
                      </span>
                      {exitBadge && (
                        <span
                          className="cm-cell-exit"
                          title={isMain || !tierSpec.pilotEnabled ? 'STARTへ戻る' : '呼出元へ戻る (RETURN)'}
                        >
                          {exitBadge}
                        </span>
                      )}
                      {!isEmpty && meta ? (
                        <div className="cm-cell-content">
                          <span className="cm-cell-title">{shortLabel}</span>
                          {paramSummary && <span className="cm-cell-param">{paramSummary}</span>}
                        </div>
                      ) : (
                        <span className="cm-cell-plus">+</span>
                      )}
                    </button>
                  );
                })
              )}

              {/* SVG Flow Arrow Overlay */}
              <svg
                className="cm-grid-arrows-svg"
                viewBox={`0 0 ${gridSize * 100} ${gridSize * 100}`}
                preserveAspectRatio="none"
              >
                <defs>
                  {(['next', 'yes', 'no'] as const).map((branch) => {
                    const color =
                      branch === 'yes' ? '#38bdf8' : branch === 'no' ? '#f43f5e' : '#10b981';
                    return (
                      <marker
                        key={branch}
                        id={`cm-arrow-${branch}`}
                        markerWidth="20"
                        markerHeight="20"
                        refX="14"
                        refY="10"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path
                          d="M1,1 L1,19 L18,10 z"
                          fill={color}
                          stroke="#020617"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                      </marker>
                    );
                  })}
                </defs>

                {connectors.map((c) => {
                  const x1 = c.from.col * 100 + 50;
                  const y1 = c.from.row * 100 + 50;
                  const x2 = c.to.col * 100 + 50;
                  const y2 = c.to.row * 100 + 50;
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const dist = Math.hypot(dx, dy) || 1;
                  const ux = dx / dist;
                  const uy = dy / dist;
                  const perpX = -uy;
                  const perpY = ux;

                  const offsetX = perpX * c.perpOffset;
                  const offsetY = perpY * c.perpOffset;
                  const hasPortBadge = c.branch === 'yes' || c.branch === 'no';
                  const portDist = 31;
                  const shaftStartDist = hasPortBadge ? 38 : 30;
                  const sx = x1 + ux * shaftStartDist + offsetX;
                  const sy = y1 + uy * shaftStartDist + offsetY;
                  const ex = x2 - ux * 31 + offsetX;
                  const ey = y2 - uy * 31 + offsetY;
                  const bx = x1 + ux * portDist + offsetX;
                  const by = y1 + uy * portDist + offsetY;

                  const strokeColor =
                    c.branch === 'yes' ? '#38bdf8' : c.branch === 'no' ? '#f43f5e' : '#10b981';
                  const strokeWidth = c.active ? 9 : c.focused ? 7.5 : 6;
                  const opacity = c.active
                    ? 1
                    : activeRunningPos
                      ? c.focused
                        ? 0.78
                        : 0.34
                      : c.focused
                        ? 1
                        : 0.9;

                  const pathD = `M ${sx} ${sy} L ${ex} ${ey}`;

                  return (
                    <g
                      key={c.key}
                      style={{ opacity }}
                      className={c.active ? 'cm-arrow-active' : undefined}
                    >
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#020617"
                        strokeWidth={strokeWidth + 4.5}
                        strokeLinecap="round"
                        strokeOpacity={0.85}
                      />
                      <path
                        d={pathD}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        markerEnd={`url(#cm-arrow-${c.branch})`}
                      />
                      {hasPortBadge && (
                        <g>
                          <circle
                            cx={bx}
                            cy={by}
                            r={10.5}
                            fill={c.branch === 'yes' ? '#0284c7' : '#e11d48'}
                            stroke="#020617"
                            strokeWidth={2}
                          />
                          <text
                            x={bx}
                            y={by}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#ffffff"
                            fontSize="12"
                            fontWeight="800"
                          >
                            {c.branch === 'yes' ? 'T' : 'F'}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="cm-arrow-legend">
            <span className="cm-legend-item">
              <i className="cm-dot is-next" /> 次へ
            </span>
            <span className="cm-legend-item">
              <i className="cm-dot is-yes" /> T: YES
            </span>
            <span className="cm-legend-item">
              <i className="cm-dot is-no" /> F: NO
            </span>
            <span className="cm-legend-item">
              <i className="cm-dot is-run" /> 実行中
            </span>
            <span className="cm-legend-hint">
              {isMain || !tierSpec.pilotEnabled ? '↺空先でSTARTへ' : '⏎空先で呼出元へ'}・右クリック消去・ドラッグ移動
            </span>
          </div>

          {!isMain && hiddenOutOfBoundsCount > 0 && (
            <div className="cm-hidden-cells-note">
              ※ 4×4 枠外（旧データ等）の未表示セルが {hiddenOutOfBoundsCount} 件あります
            </div>
          )}

          {guidePosition === 'bottom' && renderLearningGuideCard()}
        </div>

        {/* Right Column: Selected Cell Inspector + Tabbed Chip Palette / Code */}
        <div className="cm-palette-col">
          <div className="cm-inspector-box">
            <div className="cm-inspector-head">
              <div className="cm-inspector-title-wrap">
                <span className="cm-inspector-coord">
                  選択マス ({clampedRow + 1}, {clampedCol + 1})
                </span>
                <strong className="cm-inspector-chip-name">
                  {isMain
                    ? selectedPilotMeta?.label ?? '空マス'
                    : selectedSubMeta?.label ?? '空マス'}
                </strong>
              </div>
              {selectedCell && selectedCell.op !== 'empty' && (
                <div className="cm-inspector-actions">
                  <button
                    type="button"
                    className={`cm-mini-btn ${showInlineDesc ? 'is-active' : ''}`}
                    onClick={() => setShowInlineDesc((v) => !v)}
                    title="チップの詳しい解説を表示"
                  >
                    <HelpCircle size={12} /> 解説
                  </button>
                  <button
                    type="button"
                    className="cm-mini-btn is-danger"
                    onClick={() => clearCellAt(clampedRow, clampedCol)}
                    title="このマスを消去 (右クリック / Deleteキーでも消せます)"
                  >
                    <Trash2 size={12} /> 削除
                  </button>
                </div>
              )}
            </div>

            {selectedCell && selectedCell.op !== 'empty' ? (
              <div className="cm-inspector-controls">
                {showInlineDesc && (
                  <p className="cm-inspector-desc">
                    {isMain ? selectedPilotMeta?.tip : selectedSubMeta?.tip}
                  </p>
                )}

                {/* Parameters */}
                <div className="cm-inspector-params">
                  {isMain && selectedPilotMeta?.hasParam && (
                    <label className="cm-field cm-field--sm">
                      <span>{selectedPilotMeta.paramLabel ?? '値'}</span>
                      <input
                        type="number"
                        value={(selectedCell as PilotGridCell).param ?? selectedPilotMeta.defaultParam ?? 0}
                        onChange={(e) => updatePilotCell({ param: Number(e.target.value) })}
                      />
                    </label>
                  )}
                  {isMain && selectedPilotMeta?.hasOptionalArg && (
                    <label className="cm-field cm-field--sm" title="呼出先 ROM で「ARG を使う」に設定した距離・角度などに渡されます（空欄＝ROM既定値）">
                      <span>引数 ARG（省略可）</span>
                      <input
                        type="number"
                        placeholder="既定値"
                        value={
                          (selectedCell as PilotGridCell).param !== undefined &&
                          Number.isFinite((selectedCell as PilotGridCell).param)
                            ? (selectedCell as PilotGridCell).param
                            : ''
                        }
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === '') {
                            updatePilotCell({ param: undefined });
                          } else {
                            const num = Number(raw);
                            if (Number.isFinite(num)) updatePilotCell({ param: num });
                          }
                        }}
                      />
                    </label>
                  )}
                  {!isMain && selectedSubMeta?.hasParam && (
                    <>
                      <label className="cm-field cm-field--sm">
                        <span>
                          {(selectedCell as MechSubroutineCell).useArg
                            ? `既定値 (${selectedSubMeta.paramLabel ?? '値'})`
                            : selectedSubMeta.paramLabel ?? '値'}
                        </span>
                        <input
                          type="number"
                          min={
                            selectedCell.op === 'torso_twist_angle'
                              ? -chassisSpec.torsoTwistMaxDeg
                              : selectedCell.op === 'torso_twist_r' ||
                                  selectedCell.op === 'torso_twist_l'
                                ? 0
                                : selectedSubMeta.paramMin
                          }
                          max={
                            selectedCell.op === 'torso_twist_angle' ||
                            selectedCell.op === 'torso_twist_r' ||
                            selectedCell.op === 'torso_twist_l'
                              ? chassisSpec.torsoTwistMaxDeg
                              : selectedSubMeta.paramMax
                          }
                          step={selectedSubMeta.paramStep ?? 1}
                          value={
                            (selectedCell as MechSubroutineCell).param ??
                            selectedSubMeta.defaultParam ??
                            0
                          }
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            const val =
                              selectedCell.op === 'torso_twist_angle'
                                ? Math.max(
                                    -chassisSpec.torsoTwistMaxDeg,
                                    Math.min(chassisSpec.torsoTwistMaxDeg, raw)
                                  )
                                : selectedCell.op === 'torso_twist_r' ||
                                    selectedCell.op === 'torso_twist_l'
                                  ? Math.max(0, Math.min(chassisSpec.torsoTwistMaxDeg, raw))
                                  : raw;
                            updateSubCell({ param: val });
                          }}
                        />
                      </label>
                      {tierSpec.pilotEnabled && (
                        <label
                          className="cm-check-inline"
                          title="パイロット CALL 時に引数 ARG が指定されていれば、その値で上書きします（未指定なら上の既定値）"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean((selectedCell as MechSubroutineCell).useArg)}
                            onChange={(e) =>
                              updateSubCell({ useArg: e.target.checked || undefined })
                            }
                          />
                          <span>引数 ARG を使う</span>
                        </label>
                      )}
                      {selectedCell.op === 'torso_twist_angle' && (
                        <div className="cm-quick-angle-row">
                          {[-60, -45, -30, 30, 45, 60].map((presetDeg) => {
                            const disabled = Math.abs(presetDeg) > chassisSpec.torsoTwistMaxDeg;
                            const isCur =
                              Math.round((selectedCell as MechSubroutineCell).param ?? 55) ===
                              presetDeg;
                            return (
                              <button
                                key={presetDeg}
                                type="button"
                                disabled={disabled}
                                className={`cm-mini-btn ${isCur ? 'is-active' : ''}`}
                                onClick={() => updateSubCell({ param: presetDeg })}
                              >
                                {presetDeg > 0 ? `+${presetDeg}°` : `${presetDeg}°`}
                              </button>
                            );
                          })}
                          <span className="cm-quick-angle-hint">
                            上限 ±{chassisSpec.torsoTwistMaxDeg}°
                          </span>
                        </div>
                      )}
                      {(selectedCell.op === 'torso_twist_r' ||
                        selectedCell.op === 'torso_twist_l') && (
                        <div className="cm-quick-angle-row">
                          {[30, 45, 55, 70].map((presetDeg) => {
                            const disabled = presetDeg > chassisSpec.torsoTwistMaxDeg;
                            const isCur =
                              Math.round((selectedCell as MechSubroutineCell).param ?? 55) ===
                              presetDeg;
                            return (
                              <button
                                key={presetDeg}
                                type="button"
                                disabled={disabled}
                                className={`cm-mini-btn ${isCur ? 'is-active' : ''}`}
                                onClick={() => updateSubCell({ param: presetDeg })}
                              >
                                {presetDeg}°
                              </button>
                            );
                          })}
                          <span className="cm-quick-angle-hint">
                            上限 {chassisSpec.torsoTwistMaxDeg}°
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {((isMain && selectedPilotMeta?.timed) || (!isMain && selectedSubMeta?.timed)) && (
                    <label className="cm-field cm-field--sm">
                      <span>{isMain ? '最大時間(s)' : '秒数(s)'}</span>
                      <input
                        type="number"
                        step={0.05}
                        min={0.1}
                        max={3.0}
                        value={selectedCell.durationSec ?? 0.5}
                        onChange={(e) => {
                          const v = Math.max(0.1, Math.min(3.0, Number(e.target.value) || 0.1));
                          if (isMain) updatePilotCell({ durationSec: v });
                          else updateSubCell({ durationSec: v });
                        }}
                      />
                    </label>
                  )}
                  {isMain && selectedPilotMeta?.hasTarget && (
                    <label className="cm-field">
                      <span>対象</span>
                      <select
                        value={(selectedCell as PilotGridCell).target ?? 'main'}
                        onChange={(e) =>
                          updatePilotCell({ target: e.target.value as PilotTargetMode })
                        }
                      >
                        {TARGET_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {!isMain && selectedSubMeta?.hasDirChoice && (
                    <label className="cm-field">
                      <span>{selectedCell.op === 'move_circle' ? '周回方向' : '斜行方向'}</span>
                      <select
                        value={
                          (selectedCell as MechSubroutineCell).direction === 'left'
                            ? 'left'
                            : 'right'
                        }
                        onChange={(e) =>
                          updateSubCell({
                            direction: e.target.value as 'left' | 'right',
                          })
                        }
                      >
                        <option value="right">
                          {selectedCell.op === 'move_circle' ? '右回り' : '右斜行'}
                        </option>
                        <option value="left">
                          {selectedCell.op === 'move_circle' ? '左回り' : '左斜行'}
                        </option>
                      </select>
                    </label>
                  )}
                  {((isMain && selectedPilotMeta?.hasWeaponSlot) ||
                    (!isMain && selectedSubMeta?.hasWeaponSlot)) && (
                    <label className="cm-field">
                      <span>武装枠</span>
                      <select
                        value={selectedCell.weaponSlot ?? ''}
                        onChange={(e) => {
                          const ws = e.target.value
                            ? (e.target.value as WeaponSlotId)
                            : undefined;
                          if (isMain) updatePilotCell({ weaponSlot: ws });
                          else updateSubCell({ weaponSlot: ws });
                        }}
                      >
                        {WEAPON_SLOT_OPTIONS.map((w) => (
                          <option key={w.value} value={w.value}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {isMain && selectedPilotMeta?.hasPart && (
                    <label className="cm-field">
                      <span>部位</span>
                      <select
                        value={(selectedCell as PilotGridCell).partId ?? 'rightArm'}
                        onChange={(e) =>
                          updatePilotCell({ partId: e.target.value as MechPartId })
                        }
                      >
                        {PART_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                {/* 3x3 Cross Directional Pads */}
                {(isMain || selectedCell.op !== 'return') && (
                  <div className="cm-wiring-section">
                    {(isMain ? selectedPilotMeta?.branch : selectedSubMeta?.branch) ? (
                      <div className="cm-branch-dual">
                        <div className="cm-branch-box is-yes">
                          <div className="cm-branch-head">
                            <span>YES (T)</span>
                            <span className="cm-branch-target">
                              → {formatTargetCoord(clampedRow, clampedCol, selectedCell.dir)}
                            </span>
                          </div>
                          {renderOrthoPad(selectedCell.dir, 'yes', (d) =>
                            isMain ? updatePilotCell({ dir: d }) : updateSubCell({ dir: d })
                          )}
                        </div>
                        <div className="cm-branch-box is-no">
                          <div className="cm-branch-head">
                            <span>NO (F)</span>
                            <span className="cm-branch-target">
                              →{' '}
                              {formatTargetCoord(
                                clampedRow,
                                clampedCol,
                                selectedCell.elseDir ?? selectedCell.dir
                              )}
                            </span>
                          </div>
                          {renderOrthoPad(selectedCell.elseDir ?? selectedCell.dir, 'no', (d) =>
                            isMain ? updatePilotCell({ elseDir: d }) : updateSubCell({ elseDir: d })
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="cm-branch-box is-next">
                        <div className="cm-branch-head">
                          <span>進行方向 (次へ)</span>
                          <span className="cm-branch-target">
                            → {formatTargetCoord(clampedRow, clampedCol, selectedCell.dir)}
                          </span>
                        </div>
                        {renderOrthoPad(selectedCell.dir, 'next', (d) =>
                          isMain ? updatePilotCell({ dir: d }) : updateSubCell({ dir: d })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="cm-inspector-empty">
                下のパレットからチップをクリック（またはマスへドラッグ）して配置してください。
              </div>
            )}
          </div>

          {/* Tabbed Palette & Python Code Card */}
          <div className="cm-palette-card">
            <div className="cm-sidebar-tabs">
              <button
                type="button"
                className={`cm-sidebar-tab ${sidebarTab === 'palette' ? 'is-active' : ''}`}
                onClick={() => setSidebarTab('palette')}
              >
                <Grid3X3 size={13} /> チップ一覧
              </button>
              <button
                type="button"
                className={`cm-sidebar-tab ${sidebarTab === 'code' ? 'is-active' : ''}`}
                onClick={() => setSidebarTab('code')}
              >
                <Code2 size={13} /> Pythonコード
              </button>
            </div>

            {sidebarTab === 'palette' ? (
              <>
                <div className="cm-palette-tabs">
                  {isMain
                    ? (
                        [
                          ['all', 'すべて'],
                          ['call', '呼出'],
                          ['branch', '分岐'],
                          ['ctrl_emg', '制御・非常'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className={`cm-pal-tab ${pilotFilter === id ? 'is-active' : ''}`}
                          onClick={() => setPilotFilter(id)}
                        >
                          {label}
                        </button>
                      ))
                    : (
                        [
                          ['all', 'すべて'],
                          ['leg', '脚'],
                          ['torso', '腰'],
                          ['weapon_emg', '武装・非常'],
                          ['branch', '分岐'],
                          ['ctrl', '制御'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className={`cm-pal-tab ${subFilter === id ? 'is-active' : ''}`}
                          onClick={() => setSubFilter(id)}
                        >
                          {label}
                        </button>
                      ))}
                </div>

                <div className="cm-palette-grid">
                  {isMain
                    ? filteredPilotChips.map((item) => {
                        const slotId = item.op.startsWith('call_s')
                          ? (item.op.slice(-2).toUpperCase() as MechSubroutineSlotId)
                          : null;
                        const slotSub = slotId
                          ? mech.subroutines.find((s) => s.slotId === slotId)
                          : null;
                        const subLine = slotId
                          ? slotSub
                            ? `${slotSub.name}`
                            : '未搭載 (0t)'
                          : item.label;
                        const isCurrent = selectedCell?.op === item.op;
                        return (
                          <button
                            key={item.op}
                            type="button"
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData('text/plain', `palette:${item.op}`)}
                            onMouseEnter={() => setHoveredPaletteOp(item.op)}
                            onMouseLeave={() => setHoveredPaletteOp(null)}
                            onClick={() => assignPilotChipAt(item, clampedRow, clampedCol)}
                            className={`cm-palette-chip cm-cat-${item.cat} ${
                              isCurrent ? 'is-current' : ''
                            }`}
                          >
                            <span className="cm-pal-short">{item.short}</span>
                            <span className="cm-pal-sub">{subLine}</span>
                          </button>
                        );
                      })
                    : filteredSubChips.map((item) => {
                        const groupSum = item.weaponGroupKey
                          ? getWeaponGroupSummary(mech, item.weaponGroupKey)
                          : null;
                        const wep = item.weaponSlotKey ? equippedWeapons[item.weaponSlotKey] : null;
                        const subLine = groupSum
                          ? groupSum.equippedItems.length > 0
                            ? groupSum.equippedItems
                                .map((i) => `${i.spec.name}${i.mountCount > 1 ? `×${i.mountCount}` : ''}`)
                                .join('+')
                            : '未割当'
                          : wep
                            ? wep.equipped
                              ? wep.spec.name
                              : '未装備'
                            : item.label;
                        const isDimmedPalette =
                          (groupSum && groupSum.equippedSpecs.length === 0) ||
                          (wep && !wep.equipped);
                        const isCurrent = selectedCell?.op === item.op;
                        return (
                          <button
                            key={item.op}
                            type="button"
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData('text/plain', `palette:${item.op}`)}
                            onMouseEnter={() => setHoveredPaletteOp(item.op)}
                            onMouseLeave={() => setHoveredPaletteOp(null)}
                            onClick={() => assignSubChipAt(item, clampedRow, clampedCol)}
                            className={`cm-palette-chip cm-cat-${item.cat} ${
                              isCurrent ? 'is-current' : ''
                            } ${isDimmedPalette ? 'is-unequipped' : ''}`}
                          >
                            <span className="cm-pal-short">{item.short}</span>
                            <span className="cm-pal-sub">{subLine}</span>
                          </button>
                        );
                      })}
                </div>
              </>
            ) : (
              <div className="cm-code-tab-body">
                <div className="cm-code-tab-head">
                  <span>Python 自動翻訳（読む教材）</span>
                  <button
                    type="button"
                    className="cm-mini-btn"
                    onClick={() => {
                      navigator.clipboard?.writeText(pythonPreviewText).catch(() => {});
                      setCopiedPython(true);
                      window.setTimeout(() => setCopiedPython(false), 1500);
                    }}
                  >
                    <Copy size={12} /> {copiedPython ? 'コピー済' : 'コピー'}
                  </button>
                </div>
                <pre className="cm-macro-py">{pythonPreviewText}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
