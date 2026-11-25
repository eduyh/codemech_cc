import {
  ARM_WEAPONS,
  MAX_EXTRA_AMMO_TONS,
  MAX_EXTRA_HEAT_SINKS,
  SHOULDER_WEAPONS,
  buildDefaultWeaponGroups,
  clampArmorAllocationToChassis,
  getArmWeaponSpec,
  getChassisSpec,
  getResolvedWeaponGroups,
  getShoulderWeaponSpec,
  getWeaponMaxMountCount,
  inferChassisIdFromParts,
  resolveLegacyWeaponId,
} from '../data/parts';
import { DEFAULT_PILOT_PROFILE, PRESET_VANGUARD } from '../data/presets';
import { clamp, normalizeMatchSeed } from '../engine/math';
import {
  ArenaPresetId,
  MECH_SUBROUTINE_SLOT_SPECS,
  MatchRules,
  MechBlueprint,
  MechSubroutine,
  MechSubroutineSlotId,
  PilotProfile,
  WeaponSlotId,
} from '../types/mech';
import {
  decodeFramedJson,
  encodeFramedJson,
  sanitizeWrappedCode,
  wrapCodeLines,
} from './shareCodec';

export const MECH_SHARE_PREFIX = 'CMM1-';
export const MECH_BATTLE_ONLY_PREFIX = 'CMM1B-';
export const PILOT_SHARE_PREFIX = 'CMP1-';
export const RULE_SHARE_PREFIX = 'CMR1-';
export const CHALLENGE_SHARE_PREFIX = 'CMC1-';
export const REPLAY_SHARE_PREFIX = 'CMW1-';

export const MAX_MECH_PAYLOAD_BYTES = 128 * 1024;
export const MAX_RULE_PAYLOAD_BYTES = 32 * 1024;
export const MAX_CHALLENGE_PAYLOAD_BYTES = 256 * 1024;
export const MAX_REPLAY_PAYLOAD_BYTES = 1024 * 1024;

const CODEPANZER_PREFIXES = ['VST1-', 'VST2-', 'VST2B-', 'VSR2-', 'VSC2-', 'VSM2-'];

const MASK_SEEDS: Record<string, number> = {
  [MECH_SHARE_PREFIX]: 0x6a09e667,
  [MECH_BATTLE_ONLY_PREFIX]: 0xbb67ae85,
  [PILOT_SHARE_PREFIX]: 0x3c6ef372,
  [RULE_SHARE_PREFIX]: 0xa54ff53a,
  [CHALLENGE_SHARE_PREFIX]: 0x510e527f,
  [REPLAY_SHARE_PREFIX]: 0x9b05688c,
};

export type BattlefieldFormat = 'team_match' | 'battle_royale' | 'tournament' | 'short_league';

export interface BattlefieldRuleConfig {
  format: BattlefieldFormat;
  arenaPreset: ArenaPresetId;
  maxSeconds: number;
  friendlyFire: boolean;
  headDestructionKills: boolean;
  teamUnitSize: number;
  leagueMaxRounds: number;
  randomizeSeedPerMatch: boolean;
}

export const DEFAULT_BATTLEFIELD_RULE: BattlefieldRuleConfig = {
  format: 'team_match',
  arenaPreset: 'plains_ridge',
  maxSeconds: 240,
  friendlyFire: false,
  headDestructionKills: true,
  teamUnitSize: 3,
  leagueMaxRounds: 3,
  randomizeSeedPerMatch: false,
};

export interface MechPackageData {
  mech: MechBlueprint;
  pilot: PilotProfile;
  battleOnly?: boolean;
  teamTag?: string;
}

export interface RulePackageData {
  title: string;
  comment?: string;
  rule: BattlefieldRuleConfig;
}

export interface ChallengePackageData {
  title: string;
  comment?: string;
  teamTag?: string;
  challengers: MechPackageData[];
  rule?: BattlefieldRuleConfig;
  matchSeed?: number;
}

export interface ReplayParticipantData {
  id: string;
  name: string;
  teamId: string;
  mech: MechBlueprint;
  pilot: PilotProfile;
  battleOnly?: boolean;
}

