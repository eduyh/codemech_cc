/**
 * Core two-layer domain model, 8-part dual-armor mech specs, terrain, and simulation state.
 * Pure TypeScript types only.
 */

export const SIM_TPS = 30;
export const SIM_DT = 1 / SIM_TPS;
export const MAX_MECHS = 12;
export const MAX_CHASSIS_TONNAGE = 100;

export type MechWeightClass = 'light' | 'medium' | 'heavy' | 'assault';

export type CurriculumStepId =
  | 'step0_robot_4x4'
  | 'step0b_robot_6x6'
  | 'step1_pilot_routing'
  | 'step2_heat_hysteresis'
  | 'step3_subroutine_4x4'
  | 'step4_assemble_and_6x6'
  | 'step5_transfer_squad';

export type MechControlTier = 'direct_4x4' | 'direct_6x6' | 'pilot_full';

export interface MechControlTierSpec {
  id: MechControlTier;
  name: string;
  shortLabel: string;
  weight: number;
  cost: number;
  pilotEnabled: boolean;
  enabledSlots: readonly MechSubroutineSlotId[];
  slotGridSizes: Record<MechSubroutineSlotId, 4 | 6>;
  description: string;
}

export type MechPartId =
  | 'head'
  | 'torso'
  | 'rightShoulder'
  | 'rightArm'
  | 'leftShoulder'
  | 'leftArm'
  | 'rightLeg'
  | 'leftLeg';

export type DualArmorPartId = 'torso' | 'rightShoulder' | 'leftShoulder';
export type SingleArmorPartId = Exclude<MechPartId, DualArmorPartId>;
export type ArmorFace = 'front' | 'rear' | 'all';

export type WeaponSlotId = 'rightArm' | 'leftArm' | 'rightShoulder' | 'leftShoulder';
export type WeaponGroupId = 'G1' | 'G2' | 'G3' | 'G4';
export const WEAPON_GROUP_IDS: readonly WeaponGroupId[] = ['G1', 'G2', 'G3', 'G4'];
export type MechWeaponGroups = Record<WeaponGroupId, WeaponSlotId[]>;
export type WeaponKind =
  | 'laser'
  | 'ballistic'
  | 'shotgun'
  | 'srm_rocket'
  | 'srm_homing'
  | 'lrm_homing'
  | 'energy'
  | 'missile'
  | 'melee'
  | 'ams'
  | 'bap'
  | 'ecm';
export type LrmFireMode = 'salvo' | 'stream';
export type LegStyle = 'biped' | 'reverse_joint' | 'quad' | 'hover';
export type ArenaPresetId = 'plains_ridge' | 'twin_mesas' | 'urban_pillars' | 'valley_basin';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/* -------------------------------------------------------------------------- */
/* Hardware Parts Catalog Specs                                               */
/* -------------------------------------------------------------------------- */

export interface WeaponPartSpec {
  id: string;
  name: string;
  slotGroup: 'arm' | 'shoulder';
  kind: WeaponKind;
  weight: number;
  cost: number;
  damage: number;
  projectileSpeed: number;
  projectileGravity: number;
  range: number;
  maxRange?: number;
  burnDurationSec?: number;
  cooldownSec: number;
  enCost: number;
  heatCost: number;
  maxAmmo: number; // -1 for unlimited
  minRange?: number;
  spreadDeg: number;
  burstCount: number;
  canRicochet: boolean;
  ricochetAngleDeg: number;
  homingTurnDegPerSec: number;
  streamIntervalTicks?: number;
  ammoPerTon?: number;
  maxMountCount?: 1 | 2 | 3;
  providesAms?: boolean;
  amsIsLaser?: boolean;
  providesBap?: boolean;
  providesEcm?: boolean;
  requiresEcmChassis?: boolean;
  partStructureHp: number; // arm structure contributed when mounted in arm slot
  maxPartArmor: number;
  description: string;
}

