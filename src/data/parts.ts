import {
  BoosterPartSpec,
  HeadPartSpec,
  LegPartSpec,
  MAX_CHASSIS_TONNAGE,
  MechBlueprint,
  MechChassisSpec,
  MechComputedStats,
  MechPartsSelection,
  MechWeaponGroups,
  ShoulderPartSpec,
  TorsoPartSpec,
  WEAPON_GROUP_IDS,
  WeaponGroupId,
  WeaponPartSpec,
  WeaponSlotId,
} from '../types/mech';
import { clamp } from '../engine/math';

export const MAX_EXTRA_AMMO_TONS = 5;

export const HEAD_PARTS: readonly HeadPartSpec[] = [
  {
    id: 'head_std',
    name: 'H-01 バランスヘッド',
    weight: 45,
    cost: 120,
    enDrain: 14,
    structureHp: 110,
    maxArmor: 90,
    radarRange: 380,
    lockSpeedMult: 1.0,
    description: '標準的な索敵・ロック性能を備えたバランス型頭部。',
  },
  {
    id: 'head_recon',
    name: 'H-02 リーコンアイ',
    weight: 38,
    cost: 165,
    enDrain: 22,
    structureHp: 85,
    maxArmor: 65,
    radarRange: 520,
    lockSpeedMult: 1.25,
    description: '長距離レーダー特化型。遠距離狙撃や索敵支援向け。',
  },
  {
    id: 'head_armored',
    name: 'H-03 ガードヘルム',
    weight: 62,
    cost: 150,
    enDrain: 12,
    structureHp: 150,
    maxArmor: 130,
    radarRange: 330,
    lockSpeedMult: 0.9,
    description: 'コックピット保護を重視した重装甲頭部。',
  },
];

export const TORSO_PARTS: readonly TorsoPartSpec[] = [
  {
    id: 'torso_std',
    name: 'C-01 スタンダードコア',
    weight: 220,
    cost: 280,
    enCapacity: 1000,
    enRegenPerSec: 175,
    structureHp: 560,
    maxFrontArmor: 340,
    maxRearArmor: 200,
    description: '扱いやすい標準コア。前後の装甲配分バランスに優れる。',
  },
  {
    id: 'torso_light',
    name: 'C-02 エアロフレーム',
    weight: 165,
    cost: 260,
    enCapacity: 920,
    enRegenPerSec: 195,
    structureHp: 420,
    maxFrontArmor: 240,
    maxRearArmor: 140,
    description: '軽量・高出力ジェネレータ搭載。高機動戦向け。',
  },
  {
    id: 'torso_heavy',
    name: 'C-03 バスティオンコア',
    weight: 300,
    cost: 340,
    enCapacity: 1200,
    enRegenPerSec: 170,
    structureHp: 740,
    maxFrontArmor: 480,
    maxRearArmor: 280,
    description: '高耐久・大口径前面装甲を支える重量級コア。',
  },
];

export const SHOULDER_MOUNTS: readonly ShoulderPartSpec[] = [
  {
    id: 'shd_std',
    name: 'S-01 標準サイドトルソー',
    weight: 55,
    cost: 80,
    enDrain: 6,
    structureHp: 210,
    maxFrontArmor: 180,
    maxRearArmor: 110,
    description: '標準的な前後装甲フレームを持つ右胴／左胴モジュール。',
  },
  {
    id: 'shd_light',
    name: 'S-02 スリムサイドトルソー',
    weight: 35,
    cost: 70,
    enDrain: 4,
    structureHp: 150,
    maxFrontArmor: 120,
    maxRearArmor: 80,
    description: '軽量化を優先した細身の右胴／左胴モジュール。',
  },
  {
    id: 'shd_heavy',
    name: 'S-03 シールドサイドトルソー',
    weight: 85,
    cost: 115,
    enDrain: 8,
    structureHp: 290,
    maxFrontArmor: 260,
    maxRearArmor: 150,
    description: '前面からの被弾を受け止める重装甲の右胴／左胴モジュール。',
  },
];

