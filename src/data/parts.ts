import {
  BoosterPartSpec,
  LrmFireMode,
  MAX_CHASSIS_TONNAGE,
  MechArmorAllocation,
  MechBlueprint,
  MechChassisSpec,
  MechComputedStats,
  MechControlTier,
  MechControlTierSpec,
  MechPartsSelection,
  MechSubroutineSlotId,
  MechWeaponGroups,
  WEAPON_GROUP_IDS,
  WeaponGroupId,
  WeaponPartSpec,
  WeaponSlotId,
} from '../types/mech';
import { clamp } from '../engine/math';

export const MAX_EXTRA_AMMO_TONS = 5;
export const MAX_EXTRA_HEAT_SINKS = 16;
export const HEAT_SINK_DISSIPATION_PER_UNIT = 1.5;

export const ARM_WEAPONS: readonly WeaponPartSpec[] = [
  {
    id: 'ac5',
    name: '軽キャノン砲',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 5.5,
    cost: 150,
    damage: 32,
    projectileSpeed: 280,
    projectileGravity: 3.2,
    range: 380,
    maxRange: 680,
    cooldownSec: 2.6,
    enCost: 0,
    heatCost: 6,
    maxAmmo: 45,
    ammoPerTon: 30,
    spreadDeg: 0.85,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 68,
    homingTurnDegPerSec: 0,
    maxMountCount: 2,
    partStructureHp: 200,
    maxPartArmor: 140,
    description: '低発熱・長射程の軽量実弾キャノン（5.5t / 45発 / 熱6 / 最大×2）。傾斜装甲で跳弾あり。',
  },
  {
    id: 'ac10',
    name: '中キャノン砲',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 9.0,
    cost: 215,
    damage: 58,
    projectileSpeed: 255,
    projectileGravity: 3.8,
    range: 330,
    maxRange: 560,
    cooldownSec: 3.6,
    enCost: 0,
    heatCost: 11,
    maxAmmo: 24,
    ammoPerTon: 20,
    spreadDeg: 1.05,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 70,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    partStructureHp: 215,
    maxPartArmor: 155,
    description: '重装甲を一撃で削る中口径実弾キャノン（9.0t / 24発 / 熱11 / 射程330-560m）。',
  },
  {
    id: 'ac20',
    name: '重キャノン砲',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 14.0,
    cost: 290,
    damage: 95,
    projectileSpeed: 215,
    projectileGravity: 4.6,
    range: 190,
    maxRange: 320,
    cooldownSec: 4.6,
    enCost: 0,
    heatCost: 16,
    maxAmmo: 12,
    ammoPerTon: 10,
    spreadDeg: 1.25,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 72,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    partStructureHp: 235,
    maxPartArmor: 170,
    description: '近距離で重装甲を大きく削る超重量キャノン砲（14.0t / 12発 / 熱16 / 射程190-320m）。',
  },
  {
    id: 'mg_light',
    name: 'マシンガン',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 2.5,
    cost: 110,
    damage: 5,
    projectileSpeed: 245,
    projectileGravity: 3.5,
    range: 150,
    maxRange: 240,
    cooldownSec: 1.4,
    enCost: 0,
    heatCost: 2,
    maxAmmo: 120,
    ammoPerTon: 100,
    spreadDeg: 1.3,
    burstCount: 2,
    canRicochet: true,
    ricochetAngleDeg: 64,
    structureCritChance: 0.5,
    structureCritMultiplier: 2.2,
    homingTurnDegPerSec: 0,
    maxMountCount: 3,
    partStructureHp: 185,
    maxPartArmor: 130,
    description: '軽量・低発熱の近距離実弾連射砲（2.5t / 120発 / 熱2 / 射程150-240m / 最大×3）。装甲剥離後の内部構造に1/2でクリティカル2.2倍。',
  },
  {
    id: 'gauss_rifle',
    name: 'ライフル砲',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 12.0,
    cost: 270,
    damage: 76,
    projectileSpeed: 440,
    projectileGravity: 1.4,
    range: 540,
    maxRange: 900,
    cooldownSec: 5.4,
    enCost: 0,
    heatCost: 6,
    maxAmmo: 16,
    ammoPerTon: 12,
    spreadDeg: 0.35,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 76,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    partStructureHp: 180,
    maxPartArmor: 120,
    description: '超高速・低発熱の精密電磁狙撃砲（12.0t / 16発 / 熱6 / 射程540-900m）。',
  },
  {
    id: 'lbx_shotgun',
    name: '散弾砲',
    slotGroup: 'arm',
    kind: 'shotgun',
    weight: 6.5,
    cost: 175,
    damage: 12,
    projectileSpeed: 230,
    projectileGravity: 3.0,
    range: 200,
    maxRange: 320,
    cooldownSec: 3.4,
    enCost: 0,
    heatCost: 8,
    maxAmmo: 30,
    ammoPerTon: 24,
    spreadDeg: 3.6,
    burstCount: 4,
    canRicochet: true,
    ricochetAngleDeg: 62,
    structureCritChance: 0.35,
    structureCritMultiplier: 1.85,
    homingTurnDegPerSec: 0,
    maxMountCount: 2,
    partStructureHp: 205,
    maxPartArmor: 145,
    description: '4発同時発射の近距離散弾砲（6.5t / 30発 / 熱8 / 射程200-320m / 最大×2）。装甲剥離後の内部構造に約1/3でクリティカル1.85倍。',
  },
  {
    id: 'small_laser',
    name: '小口径レーザー',
    slotGroup: 'arm',
    kind: 'laser',
    weight: 1.0,
    cost: 95,
    damage: 16,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 160,
    maxRange: 250,
    burnDurationSec: 0.45,
    cooldownSec: 2.3,
    enCost: 0,
    heatCost: 6,
    maxAmmo: -1,
    spreadDeg: 0.45,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 3,
    partStructureHp: 180,
    maxPartArmor: 125,
    description: '弾薬不要の超軽量レーザー（1.0t / 残弾∞ / 熱6 / 射程160-250m / 最大×3）。',
  },
  {
    id: 'medium_laser',
    name: '中口径レーザー',
    slotGroup: 'arm',
    kind: 'laser',
    weight: 2.0,
    cost: 145,
    damage: 28,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 280,
    maxRange: 420,
    burnDurationSec: 0.7,
    cooldownSec: 3.2,
    enCost: 0,
    heatCost: 11,
    maxAmmo: -1,
    spreadDeg: 0.4,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 3,
    partStructureHp: 195,
    maxPartArmor: 135,
    description: '汎用性に優れた基本主力レーザー（2.0t / 残弾∞ / 熱11 / 射程280-420m / 最大×3）。即着光線・跳弾なし。',
  },
  {
    id: 'large_laser',
    name: '大口径レーザー',
    slotGroup: 'arm',
    kind: 'laser',
    weight: 5.0,
    cost: 210,
    damage: 54,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 420,
    maxRange: 620,
    burnDurationSec: 0.95,
    cooldownSec: 4.2,
    enCost: 0,
    heatCost: 21,
    maxAmmo: -1,
    spreadDeg: 0.35,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 2,
    partStructureHp: 205,
    maxPartArmor: 140,
    description: '長射程・高威力・高発熱の重レーザー（5.0t / 残弾∞ / 熱21 / 射程420-620m / 最大×2）。',
  },
  {
    id: 'ppc',
    name: '荷電粒子砲',
    slotGroup: 'arm',
    kind: 'energy',
    weight: 7.0,
    cost: 245,
    damage: 64,
    projectileSpeed: 300,
    projectileGravity: 0,
    range: 480,
    maxRange: 720,
    cooldownSec: 5.0,
    enCost: 0,
    heatCost: 27,
    maxAmmo: -1,
    spreadDeg: 0.65,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    partStructureHp: 200,
    maxPartArmor: 135,
    description: '高発熱と引き換えに遠距離へ大打撃を与える荷電粒子砲（7.0t / 残弾∞ / 熱27 / 射程480-720m）。',
  },
  {
    id: 'srm_rocket',
    name: '短距離ロケット砲',
    slotGroup: 'arm',
    kind: 'srm_rocket',
    weight: 3.5,
    cost: 155,
    damage: 13,
    projectileSpeed: 185,
    projectileGravity: 1.8,
    range: 240,
    maxRange: 300,
    cooldownSec: 3.8,
    enCost: 0,
    heatCost: 11,
    maxAmmo: 20,
    ammoPerTon: 18,
    spreadDeg: 3.4,
    burstCount: 4,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 2,
    partStructureHp: 195,
    maxPartArmor: 135,
    description: '直進4発斉射の短距離ロケット弾（3.5t / 20発 / 熱11 / 射程240-300m / 最大×2）。無誘導だが軽量高火力。',
  },
  {
    id: 'streak_srm',
    name: '短距離ミサイル',
    slotGroup: 'arm',
    kind: 'srm_homing',
    weight: 4.5,
    cost: 185,
    damage: 16,
    projectileSpeed: 175,
    projectileGravity: 1.2,
    range: 270,
    maxRange: 330,
    cooldownSec: 4.2,
    enCost: 0,
    heatCost: 12,
    maxAmmo: 18,
    ammoPerTon: 16,
    spreadDeg: 2.4,
    burstCount: 3,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 52,
    maxMountCount: 2,
    partStructureHp: 195,
    maxPartArmor: 135,
    description: 'ロック対象を追尾する短距離誘導ミサイル（4.5t / 18発 / 熱12 / 射程270-330m / 最大×2）。',
  },
  {
    id: 'laser_blade',
    name: 'エネルギーソード（近接用）',
    slotGroup: 'arm',
    kind: 'melee',
    weight: 3.0,
    cost: 150,
    damage: 84,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 30,
    cooldownSec: 2.3,
    enCost: 0,
    heatCost: 4,
    maxAmmo: -1,
    spreadDeg: 0,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    partStructureHp: 220,
    maxPartArmor: 155,
    description: '超近距離高威力のエネルギーソード（3.0t / 熱4 / 残弾∞）。',
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
    name: '遠距離ミサイル5',
    slotGroup: 'shoulder',
    kind: 'lrm_homing',
    weight: 4.0,
    cost: 180,
    damage: 6,
    projectileSpeed: 125,
    projectileGravity: 1.0,
    range: 750,
    maxRange: 900,
    minRange: 120,
    cooldownSec: 3.8,
    enCost: 0,
    heatCost: 9,
    maxAmmo: 24,
    ammoPerTon: 24,
    spreadDeg: 3.2,
    burstCount: 5,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 105,
    streamIntervalTicks: 3,
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '長射程誘導ミサイル5発（4.0t / 24発 / 熱9 / 射程120-900m / 120m未満不発 / 最大×2）。一斉/垂れ流し切替・遮蔽越曲射可。',
  },
  {
    id: 'lrm10',
    name: '遠距離ミサイル10',
    slotGroup: 'shoulder',
    kind: 'lrm_homing',
    weight: 7.0,
    cost: 240,
    damage: 6,
    projectileSpeed: 125,
    projectileGravity: 1.0,
    range: 750,
    maxRange: 900,
    minRange: 120,
    cooldownSec: 5.2,
    enCost: 0,
    heatCost: 17,
    maxAmmo: 18,
    ammoPerTon: 18,
    spreadDeg: 3.6,
    burstCount: 10,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 105,
    streamIntervalTicks: 2,
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '遠距離火力投射用の10発誘導ミサイル（7.0t / 18発 / 熱17 / 射程120-900m / 120m未満不発 / 最大×2）。一斉/垂れ流し切替可。',
  },
  {
    id: 'lrm15',
    name: '遠距離ミサイル15',
    slotGroup: 'shoulder',
    kind: 'lrm_homing',
    weight: 9.5,
    cost: 295,
    damage: 6,
    projectileSpeed: 125,
    projectileGravity: 1.0,
    range: 750,
    maxRange: 900,
    minRange: 120,
    cooldownSec: 6.4,
    enCost: 0,
    heatCost: 24,
    maxAmmo: 14,
    ammoPerTon: 14,
    spreadDeg: 4.0,
    burstCount: 15,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 105,
    streamIntervalTicks: 2,
    maxMountCount: 1,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: 'AMS を飽和貫通する15発大弾幕ミサイル（9.5t / 14発 / 熱24 / 射程120-900m / 120m未満不発）。',
  },
  {
    id: 'ams_ballistic',
    name: 'ミサイル迎撃機関砲 AMS',
    slotGroup: 'shoulder',
    kind: 'ams',
    weight: 1.5,
    cost: 160,
    damage: 1,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 105,
    cooldownSec: 0.14,
    enCost: 0,
    heatCost: 0,
    maxAmmo: 120,
    ammoPerTon: 120,
    spreadDeg: 0,
    burstCount: 0,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    providesAms: true,
    amsIsLaser: false,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '半径105mの飛来ミサイルを高速自動迎撃（1.5t / 弾薬120発 / 熱0）。',
  },
  {
    id: 'ams_laser',
    name: 'ミサイル迎撃レーザー LMS',
    slotGroup: 'shoulder',
    kind: 'ams',
    weight: 2.0,
    cost: 210,
    damage: 1,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 105,
    cooldownSec: 0.13,
    enCost: 0,
    heatCost: 1.0,
    maxAmmo: -1,
    spreadDeg: 0,
    burstCount: 0,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    providesAms: true,
    amsIsLaser: true,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '弾薬不要のレーザー式高速自動迎撃装置 LMS（2.0t / 半径105m / 残弾∞ / 作動時発熱）。',
  },
  {
    id: 'bap_probe',
    name: 'シーカーポッド',
    slotGroup: 'shoulder',
    kind: 'bap',
    weight: 1.5,
    cost: 170,
    damage: 0,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 240,
    cooldownSec: 1,
    enCost: 0,
    heatCost: 0,
    maxAmmo: -1,
    spreadDeg: 0,
    burstCount: 0,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    providesBap: true,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '半径240m以内の敵ECM妨害を無効化しロック時間を25%短縮する電子探査ポッド（1.5t）。',
  },
  {
    id: 'ams_bap_pod',
    name: 'シーカーポッド＋AMS',
    slotGroup: 'shoulder',
    kind: 'ams',
    weight: 3.0,
    cost: 290,
    damage: 1,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 105,
    cooldownSec: 0.14,
    enCost: 0,
    heatCost: 0,
    maxAmmo: 120,
    ammoPerTon: 120,
    spreadDeg: 0,
    burstCount: 0,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    providesAms: true,
    amsIsLaser: false,
    providesBap: true,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '1枠で実弾AMS(105m迎撃)とシーカーポッド(240m対ECM・ロック短縮)を両立する複合防護ポッド（3.0t / 120発）。',
  },
  {
    id: 'lams_bap_pod',
    name: 'シーカーポッド＋LMS',
    slotGroup: 'shoulder',
    kind: 'ams',
    weight: 3.5,
    cost: 340,
    damage: 1,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 105,
    cooldownSec: 0.13,
    enCost: 0,
    heatCost: 1.0,
    maxAmmo: -1,
    spreadDeg: 0,
    burstCount: 0,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    providesAms: true,
    amsIsLaser: true,
    providesBap: true,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '1枠でレーザー迎撃LMS(105m/弾∞)とシーカーポッド(240m対ECM・ロック短縮)を同時搭載する複合防護ポッド（3.5t）。',
  },
  {
    id: 'ecm_suite',
    name: 'ECMポッド',
    slotGroup: 'shoulder',
    kind: 'ecm',
    weight: 1.5,
    cost: 190,
    damage: 0,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 130,
    cooldownSec: 1,
    enCost: 0,
    heatCost: 0,
    maxAmmo: -1,
    spreadDeg: 0,
    burstCount: 0,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    providesEcm: true,
    requiresEcmChassis: true,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: 'ECM対応機専用：半径130mの味方被探知RCS半減・敵ロック2倍（1.5t / 搭載部位破壊で停止）。',
  },
  {
    id: 'ecm_ams_pod',
    name: 'ECMポッド＋AMS',
    slotGroup: 'shoulder',
    kind: 'ecm',
    weight: 3.0,
    cost: 320,
    damage: 1,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 105,
    cooldownSec: 0.14,
    enCost: 0,
    heatCost: 0,
    maxAmmo: 120,
    ammoPerTon: 120,
    spreadDeg: 0,
    burstCount: 0,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    providesEcm: true,
    providesAms: true,
    amsIsLaser: false,
    requiresEcmChassis: true,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: 'ECM対応機専用：1枠でECM妨害(130m)とAMS迎撃(105m)を同時搭載する電子戦ポッド（3.0t / 120発）。',
  },
  {
    id: 'srm_rocket',
    name: '短距離ロケット砲',
    slotGroup: 'shoulder',
    kind: 'srm_rocket',
    weight: 3.5,
    cost: 155,
    damage: 13,
    projectileSpeed: 185,
    projectileGravity: 1.8,
    range: 240,
    maxRange: 300,
    cooldownSec: 3.8,
    enCost: 0,
    heatCost: 11,
    maxAmmo: 20,
    ammoPerTon: 18,
    spreadDeg: 3.4,
    burstCount: 4,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の無誘導ロケット弾ポッド（3.5t / 20発 / 熱11 / 射程240-300m / 最大×2）。',
  },
  {
    id: 'streak_srm',
    name: '短距離ミサイル',
    slotGroup: 'shoulder',
    kind: 'srm_homing',
    weight: 4.5,
    cost: 185,
    damage: 16,
    projectileSpeed: 175,
    projectileGravity: 1.2,
    range: 270,
    maxRange: 330,
    cooldownSec: 4.2,
    enCost: 0,
    heatCost: 12,
    maxAmmo: 18,
    ammoPerTon: 16,
    spreadDeg: 2.4,
    burstCount: 3,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 135,
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の近〜中距離追尾ミサイル（4.5t / 18発 / 熱12 / 射程270-330m / 最大×2）。',
  },
  {
    id: 'lbx_shotgun',
    name: '散弾砲',
    slotGroup: 'shoulder',
    kind: 'shotgun',
    weight: 6.5,
    cost: 175,
    damage: 12,
    projectileSpeed: 230,
    projectileGravity: 3.0,
    range: 200,
    maxRange: 320,
    cooldownSec: 3.4,
    enCost: 0,
    heatCost: 8,
    maxAmmo: 30,
    ammoPerTon: 24,
    spreadDeg: 3.6,
    burstCount: 4,
    canRicochet: true,
    ricochetAngleDeg: 62,
    structureCritChance: 0.35,
    structureCritMultiplier: 1.85,
    homingTurnDegPerSec: 0,
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の近距離4発散弾ポッド（6.5t / 30発 / 熱8 / 射程200-320m / 最大×2）。装甲剥離後の内部構造に約1/3でクリティカル1.85倍。',
  },
  {
    id: 'ac5',
    name: '軽キャノン砲',
    slotGroup: 'shoulder',
    kind: 'ballistic',
    weight: 5.5,
    cost: 150,
    damage: 32,
    projectileSpeed: 280,
    projectileGravity: 3.2,
    range: 380,
    maxRange: 680,
    cooldownSec: 2.6,
    enCost: 0,
    heatCost: 6,
    maxAmmo: 45,
    ammoPerTon: 30,
    spreadDeg: 0.85,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 68,
    homingTurnDegPerSec: 0,
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の軽量実弾キャノン（5.5t / 45発 / 熱6 / 最大×2）。',
  },
  {
    id: 'ac20',
    name: '重キャノン砲',
    slotGroup: 'shoulder',
    kind: 'ballistic',
    weight: 14.0,
    cost: 290,
    damage: 95,
    projectileSpeed: 215,
    projectileGravity: 4.6,
    range: 190,
    maxRange: 320,
    cooldownSec: 4.6,
    enCost: 0,
    heatCost: 16,
    maxAmmo: 12,
    ammoPerTon: 10,
    spreadDeg: 1.25,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 72,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の超重量キャノン砲（14.0t / 12発 / 熱16 / 射程190-320m）。',
  },
  {
    id: 'medium_laser',
    name: '中口径レーザー',
    slotGroup: 'shoulder',
    kind: 'laser',
    weight: 2.0,
    cost: 145,
    damage: 28,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 280,
    maxRange: 420,
    burnDurationSec: 0.7,
    cooldownSec: 3.2,
    enCost: 0,
    heatCost: 11,
    maxAmmo: -1,
    spreadDeg: 0.4,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 3,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の中口径レーザー（2.0t / 残弾∞ / 熱11 / 射程280-420m / 最大×3）。',
  },
  {
    id: 'large_laser',
    name: '大口径レーザー',
    slotGroup: 'shoulder',
    kind: 'laser',
    weight: 5.0,
    cost: 210,
    damage: 54,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 420,
    maxRange: 620,
    burnDurationSec: 0.95,
    cooldownSec: 4.2,
    enCost: 0,
    heatCost: 21,
    maxAmmo: -1,
    spreadDeg: 0.35,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の大口径レーザー（5.0t / 残弾∞ / 熱21 / 射程420-620m / 最大×2）。',
  },
  {
    id: 'ppc',
    name: '荷電粒子砲',
    slotGroup: 'shoulder',
    kind: 'energy',
    weight: 7.0,
    cost: 245,
    damage: 64,
    projectileSpeed: 300,
    projectileGravity: 0,
    range: 480,
    maxRange: 720,
    cooldownSec: 5.0,
    enCost: 0,
    heatCost: 27,
    maxAmmo: -1,
    spreadDeg: 0.65,
    burstCount: 1,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の荷電粒子砲（7.0t / 残弾∞ / 熱27 / 射程480-720m）。',
  },
  {
    id: 'gauss_rifle',
    name: 'ライフル砲',
    slotGroup: 'shoulder',
    kind: 'ballistic',
    weight: 12.0,
    cost: 270,
    damage: 76,
    projectileSpeed: 440,
    projectileGravity: 1.4,
    range: 540,
    maxRange: 900,
    cooldownSec: 5.4,
    enCost: 0,
    heatCost: 6,
    maxAmmo: 16,
    ammoPerTon: 12,
    spreadDeg: 0.35,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 76,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の超長距離電磁ライフル砲（12.0t / 16発 / 熱6 / 射程540-900m）。',
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
    name: '標準スラスター',
    weight: 4.0,
    cost: 120,
    boostSpeed: 30,
    boostEnPerSec: 8,
    airLiftAccel: 29,
    airEnPerSec: 8,
    description: '中量級フレーム向けの中央胴追加ブースター（4.0t / 熱8/s）。',
  },
  {
    id: 'boost_high_thrust',
    name: '高出力スラスター',
    weight: 3.5,
    cost: 175,
    boostSpeed: 36,
    boostEnPerSec: 9,
    airLiftAccel: 31,
    airEnPerSec: 9,
    description: '軽量・高機動フレーム用の瞬間推力ブースター（3.5t / 熱9/s）。',
  },
  {
    id: 'boost_heavy',
    name: '大型スラスター',
    weight: 5.5,
    cost: 165,
    boostSpeed: 24,
    boostEnPerSec: 9,
    airLiftAccel: 28,
    airEnPerSec: 9,
    description: '重量級フレーム向けの中央胴追加ジェット（5.5t / 熱9/s）。',
  },
  {
    id: 'boost_eco',
    name: '軽量スラスター',
    weight: 3.5,
    cost: 140,
    boostSpeed: 28,
    boostEnPerSec: 6,
    airLiftAccel: 26,
    airEnPerSec: 6,
    description: '低発熱で継戦能力に優れる汎用スラスター（3.5t / 熱6/s）。',
  },
  {
    id: 'boost_assault',
    name: '超大型スラスター',
    weight: 7.0,
    cost: 195,
    boostSpeed: 19,
    boostEnPerSec: 11,
    airLiftAccel: 25,
    airEnPerSec: 11,
    description: '超重量級フレーム向けの中央胴追加ジェット（7.0t / 熱11/s）。',
  },
];