export interface ReplayPackageData {
  title: string;
  recordedAt: string;
  matchSeed: number;
  rules: MatchRules;
  participants: ReplayParticipantData[];
}

export interface ExtractedMechCandidate {
  code: string;
  mech: MechBlueprint;
  pilot: PilotProfile;
  battleOnly: boolean;
  teamTag: string;
  sourceOrder: number;
}

export interface BulkExtractWarning {
  token: string;
  reason: string;
}

export interface BulkExtractResult {
  candidates: ExtractedMechCandidate[];
  warnings: BulkExtractWarning[];
}

function assertNotCodePanzerCode(raw: string): void {
  const cleaned = sanitizeWrappedCode(raw);
  if (CODEPANZER_PREFIXES.some((p) => cleaned.startsWith(p))) {
    throw new Error('CodePanzer 用のコードです（CodeMech には読み込めません）');
  }
}

export type ShareCodeKind =
  | 'battle_only'
  | 'mech'
  | 'pilot'
  | 'challenge'
  | 'rule'
  | 'replay'
  | 'json'
  | 'unknown';

export function detectShareCodeKind(raw: string): ShareCodeKind {
  const trimmed = String(raw ?? '').trim();
  if (trimmed.startsWith('{')) return 'json';
  const cleaned = sanitizeWrappedCode(trimmed);
  if (cleaned.startsWith(MECH_BATTLE_ONLY_PREFIX)) return 'battle_only';
  if (cleaned.startsWith(MECH_SHARE_PREFIX)) return 'mech';
  if (cleaned.startsWith(PILOT_SHARE_PREFIX)) return 'pilot';
  if (cleaned.startsWith(CHALLENGE_SHARE_PREFIX)) return 'challenge';
  if (cleaned.startsWith(RULE_SHARE_PREFIX)) return 'rule';
  if (cleaned.startsWith(REPLAY_SHARE_PREFIX)) return 'replay';
  return 'unknown';
}

function pickId<T extends { id: string }>(list: readonly T[], id: unknown, fallback: string): string {
  return typeof id === 'string' && list.some((item) => item.id === id) ? id : fallback;
}