export const ARM_WEAPONS: readonly WeaponPartSpec[] = [
  {
    id: 'ac5',
    name: 'AC/5 オートキャノン',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 5.5,
    cost: 150,
    damage: 46,
    projectileSpeed: 280,
    projectileGravity: 3.2,
    range: 380,
    maxRange: 680,
    cooldownSec: 2.6,
    enCost: 0,
    heatCost: 6,
    maxAmmo: 45,
    ammoPerTon: 30,
    spreadDeg: 0.55,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 68,
    homingTurnDegPerSec: 0,
    partStructureHp: 200,
    maxPartArmor: 140,
    description: '低発熱・長射程の中口径実弾砲（5.5t / 45発 / 熱6）。傾斜装甲で跳弾あり。',
  },
  {
    id: 'ac10',
    name: 'AC/10 重オートキャノン',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 9.0,
    cost: 215,
    damage: 88,
    projectileSpeed: 255,
    projectileGravity: 3.8,
    range: 340,
    maxRange: 600,
    cooldownSec: 3.8,
    enCost: 0,
    heatCost: 12,
    maxAmmo: 24,
    ammoPerTon: 20,
    spreadDeg: 0.7,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 70,
    homingTurnDegPerSec: 0,
    partStructureHp: 215,
    maxPartArmor: 155,
    description: '重装甲を一撃で削る大口径オートキャノン（9.0t / 24発 / 熱12）。',
  },
  {
    id: 'mg_light',
    name: 'MG/2 連装機関砲',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 2.5,
    cost: 110,
    damage: 10,
    projectileSpeed: 245,
    projectileGravity: 3.5,
    range: 240,
    maxRange: 420,
    cooldownSec: 1.4,
    enCost: 0,
    heatCost: 2,
    maxAmmo: 120,
    ammoPerTon: 100,
    spreadDeg: 1.3,
    burstCount: 2,
    canRicochet: true,
    ricochetAngleDeg: 64,
    homingTurnDegPerSec: 0,
    partStructureHp: 185,
    maxPartArmor: 130,
    description: '軽量・ほぼ無発熱の近距離実弾連射砲（2.5t / 120発 / 熱2）。',
  },
  {
    id: 'gauss_rifle',
    name: 'ガウスライフル',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 12.0,
    cost: 270,
    damage: 125,
    projectileSpeed: 440,
    projectileGravity: 1.4,
    range: 540,
    maxRange: 900,
    cooldownSec: 5.2,
    enCost: 0,
    heatCost: 4,
    maxAmmo: 16,
    ammoPerTon: 12,
    spreadDeg: 0.2,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 76,
    homingTurnDegPerSec: 0,
    partStructureHp: 180,
    maxPartArmor: 120,
    description: '超高速・超低発熱の精密電磁狙撃砲（12.0t / 16発 / 熱4）。',
  },
  {
    id: 'lbx_shotgun',
    name: 'LB-X 散弾砲',
    slotGroup: 'arm',
    kind: 'shotgun',
    weight: 6.5,
    cost: 175,
    damage: 16,
    projectileSpeed: 230,
    projectileGravity: 3.0,
    range: 240,
    maxRange: 360,
    cooldownSec: 3.4,
    enCost: 0,
    heatCost: 8,
    maxAmmo: 30,
    ammoPerTon: 24,
    spreadDeg: 3.6,
    burstCount: 4,
    canRicochet: true,
    ricochetAngleDeg: 62,
    homingTurnDegPerSec: 0,
    partStructureHp: 205,
    maxPartArmor: 145,
    description: '4発同時発射の近距離散弾砲（6.5t / 30発 / 熱8）。複数部位を同時削り可能。',
  },
  {
    id: 'small_laser',
    name: 'S-Laser 小口径レーザー',
    slotGroup: 'arm',
    kind: 'laser',
    weight: 1.0,
    cost: 95,
    damage: 22,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 160,
    maxRange: 240,
    burnDurationSec: 0.45,
    cooldownSec: 2.4,
    enCost: 0,
    heatCost: 10,
    maxAmmo: -1,
    spreadDeg: 0.4,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 180,
    maxPartArmor: 125,
    description: '弾薬不要の超軽量レーザー（1.0t / 残弾∞ / 熱10）。弾切れ時の保険に最適。',
  },
  {
    id: 'medium_laser',
    name: 'M-Laser 中口径レーザー',
    slotGroup: 'arm',
    kind: 'laser',
    weight: 2.0,
    cost: 145,
    damage: 40,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 280,
    maxRange: 420,
    burnDurationSec: 0.7,
    cooldownSec: 3.2,
    enCost: 0,
    heatCost: 18,
    maxAmmo: -1,
    spreadDeg: 0.35,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 195,
    maxPartArmor: 135,
    description: 'BattleTech の基本主力レーザー（2.0t / 残弾∞ / 熱18）。即着光線・跳弾なし。',
  },
  {
    id: 'large_laser',
    name: 'L-Laser 大口径レーザー',
    slotGroup: 'arm',
    kind: 'laser',
    weight: 5.0,
    cost: 210,
    damage: 72,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 420,
    maxRange: 600,
    burnDurationSec: 0.95,
    cooldownSec: 4.4,
    enCost: 0,
    heatCost: 32,
    maxAmmo: -1,
    spreadDeg: 0.25,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 205,
    maxPartArmor: 140,
    description: '長射程・高威力・高発熱の重レーザー（5.0t / 残弾∞ / 熱32）。',
  },
  {
    id: 'ppc',
    name: 'PPC 荷電粒子砲',
    slotGroup: 'arm',
    kind: 'energy',
    weight: 7.0,
    cost: 245,
    damage: 92,
    projectileSpeed: 300,
    projectileGravity: 0,
    range: 480,
    cooldownSec: 5.2,
    enCost: 0,
    heatCost: 42,
    maxAmmo: -1,
    spreadDeg: 0.35,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 200,
    maxPartArmor: 135,
    description: '強烈な発熱と引き換えに遠距離へ大打撃を与える光学粒子砲（7.0t / 残弾∞ / 熱42）。',
  },
  {
    id: 'srm_rocket',
    name: 'SRM-6 ロケットランチャー (無誘導)',
    slotGroup: 'arm',
    kind: 'srm_rocket',
    weight: 3.5,
    cost: 155,
    damage: 18,
    projectileSpeed: 185,
    projectileGravity: 1.8,
    range: 240,
    cooldownSec: 4.0,
    enCost: 0,
    heatCost: 16,
    maxAmmo: 20,
    ammoPerTon: 18,
    spreadDeg: 3.4,
    burstCount: 4,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 195,
    maxPartArmor: 135,
    description: '直進4発斉射の短距離ロケット弾（3.5t / 20発 / 熱16）。無誘導だが軽量高火力。',
  },
  {
    id: 'streak_srm',
    name: 'Streak SRM-4 (追尾短距離)',
    slotGroup: 'arm',
    kind: 'srm_homing',
    weight: 4.5,
    cost: 185,
    damage: 22,
    projectileSpeed: 175,
    projectileGravity: 1.2,
    range: 270,
    cooldownSec: 4.4,
    enCost: 0,
    heatCost: 18,
    maxAmmo: 18,
    ammoPerTon: 16,
    spreadDeg: 2.4,
    burstCount: 3,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 52,
    partStructureHp: 195,
    maxPartArmor: 135,
    description: 'ロック対象を追尾する短距離誘導ミサイル（4.5t / 18発 / 熱18）。',
  },
  {
    id: 'laser_blade',
    name: 'エネルギーブレード (近接)',
    slotGroup: 'arm',
    kind: 'melee',
    weight: 3.0,
    cost: 150,
    damage: 115,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 26,
    cooldownSec: 2.4,
    enCost: 0,
    heatCost: 4,
    maxAmmo: -1,
    spreadDeg: 0,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 220,
    maxPartArmor: 155,
    description: '超近距離高威力のエネルギーブレード（3.0t / 熱4 / 残弾∞）。',
  },
  {
    id: 'arm_none',
    name: '装備なし',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 0,
    cost: 0,
    damage: 0,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 0,
    cooldownSec: 1,
    enCost: 0,
    heatCost: 0,
    maxAmmo: 0,
    spreadDeg: 0,
    burstCount: 0,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '腕部兵装を非搭載にし、装甲・ヒートシンクへ重量を回す（0t）。',
  },
];