export const MECH_CHASSIS_CATALOG: readonly MechChassisSpec[] = [
  {
    id: 'chassis_fnt',
    name: '高機動ライト FNT（軽量級 25t）',
    roleName: '高機動ライト',
    modelCode: 'FNT',
    weightClass: 'light',
    legStyle: 'biped',
    sizeScale: 0.72,
    maxTonnage: 25,
    skeletonWeight: 10.5,
    cost: 380,
    headPartId: 'head_recon',
    torsoPartId: 'torso_light',
    rightShoulderMountId: 'shd_light',
    leftShoulderMountId: 'shd_light',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 6.5,
    maxHeat: 100,
    baseHeatDissipation: 6.5,
    radarRange: 800,
    radarSignatureRange: 95,
    walkSpeed: 34.0,
    strafeSpeed: 0,
    turnDegPerSec: 86,
    torsoTwistMaxDeg: 95,
    torsoTwistRateDegPerSec: 132,
    visionFovHalfDeg: 64,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 2.5,
    boosterSpecId: 'boost_high_thrust',
    hasEcmMount: true,
    ecmModuleWeight: 1.5,
    jumpImpulse: 24.0,
    structureHp: {
      head: 40,
      torso: 95,
      rightShoulder: 65,
      leftShoulder: 65,
      rightArm: 50,
      leftArm: 50,
      rightLeg: 65,
      leftLeg: 65,
    },
    maxTorsoArmorTotals: {
      torso: 150,
      rightShoulder: 95,
      leftShoulder: 95,
    },
    maxArmor: {
      head: 40,
      torsoFront: 150,
      torsoRear: 150,
      rightShoulderFront: 95,
      rightShoulderRear: 95,
      leftShoulderFront: 95,
      leftShoulderRear: 95,
      rightArm: 65,
      leftArm: 65,
      rightLeg: 80,
      leftLeg: 80,
    },
    description: '全フレーム中最軽量・最高速の25t極小偵察フレーム。極低被探知（95m）と高機動跳躍が強み（ECM・スラスター対応）。',
  },
  {
    id: 'chassis_abl',
    name: '基本ライト LLB（軽量級 35t）',
    roleName: '基本ライト',
    modelCode: 'LLB',
    weightClass: 'light',
    legStyle: 'biped',
    sizeScale: 0.8,
    maxTonnage: 35,
    skeletonWeight: 14.5,
    cost: 440,
    headPartId: 'head_recon',
    torsoPartId: 'torso_light',
    rightShoulderMountId: 'shd_light',
    leftShoulderMountId: 'shd_light',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 7.0,
    maxHeat: 100,
    baseHeatDissipation: 7.0,
    radarRange: 800,
    radarSignatureRange: 120,
    walkSpeed: 30.0,
    strafeSpeed: 0,
    turnDegPerSec: 78,
    torsoTwistMaxDeg: 90,
    torsoTwistRateDegPerSec: 120,
    visionFovHalfDeg: 60,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 3.0,
    boosterSpecId: 'boost_high_thrust',
    hasEcmMount: true,
    ecmModuleWeight: 1.5,
    jumpImpulse: 22.0,
    structureHp: {
      head: 45,
      torso: 120,
      rightShoulder: 80,
      leftShoulder: 80,
      rightArm: 60,
      leftArm: 60,
      rightLeg: 80,
      leftLeg: 80,
    },
    maxTorsoArmorTotals: {
      torso: 200,
      rightShoulder: 120,
      leftShoulder: 120,
    },
    maxArmor: {
      head: 50,
      torsoFront: 200,
      torsoRear: 200,
      rightShoulderFront: 120,
      rightShoulderRear: 120,
      leftShoulderFront: 120,
      leftShoulderRear: 120,
      rightArm: 80,
      leftArm: 80,
      rightLeg: 100,
      leftLeg: 100,
    },
    description: '軽量級の基準となる35t高機動フレーム。広視野・低被探知（全周120m）・ECM・スラスター対応。',
  },
  {
    id: 'chassis_vpr',
    name: '高機動ミドル VPR（中量級 45t）',
    roleName: '高機動ミドル',
    modelCode: 'VPR',
    weightClass: 'medium',
    legStyle: 'biped',
    sizeScale: 0.9,
    maxTonnage: 45,
    skeletonWeight: 19.0,
    cost: 470,
    headPartId: 'head_recon',
    torsoPartId: 'torso_std',
    rightShoulderMountId: 'shd_std',
    leftShoulderMountId: 'shd_std',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 7.5,
    maxHeat: 100,
    baseHeatDissipation: 7.5,
    radarRange: 800,
    radarSignatureRange: 165,
    walkSpeed: 25.5,
    strafeSpeed: 0,
    turnDegPerSec: 70,
    torsoTwistMaxDeg: 88,
    torsoTwistRateDegPerSec: 108,
    visionFovHalfDeg: 56,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 3.5,
    boosterSpecId: 'boost_std',
    hasEcmMount: true,
    ecmModuleWeight: 1.5,
    jumpImpulse: 20.0,
    structureHp: {
      head: 55,
      torso: 155,
      rightShoulder: 105,
      leftShoulder: 105,
      rightArm: 80,
      leftArm: 80,
      rightLeg: 105,
      leftLeg: 105,
    },
    maxTorsoArmorTotals: {
      torso: 260,
      rightShoulder: 160,
      leftShoulder: 160,
    },
    maxArmor: {
      head: 60,
      torsoFront: 260,
      torsoRear: 260,
      rightShoulderFront: 160,
      rightShoulderRear: 160,
      leftShoulderFront: 160,
      leftShoulderRear: 160,
      rightArm: 105,
      leftArm: 105,
      rightLeg: 125,
      leftLeg: 125,
    },
    description: '軽快な足回りと中量級の火力を両立する45t高速遊撃フレーム（ECM・スラスター対応）。',
  },
  {
    id: 'chassis_abc',
    name: '基本ミドル ABC（中量級 55t）',
    roleName: '基本ミドル',
    modelCode: 'ABC',
    weightClass: 'medium',
    legStyle: 'biped',
    sizeScale: 1.0,
    maxTonnage: 55,
    skeletonWeight: 23.5,
    cost: 500,
    headPartId: 'head_std',
    torsoPartId: 'torso_std',
    rightShoulderMountId: 'shd_std',
    leftShoulderMountId: 'shd_std',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 8.0,
    maxHeat: 100,
    baseHeatDissipation: 8.0,
    radarRange: 800,
    radarSignatureRange: 210,
    walkSpeed: 22.0,
    strafeSpeed: 0,
    turnDegPerSec: 64,
    torsoTwistMaxDeg: 85,
    torsoTwistRateDegPerSec: 98,
    visionFovHalfDeg: 53,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 4.0,
    boosterSpecId: 'boost_std',
    hasEcmMount: true,
    ecmModuleWeight: 1.5,
    jumpImpulse: 18.5,
    structureHp: {
      head: 60,
      torso: 190,
      rightShoulder: 130,
      leftShoulder: 130,
      rightArm: 95,
      leftArm: 95,
      rightLeg: 130,
      leftLeg: 130,
    },
    maxTorsoArmorTotals: {
      torso: 320,
      rightShoulder: 200,
      leftShoulder: 200,
    },
    maxArmor: {
      head: 70,
      torsoFront: 320,
      torsoRear: 320,
      rightShoulderFront: 200,
      rightShoulderRear: 200,
      leftShoulderFront: 200,
      leftShoulderRear: 200,
      rightArm: 130,
      leftArm: 130,
      rightLeg: 150,
      leftLeg: 150,
    },
    description: '学習・基準モデル向けの55t汎用中量級フレーム。ECM・スラスターの両方に対応。',
  },
  {
    id: 'chassis_drg',
    name: '高機動ヘビー DRG（重量級 65t）',
    roleName: '高機動ヘビー',
    modelCode: 'DRG',
    weightClass: 'heavy',
    legStyle: 'biped',
    sizeScale: 1.12,
    maxTonnage: 65,
    skeletonWeight: 28.0,
    cost: 620,
    headPartId: 'head_recon',
    torsoPartId: 'torso_heavy',
    rightShoulderMountId: 'shd_std',
    leftShoulderMountId: 'shd_std',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 8.5,
    maxHeat: 100,
    baseHeatDissipation: 8.5,
    radarRange: 800,
    radarSignatureRange: 270,
    walkSpeed: 19.0,
    strafeSpeed: 0,
    turnDegPerSec: 56,
    torsoTwistMaxDeg: 80,
    torsoTwistRateDegPerSec: 88,
    visionFovHalfDeg: 48,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 5.0,
    boosterSpecId: 'boost_heavy',
    hasEcmMount: true,
    ecmModuleWeight: 1.5,
    jumpImpulse: 16.0,
    structureHp: {
      head: 65,
      torso: 225,
      rightShoulder: 155,
      leftShoulder: 155,
      rightArm: 115,
      leftArm: 115,
      rightLeg: 155,
      leftLeg: 155,
    },
    maxTorsoArmorTotals: {
      torso: 380,
      rightShoulder: 240,
      leftShoulder: 240,
    },
    maxArmor: {
      head: 80,
      torsoFront: 380,
      torsoRear: 380,
      rightShoulderFront: 240,
      rightShoulderRear: 240,
      leftShoulderFront: 240,
      leftShoulderRear: 240,
      rightArm: 155,
      leftArm: 155,
      rightLeg: 180,
      leftLeg: 180,
    },
    description: '高火力の武装と重量級の機動性を兼ね備えた65t重量級フレーム（ECM・スラスター対応）。',
  },
  {
    id: 'chassis_abh',
    name: '基本ヘビー XHD（重量級 75t）',
    roleName: '基本ヘビー',
    modelCode: 'XHD',
    weightClass: 'heavy',
    legStyle: 'biped',
    sizeScale: 1.2,
    maxTonnage: 75,
    skeletonWeight: 33.0,
    cost: 700,
    headPartId: 'head_armored',
    torsoPartId: 'torso_heavy',
    rightShoulderMountId: 'shd_heavy',
    leftShoulderMountId: 'shd_heavy',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 9.0,
    maxHeat: 100,
    baseHeatDissipation: 9.0,
    radarRange: 800,
    radarSignatureRange: 330,
    walkSpeed: 16.5,
    strafeSpeed: 0,
    turnDegPerSec: 50,
    torsoTwistMaxDeg: 75,
    torsoTwistRateDegPerSec: 80,
    visionFovHalfDeg: 45,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 5.5,
    boosterSpecId: 'boost_heavy',
    hasEcmMount: true,
    ecmModuleWeight: 1.5,
    jumpImpulse: 15.0,
    structureHp: {
      head: 70,
      torso: 260,
      rightShoulder: 180,
      leftShoulder: 180,
      rightArm: 130,
      leftArm: 130,
      rightLeg: 180,
      leftLeg: 180,
    },
    maxTorsoArmorTotals: {
      torso: 440,
      rightShoulder: 280,
      leftShoulder: 280,
    },
    maxArmor: {
      head: 85,
      torsoFront: 440,
      torsoRear: 440,
      rightShoulderFront: 280,
      rightShoulderRear: 280,
      leftShoulderFront: 280,
      leftShoulderRear: 280,
      rightArm: 180,
      leftArm: 180,
      rightLeg: 210,
      leftLeg: 210,
    },
    description: '高火力・重装甲の75t重量級基準フレーム。大型スラスターおよびECMの搭載選択も可能。',
  },
  {
    id: 'chassis_hwk',
    name: '高機動アサルト HWK（超重量級 85t）',
    roleName: '高機動アサルト',
    modelCode: 'HWK',
    weightClass: 'assault',
    legStyle: 'biped',
    sizeScale: 1.28,
    maxTonnage: 85,
    skeletonWeight: 37.5,
    cost: 780,
    headPartId: 'head_armored',
    torsoPartId: 'torso_heavy',
    rightShoulderMountId: 'shd_heavy',
    leftShoulderMountId: 'shd_heavy',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 9.5,
    maxHeat: 100,
    baseHeatDissipation: 9.5,
    radarRange: 800,
    radarSignatureRange: 365,
    walkSpeed: 15.0,
    strafeSpeed: 0,
    turnDegPerSec: 44,
    torsoTwistMaxDeg: 68,
    torsoTwistRateDegPerSec: 70,
    visionFovHalfDeg: 43,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 6.5,
    boosterSpecId: 'boost_assault',
    hasEcmMount: true,
    ecmModuleWeight: 1.5,
    jumpImpulse: 13.5,
    structureHp: {
      head: 75,
      torso: 295,
      rightShoulder: 205,
      leftShoulder: 205,
      rightArm: 150,
      leftArm: 150,
      rightLeg: 205,
      leftLeg: 205,
    },
    maxTorsoArmorTotals: {
      torso: 510,
      rightShoulder: 320,
      leftShoulder: 320,
    },
    maxArmor: {
      head: 92,
      torsoFront: 510,
      torsoRear: 510,
      rightShoulderFront: 320,
      rightShoulderRear: 320,
      leftShoulderFront: 320,
      leftShoulderRear: 320,
      rightArm: 205,
      leftArm: 205,
      rightLeg: 240,
      leftLeg: 240,
    },
    description: '超重量級の中で機動性にも配慮した85t主力決戦フレーム（ECM・スラスター対応）。',
  },
  {
    id: 'chassis_ftr',
    name: '基本アサルト FTR（超重量級 100t）',
    roleName: '基本アサルト',
    modelCode: 'FTR',
    weightClass: 'assault',
    legStyle: 'biped',
    sizeScale: 1.35,
    maxTonnage: 100,
    skeletonWeight: 44.0,
    cost: 880,
    headPartId: 'head_armored',
    torsoPartId: 'torso_heavy',
    rightShoulderMountId: 'shd_heavy',
    leftShoulderMountId: 'shd_heavy',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 10.0,
    maxHeat: 100,
    baseHeatDissipation: 10.0,
    radarRange: 800,
    radarSignatureRange: 400,
    walkSpeed: 13.0,
    strafeSpeed: 0,
    turnDegPerSec: 38,
    torsoTwistMaxDeg: 60,
    torsoTwistRateDegPerSec: 62,
    visionFovHalfDeg: 40,
    hasJumpBoosterMount: true,
    boosterModuleWeight: 7.5,
    boosterSpecId: 'boost_assault',
    hasEcmMount: true,
    ecmModuleWeight: 1.5,
    jumpImpulse: 12.0,
    structureHp: {
      head: 80,
      torso: 330,
      rightShoulder: 230,
      leftShoulder: 230,
      rightArm: 170,
      leftArm: 170,
      rightLeg: 230,
      leftLeg: 230,
    },
    maxTorsoArmorTotals: {
      torso: 580,
      rightShoulder: 360,
      leftShoulder: 360,
    },
    maxArmor: {
      head: 100,
      torsoFront: 580,
      torsoRear: 580,
      rightShoulderFront: 360,
      rightShoulderRear: 360,
      leftShoulderFront: 360,
      leftShoulderRear: 360,
      rightArm: 230,
      leftArm: 230,
      rightLeg: 270,
      leftLeg: 270,
    },
    description: '最大上限100t・最高装甲/放熱性能の超重量級移動要塞フレーム（超大型スラスター・ECM対応）。',
  },
];