export function validateAndRepairMechBlueprint(raw: MechBlueprint): MechBlueprint {
  const def = PRESET_VANGUARD;
  const resolvedChassisId =
    typeof raw?.chassisId === 'string' && raw.chassisId.trim()
      ? raw.chassisId.trim()
      : inferChassisIdFromParts(raw?.parts);
  const chassis = getChassisSpec(resolvedChassisId);
  const boosterEnabled = chassis.hasJumpBoosterMount
    ? typeof raw?.boosterEnabled === 'boolean'
      ? raw.boosterEnabled
      : raw?.parts?.booster !== 'boost_none'
    : false;
  const ecmEnabled = chassis.hasEcmMount ? Boolean(raw?.ecmEnabled) : false;
  const lrmFireMode = raw?.lrmFireMode === 'stream' ? 'stream' : 'salvo';

  let rightShoulderWeapon = pickId(
    SHOULDER_WEAPONS,
    typeof raw?.parts?.rightShoulderWeapon === 'string'
      ? resolveLegacyWeaponId(raw.parts.rightShoulderWeapon)
      : undefined,
    def.parts.rightShoulderWeapon
  );
  let leftShoulderWeapon = pickId(
    SHOULDER_WEAPONS,
    typeof raw?.parts?.leftShoulderWeapon === 'string'
      ? resolveLegacyWeaponId(raw.parts.leftShoulderWeapon)
      : undefined,
    def.parts.leftShoulderWeapon
  );
  if (!chassis.hasEcmMount) {
    if (getShoulderWeaponSpec(rightShoulderWeapon).requiresEcmChassis) {
      rightShoulderWeapon = 'shd_none';
    }
    if (getShoulderWeaponSpec(leftShoulderWeapon).requiresEcmChassis) {
      leftShoulderWeapon = 'shd_none';
    }
  }

  const parts = {
    head: chassis.headPartId,
    torso: chassis.torsoPartId,
    rightShoulderMount: chassis.rightShoulderMountId,
    leftShoulderMount: chassis.leftShoulderMountId,
    rightArmWeapon: pickId(
      ARM_WEAPONS,
      typeof raw?.parts?.rightArmWeapon === 'string'
        ? resolveLegacyWeaponId(raw.parts.rightArmWeapon)
        : undefined,
      def.parts.rightArmWeapon
    ),
    leftArmWeapon: pickId(
      ARM_WEAPONS,
      typeof raw?.parts?.leftArmWeapon === 'string'
        ? resolveLegacyWeaponId(raw.parts.leftArmWeapon)
        : undefined,
      def.parts.leftArmWeapon
    ),
    rightShoulderWeapon,
    leftShoulderWeapon,
    legs: chassis.legPartId,
    booster:
      chassis.hasJumpBoosterMount && boosterEnabled && chassis.boosterSpecId
        ? chassis.boosterSpecId
        : 'boost_none',
  };

  const a = raw?.armor ?? def.armor;
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const extraHeatSinks =
    typeof raw?.extraHeatSinks === 'number' && Number.isFinite(raw.extraHeatSinks)
      ? clamp(Math.round(raw.extraHeatSinks), 0, MAX_EXTRA_HEAT_SINKS)
      : 0;

  const extraAmmo: Partial<Record<WeaponSlotId, number>> = {};
  const slotWeapons = {
    rightArm: getArmWeaponSpec(parts.rightArmWeapon),
    leftArm: getArmWeaponSpec(parts.leftArmWeapon),
    rightShoulder: getShoulderWeaponSpec(parts.rightShoulderWeapon),
    leftShoulder: getShoulderWeaponSpec(parts.leftShoulderWeapon),
  };
  const slotList: WeaponSlotId[] = ['rightArm', 'leftArm', 'rightShoulder', 'leftShoulder'];
  const weaponMountCounts: Partial<Record<WeaponSlotId, 1 | 2 | 3>> = {};
  for (const slot of slotList) {
    const val = raw?.extraAmmo?.[slot];
    if (slotWeapons[slot].maxAmmo > 0 && typeof val === 'number' && Number.isFinite(val)) {
      const clamped = clamp(Math.round(val), 0, MAX_EXTRA_AMMO_TONS);
      if (clamped > 0) extraAmmo[slot] = clamped;
    }
    const maxMount = getWeaponMaxMountCount(slotWeapons[slot]);
    const rawMount = raw?.weaponMountCounts?.[slot];
    if (maxMount > 1 && typeof rawMount === 'number' && Number.isFinite(rawMount)) {
      const mc = clamp(Math.round(rawMount), 1, maxMount) as 1 | 2 | 3;
      if (mc > 1) weaponMountCounts[slot] = mc;
    }
  }

  const rawRomSlots = (raw as { romSlots?: Record<string, unknown> })?.romSlots;
  const romSlots: Partial<Record<MechSubroutineSlotId, string | null>> = {};
  if (rawRomSlots && typeof rawRomSlots === 'object') {
    for (const spec of MECH_SUBROUTINE_SLOT_SPECS) {
      const v = rawRomSlots[spec.slotId];
      if (v === null) {
        romSlots[spec.slotId] = null;
      } else if (typeof v === 'string' && v.trim()) {
        romSlots[spec.slotId] = v.trim().slice(0, 64);
      }
    }
  }
  const hasRomSlots = Object.keys(romSlots).length > 0;

  const fallbackSubroutines = structuredClone(def.subroutines);
  const rawSubs = Array.isArray((raw as { subroutines?: unknown })?.subroutines)
    ? (raw as { subroutines: MechSubroutine[] }).subroutines
    : [];
  const subroutines: MechSubroutine[] = [];
  for (let idx = 0; idx < MECH_SUBROUTINE_SLOT_SPECS.length; idx++) {
    const spec = MECH_SUBROUTINE_SLOT_SPECS[idx];
    if (romSlots[spec.slotId] === null) continue;
    const found = rawSubs.find((s) => s?.slotId === spec.slotId);
    const fb = fallbackSubroutines[idx];
    if (!found || !Array.isArray(found.cells)) {
      if (hasRomSlots && typeof romSlots[spec.slotId] === 'string') continue;
      if (fb) subroutines.push(fb);
      continue;
    }
    const subGridSize: 4 = 4;
    const validCells = found.cells
      .filter(
        (c) =>
          c &&
          typeof c.row === 'number' &&
          typeof c.col === 'number' &&
          c.row >= 0 &&
          c.row < subGridSize &&
          c.col >= 0 &&
          c.col < subGridSize &&
          typeof c.op === 'string' &&
          c.op !== 'empty'
      )
      .slice(0, subGridSize * subGridSize);
    const category =
      found.category === 'attack' || found.category === 'move' || found.category === 'control'
        ? found.category
        : undefined;
    subroutines.push({
      slotId: spec.slotId,
      name:
        typeof found.name === 'string' && found.name.trim()
          ? found.name.trim().slice(0, 32)
          : fb?.name ?? spec.defaultName,
      ...(category ? { category } : {}),
      gridSize: subGridSize,
      cells: validCells.length > 0 ? validCells : fb?.cells ?? [{ row: 0, col: 0, op: 'start', dir: 'E' }],
    });
  }

  const controlTier =
    raw?.controlTier === 'direct_4x4' || raw?.controlTier === 'direct_6x6'
      ? ('direct_4x4' as const)
      : raw?.controlTier === 'pilot_full'
        ? ('pilot_full' as const)
        : undefined;

  return {
    version: 2,
    id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 64) : def.id,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : def.name,
    authorName: typeof raw?.authorName === 'string' ? raw.authorName.trim().slice(0, 40) : undefined,
    color: typeof raw?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : def.color,
    chassisId: chassis.id,
    ...(controlTier && controlTier !== 'pilot_full' ? { controlTier } : {}),
    ...(hasRomSlots ? { romSlots } : {}),
    boosterEnabled,
    ecmEnabled,
    lrmFireMode,
    extraHeatSinks,
    ...(Object.keys(extraAmmo).length > 0 ? { extraAmmo } : {}),
    ...(Object.keys(weaponMountCounts).length > 0 ? { weaponMountCounts } : {}),
    parts,
    weaponGroups: raw?.weaponGroups
      ? getResolvedWeaponGroups({ parts, weaponGroups: raw.weaponGroups })
      : buildDefaultWeaponGroups(parts),
    armor: clampArmorAllocationToChassis(chassis, {
      head: num(a.head, def.armor.head),
      torsoFront: num(a.torsoFront, def.armor.torsoFront),
      torsoRear: num(a.torsoRear, def.armor.torsoRear),
      rightShoulderFront: num(a.rightShoulderFront, def.armor.rightShoulderFront),
      rightShoulderRear: num(a.rightShoulderRear, def.armor.rightShoulderRear),
      leftShoulderFront: num(a.leftShoulderFront, def.armor.leftShoulderFront),
      leftShoulderRear: num(a.leftShoulderRear, def.armor.leftShoulderRear),
      rightArm: num(a.rightArm, def.armor.rightArm),
      leftArm: num(a.leftArm, def.armor.leftArm),
      rightLeg: num(a.rightLeg, def.armor.rightLeg),
      leftLeg: num(a.leftLeg, def.armor.leftLeg),
    }),
    subroutines,
  };
}