export interface BoosterPartSpec {
  id: string;
  name: string;
  weight: number;
  cost: number;
  boostSpeed: number;
  boostEnPerSec: number;
  airLiftAccel: number;
  airEnPerSec: number;
  description: string;
}

export interface MechChassisSpec {
  id: string;
  name: string;
  weightClass: MechWeightClass;
  legStyle: LegStyle;
  sizeScale: number;
  maxTonnage: number;
  skeletonWeight: number;
  cost: number;
  headPartId: string;
  torsoPartId: string;
  rightShoulderMountId: string;
  leftShoulderMountId: string;
  legPartId: string;
  enCapacity: number;
  netEnRegenPerSec: number;
  maxHeat: number;
  baseHeatDissipation: number;
  radarRange: number;
  radarSignatureRange: number;
  walkSpeed: number;
  strafeSpeed: number;
  turnDegPerSec: number;
  torsoTwistMaxDeg: number;
  torsoTwistRateDegPerSec: number;
  visionFovHalfDeg: number;
  hasJumpBoosterMount: boolean;
  boosterModuleWeight: number;
  boosterSpecId: string | null;
  hasEcmMount: boolean;
  ecmModuleWeight: number;
  jumpImpulse: number;
  structureHp: Record<MechPartId, number>;
  maxArmor: MechArmorAllocation;
  maxTorsoArmorTotals: {
    torso: number;
    rightShoulder: number;
    leftShoulder: number;
  };
  description: string;
}

/* -------------------------------------------------------------------------- */
/* Layer 2 (Lower): Mech Blueprint & Subroutines (6x6 x 2 + 4x4 x 3)          */
/* -------------------------------------------------------------------------- */

export interface MechArmorAllocation {
  head: number;
  torsoFront: number;
  torsoRear: number;
  rightShoulderFront: number;
  rightShoulderRear: number;
  leftShoulderFront: number;
  leftShoulderRear: number;
  rightArm: number;
  leftArm: number;
  rightLeg: number;
  leftLeg: number;
}

export interface MechPartsSelection {
  head: string;
  torso: string;
  rightShoulderMount: string;
  leftShoulderMount: string;
  rightArmWeapon: string;
  leftArmWeapon: string;
  rightShoulderWeapon: string;
  leftShoulderWeapon: string;
  legs: string;
  booster: string;
}

export type GridDir = 'N' | 'E' | 'S' | 'W';
export type PilotTargetMode = 'main' | 'nearest' | 'flank' | 'attacker' | 'weakest';
export type JumpDirectionMode = 'forward' | 'vertical' | 'backward';

export type MechSubroutineSlotId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

export const MECH_SUBROUTINE_SLOT_SPECS: ReadonlyArray<{
  slotId: MechSubroutineSlotId;
  gridSize: 4;
  defaultName: string;
}> = [
  { slotId: 'S1', gridSize: 4, defaultName: '主交戦 (4×4)' },
  { slotId: 'S2', gridSize: 4, defaultName: '応用戦術 (4×4)' },
  { slotId: 'S3', gridSize: 4, defaultName: '索敵・移動 (4×4)' },
  { slotId: 'S4', gridSize: 4, defaultName: '冷却・防御 (4×4)' },
  { slotId: 'S5', gridSize: 4, defaultName: '近接・迎撃 (4×4)' },
  { slotId: 'S6', gridSize: 4, defaultName: '予備・特化 (4×4)' },
];