export const SHOULDER_WEAPONS: readonly WeaponPartSpec[] = [
  {
    id: 'shd_none',
    name: '装備なし',
    slotGroup: 'shoulder',
    kind: 'ballistic',
    weight: 0,
    cost: 0,
    damage: 0,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 0,
    cooldownSec: 1,
    enCost: 0,
    heatCost: 0,
    maxAmmo: 0,
    spreadDeg: 0,
    burstCount: 0,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴兵装を非搭載にし、軽量化と冷却余裕を確保（0t）。',
  },
  {
    id: 'lrm5',
    name: 'LRM-5 遠距離ミサイル (追尾)',
    slotGroup: 'shoulder',
    kind: 'lrm_homing',
    weight: 4.0,
    cost: 180,
    damage: 16,
    projectileSpeed: 145,
    projectileGravity: 1.0,
    range: 520,
    minRange: 90,
    cooldownSec: 4.8,
    enCost: 0,
    heatCost: 14,
    maxAmmo: 24,
    ammoPerTon: 24,
    spreadDeg: 3.5,
    burstCount: 3,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 42,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '長射程誘導ミサイル3発斉射（4.0t / 24発 / 熱14 / 最低射程90m）。遮蔽越しレーダー曲射可。',
  },
  {
    id: 'lrm10',
    name: 'LRM-10 重遠距離ミサイル (追尾)',
    slotGroup: 'shoulder',
    kind: 'lrm_homing',
    weight: 7.0,
    cost: 240,
    damage: 16,
    projectileSpeed: 145,
    projectileGravity: 1.0,
    range: 540,
    minRange: 90,
    cooldownSec: 5.6,
    enCost: 0,
    heatCost: 24,
    maxAmmo: 18,
    ammoPerTon: 18,
    spreadDeg: 4.0,
    burstCount: 5,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 42,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '遠距離火力投射用の5発同時誘導弾（7.0t / 18発 / 熱24 / 最低射程90m）。遮蔽越しレーダー曲射可。',
  },
  {
    id: 'srm_rocket',
    name: 'SRM-6 ロケットランチャー (無誘導)',
    slotGroup: 'shoulder',
    kind: 'srm_rocket',
    weight: 3.5,
    cost: 155,
    damage: 18,
    projectileSpeed: 185,
    projectileGravity: 1.8,
    range: 240,
    cooldownSec: 4.0,
    enCost: 0,
    heatCost: 16,
    maxAmmo: 20,
    ammoPerTon: 18,
    spreadDeg: 3.4,
    burstCount: 4,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の無誘導ロケット弾ポッド（3.5t / 20発 / 熱16）。',
  },
  {
    id: 'streak_srm',
    name: 'Streak SRM-4 (追尾短距離)',
    slotGroup: 'shoulder',
    kind: 'srm_homing',
    weight: 4.5,
    cost: 185,
    damage: 22,
    projectileSpeed: 175,
    projectileGravity: 1.2,
    range: 270,
    cooldownSec: 4.4,
    enCost: 0,
    heatCost: 18,
    maxAmmo: 18,
    ammoPerTon: 16,
    spreadDeg: 2.4,
    burstCount: 3,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 52,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の近〜中距離追尾ミサイル（4.5t / 18発 / 熱18）。',
  },
  {
    id: 'lbx_shotgun',
    name: 'LB-X 散弾砲',
    slotGroup: 'shoulder',
    kind: 'shotgun',
    weight: 6.5,
    cost: 175,
    damage: 16,
    projectileSpeed: 230,
    projectileGravity: 3.0,
    range: 240,
    maxRange: 360,
    cooldownSec: 3.4,
    enCost: 0,
    heatCost: 8,
    maxAmmo: 30,
    ammoPerTon: 24,
    spreadDeg: 3.6,
    burstCount: 4,
    canRicochet: true,
    ricochetAngleDeg: 62,
    homingTurnDegPerSec: 0,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の近距離4発散弾ポッド（6.5t / 30発 / 熱8）。',
  },
  {
    id: 'ac5',
    name: 'AC/5 オートキャノン',
    slotGroup: 'shoulder',
    kind: 'ballistic',
    weight: 5.5,
    cost: 150,
    damage: 46,
    projectileSpeed: 280,
    projectileGravity: 3.2,
    range: 380,
    maxRange: 680,
    cooldownSec: 2.6,
    enCost: 0,
    heatCost: 6,
    maxAmmo: 45,
    ammoPerTon: 30,
    spreadDeg: 0.55,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 68,
    homingTurnDegPerSec: 0,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の中口径オートキャノン（5.5t / 45発 / 熱6）。',
  },
  {
    id: 'medium_laser',
    name: 'M-Laser 中口径レーザー',
    slotGroup: 'shoulder',
    kind: 'laser',
    weight: 2.0,
    cost: 145,
    damage: 40,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 280,
    maxRange: 420,
    burnDurationSec: 0.7,
    cooldownSec: 3.2,
    enCost: 0,
    heatCost: 18,
    maxAmmo: -1,
    spreadDeg: 0.35,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の中口径レーザー（2.0t / 残弾∞ / 熱18）。',
  },
  {
    id: 'large_laser',
    name: 'L-Laser 大口径レーザー',
    slotGroup: 'shoulder',
    kind: 'laser',
    weight: 5.0,
    cost: 210,
    damage: 72,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 420,
    maxRange: 600,
    burnDurationSec: 0.95,
    cooldownSec: 4.4,
    enCost: 0,
    heatCost: 32,
    maxAmmo: -1,
    spreadDeg: 0.25,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の大口径レーザー（5.0t / 残弾∞ / 熱32）。',
  },
  {
    id: 'ppc',
    name: 'PPC 荷電粒子砲',
    slotGroup: 'shoulder',
    kind: 'energy',
    weight: 7.0,
    cost: 245,
    damage: 92,
    projectileSpeed: 300,
    projectileGravity: 0,
    range: 480,
    cooldownSec: 5.2,
    enCost: 0,
    heatCost: 42,
    maxAmmo: -1,
    spreadDeg: 0.35,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の粒子砲（7.0t / 残弾∞ / 熱42）。',
  },
  {
    id: 'gauss_rifle',
    name: 'ガウスライフル',
    slotGroup: 'shoulder',
    kind: 'ballistic',
    weight: 12.0,
    cost: 270,
    damage: 125,
    projectileSpeed: 440,
    projectileGravity: 1.4,
    range: 540,
    maxRange: 900,
    cooldownSec: 5.2,
    enCost: 0,
    heatCost: 4,
    maxAmmo: 16,
    ammoPerTon: 12,
    spreadDeg: 0.2,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 76,
    homingTurnDegPerSec: 0,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の超長距離ガウスキャノン（12.0t / 16発 / 熱4）。',
  },
];

export const LEG_PARTS: readonly LegPartSpec[] = [
  {
    id: 'legs_biped_std',
    name: 'L-01 標準二脚',
    style: 'biped',
    weight: 210,
    cost: 200,
    loadCapacity: 1120,
    enDrain: 24,
    structureHpEach: 240,
    maxArmorEach: 180,
    walkSpeed: 34,
    strafeSpeed: 28,
    jumpImpulse: 30,
    turnDegPerSec: 160,
    description: 'クセのない標準二脚。歩行・跳躍・積載の均衡が良い。',
  },
  {
    id: 'legs_reverse_agile',
    name: 'L-02 軽量逆関節',
    style: 'reverse_joint',
    weight: 175,
    cost: 235,
    loadCapacity: 940,
    enDrain: 22,
    structureHpEach: 195,
    maxArmorEach: 140,
    walkSpeed: 39,
    strafeSpeed: 34,
    jumpImpulse: 40,
    turnDegPerSec: 195,
    description: '高い跳躍力と旋回性能を誇る高機動脚部。',
  },
  {
    id: 'legs_heavy_quad',
    name: 'L-03 重装四脚',
    style: 'quad',
    weight: 305,
    cost: 265,
    loadCapacity: 1600,
    enDrain: 34,
    structureHpEach: 330,
    maxArmorEach: 260,
    walkSpeed: 27,
    strafeSpeed: 24,
    jumpImpulse: 22,
    turnDegPerSec: 125,
    description: '高い積載量と脚部耐久を持つ重戦車級脚部。',
  },
  {
    id: 'legs_hover',
    name: 'L-04 ホバーレッグ',
    style: 'hover',
    weight: 195,
    cost: 250,
    loadCapacity: 1020,
    enDrain: 38,
    structureHpEach: 205,
    maxArmorEach: 155,
    walkSpeed: 42,
    strafeSpeed: 38,
    jumpImpulse: 27,
    turnDegPerSec: 175,
    description: '水平移動と平行移動に優れる滑走脚部。EN 消費がやや高い。',
  },
];