export function validateAndRepairPilotProfile(raw: PilotProfile): PilotProfile {
  const def = DEFAULT_PILOT_PROFILE;
  const rawCells = raw?.grid?.cells;
  const cleanCells = Array.isArray(rawCells)
    ? rawCells
        .filter(
          (c) =>
            c &&
            typeof c.row === 'number' &&
            typeof c.col === 'number' &&
            c.row >= 0 &&
            c.row < 6 &&
            c.col >= 0 &&
            c.col < 6 &&
            typeof c.op === 'string' &&
            c.op !== 'empty'
        )
        .slice(0, 36)
    : [];

  return {
    version: 2,
    id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id : def.id,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.slice(0, 40) : def.name,
    authorName: typeof raw?.authorName === 'string' ? raw.authorName.slice(0, 40) : undefined,
    grid: {
      gridSize: 6,
      cells: cleanCells.length > 0 ? cleanCells : structuredClone(def.grid.cells),
    },
  };
}

export function normalizeBattlefieldRule(raw?: Partial<BattlefieldRuleConfig>): BattlefieldRuleConfig {
  const validFormats = new Set<BattlefieldFormat>([
    'team_match',
    'battle_royale',
    'tournament',
    'short_league',
  ]);
  const validArenas = new Set<ArenaPresetId>([
    'plains_ridge',
    'twin_mesas',
    'urban_pillars',
    'valley_basin',
  ]);

  return {
    format: raw?.format && validFormats.has(raw.format) ? raw.format : DEFAULT_BATTLEFIELD_RULE.format,
    arenaPreset:
      raw?.arenaPreset && validArenas.has(raw.arenaPreset)
        ? raw.arenaPreset
        : DEFAULT_BATTLEFIELD_RULE.arenaPreset,
    maxSeconds: clamp(raw?.maxSeconds ?? DEFAULT_BATTLEFIELD_RULE.maxSeconds, 30, 600),
    friendlyFire: Boolean(raw?.friendlyFire),
    headDestructionKills: raw?.headDestructionKills ?? true,
    teamUnitSize: clamp(Math.round(raw?.teamUnitSize ?? DEFAULT_BATTLEFIELD_RULE.teamUnitSize), 1, 6),
    leagueMaxRounds: clamp(Math.round(raw?.leagueMaxRounds ?? DEFAULT_BATTLEFIELD_RULE.leagueMaxRounds), 1, 10),
    randomizeSeedPerMatch: Boolean(raw?.randomizeSeedPerMatch),
  };
}