export type MechSubroutineOp =
  | 'empty'
  | 'start'
  | 'wire'
  | 'wait'
  | 'return'
  // Latched leg / movement commands (with obstacle-avoidance & mech steering)
  | 'move_approach'
  | 'move_maintain'
  | 'move_circle'
  | 'move_evade'
  | 'move_retreat'
  | 'move_high_ground'
  | 'move_jump'
  | 'move_stop'
  // Latched upper-body waist orientation
  | 'torso_track'
  | 'torso_twist_auto'
  | 'torso_twist_angle'
  | 'torso_twist_r'
  | 'torso_twist_l'
  | 'torso_center'
  // Aim-and-fire / emergency actions
  | 'fire_group_1'
  | 'fire_group_2'
  | 'fire_group_3'
  | 'fire_group_4'
  | 'fire_right_arm'
  | 'fire_left_arm'
  | 'fire_right_shoulder'
  | 'fire_left_shoulder'
  | 'fire_alpha'
  | 'emergency_cool'
  | 'override_on'
  | 'override_off'
  // Branch checks (True -> dir, False -> elseDir)
  | 'if_group_1_ready'
  | 'if_group_2_ready'
  | 'if_group_3_ready'
  | 'if_group_4_ready'
  | 'if_right_arm_ready'
  | 'if_left_arm_ready'
  | 'if_right_shoulder_ready'
  | 'if_left_shoulder_ready'
  | 'if_enemy_in_sight'
  | 'if_enemy_dist_lt'
  | 'if_enemy_dist_gt'
  | 'if_heat_above'
  | 'if_heat_below'
  | 'if_right_armor_weaker'
  | 'if_ammo_empty'
  | 'if_airborne'
  | 'if_incoming_fire'
  | 'if_target_locked'
  | 'if_incoming_missile'
  | 'if_ecm_jammed'
  | 'if_obstacle_ahead';

export interface MechSubroutineCell {
  row: number;
  col: number;
  op: MechSubroutineOp;
  dir: GridDir;
  elseDir?: GridDir;
  durationSec?: number;
  param?: number;
  useArg?: boolean;
  direction?: 'left' | 'right' | 'auto';
  jumpDir?: JumpDirectionMode;
  weaponSlot?: WeaponSlotId;
}

export type RomCategory = 'attack' | 'move' | 'control';

export interface MechSubroutine {
  slotId: MechSubroutineSlotId;
  name: string;
  category?: RomCategory;
  gridSize: 6 | 4;
  cells: MechSubroutineCell[];
}

export interface ProgramRomEntry {
  id: string;
  name: string;
  category?: RomCategory;
  gridSize: 4 | 6;
  builtIn?: boolean;
  savedAt?: number;
  cells: MechSubroutineCell[];
}

export interface MechBlueprint {
  version: number;
  id: string;
  name: string;
  authorName?: string;
  color: string;
  chassisId: string;
  controlTier?: MechControlTier;
  romSlots?: Partial<Record<MechSubroutineSlotId, string | null>>;
  boosterEnabled: boolean;
  ecmEnabled?: boolean;
  lrmFireMode?: LrmFireMode;
  lrmFireModes?: Partial<Record<WeaponSlotId, LrmFireMode>>;
  extraHeatSinks?: number;
  extraAmmo?: Partial<Record<WeaponSlotId, number>>;
  weaponMountCounts?: Partial<Record<WeaponSlotId, 1 | 2 | 3>>;
  parts: MechPartsSelection;
  weaponGroups?: MechWeaponGroups;
  armor: MechArmorAllocation;
  subroutines: MechSubroutine[];
}

export interface MechComputedStats {
  chassisId: string;
  controlTier: MechControlTier;
  controlComputerWeight: number;
  romWeight: number;
  weightClass: MechWeightClass;
  sizeScale: number;
  totalWeight: number;
  loadCapacity: number;
  skeletonWeight: number;
  boosterWeight: number;
  heatSinkWeight: number;
  ammoWeight: number;
  weaponsWeight: number;
  armorWeight: number;
  hasBoosterMount: boolean;
  boosterActive: boolean;
  hasEcmMount: boolean;
  ecmActive: boolean;
  ecmWeight: number;
  hasBap: boolean;
  hasAms: boolean;
  overweight: boolean;
  overweightRatio: number;
  totalCost: number;
  maxEn: number;
  netEnRegenPerSec: number;
  maxHeat: number;
  heatDissipationPerSec: number;
  extraHeatSinks: number;
  walkSpeed: number;
  strafeSpeed: number;
  boostSpeed: number;
  jumpImpulse: number;
  turnDegPerSec: number;
  torsoTwistMaxDeg: number;
  torsoTwistRateDegPerSec: number;
  visionFovHalfDeg: number;
  radarRange: number;
  radarSignatureRange: number;
  totalArmorPoints: number;
  totalStructureHp: number;
  validationErrors: string[];
  valid: boolean;
}