export const BOOSTER_PARTS: readonly BoosterPartSpec[] = [
  {
    id: 'boost_none',
    name: '未装着',
    weight: 0,
    cost: 0,
    boostSpeed: 0,
    boostEnPerSec: 0,
    airLiftAccel: 0,
    airEnPerSec: 0,
    description: '中央胴追加ブースター／ジャンプジェット未搭載。',
  },
  {
    id: 'boost_std',
    name: 'JJ-01 標準ジャンプ＆スラスター',
    weight: 4.0,
    cost: 120,
    boostSpeed: 22,
    boostEnPerSec: 22,
    airLiftAccel: 20,
    airEnPerSec: 22,
    description: '中量級フレーム向けの中央胴追加ブースター（4.0t / 熱22/s）。',
  },
  {
    id: 'boost_high_thrust',
    name: 'JJ-02 高出力ジャンプジェット',
    weight: 3.5,
    cost: 175,
    boostSpeed: 26,
    boostEnPerSec: 26,
    airLiftAccel: 22,
    airEnPerSec: 26,
    description: '軽量・高機動フレーム用の瞬間推力ブースター（3.5t / 熱26/s）。',
  },
  {
    id: 'boost_heavy',
    name: 'JJ-03 重機体用補助ジェット',
    weight: 5.5,
    cost: 165,
    boostSpeed: 18,
    boostEnPerSec: 25,
    airLiftAccel: 20,
    airEnPerSec: 25,
    description: '85t級アサルトメック専用の中央胴追加ジェット（5.5t / 熱25/s）。',
  },
  {
    id: 'boost_eco',
    name: 'JJ-04 省燃費スラスター',
    weight: 3.5,
    cost: 140,
    boostSpeed: 20,
    boostEnPerSec: 18,
    airLiftAccel: 18,
    airEnPerSec: 18,
    description: '低発熱で継戦能力に優れる汎用スラスター（3.5t / 熱18/s）。',
  },
];