/* -------------------------------------------------------------------------- */
/* Encoders & Decoders (CMM1-, CMM1B-, CMP1-, CMR1-, CMC1-, CMW1-)            */
/* -------------------------------------------------------------------------- */

export function encodeMechCode(
  pkg: MechPackageData,
  opts?: { battleOnly?: boolean }
): string {
  const battleOnly = Boolean(opts?.battleOnly ?? pkg.battleOnly);
  const prefix = battleOnly ? MECH_BATTLE_ONLY_PREFIX : MECH_SHARE_PREFIX;
  const cleanPayload: MechPackageData = {
    mech: validateAndRepairMechBlueprint(pkg.mech),
    pilot: validateAndRepairPilotProfile(pkg.pilot),
    battleOnly: battleOnly || undefined,
    teamTag: pkg.teamTag?.trim() ? pkg.teamTag.trim().slice(0, 24) : undefined,
  };
  return encodeFramedJson(prefix, cleanPayload, {
    obfuscate: battleOnly,
    maskSeed: MASK_SEEDS[prefix],
  });
}

export function decodeMechCode(raw: string): MechPackageData {
  assertNotCodePanzerCode(raw);
  const { prefix, data } = decodeFramedJson<MechPackageData>(
    raw,
    [MECH_SHARE_PREFIX, MECH_BATTLE_ONLY_PREFIX],
    MAX_MECH_PAYLOAD_BYTES,
    MASK_SEEDS
  );
  if (!data?.mech || !data?.pilot) {
    throw new Error('機体またはパイロットデータが不足しています');
  }
  const battleOnly = prefix === MECH_BATTLE_ONLY_PREFIX || Boolean(data.battleOnly);
  return {
    mech: validateAndRepairMechBlueprint(data.mech),
    pilot: validateAndRepairPilotProfile(data.pilot),
    battleOnly,
    teamTag: data.teamTag,
  };
}

export function encodePilotCode(pilot: PilotProfile): string {
  return encodeFramedJson(PILOT_SHARE_PREFIX, validateAndRepairPilotProfile(pilot), {
    obfuscate: false,
    maskSeed: MASK_SEEDS[PILOT_SHARE_PREFIX],
  });
}

