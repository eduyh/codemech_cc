import {
  ArenaPresetId,
  CurriculumStepId,
  MechBlueprint,
  PilotProfile,
} from '../types/mech';
import { DEFAULT_PILOT_PROFILE, PRESET_VANGUARD } from './presets';

export interface CurriculumMissionSpec {
  id: CurriculumStepId;
  stepNumber: 1 | 2 | 3 | 4 | 5;
  title: string;
  subtitle: string;
  csConcept: string;
  goal: string;
  hint: string;
  arenaPreset: ArenaPresetId;
  seed: number;
  maxSeconds: number;
  buildBrokenStarter: () => { mech: MechBlueprint; pilot: PilotProfile };
}

export const CURRICULUM_MISSIONS: readonly CurriculumMissionSpec[] = [
  {
    id: 'step1_pilot_routing',
    stepNumber: 1,
    title: 'Step 1: パイロット 6×6 ルーティング修正',
    subtitle: '壊れた分岐配線（Yes/No 方向と CALL S1/S3）を直して勝利せよ',
    csConcept: '条件分岐 (if/else) とサブルーチン呼び分け',
    goal: 'パイロット 6×6 で 2 つ以上の機体枠（例: S1 主交戦 / S3 索敵）を呼び分け、訓練機に勝利する',
    hint: 'バグ入り課題では「視界に敵?」の Yes 先が S3 のまま止まっています。Yes で CALL S1（主交戦）、No で CALL S3（索敵・高台）へ繋ぎましょう。',
    arenaPreset: 'plains_ridge',
    seed: 10101,
    maxSeconds: 180,
    buildBrokenStarter: () => {
      const mech = structuredClone(PRESET_VANGUARD);
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_step1_pilot',
        name: 'Step1 バグ入りパイロット',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            // Bug: calls S3 (patrol) instead of S1 even when enemy is in sight, and else has nothing!
            { row: 1, col: 1, op: 'call_s3', dir: 'S', target: 'main', durationSec: 0.65 },
          ],
        },
      };
      return { mech, pilot };
    },
  },
  {
    id: 'step2_heat_hysteresis',
    stepNumber: 2,
    title: 'Step 2: 発熱監視＆冷却ヒステリシス制御',
    subtitle: 'オーバーヒート融解を防ぐ条件分岐＋状態ループを組め',
    csConcept: '状態維持ループ（ヒステリシス制御）',
    goal: '高発熱レーザー機 (ヴァンガード改) に熱分岐（熱>% > ＋ S4冷却/緊急冷却）を組み、熱融解せず勝利する',
    hint: 'バグ入り課題では常に OVERRIDE ON のまま撃ち続けて自爆します。「熱 > 85%」→「CALL S4」→「熱 < 45%? (Noなら←でS4へ戻る)」のループを組みましょう。',
    arenaPreset: 'twin_mesas',
    seed: 20202,
    maxSeconds: 180,
    buildBrokenStarter: () => {
      const mech = structuredClone(PRESET_VANGUARD);
      mech.name = 'CM-01 ヴァンガード (高発熱仕様)';
      mech.extraHeatSinks = 0;
      mech.parts.rightArmWeapon = 'large_laser';
      mech.parts.leftArmWeapon = 'medium_laser';
      mech.parts.rightShoulderWeapon = 'large_laser';
      mech.parts.leftShoulderWeapon = 'shd_none';
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_step2_pilot',
        name: 'Step2 暴走オーバーヒートAI',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            // Bug: forces override ON and ignores heat completely -> heat_meltdown!
            { row: 1, col: 0, op: 'override_on', dir: 'S' },
            { row: 2, col: 0, op: 'if_enemy_in_sight', dir: 'E', elseDir: 'S' },
            { row: 2, col: 1, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.7 },
            { row: 3, col: 0, op: 'call_s3', dir: 'S', target: 'main', durationSec: 0.6 },
          ],
        },
      };
      return { mech, pilot };
    },
  },
  {
    id: 'step3_subroutine_4x4',
    stepNumber: 3,
    title: 'Step 3: 4×4 機体サブルーチン改造',
    subtitle: '機体側の S3〜S5 (4×4) に脚・腰・武装と分岐を実装せよ',
    csConcept: '関数 (サブルーチン) 内部の実装とラッチ制御',
    goal: '4×4 枠（S3〜S5）のいずれかに 4 マス以上の行動（分岐または移動＋腰＋攻撃）を組んで実戦発動させ勝利する',
    hint: 'バグ入り課題では S3 (4×4) が「その場停止＋待機」になっているため動けません。S3 に「高台移動 → 腰:敵追尾 → G2可? → 撃:G2」などを組みましょう。',
    arenaPreset: 'plains_ridge',
    seed: 30303,
    maxSeconds: 180,
    buildBrokenStarter: () => {
      const mech = structuredClone(PRESET_VANGUARD);
      mech.subroutines = mech.subroutines.map((s) =>
        s.gridSize === 4
          ? s.slotId === 'S3'
            ? {
                slotId: 'S3',
                name: '壊れた索敵 (4×4)',
                gridSize: 4,
                cells: [
                  { row: 0, col: 0, op: 'start', dir: 'E' },
                  { row: 0, col: 1, op: 'move_stop', dir: 'E' },
                  { row: 0, col: 2, op: 'wait', dir: 'S', durationSec: 0.6 },
                ],
              }
            : {
                slotId: s.slotId,
                name: s.name,
                gridSize: 4,
                cells: [{ row: 0, col: 0, op: 'start', dir: 'E' }],
              }
          : s
      );
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_step3_pilot',
        name: 'Step3 S3テストパイロット',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s3', dir: 'S', target: 'main', durationSec: 0.65 },
          ],
        },
      };
      return { mech, pilot };
    },
  },
  {
    id: 'step4_assemble_and_6x6',
    stepNumber: 4,
    title: 'Step 4: アセンブル × 6×6 主交戦設計',
    subtitle: '前後装甲配分と 6×6 主戦術 (S1: 分岐＋ツイスト防御) を両立せよ',
    csConcept: 'データ設計 (機体パラメータ) × 制御アルゴリズムの統合',
    goal: '中央胴(前)装甲 > 中央胴(後)装甲、かつ S1 (6×6) に分岐を含む 6 マス以上の戦術を組んで市街地ピラー戦に勝利する',
    hint: 'バグ入り課題では前面装甲が極薄 (40) で、S1 も「停止して左腕のみ」です。「機体ガレージ」で前装甲を厚くし、S1 (6×6) で間合い維持＋左右武装＋ツイスト防御を組みましょう。',
    arenaPreset: 'urban_pillars',
    seed: 40404,
    maxSeconds: 200,
    buildBrokenStarter: () => {
      const mech = structuredClone(PRESET_VANGUARD);
      mech.armor.torsoFront = 35;
      mech.armor.torsoRear = 175;
      mech.subroutines = mech.subroutines.map((s) =>
        s.slotId === 'S1'
          ? {
              slotId: 'S1',
              name: '壊れた主交戦 (6×6)',
              gridSize: 6,
              cells: [
                { row: 0, col: 0, op: 'start', dir: 'E' },
                { row: 0, col: 1, op: 'move_stop', dir: 'E' },
                { row: 0, col: 2, op: 'wait', dir: 'S', durationSec: 0.5 },
              ],
            }
          : s
      );
      const pilot = structuredClone(DEFAULT_PILOT_PROFILE);
      return { mech, pilot };
    },
  },
  {
    id: 'step5_transfer_squad',
    stepNumber: 5,
    title: 'Step 5: 小隊 2v2 連携＆機体乗り換え適性',
    subtitle: 'パイロット 6×6 を抽象化し、別機体でも戦える上位判断を完成させよう',
    csConcept: 'インターフェースと実装の分離 (機体乗り換え適性)',
    goal: 'パイロット 6×6 で 3 枠以上の CALL (S1〜S5) を使い分け、小隊 2v2 に勝利＆別機体 (ホークアイ) への乗換検証を突破する',
    hint: 'バグ入り課題では CALL S1 しか使わないため過熱や背後奇襲に対応できません。S1/S3/S4/S5 などを状況に応じて呼び分け、味方フォートレスと連携して勝利しましょう。',
    arenaPreset: 'valley_basin',
    seed: 50505,
    maxSeconds: 220,
    buildBrokenStarter: () => {
      const mech = structuredClone(PRESET_VANGUARD);
      const pilot: PilotProfile = {
        version: 2,
        id: 'bug_step5_pilot',
        name: 'Step5 単調パイロット',
        grid: {
          gridSize: 6,
          cells: [
            { row: 0, col: 0, op: 'start', dir: 'S' },
            { row: 1, col: 0, op: 'call_s1', dir: 'S', target: 'main', durationSec: 0.7 },
          ],
        },
      };
      return { mech, pilot };
    },
  },
];