export const MECH_CHASSIS_CATALOG: readonly MechChassisSpec[] = [
  {
    id: 'chassis_vanguard',
    name: 'CM-01 ヴァンガード級 (55t 中量級)',
    weightClass: 'medium',
    maxTonnage: 55,
    skeletonWeight: 25.0,
    cost: 520,
    headPartId: 'head_std',
    torsoPartId: 'torso_std',
    rightShoulderMountId: 'shd_std',
    leftShoulderMountId: 'shd_std',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 13.5,
    maxHeat: 100,
    baseHeatDissipation: 13.5,
    radarRange: 390,
    walkSpeed: 12.5,
    strafeSpeed: 0,
    turnDegPerSec: 64,
    torsoTwistMaxDeg: 85,
    torsoTwistRateDegPerSec: 98,
    visionFovHalfDeg: 75,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 4.0,
    boosterSpecId: 'boost_std',
    jumpImpulse: 16.5,
    structureHp: {
      head: 95,
      torso: 540,
      rightShoulder: 220,
      leftShoulder: 220,
      rightArm: 190,
      leftArm: 190,
      rightLeg: 250,
      leftLeg: 250,
    },
    maxArmor: {
      head: 90,
      torsoFront: 340,
      torsoRear: 180,
      rightShoulderFront: 180,
      rightShoulderRear: 100,
      leftShoulderFront: 180,
      leftShoulderRear: 100,
      rightArm: 150,
      leftArm: 150,
      rightLeg: 190,
      leftLeg: 190,
    },
    description: '胴体追加ジェット搭載可能な標準55t中量二脚。武装と装甲のバランスに優れる。',
  },
  {
    id: 'chassis_striker',
    name: 'CM-02 ストライカー級 (35t 軽量級)',
    weightClass: 'light',
    maxTonnage: 35,
    skeletonWeight: 15.5,
    cost: 440,
    headPartId: 'head_std',
    torsoPartId: 'torso_light',
    rightShoulderMountId: 'shd_light',
    leftShoulderMountId: 'shd_light',
    legPartId: 'legs_reverse_agile',
    enCapacity: 100,
    netEnRegenPerSec: 12.5,
    maxHeat: 100,
    baseHeatDissipation: 12.5,
    radarRange: 400,
    walkSpeed: 15.5,
    strafeSpeed: 0,
    turnDegPerSec: 78,
    torsoTwistMaxDeg: 90,
    torsoTwistRateDegPerSec: 120,
    visionFovHalfDeg: 75,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 3.0,
    boosterSpecId: 'boost_high_thrust',
    jumpImpulse: 19.5,
    structureHp: {
      head: 70,
      torso: 380,
      rightShoulder: 145,
      leftShoulder: 145,
      rightArm: 130,
      leftArm: 130,
      rightLeg: 175,
      leftLeg: 175,
    },
    maxArmor: {
      head: 65,
      torsoFront: 220,
      torsoRear: 110,
      rightShoulderFront: 115,
      rightShoulderRear: 65,
      leftShoulderFront: 115,
      leftShoulderRear: 65,
      rightArm: 100,
      leftArm: 100,
      rightLeg: 120,
      leftLeg: 120,
    },
    description: '軽快な35t軽量逆関節フレーム。胴体ジャンプジェットを装備可能。',
  },
  {
    id: 'chassis_fortress',
    name: 'CM-03 フォートレス級 (100t 超重量級)',
    weightClass: 'assault',
    maxTonnage: 100,
    skeletonWeight: 46.0,
    cost: 860,
    headPartId: 'head_armored',
    torsoPartId: 'torso_heavy',
    rightShoulderMountId: 'shd_heavy',
    leftShoulderMountId: 'shd_heavy',
    legPartId: 'legs_heavy_quad',
    enCapacity: 100,
    netEnRegenPerSec: 17.0,
    maxHeat: 100,
    baseHeatDissipation: 17.0,
    radarRange: 360,
    walkSpeed: 7.5,
    strafeSpeed: 0,
    turnDegPerSec: 38,
    torsoTwistMaxDeg: 60,
    torsoTwistRateDegPerSec: 62,
    visionFovHalfDeg: 65,
    hasJumpBoosterMount: false,
    boosterModuleWeight: 0,
    boosterSpecId: null,
    jumpImpulse: 0,
    structureHp: {
      head: 150,
      torso: 920,
      rightShoulder: 380,
      leftShoulder: 380,
      rightArm: 310,
      leftArm: 360,
      rightLeg: 440,
      leftLeg: 440,
    },
    maxArmor: {
      head: 140,
      torsoFront: 560,
      torsoRear: 260,
      rightShoulderFront: 300,
      rightShoulderRear: 150,
      leftShoulderFront: 300,
      leftShoulderRear: 150,
      rightArm: 240,
      leftArm: 360,
      rightLeg: 400,
      leftLeg: 400,
    },
    description: '最大上限100tの超重量級四脚要塞。ブースト・跳躍は非搭載（後付け不可）だが重装甲・重武装が可能。',
  },
  {
    id: 'chassis_hawkeye',
    name: 'CM-04 ホークアイ級 (65t 重量級)',
    weightClass: 'heavy',
    maxTonnage: 65,
    skeletonWeight: 31.0,
    cost: 620,
    headPartId: 'head_recon',
    torsoPartId: 'torso_light',
    rightShoulderMountId: 'shd_std',
    leftShoulderMountId: 'shd_light',
    legPartId: 'legs_hover',
    enCapacity: 100,
    netEnRegenPerSec: 14.0,
    maxHeat: 100,
    baseHeatDissipation: 14.0,
    radarRange: 520,
    walkSpeed: 11.0,
    strafeSpeed: 0,
    turnDegPerSec: 56,
    torsoTwistMaxDeg: 80,
    torsoTwistRateDegPerSec: 88,
    visionFovHalfDeg: 85,
    hasJumpBoosterMount: false,
    boosterModuleWeight: 0,
    boosterSpecId: null,
    jumpImpulse: 0,
    structureHp: {
      head: 90,
      torso: 600,
      rightShoulder: 240,
      leftShoulder: 210,
      rightArm: 210,
      leftArm: 210,
      rightLeg: 280,
      leftLeg: 280,
    },
    maxArmor: {
      head: 95,
      torsoFront: 380,
      torsoRear: 180,
      rightShoulderFront: 200,
      rightShoulderRear: 110,
      leftShoulderFront: 180,
      leftShoulderRear: 100,
      rightArm: 160,
      leftArm: 160,
      rightLeg: 220,
      leftLeg: 220,
    },
    description: '長距離索敵頭部を統合した65t重火器支援機。ブースト・跳躍機構は非搭載。',
  },
  {
    id: 'chassis_tempest',
    name: 'CM-05 テンペスト級 (50t 中量級)',
    weightClass: 'medium',
    maxTonnage: 50,
    skeletonWeight: 22.0,
    cost: 510,
    headPartId: 'head_std',
    torsoPartId: 'torso_light',
    rightShoulderMountId: 'shd_light',
    leftShoulderMountId: 'shd_light',
    legPartId: 'legs_hover',
    enCapacity: 100,
    netEnRegenPerSec: 13.0,
    maxHeat: 100,
    baseHeatDissipation: 13.0,
    radarRange: 390,
    walkSpeed: 13.5,
    strafeSpeed: 0,
    turnDegPerSec: 68,
    torsoTwistMaxDeg: 90,
    torsoTwistRateDegPerSec: 105,
    visionFovHalfDeg: 75,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 3.5,
    boosterSpecId: 'boost_std',
    jumpImpulse: 16.5,
    structureHp: {
      head: 85,
      torso: 490,
      rightShoulder: 195,
      leftShoulder: 195,
      rightArm: 175,
      leftArm: 175,
      rightLeg: 225,
      leftLeg: 225,
    },
    maxArmor: {
      head: 85,
      torsoFront: 300,
      torsoRear: 150,
      rightShoulderFront: 160,
      rightShoulderRear: 85,
      leftShoulderFront: 160,
      leftShoulderRear: 85,
      rightArm: 135,
      leftArm: 135,
      rightLeg: 170,
      leftLeg: 170,
    },
    description: '横移動に優れた50tホバー機体。胴体追加ブースターのON/OFFが可能。',
  },
  {
    id: 'chassis_aegis',
    name: 'CM-06 イージス級 (75t 重量級)',
    weightClass: 'heavy',
    maxTonnage: 75,
    skeletonWeight: 36.0,
    cost: 680,
    headPartId: 'head_armored',
    torsoPartId: 'torso_std',
    rightShoulderMountId: 'shd_std',
    leftShoulderMountId: 'shd_std',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 15.0,
    maxHeat: 100,
    baseHeatDissipation: 15.0,
    radarRange: 370,
    walkSpeed: 9.5,
    strafeSpeed: 0,
    turnDegPerSec: 50,
    torsoTwistMaxDeg: 75,
    torsoTwistRateDegPerSec: 80,
    visionFovHalfDeg: 68,
    hasJumpBoosterMount: false,
    boosterModuleWeight: 0,
    boosterSpecId: null,
    jumpImpulse: 0,
    structureHp: {
      head: 120,
      torso: 720,
      rightShoulder: 280,
      leftShoulder: 280,
      rightArm: 240,
      leftArm: 300,
      rightLeg: 330,
      leftLeg: 330,
    },
    maxArmor: {
      head: 115,
      torsoFront: 440,
      torsoRear: 200,
      rightShoulderFront: 230,
      rightShoulderRear: 115,
      leftShoulderFront: 230,
      leftShoulderRear: 115,
      rightArm: 190,
      leftArm: 280,
      rightLeg: 270,
      leftLeg: 270,
    },
    description: '正面重装甲とトルソー防御に特化した75t重量二脚。ブースト機構なしの堅牢設計。',
  },
  {
    id: 'chassis_valkyrie',
    name: 'CM-07 バルキリー級 (60t 重量級)',
    weightClass: 'heavy',
    maxTonnage: 60,
    skeletonWeight: 25.5,
    cost: 590,
    headPartId: 'head_recon',
    torsoPartId: 'torso_light',
    rightShoulderMountId: 'shd_light',
    leftShoulderMountId: 'shd_light',
    legPartId: 'legs_reverse_agile',
    enCapacity: 100,
    netEnRegenPerSec: 13.5,
    maxHeat: 100,
    baseHeatDissipation: 13.5,
    radarRange: 480,
    walkSpeed: 12.0,
    strafeSpeed: 0,
    turnDegPerSec: 64,
    torsoTwistMaxDeg: 85,
    torsoTwistRateDegPerSec: 95,
    visionFovHalfDeg: 85,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 4.0,
    boosterSpecId: 'boost_high_thrust',
    jumpImpulse: 17.5,
    structureHp: {
      head: 95,
      torso: 550,
      rightShoulder: 225,
      leftShoulder: 225,
      rightArm: 195,
      leftArm: 195,
      rightLeg: 260,
      leftLeg: 260,
    },
    maxArmor: {
      head: 90,
      torsoFront: 350,
      torsoRear: 170,
      rightShoulderFront: 185,
      rightShoulderRear: 95,
      leftShoulderFront: 185,
      leftShoulderRear: 95,
      rightArm: 155,
      leftArm: 155,
      rightLeg: 200,
      leftLeg: 200,
    },
    description: '長距離索敵と胴体ジャンプジェットを併せ持つ60t戦術機。',
  },
  {
    id: 'chassis_berserker',
    name: 'CM-08 バーサーカー級 (85t 強襲重量級)',
    weightClass: 'assault',
    maxTonnage: 85,
    skeletonWeight: 39.0,
    cost: 760,
    headPartId: 'head_armored',
    torsoPartId: 'torso_heavy',
    rightShoulderMountId: 'shd_heavy',
    leftShoulderMountId: 'shd_heavy',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 15.5,
    maxHeat: 100,
    baseHeatDissipation: 15.5,
    radarRange: 360,
    walkSpeed: 8.8,
    strafeSpeed: 0,
    turnDegPerSec: 46,
    torsoTwistMaxDeg: 70,
    torsoTwistRateDegPerSec: 72,
    visionFovHalfDeg: 68,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 5.5,
    boosterSpecId: 'boost_heavy',
    jumpImpulse: 14.5,
    structureHp: {
      head: 135,
      torso: 800,
      rightShoulder: 330,
      leftShoulder: 330,
      rightArm: 270,
      leftArm: 270,
      rightLeg: 375,
      leftLeg: 375,
    },
    maxArmor: {
      head: 130,
      torsoFront: 500,
      torsoRear: 220,
      rightShoulderFront: 260,
      rightShoulderRear: 130,
      leftShoulderFront: 260,
      leftShoulderRear: 130,
      rightArm: 215,
      leftArm: 245,
      rightLeg: 350,
      leftLeg: 350,
    },
    description: '重装甲ながら胴体追加ジェットを備える85t強襲二脚。オンオフで重量配分を調整可能。',
  },
];

