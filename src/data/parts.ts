import {
  BoosterPartSpec,
  MAX_CHASSIS_TONNAGE,
  MechBlueprint,
  MechChassisSpec,
  MechComputedStats,
  MechPartsSelection,
  MechWeaponGroups,
  WEAPON_GROUP_IDS,
  WeaponGroupId,
  WeaponPartSpec,
  WeaponSlotId,
} from '../types/mech';
import { clamp } from '../engine/math';

export const MAX_EXTRA_AMMO_TONS = 5;

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
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '長射程誘導ミサイル5発（4.0t / 24発 / 熱12 / 射程120-900m）。一斉/垂れ流し切替・遮蔽越曲射可。',
  },
  {
    id: 'lrm10',
    name: 'LRM-10 重遠距離ミサイル (追尾)',
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
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '遠距離火力投射用の10発誘導弾（7.0t / 18発 / 熱22 / 射程120-900m）。一斉/垂れ流し切替可。',
  },
  {
    id: 'lrm15',
    name: 'LRM-15 大型遠距離ミサイル (追尾)',
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
    partStructureHp: 0,
    maxPartArmor: 0,
    description: 'AMS を飽和貫通する15発大弾幕ミサイル（9.5t / 14発 / 熱30 / 射程120-900m）。',
  },
  {
    id: 'ams_ballistic',
    name: 'AMS 対ミサイル迎撃機関砲 (常時)',
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
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '半径80mの飛来ミサイルを自動迎撃（1.5t / 弾薬120発 / 熱0）。',
  },
  {
    id: 'ams_laser',
    name: 'L-AMS レーザー迎撃システム (常時)',
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
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '弾薬不要のレーザー式自動迎撃装置（2.0t / 残弾∞ / 作動時発熱）。',
  },
  {
    id: 'bap_probe',
    name: 'BAP アクティブプローブ (常時)',
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
    partStructureHp: 0,
    maxPartArmor: 0,
    description: '半径240m以内の敵ECM妨害を無効化しロック時間を25%短縮する電子探査装置（1.5t）。',
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
    homingTurnDegPerSec: 135,
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
    boostSpeed: 30,
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
    boostSpeed: 36,
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
    boostSpeed: 24,
    boostEnPerSec: 25,
    airLiftAccel: 20,
    airEnPerSec: 25,
    description: '重量級フレーム向けの中央胴追加ジェット（5.5t / 熱25/s）。',
  },
  {
    id: 'boost_eco',
    name: 'JJ-04 省燃費スラスター',
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
    legStyle: 'reverse_joint',
    sizeScale: 0.8,
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
    description: '軽快な35t軽量逆関節フレーム。広視野・低被探知（全周120m）と胴体ジャンプジェットを装備可能。',
  },
  {
    id: 'chassis_fortress',
    name: 'CM-03 フォートレス級 (100t 超重量級)',
    weightClass: 'assault',
    legStyle: 'quad',
    sizeScale: 1.35,
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
    legStyle: 'hover',
    sizeScale: 1.15,
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
    description: '高火力の65t重量級ホバー支援機。ブースト・跳躍機構は非搭載。',
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
  if (parts.legs === 'legs_heavy_quad' || parts.torso === 'torso_heavy') return 'chassis_fortress';
  if (parts.legs === 'legs_reverse_agile') return 'chassis_striker';
  if (parts.legs === 'legs_hover') return 'chassis_hawkeye';
  return 'chassis_vanguard';
}

export function applyChassisToBlueprint(bp: MechBlueprint, chassisId: string): MechBlueprint {
  const chassis = getChassisSpec(chassisId);
  const nextBoosterEnabled = chassis.hasJumpBoosterMount ? bp.boosterEnabled : false;
  const nextEcmEnabled = chassis.hasEcmMount ? Boolean(bp.ecmEnabled) : false;
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
    ecmEnabled: nextEcmEnabled,
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
  const hasEcmMount = chassis.hasEcmMount;
  const ecmActive = hasEcmMount && Boolean(blueprint.ecmEnabled);
  const hasBap = rShdWep.kind === 'bap' || lShdWep.kind === 'bap';
  const hasAms = rShdWep.kind === 'ams' || lShdWep.kind === 'ams';

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
  const ecmWeight = ecmActive ? chassis.ecmModuleWeight : 0;
  const extraHeatSinks = clamp(Math.round(blueprint.extraHeatSinks ?? 0), 0, 8);
  const heatSinkWeight = extraHeatSinks * 1.0;
  const ammoWeight =
    getWeaponSlotExtraAmmoTons(blueprint, 'rightArm') +
    getWeaponSlotExtraAmmoTons(blueprint, 'leftArm') +
    getWeaponSlotExtraAmmoTons(blueprint, 'rightShoulder') +
    getWeaponSlotExtraAmmoTons(blueprint, 'leftShoulder');
  const weaponsWeight = Math.round((rArmWep.weight + lArmWep.weight + rShdWep.weight + lShdWep.weight) * 100) / 100;

  const totalWeight =
    Math.round((skeletonWeight + boosterWeight + ecmWeight + heatSinkWeight + ammoWeight + weaponsWeight + armorWeight) * 100) / 100;
  const loadCapacity = Math.min(MAX_CHASSIS_TONNAGE, chassis.maxTonnage);
  const overweight = totalWeight > loadCapacity + 1e-6;
  const overweightRatio = loadCapacity > 0 ? totalWeight / loadCapacity : 1;

  const totalCost =
    chassis.cost +
    (boosterActive ? booster.cost : 0) +
    (ecmActive ? 170 : 0) +
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
  if (blueprint.ecmEnabled && !hasEcmMount) {
    errors.push(`この機体フレーム (${chassis.name}) には ECM スイートを搭載できません`);
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