function findByIdOrFirst<T extends { id: string }>(list: readonly T[], id: string): T {
  return list.find((item) => item.id === id) ?? list[0];
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
  lrm20: 'lrm15',
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

export function isPassiveModuleSpec(spec: WeaponPartSpec): boolean {
  return (
    spec.kind === 'ams' ||
    spec.kind === 'bap' ||
    spec.kind === 'ecm' ||
    Boolean(spec.providesAms || spec.providesBap || spec.providesEcm)
  );
}

export function getWeaponMaxMountCount(spec: WeaponPartSpec): 1 | 2 | 3 {
  if (isPassiveModuleSpec(spec) || spec.burstCount <= 0 || spec.damage <= 0) return 1;
  return spec.maxMountCount ?? 1;
}

export function getWeaponSlotMountCount(
  bp: Pick<MechBlueprint, 'parts' | 'weaponMountCounts'>,
  slot: WeaponSlotId
): 1 | 2 | 3 {
  const spec = getSlotWeaponSpecFromParts(bp.parts, slot);
  const maxMount = getWeaponMaxMountCount(spec);
  if (maxMount <= 1) return 1;
  const raw = bp.weaponMountCounts?.[slot];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
  const clamped = clamp(Math.round(raw), 1, maxMount);
  return clamped as 1 | 2 | 3;
}

function clampDualArmor(frontRaw: number, rearRaw: number, totalCap: number): { front: number; rear: number } {
  const front = clamp(Math.round(frontRaw), 0, totalCap);
  const rear = clamp(Math.round(rearRaw), 0, Math.max(0, totalCap - front));
  return { front, rear };
}

export function clampArmorAllocationToChassis(
  chassis: MechChassisSpec,
  armor: MechArmorAllocation
): MechArmorAllocation {
  const m = chassis.maxArmor;
  const caps = chassis.maxTorsoArmorTotals;
  const ct = clampDualArmor(armor.torsoFront, armor.torsoRear, caps.torso);
  const rt = clampDualArmor(armor.rightShoulderFront, armor.rightShoulderRear, caps.rightShoulder);
  const lt = clampDualArmor(armor.leftShoulderFront, armor.leftShoulderRear, caps.leftShoulder);
  return {
    head: clamp(Math.round(armor.head), 0, m.head),
    torsoFront: ct.front,
    torsoRear: ct.rear,
    rightShoulderFront: rt.front,
    rightShoulderRear: rt.rear,
    leftShoulderFront: lt.front,
    leftShoulderRear: lt.rear,
    rightArm: clamp(Math.round(armor.rightArm), 0, m.rightArm),
    leftArm: clamp(Math.round(armor.leftArm), 0, m.leftArm),
    rightLeg: clamp(Math.round(armor.rightLeg), 0, m.rightLeg),
    leftLeg: clamp(Math.round(armor.leftLeg), 0, m.leftLeg),
  };
}

export function getChassisMaxTotalArmorPoints(chassis: MechChassisSpec): number {
  const m = chassis.maxArmor;
  const caps = chassis.maxTorsoArmorTotals;
  return (
    m.head +
    caps.torso +
    caps.rightShoulder +
    caps.leftShoulder +
    m.rightArm +
    m.leftArm +
    m.rightLeg +
    m.leftLeg
  );
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

export function getWeaponSlotLrmFireMode(
  bp: Pick<MechBlueprint, 'lrmFireMode' | 'lrmFireModes'>,
  slot: WeaponSlotId
): LrmFireMode {
  const slotMode = bp.lrmFireModes?.[slot];
  if (slotMode === 'stream' || slotMode === 'salvo') return slotMode;
  return bp.lrmFireMode === 'stream' ? 'stream' : 'salvo';
}

export function getArmWeaponSpec(id: string): WeaponPartSpec {
  return findByIdOrFirst(ARM_WEAPONS, resolveLegacyWeaponId(id));
}

export function getShoulderWeaponSpec(id: string): WeaponPartSpec {
  return findByIdOrFirst(SHOULDER_WEAPONS, resolveLegacyWeaponId(id));
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
  const spec = getSlotWeaponSpecFromParts(parts, slot);
  return spec.burstCount > 0 && spec.damage > 0;
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
  blueprint: Pick<MechBlueprint, 'parts' | 'weaponGroups' | 'weaponMountCounts'>,
  groupId: WeaponGroupId
): {
  slots: WeaponSlotId[];
  equippedSpecs: WeaponPartSpec[];
  equippedItems: Array<{ slot: WeaponSlotId; spec: WeaponPartSpec; mountCount: 1 | 2 | 3 }>;
  totalDamage: number;
  totalHeat: number;
  minRange: number;
  maxRange: number;
  maxExtendedRange: number;
  maxBurnSec: number;
} {
  const slots = getResolvedWeaponGroups(blueprint)[groupId];
  const equippedSpecs: WeaponPartSpec[] = [];
  const equippedItems: Array<{ slot: WeaponSlotId; spec: WeaponPartSpec; mountCount: 1 | 2 | 3 }> = [];
  let totalDamage = 0;
  let totalHeat = 0;
  let minRange = Infinity;
  let maxRange = 0;
  let maxExtendedRange = 0;
  let maxBurnSec = 0;

  for (const s of slots) {
    const spec = getSlotWeaponSpecFromParts(blueprint.parts, s);
    if (isPassiveModuleSpec(spec) || spec.burstCount <= 0 || spec.damage <= 0) continue;
    const mountCount = getWeaponSlotMountCount(blueprint, s);
    equippedSpecs.push(spec);
    equippedItems.push({ slot: s, spec, mountCount });
    totalDamage += Math.round(spec.damage * spec.burstCount * mountCount);
    totalHeat += spec.heatCost * mountCount;
    if (spec.range < minRange) minRange = spec.range;
    if (spec.range > maxRange) maxRange = spec.range;
    const ext = getWeaponMaxRange(spec);
    if (ext > maxExtendedRange) maxExtendedRange = ext;
    if ((spec.burnDurationSec ?? 0) > maxBurnSec) maxBurnSec = spec.burnDurationSec ?? 0;
  }

  return {
    slots,
    equippedSpecs,
    equippedItems,
    totalDamage,
    totalHeat,
    minRange: minRange === Infinity ? 0 : minRange,
    maxRange,
    maxExtendedRange,
    maxBurnSec,
  };
}

export const CONTROL_TIER_CATALOG: readonly MechControlTierSpec[] = [
  {
    id: 'direct_4x4',
    name: 'Lv.1 ロボット単体 (4×4 × 1枚)',
    shortLabel: 'ロボット 4×4',
    weight: 0,
    cost: 0,
    pilotEnabled: false,
    enabledSlots: ['S1'],
    slotGridSizes: { S1: 4, S2: 4, S3: 4, S4: 4, S5: 4, S6: 4 },
    description: 'パイロット層を使わず、4×4 ルーチン 1 枚（S1）だけで機体を動かす入門・単体制御モードです。',
  },
  {
    id: 'pilot_full',
    name: 'Lv.2 パイロットAI ＋ ルーチン (最大6枠)',
    shortLabel: 'パイロットAI + 6枠',
    weight: 0,
    cost: 0,
    pilotEnabled: true,
    enabledSlots: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
    slotGridSizes: { S1: 4, S2: 4, S3: 4, S4: 4, S5: 4, S6: 4 },
    description: 'パイロットAI で戦況を見て 4×4 ルーチン（最大6枠 S1〜S6）を ARG 引数付きで呼び分ける標準制御モードです。',
  },
];

export const ROM_WEIGHT_4X4 = 0.5;
export const ROM_WEIGHT_6X6 = 0.5;

export function getRomWeightByGridSize(_gridSize?: 4 | 6): number {
  return ROM_WEIGHT_4X4;
}

export function getControlTierSpec(tier?: MechControlTier): MechControlTierSpec {
  if (tier === 'direct_4x4' || tier === 'direct_6x6') {
    return CONTROL_TIER_CATALOG[0];
  }
  return CONTROL_TIER_CATALOG.find((t) => t.id === tier) ?? CONTROL_TIER_CATALOG[1];
}

export function getEffectiveSubroutineGridSize(
  _bp: Pick<MechBlueprint, 'controlTier' | 'subroutines'>,
  _slotId: MechSubroutineSlotId
): 4 | 6 {
  return 4;
}

/**
 * Computes total ROM weight for active slots of a blueprint:
 * - Unmounted slots (`romSlots?.[slot] === null` or no subroutine present) cost 0t.
 * - All mounted 4x4 ROMs cost 0.5t each (max 5 slots = 2.5t).
 */
export function computeBlueprintRomWeight(
  bp: Pick<MechBlueprint, 'controlTier' | 'romSlots' | 'subroutines'>
): number {
  const tierSpec = getControlTierSpec(bp.controlTier);
  let total = 0;
  for (const slotId of tierSpec.enabledSlots) {
    if (bp.romSlots?.[slotId] === null) continue;
    const sub = bp.subroutines?.find((s) => s.slotId === slotId);
    if (!sub) continue;
    total += ROM_WEIGHT_4X4;
  }
  return Math.round(total * 100) / 100;
}

const LEGACY_CHASSIS_ALIASES: Record<string, string> = {
  chassis_tempest: 'chassis_abc',
  chassis_aegis: 'chassis_ftr',
  chassis_valkyrie: 'chassis_drg',
  chassis_berserker: 'chassis_ftr',
  chassis_vanguard: 'chassis_abc',
  chassis_striker: 'chassis_abl',
  chassis_fortress: 'chassis_ftr',
  chassis_hawkeye: 'chassis_drg',
  chassis_light_35: 'chassis_abl',
  chassis_medium_55: 'chassis_abc',
  chassis_heavy_75: 'chassis_abh',
  chassis_assault_95: 'chassis_ftr',
};

export function getChassisSpec(id?: string): MechChassisSpec {
  if (id) {
    const resolvedId = LEGACY_CHASSIS_ALIASES[id] ?? id;
    const found = MECH_CHASSIS_CATALOG.find((c) => c.id === resolvedId);
    if (found) return found;
  }
  return MECH_CHASSIS_CATALOG.find((c) => c.id === 'chassis_abc') ?? MECH_CHASSIS_CATALOG[0];
}

export function inferChassisIdFromParts(parts?: Partial<MechPartsSelection>): string {
  if (!parts) return 'chassis_abc';
  const exact = MECH_CHASSIS_CATALOG.find(
    (c) =>
      c.headPartId === parts.head &&
      c.torsoPartId === parts.torso &&
      c.rightShoulderMountId === parts.rightShoulderMount &&
      c.leftShoulderMountId === parts.leftShoulderMount &&
      c.legPartId === parts.legs
  );
  if (exact) return exact.id;
  if (
    parts.legs === 'legs_heavy_quad' ||
    parts.torso === 'torso_heavy' ||
    parts.head === 'head_armored'
  ) {
    return 'chassis_abh';
  }
  if (
    parts.legs === 'legs_reverse_agile' ||
    parts.torso === 'torso_light' ||
    parts.head === 'head_recon'
  ) {
    return 'chassis_abl';
  }
  return 'chassis_abc';
}

export function applyChassisToBlueprint(bp: MechBlueprint, chassisId: string): MechBlueprint {
  const chassis = getChassisSpec(chassisId);
  const nextBoosterEnabled = chassis.hasJumpBoosterMount ? bp.boosterEnabled : false;
  const nextEcmEnabled = chassis.hasEcmMount ? Boolean(bp.ecmEnabled) : false;
  const rShdSpec = getShoulderWeaponSpec(bp.parts.rightShoulderWeapon);
  const lShdSpec = getShoulderWeaponSpec(bp.parts.leftShoulderWeapon);
  const nextRightShoulderWeapon =
    rShdSpec.requiresEcmChassis && !chassis.hasEcmMount ? 'shd_none' : bp.parts.rightShoulderWeapon;
  const nextLeftShoulderWeapon =
    lShdSpec.requiresEcmChassis && !chassis.hasEcmMount ? 'shd_none' : bp.parts.leftShoulderWeapon;
  const nextParts: MechPartsSelection = {
    ...bp.parts,
    head: chassis.headPartId,
    torso: chassis.torsoPartId,
    rightShoulderMount: chassis.rightShoulderMountId,
    leftShoulderMount: chassis.leftShoulderMountId,
    rightShoulderWeapon: nextRightShoulderWeapon,
    leftShoulderWeapon: nextLeftShoulderWeapon,
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
    ecmEnabled: nextEcmEnabled,
    parts: nextParts,
    armor: clampArmorAllocationToChassis(chassis, bp.armor),
  };
}

export function computeMechStats(blueprint: MechBlueprint): MechComputedStats {
  const chassis = getChassisSpec(
    blueprint.chassisId ?? inferChassisIdFromParts(blueprint.parts)
  );
  const tierSpec = getControlTierSpec(blueprint.controlTier);
  const controlComputerWeight = tierSpec.weight;
  const romWeight = computeBlueprintRomWeight(blueprint);
  const rArmWep = getArmWeaponSpec(blueprint.parts.rightArmWeapon);
  const lArmWep = getArmWeaponSpec(blueprint.parts.leftArmWeapon);
  const rShdWep = getShoulderWeaponSpec(blueprint.parts.rightShoulderWeapon);
  const lShdWep = getShoulderWeaponSpec(blueprint.parts.leftShoulderWeapon);

  const mRA = getWeaponSlotMountCount(blueprint, 'rightArm');
  const mLA = getWeaponSlotMountCount(blueprint, 'leftArm');
  const mRS = getWeaponSlotMountCount(blueprint, 'rightShoulder');
  const mLS = getWeaponSlotMountCount(blueprint, 'leftShoulder');

  const hasBoosterMount = chassis.hasJumpBoosterMount;
  const boosterActive = hasBoosterMount && Boolean(blueprint.boosterEnabled);
  const booster =
    boosterActive && chassis.boosterSpecId
      ? getBoosterSpec(chassis.boosterSpecId)
      : getBoosterSpec('boost_none');
  const hasEcmMount = chassis.hasEcmMount;
  const hasSlotEcm = Boolean(rShdWep.providesEcm || lShdWep.providesEcm);
  const ecmActive = hasEcmMount && (hasSlotEcm || Boolean(blueprint.ecmEnabled));
  const hasBap = Boolean(rShdWep.providesBap || lShdWep.providesBap);
  const hasAms = Boolean(rShdWep.providesAms || lShdWep.providesAms);

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
  const ecmWeight = !hasSlotEcm && ecmActive ? chassis.ecmModuleWeight : 0;
  const extraHeatSinks = clamp(Math.round(blueprint.extraHeatSinks ?? 0), 0, MAX_EXTRA_HEAT_SINKS);
  const heatSinkWeight = extraHeatSinks * 1.0;
  const ammoWeight =
    getWeaponSlotExtraAmmoTons(blueprint, 'rightArm') +
    getWeaponSlotExtraAmmoTons(blueprint, 'leftArm') +
    getWeaponSlotExtraAmmoTons(blueprint, 'rightShoulder') +
    getWeaponSlotExtraAmmoTons(blueprint, 'leftShoulder');
  const weaponsWeight =
    Math.round(
      (rArmWep.weight * mRA +
        lArmWep.weight * mLA +
        rShdWep.weight * mRS +
        lShdWep.weight * mLS) *
        100
    ) / 100;

  const totalWeight =
    Math.round(
      (skeletonWeight +
        controlComputerWeight +
        romWeight +
        boosterWeight +
        ecmWeight +
        heatSinkWeight +
        ammoWeight +
        weaponsWeight +
        armorWeight) *
        100
    ) / 100;
  const loadCapacity = Math.min(MAX_CHASSIS_TONNAGE, chassis.maxTonnage);
  const overweight = totalWeight > loadCapacity + 1e-6;
  const overweightRatio = loadCapacity > 0 ? totalWeight / loadCapacity : 1;

  const totalCost =
    chassis.cost +
    tierSpec.cost +
    (boosterActive ? booster.cost : 0) +
    (!hasSlotEcm && ecmActive ? 170 : 0) +
    extraHeatSinks * 45 +
    Math.round(ammoWeight * 35) +
    rArmWep.cost * mRA +
    lArmWep.cost * mLA +
    rShdWep.cost * mRS +
    lShdWep.cost * mLS +
    Math.round(totalArmorPoints * 0.25);

  const maxHeat = chassis.maxHeat;
  const heatDissipationPerSec = Number(
    (chassis.baseHeatDissipation + extraHeatSinks * HEAT_SINK_DISSIPATION_PER_UNIT).toFixed(2)
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
    errors.push(`この機体フレーム (${chassis.name}) にはジャンプスラスターを後付けできません`);
  }
  if ((blueprint.ecmEnabled || rShdWep.requiresEcmChassis || lShdWep.requiresEcmChassis) && !hasEcmMount) {
    errors.push(`この機体フレーム (${chassis.name}) には ECM 装備を搭載できません`);
  }

  const maxA = chassis.maxArmor;
  const torsoCaps = chassis.maxTorsoArmorTotals;
  const checkCap = (label: string, val: number, max: number) => {
    if (val < 0 || val > max) {
      errors.push(`${label}装甲が範囲外 (${val} / 0..${max})`);
    }
  };
  checkCap('頭', a.head, maxA.head);
  checkCap('中央胴(前)', a.torsoFront, maxA.torsoFront);
  checkCap('中央胴(後)', a.torsoRear, maxA.torsoRear);
  if (a.torsoFront + a.torsoRear > torsoCaps.torso) {
    errors.push(`中央胴の前後装甲合計が上限超過 (${a.torsoFront + a.torsoRear} > ${torsoCaps.torso})`);
  }
  checkCap('右胴(前)', a.rightShoulderFront, maxA.rightShoulderFront);
  checkCap('右胴(後)', a.rightShoulderRear, maxA.rightShoulderRear);
  if (a.rightShoulderFront + a.rightShoulderRear > torsoCaps.rightShoulder) {
    errors.push(
      `右胴の前後装甲合計が上限超過 (${a.rightShoulderFront + a.rightShoulderRear} > ${torsoCaps.rightShoulder})`
    );
  }
  checkCap('左胴(前)', a.leftShoulderFront, maxA.leftShoulderFront);
  checkCap('左胴(後)', a.leftShoulderRear, maxA.leftShoulderRear);
  if (a.leftShoulderFront + a.leftShoulderRear > torsoCaps.leftShoulder) {
    errors.push(
      `左胴の前後装甲合計が上限超過 (${a.leftShoulderFront + a.leftShoulderRear} > ${torsoCaps.leftShoulder})`
    );
  }
  checkCap('右腕', a.rightArm, maxA.rightArm);
  checkCap('左腕', a.leftArm, maxA.leftArm);
  checkCap('右脚', a.rightLeg, maxA.rightLeg);
  checkCap('左脚', a.leftLeg, maxA.leftLeg);

  return {
    chassisId: chassis.id,
    controlTier: tierSpec.id,
    controlComputerWeight,
    romWeight,
    weightClass: chassis.weightClass,
    sizeScale: chassis.sizeScale,
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
    hasEcmMount,
    ecmActive,
    ecmWeight,
    hasBap,
    hasAms,
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
    radarSignatureRange: chassis.radarSignatureRange,
    totalArmorPoints,
    totalStructureHp,
    validationErrors: errors,
    valid: errors.length === 0,
  };
}