function findByIdOrFirst<T extends { id: string }>(list: readonly T[], id: string): T {
  return list.find((item) => item.id === id) ?? list[0];
}

export function getHeadSpec(id: string): HeadPartSpec {
  return findByIdOrFirst(HEAD_PARTS, id);
}

export function getTorsoSpec(id: string): TorsoPartSpec {
  return findByIdOrFirst(TORSO_PARTS, id);
}

export function getShoulderMountSpec(id: string): ShoulderPartSpec {
  return findByIdOrFirst(SHOULDER_MOUNTS, id);
}

const LEGACY_WEAPON_ALIASES: Record<string, string> = {
  rifle_std: 'ac5',
  autocannon_light: 'mg_light',
  sniper_rifle: 'gauss_rifle',
  plasma_rifle: 'ppc',
  missile_pod_4: 'lrm5',
  rail_cannon: 'gauss_rifle',
  flak_pod: 'lbx_shotgun',
  buckler_shield: 'medium_laser',
};

export function resolveLegacyWeaponId(id: string): string {
  return LEGACY_WEAPON_ALIASES[id] ?? id;
}

export function getWeaponSpecBySlot(bp: MechBlueprint, slot: WeaponSlotId): WeaponPartSpec {
  switch (slot) {
    case 'rightArm':
      return getArmWeaponSpec(bp.parts.rightArmWeapon);
    case 'leftArm':
      return getArmWeaponSpec(bp.parts.leftArmWeapon);
    case 'rightShoulder':
      return getShoulderWeaponSpec(bp.parts.rightShoulderWeapon);
    case 'leftShoulder':
      return getShoulderWeaponSpec(bp.parts.leftShoulderWeapon);
  }
}

export function getWeaponSlotExtraAmmoTons(bp: MechBlueprint, slot: WeaponSlotId): number {
  const spec = getWeaponSpecBySlot(bp, slot);
  if (spec.maxAmmo <= 0) return 0;
  const raw = bp.extraAmmo?.[slot];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return clamp(Math.round(raw), 0, MAX_EXTRA_AMMO_TONS);
}

export function getWeaponSlotMaxAmmo(bp: MechBlueprint, slot: WeaponSlotId): number {
  const spec = getWeaponSpecBySlot(bp, slot);
  if (spec.maxAmmo <= 0) return spec.maxAmmo;
  const extraTons = getWeaponSlotExtraAmmoTons(bp, slot);
  return spec.maxAmmo + extraTons * (spec.ammoPerTon ?? spec.maxAmmo);
}

export function getArmWeaponSpec(id: string): WeaponPartSpec {
  return findByIdOrFirst(ARM_WEAPONS, resolveLegacyWeaponId(id));
}

export function getShoulderWeaponSpec(id: string): WeaponPartSpec {
  return findByIdOrFirst(SHOULDER_WEAPONS, resolveLegacyWeaponId(id));
}

export function getLegSpec(id: string): LegPartSpec {
  return findByIdOrFirst(LEG_PARTS, id);
}

export function getBoosterSpec(id: string): BoosterPartSpec {
  return findByIdOrFirst(BOOSTER_PARTS, id);
}

export function getWeaponSpec(id: string): WeaponPartSpec {
  const resolved = resolveLegacyWeaponId(id);
  const arm = ARM_WEAPONS.find((w) => w.id === resolved);
  if (arm) return arm;
  return findByIdOrFirst(SHOULDER_WEAPONS, resolved);
}

const VALID_WEAPON_SLOTS: readonly WeaponSlotId[] = [
  'rightArm',
  'leftArm',
  'rightShoulder',
  'leftShoulder',
];

function isSlotEquipped(parts: MechPartsSelection, slot: WeaponSlotId): boolean {
  if (slot === 'rightArm') return getArmWeaponSpec(parts.rightArmWeapon).id !== 'arm_none';
  if (slot === 'leftArm') return getArmWeaponSpec(parts.leftArmWeapon).id !== 'arm_none';
  if (slot === 'rightShoulder') {
    return getShoulderWeaponSpec(parts.rightShoulderWeapon).id !== 'shd_none';
  }
  return getShoulderWeaponSpec(parts.leftShoulderWeapon).id !== 'shd_none';
}

export function getSlotWeaponSpecFromParts(
  parts: MechPartsSelection,
  slot: WeaponSlotId
): WeaponPartSpec {
  if (slot === 'rightArm') return getArmWeaponSpec(parts.rightArmWeapon);
  if (slot === 'leftArm') return getArmWeaponSpec(parts.leftArmWeapon);
  if (slot === 'rightShoulder') return getShoulderWeaponSpec(parts.rightShoulderWeapon);
  return getShoulderWeaponSpec(parts.leftShoulderWeapon);
}