/* -------------------------------------------------------------------------- */
/* Layer 1 (Upper): Pilot 6x6 Strategic Judgment Grid                         */
/* -------------------------------------------------------------------------- */

export type PilotGridOp =
  | 'empty'
  | 'start'
  | 'wire'
  // Subroutine dispatch (calls S1..S6 on whichever mech the pilot boards)
  | 'call_s1'
  | 'call_s2'
  | 'call_s3'
  | 'call_s4'
  | 'call_s5'
  | 'call_s6'
  // Emergency & Flag memory operations
  | 'emergency_cool'
  | 'override_on'
  | 'override_off'
  | 'flag_a_on'
  | 'flag_a_off'
  | 'flag_b_on'
  | 'flag_b_off'
  // Branch conditions (True -> dir, False -> elseDir)
  | 'if_enemy_in_sight'
  | 'if_enemy_on_radar'
  | 'if_enemy_dist_lt'
  | 'if_enemy_dist_gt'
  | 'if_enemy_flank'
  | 'if_heat_above'
  | 'if_heat_below'
  | 'if_ammo_empty'
  | 'if_part_destroyed'
  | 'if_torso_hp_below'
  | 'if_incoming_fire'
  | 'if_target_locked'
  | 'if_incoming_missile'
  | 'if_ecm_jammed'
  | 'if_obstacle_ahead'
  | 'if_enemy_hp_below'
  | 'if_flag_a'
  | 'if_flag_b';

export interface PilotGridCell {
  row: number;
  col: number;
  op: PilotGridOp;
  dir: GridDir;
  elseDir?: GridDir;
  param?: number;
  durationSec?: number;
  target?: PilotTargetMode;
  partId?: MechPartId;
  weaponSlot?: WeaponSlotId;
}

export interface PilotGridProgram {
  gridSize: 6;
  cells: PilotGridCell[];
}

export interface PilotProfile {
  version: number;
  id: string;
  name: string;
  authorName?: string;
  grid: PilotGridProgram;
}

export type WeaponReadyReason =
  | 'ready'
  | 'cooldown'
  | 'out_of_arc'
  | 'out_of_range'
  | 'blocked_los'
  | 'no_ammo'
  | 'destroyed'
  | 'shutdown'
  | 'none';

export interface PilotDebugTrace {
  activePilotCell: { row: number; col: number } | null;
  activeSubroutineSlot: MechSubroutineSlotId | null;
  activeSubroutineCell: { row: number; col: number } | null;
  lastBranch: {
    board: 'MAIN' | MechSubroutineSlotId;
    label: string;
    result: boolean;
  } | null;
  flagA: boolean;
  flagB: boolean;
  overrideLatched: boolean;
  weaponStatuses: Record<WeaponSlotId, WeaponReadyReason>;
}

/* -------------------------------------------------------------------------- */
/* Terrain & Runtime Simulation Types                                         */
/* -------------------------------------------------------------------------- */

export interface TerrainObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  baseZ: number;
  topZ: number;
}

export interface TerrainConfig {
  id: ArenaPresetId;
  width: number;
  depth: number;
  heightAmplitude: number;
  ridgeType: 'central_ridge' | 'twin_mesas' | 'urban_flat' | 'valley_rim';
  obstacles: TerrainObstacle[];
  seed: number;
}

export interface DualArmorPartRuntimeState {
  kind: 'dual';
  frontArmor: number;
  maxFrontArmor: number;
  rearArmor: number;
  maxRearArmor: number;
  structure: number;
  maxStructure: number;
  destroyed: boolean;
}