export function decodePilotCode(raw: string): PilotProfile {
  assertNotCodePanzerCode(raw);
  const { data } = decodeFramedJson<PilotProfile>(
    raw,
    [PILOT_SHARE_PREFIX],
    MAX_MECH_PAYLOAD_BYTES,
    MASK_SEEDS
  );
  return validateAndRepairPilotProfile(data);
}

export function encodeRuleCode(pkg: RulePackageData): string {
  const clean: RulePackageData = {
    title: pkg.title.trim() || 'CodeMech 大会ルール',
    comment: pkg.comment?.trim() || undefined,
    rule: normalizeBattlefieldRule(pkg.rule),
  };
  return encodeFramedJson(RULE_SHARE_PREFIX, clean, {
    obfuscate: false,
    maskSeed: MASK_SEEDS[RULE_SHARE_PREFIX],
  });
}

export function decodeRuleCode(raw: string): RulePackageData {
  assertNotCodePanzerCode(raw);
  const { data } = decodeFramedJson<RulePackageData>(
    raw,
    [RULE_SHARE_PREFIX],
    MAX_RULE_PAYLOAD_BYTES,
    MASK_SEEDS
  );
  return {
    title: data.title || 'CodeMech 大会ルール',
    comment: data.comment,
    rule: normalizeBattlefieldRule(data.rule),
  };
}

export function encodeChallengeCode(pkg: ChallengePackageData): string {
  if (!pkg.challengers || pkg.challengers.length === 0 || pkg.challengers.length > 3) {
    throw new Error('挑戦状には 1〜3 機の機体が必要です');
  }
  const clean: ChallengePackageData = {
    title: pkg.title.trim() || 'CodeMech 挑戦状',
    comment: pkg.comment?.trim() || undefined,
    teamTag: pkg.teamTag?.trim() || undefined,
    challengers: pkg.challengers.map((c) => ({
      mech: validateAndRepairMechBlueprint(c.mech),
      pilot: validateAndRepairPilotProfile(c.pilot),
      battleOnly: c.battleOnly || undefined,
      teamTag: c.teamTag,
    })),
    rule: pkg.rule ? normalizeBattlefieldRule(pkg.rule) : undefined,
    matchSeed: pkg.matchSeed !== undefined ? normalizeMatchSeed(pkg.matchSeed) : undefined,
  };
  return encodeFramedJson(CHALLENGE_SHARE_PREFIX, clean, {
    obfuscate: true,
    maskSeed: MASK_SEEDS[CHALLENGE_SHARE_PREFIX],
  });
}

export function decodeChallengeCode(raw: string): ChallengePackageData {
  assertNotCodePanzerCode(raw);
  const { data } = decodeFramedJson<ChallengePackageData>(
    raw,
    [CHALLENGE_SHARE_PREFIX],
    MAX_CHALLENGE_PAYLOAD_BYTES,
    MASK_SEEDS
  );
  if (!Array.isArray(data?.challengers) || data.challengers.length === 0) {
    throw new Error('挑戦状に機体が含まれていません');
  }
  return {
    title: data.title || 'CodeMech 挑戦状',
    comment: data.comment,
    teamTag: data.teamTag,
    challengers: data.challengers.slice(0, 3).map((c) => ({
      mech: validateAndRepairMechBlueprint(c.mech),
      pilot: validateAndRepairPilotProfile(c.pilot),
      battleOnly: Boolean(c.battleOnly),
      teamTag: c.teamTag,
    })),
    rule: data.rule ? normalizeBattlefieldRule(data.rule) : undefined,
    matchSeed: data.matchSeed,
  };
}

export function encodeReplayCode(replay: ReplayPackageData): string {
  return encodeFramedJson(REPLAY_SHARE_PREFIX, replay, {
    obfuscate: false,
    maskSeed: MASK_SEEDS[REPLAY_SHARE_PREFIX],
  });
}