export function buildDefaultWeaponGroups(parts: MechPartsSelection): MechWeaponGroups {
  const equippedAll = VALID_WEAPON_SLOTS.filter((s) => isSlotEquipped(parts, s));
  const arms = (['rightArm', 'leftArm'] as WeaponSlotId[]).filter((s) => isSlotEquipped(parts, s));
  const shoulders = (['rightShoulder', 'leftShoulder'] as WeaponSlotId[]).filter((s) =>
    isSlotEquipped(parts, s)
  );

  return {
    G1: arms.length > 0 ? arms : equippedAll,
    G2: shoulders.length > 0 ? shoulders : isSlotEquipped(parts, 'leftArm') ? ['leftArm'] : [],
    G3: isSlotEquipped(parts, 'rightArm')
      ? ['rightArm']
      : equippedAll.length > 0
        ? [equippedAll[0]]
        : [],
    G4: isSlotEquipped(parts, 'leftArm') ? ['leftArm'] : equippedAll,
  };
}

export function getResolvedWeaponGroups(
  blueprint: Pick<MechBlueprint, 'parts' | 'weaponGroups'>
): MechWeaponGroups {
  if (!blueprint.weaponGroups) {
    return buildDefaultWeaponGroups(blueprint.parts);
  }
  const out = {} as MechWeaponGroups;
  for (const gid of WEAPON_GROUP_IDS) {
    const raw = blueprint.weaponGroups[gid];
    const clean: WeaponSlotId[] = [];
    if (Array.isArray(raw)) {
      for (const s of raw) {
        if (VALID_WEAPON_SLOTS.includes(s) && !clean.includes(s)) {
          clean.push(s);
        }
      }
    }
    out[gid] = clean;
  }
  return out;
}

export function getWeaponMaxRange(spec: WeaponPartSpec): number {
  return spec.maxRange ?? spec.range;
}

export function computeRangeFalloffMultiplier(
  distance: number,
  optimalRange: number,
  maxRange: number
): number {
  if (distance <= optimalRange) return 1;
  if (maxRange <= optimalRange || distance >= maxRange) return 0;
  return clamp(1 - (distance - optimalRange) / (maxRange - optimalRange), 0, 1);
}

export function getWeaponGroupSummary(
  blueprint: Pick<MechBlueprint, 'parts' | 'weaponGroups'>,
  groupId: WeaponGroupId
): {
  slots: WeaponSlotId[];
  equippedSpecs: WeaponPartSpec[];
  totalDamage: number;
  totalHeat: number;
  minRange: number;
  maxRange: number;
  maxExtendedRange: number;
  maxBurnSec: number;
} {
  const slots = getResolvedWeaponGroups(blueprint)[groupId];
  const equippedSpecs: WeaponPartSpec[] = [];
  let totalDamage = 0;
  let totalHeat = 0;
  let minRange = Infinity;
  let maxRange = 0;
  let maxExtendedRange = 0;
  let maxBurnSec = 0;

  for (const s of slots) {
    const spec = getSlotWeaponSpecFromParts(blueprint.parts, s);
    if (spec.burstCount <= 0 || spec.damage <= 0) continue;
    equippedSpecs.push(spec);
    totalDamage += Math.round(spec.damage * spec.burstCount);
    totalHeat += spec.heatCost;
    if (spec.range < minRange) minRange = spec.range;
    if (spec.range > maxRange) maxRange = spec.range;
    const ext = getWeaponMaxRange(spec);
    if (ext > maxExtendedRange) maxExtendedRange = ext;
    if ((spec.burnDurationSec ?? 0) > maxBurnSec) maxBurnSec = spec.burnDurationSec ?? 0;
  }

  return {
    slots,
    equippedSpecs,
    totalDamage,
    totalHeat,
    minRange: minRange === Infinity ? 0 : minRange,
    maxRange,
    maxExtendedRange,
    maxBurnSec,
  };
}

export function getChassisSpec(id?: string): MechChassisSpec {
  if (id) {
    const found = MECH_CHASSIS_CATALOG.find((c) => c.id === id);
    if (found) return found;
  }
  return MECH_CHASSIS_CATALOG[0];
}

export function inferChassisIdFromParts(parts?: Partial<MechPartsSelection>): string {
  if (!parts) return MECH_CHASSIS_CATALOG[0].id;
  const exact = MECH_CHASSIS_CATALOG.find(
    (c) =>
      c.headPartId === parts.head &&
      c.torsoPartId === parts.torso &&
      c.rightShoulderMountId === parts.rightShoulderMount &&
      c.leftShoulderMountId === parts.leftShoulderMount &&
      c.legPartId === parts.legs
  );
  if (exact) return exact.id;
  if (parts.legs === 'legs_heavy_quad') return 'chassis_fortress';
  if (parts.legs === 'legs_reverse_agile') return parts.head === 'head_recon' ? 'chassis_valkyrie' : 'chassis_striker';
  if (parts.legs === 'legs_hover') return parts.head === 'head_recon' ? 'chassis_hawkeye' : 'chassis_tempest';
  if (parts.torso === 'torso_heavy') return 'chassis_berserker';
  if (parts.head === 'head_armored') return 'chassis_aegis';
  return 'chassis_vanguard';
}

export function applyChassisToBlueprint(bp: MechBlueprint, chassisId: string): MechBlueprint {
  const chassis = getChassisSpec(chassisId);
  const nextBoosterEnabled = chassis.hasJumpBoosterMount ? bp.boosterEnabled : false;
  const nextParts: MechPartsSelection = {
    ...bp.parts,
    head: chassis.headPartId,
    torso: chassis.torsoPartId,
    rightShoulderMount: chassis.rightShoulderMountId,
    leftShoulderMount: chassis.leftShoulderMountId,
    legs: chassis.legPartId,
    booster:
      chassis.hasJumpBoosterMount && nextBoosterEnabled && chassis.boosterSpecId
        ? chassis.boosterSpecId
        : 'boost_none',
  };
  return {
    ...bp,
    chassisId: chassis.id,
    boosterEnabled: nextBoosterEnabled,
    parts: nextParts,
    armor: {
      head: clamp(bp.armor.head, 0, chassis.maxArmor.head),
      torsoFront: clamp(bp.armor.torsoFront, 0, chassis.maxArmor.torsoFront),
      torsoRear: clamp(bp.armor.torsoRear, 0, chassis.maxArmor.torsoRear),
      rightShoulderFront: clamp(bp.armor.rightShoulderFront, 0, chassis.maxArmor.rightShoulderFront),
      rightShoulderRear: clamp(bp.armor.rightShoulderRear, 0, chassis.maxArmor.rightShoulderRear),
      leftShoulderFront: clamp(bp.armor.leftShoulderFront, 0, chassis.maxArmor.leftShoulderFront),
      leftShoulderRear: clamp(bp.armor.leftShoulderRear, 0, chassis.maxArmor.leftShoulderRear),
      rightArm: clamp(bp.armor.rightArm, 0, chassis.maxArmor.rightArm),
      leftArm: clamp(bp.armor.leftArm, 0, chassis.maxArmor.leftArm),
      rightLeg: clamp(bp.armor.rightLeg, 0, chassis.maxArmor.rightLeg),
      leftLeg: clamp(bp.armor.leftLeg, 0, chassis.maxArmor.leftLeg),
    },
  };
}