export interface SingleArmorPartRuntimeState {
  kind: 'single';
  armor: number;
  maxArmor: number;
  structure: number;
  maxStructure: number;
  destroyed: boolean;
}

export type MechPartRuntimeState = DualArmorPartRuntimeState | SingleArmorPartRuntimeState;

export interface MechPartsRuntimeState {
  head: SingleArmorPartRuntimeState;
  torso: DualArmorPartRuntimeState;
  rightShoulder: DualArmorPartRuntimeState;
  rightArm: SingleArmorPartRuntimeState;
  leftShoulder: DualArmorPartRuntimeState;
  leftArm: SingleArmorPartRuntimeState;
  rightLeg: SingleArmorPartRuntimeState;
  leftLeg: SingleArmorPartRuntimeState;
}

export interface WeaponSlotRuntimeState {
  slot: WeaponSlotId;
  weaponId: string;
  cooldownRemaining: number;
  ammoRemaining: number; // -1 for unlimited
}

export interface MechControlInput {
  moveForward: number; // -1..1
  moveStrafe: number; // -1..1
  turnYaw: number; // -1..1
  targetYaw?: number;
  torsoTargetYaw?: number;
  torsoTwistOffsetDeg?: number;
  targetPitch?: number; // degrees, +up / -down
  boost: boolean;
  jump: boolean;
  jumpDir?: JumpDirectionMode;
  jumpBurnSec?: number;
  fireRightArm: boolean;
  fireLeftArm: boolean;
  fireRightShoulder: boolean;
  fireLeftShoulder: boolean;
  emergencyCool: boolean;
  overrideShutdown?: boolean;
  lockTargetId?: string | null;
}

export interface VisibleEnemyInfo {
  id: string;
  teamId: string;
  distance: number;
  bearingDeg: number; // world bearing 0=N, 90=E
  relBearingDeg: number; // relative to leg yaw (-180..180)
  torsoRelBearingDeg: number; // relative to torso world yaw (-180..180)
  elevationDiff: number; // enemy.z - self.z
  isFlank: boolean;
  totalHpRatio: number;
  inVisualFov: boolean;
  hasLineOfSight: boolean;
  allySpotted: boolean;
}

export interface MechSensorState {
  mechId: string;
  teamId: string;
  tick: number;
  time: number;
  position: Vec3;
  yawDeg: number;
  torsoYawDeg: number;
  torsoYawOffsetDeg: number;
  effectiveRadarRange: number;
  effectiveOmniRadarScale: number;
  effectiveVisionFovHalfDeg: number;
  grounded: boolean;
  enRatio: number;
  enOverheated: boolean;
  heatRatio: number;
  thermalShutdown: boolean;
  overrideShutdownActive: boolean;
  emptyAmmoSlots: WeaponSlotId[];
  anyAmmoEmpty: boolean;
  torsoHpRatio: number;
  totalHpRatio: number;
  incomingFire: boolean;
  incomingFireRelBearingDeg: number | null;
  incomingMissile: boolean;
  lockTargetId: string | null;
  lockProgressRatio: number;
  targetLocked: boolean;
  ecmActive: boolean;
  ecmJammed: boolean;
  bapActive: boolean;
  obstacleAhead: boolean;
  destroyedParts: MechPartId[];
  visibleEnemies: VisibleEnemyInfo[];
  radarContacts: VisibleEnemyInfo[];
  nearestEnemy: VisibleEnemyInfo | null;
  nearestRadarEnemy: VisibleEnemyInfo | null;
  nearestFlankEnemy: VisibleEnemyInfo | null;
}

export interface SalvoQueueItem {
  slot: WeaponSlotId;
  weaponId: string;
  remainingShots: number;
  ticksUntilNext: number;
  targetId: string | null;
  isIndirect: boolean;
  guided: boolean;
}

