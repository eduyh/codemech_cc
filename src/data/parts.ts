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
export const HEAT_SINK_DISSIPATION_PER_UNIT = 2.0;

export const ARM_WEAPONS: readonly WeaponPartSpec[] = [
  {
    id: 'ac5',
    name: '軽キャノン砲',
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
    maxMountCount: 1,
    partStructureHp: 215,
    maxPartArmor: 155,
    description: '重装甲を一撃で削る中口径実弾キャノン（9.0t / 24発 / 熱12）。',
  },
  {
    id: 'ac20',
    name: '重キャノン砲',
    slotGroup: 'arm',
    kind: 'ballistic',
    weight: 14.0,
    cost: 290,
    damage: 155,
    projectileSpeed: 215,
    projectileGravity: 4.6,
    range: 180,
    maxRange: 320,
    cooldownSec: 4.8,
    enCost: 0,
    heatCost: 18,
    maxAmmo: 12,
    ammoPerTon: 10,
    spreadDeg: 0.9,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 72,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    partStructureHp: 235,
    maxPartArmor: 170,
    description: '近距離で重装甲を一撃粉砕する超重量キャノン砲（14.0t / 12発 / 熱18 / 射程180-320m）。',
  },
  {
    id: 'mg_light',
    name: 'マシンガン',
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
    maxMountCount: 3,
    partStructureHp: 185,
    maxPartArmor: 130,
    description: '軽量・ほぼ無発熱の近距離実弾連射砲（2.5t / 120発 / 熱2 / 最大×3）。',
  },
  {
    id: 'gauss_rifle',
    name: 'ライフル砲',
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
    maxMountCount: 1,
    partStructureHp: 180,
    maxPartArmor: 120,
    description: '超高速・超低発熱の精密電磁狙撃砲（12.0t / 16発 / 熱4）。',
  },
  {
    id: 'lbx_shotgun',
    name: '散弾砲',
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
    maxMountCount: 2,
    partStructureHp: 205,
    maxPartArmor: 145,
    description: '4発同時発射の近距離散弾砲（6.5t / 30発 / 熱8 / 最大×2）。複数部位を同時削り可能。',
  },
  {
    id: 'small_laser',
    name: '小口径レーザー',
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
    maxMountCount: 3,
    partStructureHp: 180,
    maxPartArmor: 125,
    description: '弾薬不要の超軽量レーザー（1.0t / 残弾∞ / 熱10 / 最大×3）。',
  },
  {
    id: 'medium_laser',
    name: '中口径レーザー',
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
    maxMountCount: 3,
    partStructureHp: 195,
    maxPartArmor: 135,
    description: '汎用性に優れた基本主力レーザー（2.0t / 残弾∞ / 熱18 / 最大×3）。即着光線・跳弾なし。',
  },
  {
    id: 'large_laser',
    name: '大口径レーザー',
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
    maxMountCount: 2,
    partStructureHp: 205,
    maxPartArmor: 140,
    description: '長射程・高威力・高発熱の重レーザー（5.0t / 残弾∞ / 熱32 / 最大×2）。',
  },
  {
    id: 'ppc',
    name: '荷電粒子砲',
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
    maxMountCount: 1,
    partStructureHp: 200,
    maxPartArmor: 135,
    description: '強烈な発熱と引き換えに遠距離へ大打撃を与える荷電粒子砲（7.0t / 残弾∞ / 熱42）。',
  },
  {
    id: 'srm_rocket',
    name: '短距離ロケット砲',
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
    maxMountCount: 2,
    partStructureHp: 195,
    maxPartArmor: 135,
    description: '直進4発斉射の短距離ロケット弾（3.5t / 20発 / 熱16 / 最大×2）。無誘導だが軽量高火力。',
  },
  {
    id: 'streak_srm',
    name: '短距離ミサイル',
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
    maxMountCount: 2,
    partStructureHp: 195,
    maxPartArmor: 135,
    description: 'ロック対象を追尾する短距離誘導ミサイル（4.5t / 18発 / 熱18 / 最大×2）。',
  },
  {
    id: 'laser_blade',
    name: 'エネルギーソード（近接用）',
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
    damage: 10,
    projectileSpeed: 155,
    projectileGravity: 1.0,
    range: 750,
    maxRange: 900,
    minRange: 120,
    cooldownSec: 3.8,
    enCost: 0,
    heatCost: 12,
    maxAmmo: 24,
    ammoPerTon: 24,
    spreadDeg: 3.2,
    burstCount: 5,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 160,
    streamIntervalTicks: 3,
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '長射程誘導ミサイル5発（4.0t / 24発 / 熱12 / 射程120-900m / 最大×2）。一斉/垂れ流し切替・遮蔽越曲射可。',
  },
  {
    id: 'lrm10',
    name: '遠距離ミサイル10',
    slotGroup: 'shoulder',
    kind: 'lrm_homing',
    weight: 7.0,
    cost: 240,
    damage: 10,
    projectileSpeed: 155,
    projectileGravity: 1.0,
    range: 750,
    maxRange: 900,
    minRange: 120,
    cooldownSec: 5.4,
    enCost: 0,
    heatCost: 22,
    maxAmmo: 18,
    ammoPerTon: 18,
    spreadDeg: 3.6,
    burstCount: 10,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 160,
    streamIntervalTicks: 2,
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '遠距離火力投射用の10発誘導ミサイル（7.0t / 18発 / 熱22 / 射程120-900m / 最大×2）。一斉/垂れ流し切替可。',
  },
  {
    id: 'lrm15',
    name: '遠距離ミサイル15',
    slotGroup: 'shoulder',
    kind: 'lrm_homing',
    weight: 9.5,
    cost: 295,
    damage: 10,
    projectileSpeed: 155,
    projectileGravity: 1.0,
    range: 750,
    maxRange: 900,
    minRange: 120,
    cooldownSec: 6.6,
    enCost: 0,
    heatCost: 30,
    maxAmmo: 14,
    ammoPerTon: 14,
    spreadDeg: 4.0,
    burstCount: 15,
    canRicochet: false,
    ricochetAngleDeg: 89,
    homingTurnDegPerSec: 160,
    streamIntervalTicks: 2,
    maxMountCount: 1,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: 'AMS を飽和貫通する15発大弾幕ミサイル（9.5t / 14発 / 熱30 / 射程120-900m）。',
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
    range: 80,
    cooldownSec: 0.22,
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
    description: '半径80mの飛来ミサイルを自動迎撃（1.5t / 弾薬120発 / 熱0）。',
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
    range: 80,
    cooldownSec: 0.20,
    enCost: 0,
    heatCost: 1.6,
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
    description: '弾薬不要のレーザー式自動迎撃装置 LMS（2.0t / 残弾∞ / 作動時発熱）。',
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
    name: 'AMS＋シーカーポッド',
    slotGroup: 'shoulder',
    kind: 'ams',
    weight: 3.0,
    cost: 290,
    damage: 1,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 80,
    cooldownSec: 0.22,
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
    description: '1枠で実弾AMS(80m迎撃)とシーカーポッド(240m対ECM・ロック短縮)を両立する複合防護ポッド（3.0t / 120発）。',
  },
  {
    id: 'lams_bap_pod',
    name: 'LMS＋シーカーポッド',
    slotGroup: 'shoulder',
    kind: 'ams',
    weight: 3.5,
    cost: 340,
    damage: 1,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 80,
    cooldownSec: 0.20,
    enCost: 0,
    heatCost: 1.6,
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
    description: '1枠でレーザー迎撃LMS(弾∞)とシーカーポッド(240m対ECM・ロック短縮)を同時搭載する複合防護ポッド（3.5t）。',
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
    name: 'AMS＋ECMポッド',
    slotGroup: 'shoulder',
    kind: 'ecm',
    weight: 3.0,
    cost: 320,
    damage: 1,
    projectileSpeed: 0,
    projectileGravity: 0,
    range: 80,
    cooldownSec: 0.22,
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
    description: 'ECM対応機専用：1枠でECM妨害(130m)とAMS迎撃(80m)を同時搭載する電子戦ポッド（3.0t / 120発）。',
  },
  {
    id: 'srm_rocket',
    name: '短距離ロケット砲',
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
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の無誘導ロケット弾ポッド（3.5t / 20発 / 熱16 / 最大×2）。',
  },
  {
    id: 'streak_srm',
    name: '短距離ミサイル',
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
    homingTurnDegPerSec: 135,
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の近〜中距離追尾ミサイル（4.5t / 18発 / 熱18 / 最大×2）。',
  },
  {
    id: 'lbx_shotgun',
    name: '散弾砲',
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
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の近距離4発散弾ポッド（6.5t / 30発 / 熱8 / 最大×2）。',
  },
  {
    id: 'ac5',
    name: '軽キャノン砲',
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
    damage: 155,
    projectileSpeed: 215,
    projectileGravity: 4.6,
    range: 180,
    maxRange: 320,
    cooldownSec: 4.8,
    enCost: 0,
    heatCost: 18,
    maxAmmo: 12,
    ammoPerTon: 10,
    spreadDeg: 0.9,
    burstCount: 1,
    canRicochet: true,
    ricochetAngleDeg: 72,
    homingTurnDegPerSec: 0,
    maxMountCount: 1,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載型の超重量キャノン砲（14.0t / 12発 / 熱18 / 射程180-320m）。',
  },
  {
    id: 'medium_laser',
    name: '中口径レーザー',
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
    maxMountCount: 3,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の中口径レーザー（2.0t / 残弾∞ / 熱18 / 最大×3）。',
  },
  {
    id: 'large_laser',
    name: '大口径レーザー',
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
    maxMountCount: 2,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の大口径レーザー（5.0t / 残弾∞ / 熱32 / 最大×2）。',
  },
  {
    id: 'ppc',
    name: '荷電粒子砲',
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
    maxMountCount: 1,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の荷電粒子砲（7.0t / 残弾∞ / 熱42）。',
  },
  {
    id: 'gauss_rifle',
    name: 'ライフル砲',
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
    maxMountCount: 1,
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '右胴・左胴搭載の超長距離電磁ライフル砲（12.0t / 16発 / 熱4）。',
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
    boostEnPerSec: 22,
    airLiftAccel: 20,
    airEnPerSec: 22,
    description: '中量級フレーム向けの中央胴追加ブースター（4.0t / 熱22/s）。',
  },
  {
    id: 'boost_high_thrust',
    name: '高出力スラスター',
    weight: 3.5,
    cost: 175,
    boostSpeed: 36,
    boostEnPerSec: 26,
    airLiftAccel: 22,
    airEnPerSec: 26,
    description: '軽量・高機動フレーム用の瞬間推力ブースター（3.5t / 熱26/s）。',
  },
  {
    id: 'boost_heavy',
    name: '大型スラスター',
    weight: 5.5,
    cost: 165,
    boostSpeed: 24,
    boostEnPerSec: 25,
    airLiftAccel: 20,
    airEnPerSec: 25,
    description: '重量級フレーム向けの中央胴追加ジェット（5.5t / 熱25/s）。',
  },
  {
    id: 'boost_eco',
    name: '軽量スラスター',
    weight: 3.5,
    cost: 140,
    boostSpeed: 28,
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
    legStyle: 'biped',
    sizeScale: 1.0,
    maxTonnage: 55,
    skeletonWeight: 23.5,
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
    hasEcmMount: false,
    ecmModuleWeight: 0,
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
    description: '胴体追加ジェット搭載可能な標準55t中量機。武装と装甲のバランスに優れる。',
  },
  {
    id: 'chassis_striker',
    name: 'CM-02 ストライカー級 (35t 軽量級)',
    weightClass: 'light',
    legStyle: 'biped',
    sizeScale: 0.8,
    maxTonnage: 35,
    skeletonWeight: 14.5,
    cost: 440,
    headPartId: 'head_std',
    torsoPartId: 'torso_light',
    rightShoulderMountId: 'shd_light',
    leftShoulderMountId: 'shd_light',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 12.5,
    maxHeat: 100,
    baseHeatDissipation: 12.5,
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
    description: '軽快な35t軽量高機動フレーム。広視野・低被探知（全周120m）・ECM対応・跳躍機構を装備。',
  },
  {
    id: 'chassis_fortress',
    name: 'CM-03 フォートレス級 (100t 超重量級)',
    weightClass: 'assault',
    legStyle: 'biped',
    sizeScale: 1.35,
    maxTonnage: 100,
    skeletonWeight: 44.0,
    cost: 860,
    headPartId: 'head_armored',
    torsoPartId: 'torso_heavy',
    rightShoulderMountId: 'shd_heavy',
    leftShoulderMountId: 'shd_heavy',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 17.0,
    maxHeat: 100,
    baseHeatDissipation: 17.0,
    radarRange: 800,
    radarSignatureRange: 400,
    walkSpeed: 13.0,
    strafeSpeed: 0,
    turnDegPerSec: 38,
    torsoTwistMaxDeg: 60,
    torsoTwistRateDegPerSec: 62,
    visionFovHalfDeg: 40,
    hasJumpBoosterMount: false,
    boosterModuleWeight: 0,
    boosterSpecId: null,
    hasEcmMount: false,
    ecmModuleWeight: 0,
    jumpImpulse: 0,
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
    description: '最大上限100tの超重量級要塞機。ブースト・跳躍は非搭載（後付け不可）だが重装甲・重武装が可能。',
  },
  {
    id: 'chassis_hawkeye',
    name: 'CM-04 ホークアイ級 (65t 重量級)',
    weightClass: 'heavy',
    legStyle: 'biped',
    sizeScale: 1.15,
    maxTonnage: 65,
    skeletonWeight: 28.5,
    cost: 620,
    headPartId: 'head_recon',
    torsoPartId: 'torso_light',
    rightShoulderMountId: 'shd_std',
    leftShoulderMountId: 'shd_light',
    legPartId: 'legs_biped_std',
    enCapacity: 100,
    netEnRegenPerSec: 14.0,
    maxHeat: 100,
    baseHeatDissipation: 14.0,
    radarRange: 800,
    radarSignatureRange: 300,
    walkSpeed: 18.0,
    strafeSpeed: 0,
    turnDegPerSec: 56,
    torsoTwistMaxDeg: 80,
    torsoTwistRateDegPerSec: 88,
    visionFovHalfDeg: 47,
    hasJumpBoosterMount: false,
    boosterModuleWeight: 0,
    boosterSpecId: null,
    hasEcmMount: true,
    ecmModuleWeight: 1.5,
    jumpImpulse: 0,
    structureHp: {
      head: 65,
      torso: 220,
      rightShoulder: 150,
      leftShoulder: 150,
      rightArm: 110,
      leftArm: 110,
      rightLeg: 150,
      leftLeg: 150,
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
      rightArm: 150,
      leftArm: 150,
      rightLeg: 180,
      leftLeg: 180,
    },
    description: '高火力の65t重量級支援機。ECM対応・ブースト跳躍機構は非搭載。',
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
    description: 'パイロット層を使わず、4×4 ROM 1 枚（S1）だけで機体を動かす入門・単体制御モードです。',
  },
  {
    id: 'pilot_full',
    name: 'Lv.2 パイロット 6×6 ＋ 4×4 ROM (最大6枠)',
    shortLabel: 'パイロット 6×6 + 6枠',
    weight: 0,
    cost: 0,
    pilotEnabled: true,
    enabledSlots: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
    slotGridSizes: { S1: 4, S2: 4, S3: 4, S4: 4, S5: 4, S6: 4 },
    description: 'パイロット 6×6 で戦況を見て 4×4 ROM（最大6枠 S1〜S6）を ARG 引数付きで呼び分ける標準制御モードです。',
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
  chassis_tempest: 'chassis_vanguard',
  chassis_aegis: 'chassis_fortress',
  chassis_valkyrie: 'chassis_hawkeye',
  chassis_berserker: 'chassis_fortress',
};

export function getChassisSpec(id?: string): MechChassisSpec {
  if (id) {
    const resolvedId = LEGACY_CHASSIS_ALIASES[id] ?? id;
    const found = MECH_CHASSIS_CATALOG.find((c) => c.id === resolvedId);
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
  if (
    parts.legs === 'legs_heavy_quad' ||
    parts.torso === 'torso_heavy' ||
    parts.head === 'head_armored'
  ) {
    return 'chassis_fortress';
  }
  if (parts.legs === 'legs_hover' || parts.head === 'head_recon') {
    return 'chassis_hawkeye';
  }
  if (parts.legs === 'legs_reverse_agile' || parts.torso === 'torso_light') {
    return 'chassis_striker';
  }
  return 'chassis_vanguard';
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
    errors.push(`この機体フレーム (${chassis.name}) にはブースト／ジャンプを後付けできません`);
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