export function computeMechStats(blueprint: MechBlueprint): MechComputedStats {
  const chassis = getChassisSpec(
    blueprint.chassisId ?? inferChassisIdFromParts(blueprint.parts)
  );
  const rArmWep = getArmWeaponSpec(blueprint.parts.rightArmWeapon);
  const lArmWep = getArmWeaponSpec(blueprint.parts.leftArmWeapon);
  const rShdWep = getShoulderWeaponSpec(blueprint.parts.rightShoulderWeapon);
  const lShdWep = getShoulderWeaponSpec(blueprint.parts.leftShoulderWeapon);

  const hasBoosterMount = chassis.hasJumpBoosterMount;
  const boosterActive = hasBoosterMount && Boolean(blueprint.boosterEnabled);
  const booster =
    boosterActive && chassis.boosterSpecId
      ? getBoosterSpec(chassis.boosterSpecId)
      : getBoosterSpec('boost_none');

  const a = blueprint.armor;
  const totalArmorPoints =
    a.head +
    a.torsoFront +
    a.torsoRear +
    a.rightShoulderFront +
    a.rightShoulderRear +
    a.leftShoulderFront +
    a.leftShoulderRear +
    a.rightArm +
    a.leftArm +
    a.rightLeg +
    a.leftLeg;

  // 100 armor points = 1.0 ton
  const armorWeight = Math.round(totalArmorPoints) / 100;
  const skeletonWeight = chassis.skeletonWeight;
  const boosterWeight = boosterActive ? chassis.boosterModuleWeight : 0;
  const extraHeatSinks = clamp(Math.round(blueprint.extraHeatSinks ?? 0), 0, 8);
  const heatSinkWeight = extraHeatSinks * 1.0;
  const ammoWeight =
    getWeaponSlotExtraAmmoTons(blueprint, 'rightArm') +
    getWeaponSlotExtraAmmoTons(blueprint, 'leftArm') +
    getWeaponSlotExtraAmmoTons(blueprint, 'rightShoulder') +
    getWeaponSlotExtraAmmoTons(blueprint, 'leftShoulder');
  const weaponsWeight = Math.round((rArmWep.weight + lArmWep.weight + rShdWep.weight + lShdWep.weight) * 100) / 100;

  const totalWeight =
    Math.round((skeletonWeight + boosterWeight + heatSinkWeight + ammoWeight + weaponsWeight + armorWeight) * 100) / 100;
  const loadCapacity = Math.min(MAX_CHASSIS_TONNAGE, chassis.maxTonnage);
  const overweight = totalWeight > loadCapacity + 1e-6;
  const overweightRatio = loadCapacity > 0 ? totalWeight / loadCapacity : 1;

  const totalCost =
    chassis.cost +
    (boosterActive ? booster.cost : 0) +
    extraHeatSinks * 45 +
    Math.round(ammoWeight * 35) +
    rArmWep.cost +
    lArmWep.cost +
    rShdWep.cost +
    lShdWep.cost +
    Math.round(totalArmorPoints * 0.25);

  const maxHeat = chassis.maxHeat;
  const heatDissipationPerSec = Number(
    (chassis.baseHeatDissipation + extraHeatSinks * 1.8).toFixed(2)
  );

  const weightSpeedFactor = overweight
    ? Math.max(0.45, 1 - (overweightRatio - 1) * 1.4)
    : Math.max(0.86, 1.06 - overweightRatio * 0.2);

  const s = chassis.structureHp;
  const totalStructureHp =
    s.head +
    s.torso +
    s.rightShoulder +
    s.leftShoulder +
    s.rightArm +
    s.leftArm +
    s.rightLeg +
    s.leftLeg;

  const errors: string[] = [];
  if (overweight) {
    errors.push(`総重量超過 (${totalWeight.toFixed(1)}t > ${loadCapacity.toFixed(1)}t)`);
  }
  if (blueprint.boosterEnabled && !hasBoosterMount) {
    errors.push(`この機体フレーム (${chassis.name}) にはブースト／ジャンプを後付けできません`);
  }

  const maxA = chassis.maxArmor;
  const checkCap = (label: string, val: number, max: number) => {
    if (val < 0 || val > max) {
      errors.push(`${label}装甲が範囲外 (${val} / 0..${max})`);
    }
  };
  checkCap('頭', a.head, maxA.head);
  checkCap('中央胴(前)', a.torsoFront, maxA.torsoFront);
  checkCap('中央胴(後)', a.torsoRear, maxA.torsoRear);
  checkCap('右胴(前)', a.rightShoulderFront, maxA.rightShoulderFront);
  checkCap('右胴(後)', a.rightShoulderRear, maxA.rightShoulderRear);
  checkCap('左胴(前)', a.leftShoulderFront, maxA.leftShoulderFront);
  checkCap('左胴(後)', a.leftShoulderRear, maxA.leftShoulderRear);
  checkCap('右腕', a.rightArm, maxA.rightArm);
  checkCap('左腕', a.leftArm, maxA.leftArm);
  checkCap('右脚', a.rightLeg, maxA.rightLeg);
  checkCap('左脚', a.leftLeg, maxA.leftLeg);

  return {
    chassisId: chassis.id,
    weightClass: chassis.weightClass,
    totalWeight,
    loadCapacity,
    skeletonWeight,
    boosterWeight,
    heatSinkWeight,
    ammoWeight,
    weaponsWeight,
    armorWeight,
    hasBoosterMount,
    boosterActive,
    overweight,
    overweightRatio,
    totalCost,
    maxEn: maxHeat,
    netEnRegenPerSec: heatDissipationPerSec,
    maxHeat,
    heatDissipationPerSec,
    extraHeatSinks,
    walkSpeed: chassis.walkSpeed * weightSpeedFactor,
    strafeSpeed: 0,
    boostSpeed: boosterActive ? booster.boostSpeed * weightSpeedFactor : 0,
    jumpImpulse: boosterActive ? chassis.jumpImpulse * Math.min(1, weightSpeedFactor + 0.05) : 0,
    turnDegPerSec: chassis.turnDegPerSec * (overweight ? 0.75 : 1),
    torsoTwistMaxDeg: chassis.torsoTwistMaxDeg,
    torsoTwistRateDegPerSec: chassis.torsoTwistRateDegPerSec * (overweight ? 0.85 : 1),
    visionFovHalfDeg: chassis.visionFovHalfDeg,
    radarRange: chassis.radarRange,
    totalArmorPoints,
    totalStructureHp,
    validationErrors: errors,
    valid: errors.length === 0,
  };
}