export interface MechRuntimeState {
  id: string;
  name: string;
  teamId: string;
  slotIndex: number;
  color: string;
  blueprint: MechBlueprint;
  stats: MechComputedStats;
  pos: Vec3;
  vel: Vec3;
  yawDeg: number;
  torsoYawOffsetDeg: number;
  pitchDeg: number;
  grounded: boolean;
  alive: boolean;
  destroyedReason: 'torso_destroyed' | 'head_destroyed' | 'heat_meltdown' | null;
  en: number;
  maxEn: number;
  enOverheated: boolean;
  heat: number;
  maxHeat: number;
  heatDissipationPerSec: number;
  thermalShutdown: boolean;
  overrideShutdownActive: boolean;
  overheatDamageTaken: number;
  parts: MechPartsRuntimeState;
  weapons: Record<WeaponSlotId, WeaponSlotRuntimeState>;
  rngState: number;
  lastHitTick: number;
  lastAttackerId: string | null;
  lastHitRelBearingDeg: number | null;
  lockTargetId: string | null;
  lockProgressSec: number;
  lockRequiredSec: number;
  lockDecayGraceSec: number;
  lockComplete: boolean;
  ecmDisruptedTicks: number;
  jumpBurnRemainingSec: number;
  jumpDir: JumpDirectionMode;
  salvoQueue: SalvoQueueItem[];
  damageDealt: number;
  damageTaken: number;
  kills: number;
}

export interface ProjectileState {
  id: number;
  ownerId: string;
  teamId: string;
  slot: WeaponSlotId;
  weaponId: string;
  kind: WeaponKind;
  pos: Vec3;
  vel: Vec3;
  gravity: number;
  damage: number;
  canRicochet: boolean;
  ricochetAngleDeg: number;
  homingTurnDegPerSec: number;
  targetId: string | null;
  distanceTraveled: number;
  optimalRange: number;
  maxRange: number;
  ttlTicks: number;
  hp: number;
  loftTicksRemaining: number;
}

export interface ActiveBeamState {
  id: number;
  ownerId: string;
  teamId: string;
  slot: WeaponSlotId;
  weaponId: string;
  targetId: string | null;
  originPos: Vec3;
  endPos: Vec3;
  damagePerTick: number;
  optimalRange: number;
  maxRange: number;
  ticksRemaining: number;
  totalTicks: number;
  spreadYawOffset: number;
  spreadPitchOffset: number;
  color: string;
}

export type SimCombatEventType =
  | 'fire'
  | 'hit'
  | 'ricochet'
  | 'part_destroyed'
  | 'mech_destroyed'
  | 'en_overheat'
  | 'thermal_shutdown'
  | 'heat_damage'
  | 'terrain_hit'
  | 'missile_intercepted'
  | 'ecm_disrupted';

export interface SimCombatEvent {
  tick: number;
  type: SimCombatEventType;
  actorId: string;
  targetId?: string;
  partId?: MechPartId;
  face?: ArmorFace;
  damage?: number;
  pos: Vec3;
  endPos?: Vec3;
  detail?: string;
}

export interface MatchRules {
  maxSeconds: number;
  friendlyFire: boolean;
  headDestructionKills: boolean;
  arenaPreset: ArenaPresetId;
  arenaWidth: number;
  arenaDepth: number;
}

export interface MatchParticipantEntry {
  id: string;
  name: string;
  teamId: string;
  blueprint: MechBlueprint;
  pilot?: PilotProfile;
}

export interface MatchConfig {
  seed?: number;
  rules?: Partial<MatchRules>;
  entries: MatchParticipantEntry[];
}

export interface SimState {
  tick: number;
  time: number;
  matchSeed: number;
  rules: MatchRules;
  terrain: TerrainConfig;
  mechs: MechRuntimeState[];
  projectiles: ProjectileState[];
  nextProjectileId: number;
  activeBeams: ActiveBeamState[];
  nextBeamId: number;
  events: SimCombatEvent[];
  lastTickEvents: SimCombatEvent[];
  finished: boolean;
  winnerTeamId: string | null;
}