export function decodeReplayCode(raw: string): ReplayPackageData {
  assertNotCodePanzerCode(raw);
  const { data } = decodeFramedJson<ReplayPackageData>(
    raw,
    [REPLAY_SHARE_PREFIX],
    MAX_REPLAY_PAYLOAD_BYTES,
    MASK_SEEDS
  );
  if (!Array.isArray(data?.participants) || data.participants.length === 0) {
    throw new Error('リプレイに参加機体データがありません');
  }
  return {
    ...data,
    participants: data.participants.map((p) => ({
      ...p,
      mech: validateAndRepairMechBlueprint(p.mech),
      pilot: validateAndRepairPilotProfile(p.pilot),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Bulk Chat/Email Extraction & Deduplication & File Serialization            */
/* -------------------------------------------------------------------------- */

function findNearbyTeamTag(contextWindow: string): string {
  const hashMatch = contextWindow.match(/#([^\s#@:[\]()<>「」]+)/);
  if (hashMatch) return hashMatch[1].trim().slice(0, 24);

  const labelMatch = contextWindow.match(/(?:チーム|Team|班)\s*[:：]\s*([^\s\n\r]+)/i);
  if (labelMatch) return labelMatch[1].trim().slice(0, 24);

  const bracketMatch = contextWindow.match(/\[([^\[\]\n\r]{1,20})\]/);
  if (bracketMatch && !bracketMatch[1].includes('CodeMech')) {
    return bracketMatch[1].trim();
  }
  return '';
}

export function extractMechCodesFromText(text: string): BulkExtractResult {
  const candidates: ExtractedMechCandidate[] = [];
  const warnings: BulkExtractWarning[] = [];
  const seenTokens = new Set<string>();
  let order = 0;

  // Check for CodePanzer leakage first
  const cpMatches = text.match(/\bVST[12]B?-[A-Za-z0-9_.\-\s]{8,}/g);
  if (cpMatches) {
    warnings.push({
      token: cpMatches[0].slice(0, 24),
      reason: 'CodePanzer 用のコードが混入しています（CodeMech 専用コード CMM1- / CMM1B- が必要です）',
    });
  }

  // 1. Extract >>>...<<< wrapped blocks (resilient to chat/mail line wrapping)
  const blockRegex = />>>([\s\S]*?)<<</g;
  let maskedText = text;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(text)) !== null) {
    const rawBlock = blockMatch[0];
    const startIdx = blockMatch.index;
    const contextBefore = text.slice(Math.max(0, startIdx - 140), startIdx);
    const cleaned = sanitizeWrappedCode(rawBlock);
    if (!cleaned.startsWith(MECH_SHARE_PREFIX) && !cleaned.startsWith(MECH_BATTLE_ONLY_PREFIX)) {
      continue;
    }

    seenTokens.add(cleaned);
    maskedText = maskedText.replace(rawBlock, ' ');
    try {
      const pkg = decodeMechCode(cleaned);
      candidates.push({
        code: cleaned,
        mech: pkg.mech,
        pilot: pkg.pilot,
        battleOnly: Boolean(pkg.battleOnly),
        teamTag: pkg.teamTag || findNearbyTeamTag(contextBefore) || '',
        sourceOrder: order++,
      });
    } catch (err) {
      warnings.push({
        token: cleaned.slice(0, 28) + '...',
        reason: err instanceof Error ? err.message : 'デコードに失敗しました',
      });
    }
  }

  // 2. Extract raw single-line CMM1- / CMM1B- tokens
  const rawTokenRegex = /CMM1B?-[A-Za-z0-9_-]+(?:\.[0-9A-Fa-f]{4})?/g;
  let tokMatch: RegExpExecArray | null;
  while ((tokMatch = rawTokenRegex.exec(maskedText)) !== null) {
    const token = tokMatch[0];
    if (seenTokens.has(token)) continue;
    seenTokens.add(token);

    const contextBefore = maskedText.slice(Math.max(0, tokMatch.index - 120), tokMatch.index);
    try {
      const pkg = decodeMechCode(token);
      candidates.push({
        code: token,
        mech: pkg.mech,
        pilot: pkg.pilot,
        battleOnly: Boolean(pkg.battleOnly),
        teamTag: pkg.teamTag || findNearbyTeamTag(contextBefore) || '',
        sourceOrder: order++,
      });
    } catch (err) {
      warnings.push({
        token: token.slice(0, 28) + '...',
        reason: err instanceof Error ? err.message : 'デコードに失敗しました',
      });
    }
  }

  return { candidates, warnings };
}

export function deduplicateExtractedCandidates(
  candidates: ExtractedMechCandidate[],
  strategy: 'latest' | 'all'
): ExtractedMechCandidate[] {
  if (strategy === 'all') return candidates.slice();

  const map = new Map<string, ExtractedMechCandidate>();
  for (const cand of candidates) {
    const key = `${(cand.mech.authorName ?? '').trim()}::${cand.mech.name.trim()}`;
    const existing = map.get(key);
    if (!existing || cand.sourceOrder >= existing.sourceOrder) {
      map.set(key, cand);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.sourceOrder - b.sourceOrder);
}

export function formatMechSubmissionText(pkg: MechPackageData): string {
  const code = encodeMechCode(pkg);
  const tagLine = pkg.teamTag?.trim() ? ` #${pkg.teamTag.trim()}` : '';
  const modeNote = pkg.battleOnly ? ' [対戦専用・中身非公開]' : '';
  return [
    `【CodeMech 機体提出】${pkg.mech.name}${modeNote}${tagLine}`,
    `>>>${wrapCodeLines(code, 72)}<<<`,
  ].join('\n');
}

export function formatRuleCardText(pkg: RulePackageData): string {
  const code = encodeRuleCode(pkg);
  return [
    `【CodeMech 大会ルール】${pkg.title}`,
    pkg.comment ? pkg.comment : '',
    `>>>${wrapCodeLines(code, 72)}<<<`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatReplayCardText(replay: ReplayPackageData): string {
  const code = encodeReplayCode(replay);
  return [
    `【CodeMech リプレイ】${replay.title} (Seed:${replay.matchSeed})`,
    `>>>${wrapCodeLines(code, 72)}<<<`,
  ].join('\n');
}

export function serializeMechFile(pkg: MechPackageData): string {
  return JSON.stringify(
    {
      format: 'codemech.mech_package.v1',
      mech: validateAndRepairMechBlueprint(pkg.mech),
      pilot: validateAndRepairPilotProfile(pkg.pilot),
      battleOnly: Boolean(pkg.battleOnly),
      teamTag: pkg.teamTag,
    },
    null,
    2
  );
}

export function parseMechFileText(raw: string): MechPackageData {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // Supports either { mech, pilot } package or raw .cmmech.json MechBlueprint
  if (parsed && typeof parsed === 'object' && 'mech' in parsed && 'pilot' in parsed) {
    return {
      mech: validateAndRepairMechBlueprint(parsed.mech as MechBlueprint),
      pilot: validateAndRepairPilotProfile(parsed.pilot as PilotProfile),
      battleOnly: Boolean(parsed.battleOnly),
      teamTag: typeof parsed.teamTag === 'string' ? parsed.teamTag : undefined,
    };
  }
  if (parsed && typeof parsed === 'object' && 'parts' in parsed && 'armor' in parsed) {
    return {
      mech: validateAndRepairMechBlueprint(parsed as unknown as MechBlueprint),
      pilot: structuredClone(DEFAULT_PILOT_PROFILE),
      battleOnly: false,
    };
  }
  throw new Error('対応していない機体 JSON 形式です');
}

export function serializeReplayFile(replay: ReplayPackageData): string {
  return JSON.stringify(
    {
      format: 'codemech.replay.v1',
      ...replay,
    },
    null,
    2
  );
}

export function parseReplayFileText(raw: string): ReplayPackageData {
  const parsed = JSON.parse(raw) as ReplayPackageData;
  if (!Array.isArray(parsed?.participants) || parsed.participants.length === 0) {
    throw new Error('有効なリプレイデータではありません');
  }
  return {
    ...parsed,
    participants: parsed.participants.map((p) => ({
      ...p,
      mech: validateAndRepairMechBlueprint(p.mech),
      pilot: validateAndRepairPilotProfile(p.pilot),
    })),
  };
}
