import { useEffect, useRef, useState } from 'react';
import {
  SavedCustomMech,
  extractCustomTagFromName,
  formatCustomMechName,
  getBaseMechName,
  normalizeCustomTag,
} from '../utils/customMechStorage';
import {
  ROM_CATEGORY_SPECS,
  analyzeMechRomCompatibility,
  findRomById,
  formatRomLabel,
  getRomCategory,
  getRomFeatureTags,
  resolveMechBlueprintRoms,
} from '../utils/romLibrary';
import { MechPaperdoll } from './MechPaperdoll';
import {
  ARM_WEAPONS,
  CONTROL_TIER_CATALOG,
  HEAT_SINK_DISSIPATION_PER_UNIT,
  MAX_EXTRA_AMMO_TONS,
  MAX_EXTRA_HEAT_SINKS,
  MECH_CHASSIS_CATALOG,
  ROM_WEIGHT_4X4,
  SHOULDER_WEAPONS,
  applyChassisToBlueprint,
  clampArmorAllocationToChassis,
  computeMechStats,
  getArmWeaponSpec,
  getChassisMaxTotalArmorPoints,
  getChassisSpec,
  getControlTierSpec,
  getResolvedWeaponGroups,
  getShoulderWeaponSpec,
  getWeaponGroupSummary,
  getWeaponMaxMountCount,
  getWeaponSlotExtraAmmoTons,
  getWeaponSlotMountCount,
  inferChassisIdFromParts,
  isPassiveModuleSpec,
} from '../data/parts';
import { STARTER_MECHS } from '../data/presets';
import { clamp } from '../engine/math';
import {
  DualArmorPartId,
  MECH_SUBROUTINE_SLOT_SPECS,
  MechArmorAllocation,
  MechBlueprint,
  MechChassisSpec,
  MechControlTier,
  MechPartId,
  MechPartsSelection,
  MechSubroutineSlotId,
  PilotProfile,
  ProgramRomEntry,
  SingleArmorPartId,
  WEAPON_GROUP_IDS,
  WeaponGroupId,
  WeaponSlotId,
} from '../types/mech';

interface MechGarageProps {
  blueprint: MechBlueprint;
  savedMechs: SavedCustomMech[];
  allRoms: readonly ProgramRomEntry[];
  pilot?: PilotProfile;
  onChange: (next: MechBlueprint) => void;
  onSaveCustomMech: (tag: string) => { saved: SavedCustomMech; updated: boolean };
  onLoadBlueprint: (bp: MechBlueprint) => void;
  onDeleteCustomMech: (id: string) => void;
}

const WEIGHT_CLASS_LABEL: Record<MechChassisSpec['weightClass'], string> = {
  light: '軽量級',
  medium: '中量級',
  heavy: '重量級',
  assault: '超重量級',
};

const DUAL_KEYS: Record<
  DualArmorPartId,
  { front: keyof MechArmorAllocation; rear: keyof MechArmorAllocation; label: string }
> = {
  torso: { front: 'torsoFront', rear: 'torsoRear', label: '中央胴' },
  rightShoulder: { front: 'rightShoulderFront', rear: 'rightShoulderRear', label: '右胴' },
  leftShoulder: { front: 'leftShoulderFront', rear: 'leftShoulderRear', label: '左胴' },
};

const SINGLE_KEYS: Record<SingleArmorPartId, { key: keyof MechArmorAllocation; label: string }> = {
  head: { key: 'head', label: '頭 (重要)' },
  rightArm: { key: 'rightArm', label: '右腕' },
  leftArm: { key: 'leftArm', label: '左腕' },
  rightLeg: { key: 'rightLeg', label: '右脚' },
  leftLeg: { key: 'leftLeg', label: '左脚' },
};

const SYMMETRIC_PAIR: Partial<Record<MechPartId, MechPartId>> = {
  rightShoulder: 'leftShoulder',
  leftShoulder: 'rightShoulder',
  rightArm: 'leftArm',
  leftArm: 'rightArm',
  rightLeg: 'leftLeg',
  leftLeg: 'rightLeg',
};

function buildPresetArmor(chassis: MechChassisSpec, frontRatio: number): MechArmorAllocation {
  const caps = chassis.maxTorsoArmorTotals;
  const split = (cap: number) => {
    const front = Math.round((cap * frontRatio) / 5) * 5;
    return { front, rear: cap - front };
  };
  const ct = split(caps.torso);
  const rt = split(caps.rightShoulder);
  const lt = split(caps.leftShoulder);
  return {
    head: chassis.maxArmor.head,
    torsoFront: ct.front,
    torsoRear: ct.rear,
    rightShoulderFront: rt.front,
    rightShoulderRear: rt.rear,
    leftShoulderFront: lt.front,
    leftShoulderRear: lt.rear,
    rightArm: chassis.maxArmor.rightArm,
    leftArm: chassis.maxArmor.leftArm,
    rightLeg: chassis.maxArmor.rightLeg,
    leftLeg: chassis.maxArmor.leftLeg,
  };
}

function scaleArmorToPoints(
  chassis: MechChassisSpec,
  base: MechArmorAllocation,
  targetPoints: number
): MechArmorAllocation {
  const maxTotal = getChassisMaxTotalArmorPoints(chassis);
  const goal = clamp(Math.floor(targetPoints / 5) * 5, 0, maxTotal);
  if (goal <= 0) {
    return {
      head: 0,
      torsoFront: 0,
      torsoRear: 0,
      rightShoulderFront: 0,
      rightShoulderRear: 0,
      leftShoulderFront: 0,
      leftShoulderRear: 0,
      rightArm: 0,
      leftArm: 0,
      rightLeg: 0,
      leftLeg: 0,
    };
  }
  const baseSum = Object.values(base).reduce((acc, v) => acc + v, 0);
  const source = baseSum > 0 ? base : buildPresetArmor(chassis, 0.78);
  const srcSum = Math.max(1, Object.values(source).reduce((acc, v) => acc + v, 0));
  const factor = goal / srcSum;

  const next = clampArmorAllocationToChassis(chassis, {
    head: Math.round((source.head * factor) / 5) * 5,
    torsoFront: Math.round((source.torsoFront * factor) / 5) * 5,
    torsoRear: Math.round((source.torsoRear * factor) / 5) * 5,
    rightShoulderFront: Math.round((source.rightShoulderFront * factor) / 5) * 5,
    rightShoulderRear: Math.round((source.rightShoulderRear * factor) / 5) * 5,
    leftShoulderFront: Math.round((source.leftShoulderFront * factor) / 5) * 5,
    leftShoulderRear: Math.round((source.leftShoulderRear * factor) / 5) * 5,
    rightArm: Math.round((source.rightArm * factor) / 5) * 5,
    leftArm: Math.round((source.leftArm * factor) / 5) * 5,
    rightLeg: Math.round((source.rightLeg * factor) / 5) * 5,
    leftLeg: Math.round((source.leftLeg * factor) / 5) * 5,
  });

  const keys: Array<keyof MechArmorAllocation> = [
    'torsoFront',
    'rightShoulderFront',
    'leftShoulderFront',
    'rightArm',
    'leftArm',
    'rightLeg',
    'leftLeg',
    'head',
    'torsoRear',
    'rightShoulderRear',
    'leftShoulderRear',
  ];
  let curSum = Object.values(next).reduce((acc, v) => acc + v, 0);
  for (let guard = 0; guard < 120 && curSum !== goal; guard++) {
    let changed = false;
    const step = curSum < goal ? 5 : -5;
    for (const k of keys) {
      if (curSum === goal) break;
      const cand = clampArmorAllocationToChassis(chassis, { ...next, [k]: next[k] + step });
      const candSum = Object.values(cand).reduce((acc, v) => acc + v, 0);
      if (candSum !== curSum && ((step > 0 && candSum <= goal) || (step < 0 && candSum >= goal))) {
        next[k] = cand[k];
        curSum = candSum;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return next;
}

export function MechGarage({
  blueprint,
  savedMechs,
  allRoms,
  pilot,
  onChange,
  onSaveCustomMech,
  onLoadBlueprint,
  onDeleteCustomMech,
}: MechGarageProps) {
  const [selectedPart, setSelectedPart] = useState<MechPartId>('torso');
  const [symLock, setSymLock] = useState<boolean>(true);
  const [mobileSection, setMobileSection] = useState<'all' | 'chassis' | 'weapons' | 'armor'>('all');
  const [customTag, setCustomTag] = useState<string>(() => extractCustomTagFromName(blueprint.name));
  const [selectedSlotId, setSelectedSlotId] = useState<string>(() =>
    savedMechs.some((m) => m.id === blueprint.id) ? blueprint.id : savedMechs[0]?.id ?? ''
  );
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const flashNotice = (msg: string) => {
    setSaveNotice(msg);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => setSaveNotice(null), 2600);
  };

  const chassisId = blueprint.chassisId || inferChassisIdFromParts(blueprint.parts);
  const chassis = getChassisSpec(chassisId);
  const tierSpec = getControlTierSpec(blueprint.controlTier);
  const stats = computeMechStats(blueprint);

  const handleSelectChassis = (nextChassisId: string) => {
    const nextBp = applyChassisToBlueprint(blueprint, nextChassisId);
    const nextName = formatCustomMechName(getBaseMechName(nextChassisId), customTag);
    onChange({ ...nextBp, name: nextName });
  };

  const effectiveSelectedId = (() => {
    if (selectedSlotId.startsWith('preset:')) return selectedSlotId;
    if (selectedSlotId && savedMechs.some((m) => m.id === selectedSlotId)) return selectedSlotId;
    const curMatch = savedMechs.find((m) => m.id === blueprint.id);
    if (curMatch) return curMatch.id;
    return savedMechs[0]?.id ?? '';
  })();

  const selectedCustom = savedMechs.find((m) => m.id === effectiveSelectedId);

  const handleSaveSlot = () => {
    const res = onSaveCustomMech(customTag);
    setCustomTag(res.saved.tag);
    setSelectedSlotId(res.saved.id);
    const codeLabel = res.saved.blueprint.name.split(' ')[0] ?? res.saved.tag;
    flashNotice(res.updated ? `上書き ${codeLabel}` : `保存 ${codeLabel}`);
  };

  const handleLoadSlot = () => {
    if (!effectiveSelectedId) return;
    if (effectiveSelectedId.startsWith('preset:')) {
      const presetId = effectiveSelectedId.slice('preset:'.length);
      const foundPreset = STARTER_MECHS.find((p) => p.id === presetId);
      if (!foundPreset) return;
      onLoadBlueprint(foundPreset);
      setCustomTag('');
      flashNotice(`標準「${foundPreset.name}」読込`);
      return;
    }
    if (selectedCustom) {
      onLoadBlueprint(selectedCustom.blueprint);
      setCustomTag(selectedCustom.tag);
      const codeLabel = selectedCustom.blueprint.name.split(' ')[0] ?? selectedCustom.tag;
      flashNotice(`読込 ${codeLabel}`);
    }
  };

  const handleDeleteSlot = () => {
    if (!selectedCustom) return;
    const codeLabel = selectedCustom.blueprint.name.split(' ')[0] ?? selectedCustom.tag;
    onDeleteCustomMech(selectedCustom.id);
    const remaining = savedMechs.filter((m) => m.id !== selectedCustom.id);
    setSelectedSlotId(remaining[0]?.id ?? '');
    flashNotice(`削除 ${codeLabel}`);
  };

  const handleSelectControlTier = (nextTier: MechControlTier) => {
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      controlTier: nextTier,
    });
  };

  const handleMountRom = (slotId: MechSubroutineSlotId, value: string) => {
    const nextRomSlots: Partial<Record<MechSubroutineSlotId, string | null>> = {
      ...(blueprint.romSlots ?? {}),
      [slotId]: value === '__none__' ? null : value,
    };
    const nextBp = resolveMechBlueprintRoms(
      {
        ...blueprint,
        chassisId: chassis.id,
        romSlots: nextRomSlots,
      },
      allRoms
    );
    onChange(nextBp);
  };

  const romIssues = analyzeMechRomCompatibility(blueprint, allRoms, pilot);
  const userRomList = allRoms.filter((r) => !r.builtIn);
  const builtInRomList = allRoms.filter((r) => r.builtIn);

  const handleToggleBooster = () => {
    if (!chassis.hasJumpBoosterMount) return;
    const nextEnabled = !blueprint.boosterEnabled;
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      boosterEnabled: nextEnabled,
      parts: {
        ...blueprint.parts,
        booster: nextEnabled && chassis.boosterSpecId ? chassis.boosterSpecId : 'boost_none',
      },
    });
  };

  const handleSetLrmMode = (mode: 'salvo' | 'stream') => {
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      lrmFireMode: mode,
    });
  };

  const WEAPON_KEY_TO_SLOT: Record<
    'rightArmWeapon' | 'leftArmWeapon' | 'rightShoulderWeapon' | 'leftShoulderWeapon',
    WeaponSlotId
  > = {
    rightArmWeapon: 'rightArm',
    leftArmWeapon: 'leftArm',
    rightShoulderWeapon: 'rightShoulder',
    leftShoulderWeapon: 'leftShoulder',
  };

  const updateWeapon = (
    key: 'rightArmWeapon' | 'leftArmWeapon' | 'rightShoulderWeapon' | 'leftShoulderWeapon',
    value: string
  ) => {
    const slot = WEAPON_KEY_TO_SLOT[key];
    const nextParts: MechPartsSelection = { ...blueprint.parts, [key]: value };
    const nextExtraAmmo = { ...(blueprint.extraAmmo ?? {}) };
    delete nextExtraAmmo[slot];
    const nextSpec =
      slot === 'rightArm' || slot === 'leftArm'
        ? getArmWeaponSpec(value)
        : getShoulderWeaponSpec(value);
    const maxMount = getWeaponMaxMountCount(nextSpec);
    const nextMounts = { ...(blueprint.weaponMountCounts ?? {}) };
    const curMount = nextMounts[slot] ?? 1;
    if (maxMount <= 1) {
      delete nextMounts[slot];
    } else if (curMount > maxMount) {
      nextMounts[slot] = maxMount;
    }
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      extraAmmo: Object.keys(nextExtraAmmo).length > 0 ? nextExtraAmmo : undefined,
      weaponMountCounts: Object.keys(nextMounts).length > 0 ? nextMounts : undefined,
      parts: nextParts,
      armor: clampArmorAllocationToChassis(chassis, blueprint.armor),
    });
  };

  const updateMountCount = (slot: WeaponSlotId, count: 1 | 2 | 3) => {
    const nextMounts = { ...(blueprint.weaponMountCounts ?? {}) };
    if (count <= 1) {
      delete nextMounts[slot];
    } else {
      nextMounts[slot] = count;
    }
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      weaponMountCounts: Object.keys(nextMounts).length > 0 ? nextMounts : undefined,
    });
  };

  const updateExtraAmmo = (slot: WeaponSlotId, delta: number) => {
    const current = getWeaponSlotExtraAmmoTons(blueprint, slot);
    const nextVal = clamp(current + delta, 0, MAX_EXTRA_AMMO_TONS);
    const nextExtraAmmo = { ...(blueprint.extraAmmo ?? {}) };
    if (nextVal > 0) {
      nextExtraAmmo[slot] = nextVal;
    } else {
      delete nextExtraAmmo[slot];
    }
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      extraAmmo: Object.keys(nextExtraAmmo).length > 0 ? nextExtraAmmo : undefined,
    });
  };

  const updateExtraHeatSinks = (delta: number) => {
    const current = stats.extraHeatSinks;
    const nextVal = clamp(current + delta, 0, MAX_EXTRA_HEAT_SINKS);
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      extraHeatSinks: nextVal,
    });
  };

  const resolvedGroups = getResolvedWeaponGroups(blueprint);

  const toggleGroupMember = (groupId: WeaponGroupId, slot: WeaponSlotId) => {
    const cur = resolvedGroups[groupId];
    const nextMembers = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot];
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      weaponGroups: {
        ...resolvedGroups,
        [groupId]: nextMembers,
      },
    });
  };

  const setArmorDirect = (nextArmor: MechArmorAllocation) => {
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      armor: clampArmorAllocationToChassis(chassis, nextArmor),
    });
  };

  const handleFitRemainingArmor = () => {
    const nonArmorWeight = stats.totalWeight - stats.armorWeight;
    const availPts = Math.floor(Math.max(0, stats.loadCapacity - nonArmorWeight) * 100);
    setArmorDirect(scaleArmorToPoints(chassis, blueprint.armor, availPts));
  };

  const handleAdjustTotalArmorTons = (deltaTons: number) => {
    const targetPts = Math.max(0, stats.totalArmorPoints + Math.round(deltaTons * 100));
    setArmorDirect(scaleArmorToPoints(chassis, blueprint.armor, targetPts));
  };

  const applyTorsoFrontRatio = (frontRatio: number, keepCurrentTotal: boolean) => {
    const next = { ...blueprint.armor };
    const ratio = clamp(frontRatio, 0.5, 0.92);
    for (const partId of ['torso', 'rightShoulder', 'leftShoulder'] as DualArmorPartId[]) {
      const k = DUAL_KEYS[partId];
      const cap = chassis.maxTorsoArmorTotals[partId];
      const total = keepCurrentTotal ? next[k.front] + next[k.rear] : cap;
      const front = Math.round((total * ratio) / 5) * 5;
      next[k.front] = clamp(front, 0, total);
      next[k.rear] = Math.max(0, total - next[k.front]);
    }
    if (!keepCurrentTotal) {
      next.head = chassis.maxArmor.head;
      next.rightArm = chassis.maxArmor.rightArm;
      next.leftArm = chassis.maxArmor.leftArm;
      next.rightLeg = chassis.maxArmor.rightLeg;
      next.leftLeg = chassis.maxArmor.leftLeg;
    }
    setArmorDirect(next);
  };

  const shiftGlobalTorsoFrontRatio = (deltaPct: number) => {
    const torsoTotal =
      blueprint.armor.torsoFront +
      blueprint.armor.torsoRear +
      blueprint.armor.rightShoulderFront +
      blueprint.armor.rightShoulderRear +
      blueprint.armor.leftShoulderFront +
      blueprint.armor.leftShoulderRear;
    const torsoFront =
      blueprint.armor.torsoFront +
      blueprint.armor.rightShoulderFront +
      blueprint.armor.leftShoulderFront;
    const curRatio = torsoTotal > 0 ? torsoFront / torsoTotal : 0.78;
    applyTorsoFrontRatio(curRatio + deltaPct / 100, true);
  };

  const adjustSinglePartArmor = (partId: SingleArmorPartId, targetVal: number) => {
    const key = SINGLE_KEYS[partId].key;
    const clamped = clamp(Math.round(targetVal / 5) * 5, 0, chassis.maxArmor[key]);
    const next = { ...blueprint.armor, [key]: clamped };
    const partner = symLock ? SYMMETRIC_PAIR[partId] : undefined;
    if (partner && partner in SINGLE_KEYS) {
      const pKey = SINGLE_KEYS[partner as SingleArmorPartId].key;
      next[pKey] = clamp(clamped, 0, chassis.maxArmor[pKey]);
    }
    setArmorDirect(next);
  };

  const adjustDualPartSum = (partId: DualArmorPartId, targetSum: number) => {
    const applyOne = (pid: DualArmorPartId, buf: MechArmorAllocation) => {
      const k = DUAL_KEYS[pid];
      const cap = chassis.maxTorsoArmorTotals[pid];
      const goal = clamp(Math.round(targetSum / 5) * 5, 0, cap);
      const curSum = buf[k.front] + buf[k.rear];
      const frontRatio = curSum > 0 ? buf[k.front] / curSum : 0.78;
      const front = clamp(Math.round((goal * frontRatio) / 5) * 5, 0, goal);
      buf[k.front] = front;
      buf[k.rear] = goal - front;
    };
    const next = { ...blueprint.armor };
    applyOne(partId, next);
    const partner = symLock ? SYMMETRIC_PAIR[partId] : undefined;
    if (partner && partner in DUAL_KEYS) {
      applyOne(partner as DualArmorPartId, next);
    }
    setArmorDirect(next);
  };

  const shiftDualPartFront = (partId: DualArmorPartId, deltaFront: number) => {
    const applyShift = (pid: DualArmorPartId, buf: MechArmorAllocation) => {
      const k = DUAL_KEYS[pid];
      const sum = buf[k.front] + buf[k.rear];
      const nextFront = clamp(buf[k.front] + deltaFront, 0, sum);
      buf[k.front] = nextFront;
      buf[k.rear] = sum - nextFront;
    };
    const next = { ...blueprint.armor };
    applyShift(partId, next);
    const partner = symLock ? SYMMETRIC_PAIR[partId] : undefined;
    if (partner && partner in DUAL_KEYS) {
      applyShift(partner as DualArmorPartId, next);
    }
    setArmorDirect(next);
  };

  const adjustDetailField = (key: keyof MechArmorAllocation, delta: number) => {
    const next = { ...blueprint.armor, [key]: Math.max(0, blueprint.armor[key] + delta) };
    setArmorDirect(next);
  };

  const armorSliders: Array<{ key: keyof MechArmorAllocation; label: string; max: number }> = [
    { key: 'head', label: '頭 (重要)', max: chassis.maxArmor.head },
    { key: 'torsoFront', label: '中央胴(前)', max: chassis.maxTorsoArmorTotals.torso },
    { key: 'torsoRear', label: '中央胴(後)', max: chassis.maxTorsoArmorTotals.torso },
    { key: 'rightShoulderFront', label: '右胴(前)', max: chassis.maxTorsoArmorTotals.rightShoulder },
    { key: 'rightShoulderRear', label: '右胴(後)', max: chassis.maxTorsoArmorTotals.rightShoulder },
    { key: 'leftShoulderFront', label: '左胴(前)', max: chassis.maxTorsoArmorTotals.leftShoulder },
    { key: 'leftShoulderRear', label: '左胴(後)', max: chassis.maxTorsoArmorTotals.leftShoulder },
    { key: 'rightArm', label: '右腕', max: chassis.maxArmor.rightArm },
    { key: 'leftArm', label: '左腕', max: chassis.maxArmor.leftArm },
    { key: 'rightLeg', label: '右脚', max: chassis.maxArmor.rightLeg },
    { key: 'leftLeg', label: '左脚', max: chassis.maxArmor.leftLeg },
  ];

  const maxTotalArmorPoints = getChassisMaxTotalArmorPoints(chassis);
  const totalArmorPct = Math.round((stats.totalArmorPoints / Math.max(1, maxTotalArmorPoints)) * 100);
  const allTorsoSum =
    blueprint.armor.torsoFront +
    blueprint.armor.torsoRear +
    blueprint.armor.rightShoulderFront +
    blueprint.armor.rightShoulderRear +
    blueprint.armor.leftShoulderFront +
    blueprint.armor.leftShoulderRear;
  const allTorsoFrontSum =
    blueprint.armor.torsoFront +
    blueprint.armor.rightShoulderFront +
    blueprint.armor.leftShoulderFront;
  const globalFrontPct = allTorsoSum > 0 ? Math.round((allTorsoFrontSum / allTorsoSum) * 100) : 78;
  const weightPct = Math.min(100, Math.round((stats.totalWeight / Math.max(1, stats.loadCapacity)) * 100));
  const remainingTons = stats.loadCapacity - stats.totalWeight;
  const mobileHiddenClass = (sec: 'chassis' | 'weapons' | 'armor') =>
    mobileSection !== 'all' && mobileSection !== sec ? 'is-mobile-hidden' : '';

  return (
    <section className="cm-panel cm-garage-panel">
      <div className="cm-panel-head cm-garage-head">
        <div>
          <h2 className="cm-panel-title">機体ガレージ — {blueprint.name}</h2>
          <p className="cm-panel-sub">
            フレーム骨格は機体固有（最大100t）。トン数内で武装・中央胴ブースター有無・8部位前後装甲を調整します
          </p>
        </div>

        <div className="cm-garage-slot-bar">
          <div className="cm-garage-save-group">
            <input
              type="text"
              className="cm-tag-input"
              maxLength={3}
              inputMode="text"
              value={customTag}
              placeholder="半角3文字"
              aria-label="カスタム識別名（半角英数3文字まで）"
              onChange={(e) => setCustomTag(normalizeCustomTag(e.target.value))}
            />
            <span className="cm-tag-count">{customTag.length}/3</span>
            <button
              type="button"
              className="cm-btn-primary-xs"
              onClick={handleSaveSlot}
              title="半角3文字までの識別名を CM-XX/ABC 形式で付けて保存します（同フレーム・同識別名は上書き）"
            >
              保存
            </button>
          </div>

          <div className="cm-garage-load-group">
            <select
              className="cm-saved-select"
              aria-label="保存済みカスタム機体"
              value={effectiveSelectedId}
              onChange={(e) => setSelectedSlotId(e.target.value)}
            >
              {savedMechs.length === 0 && <option value="">保存済みカスタムなし</option>}
              {savedMechs.length > 0 && (
                <optgroup label="保存済みカスタム">
                  {savedMechs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {formatCustomMechName(m.baseName, m.tag)}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="標準プリセット">
                {STARTER_MECHS.map((p) => (
                  <option key={p.id} value={`preset:${p.id}`}>
                    標準: {p.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              type="button"
              className="cm-btn-xs"
              disabled={!effectiveSelectedId}
              onClick={handleLoadSlot}
            >
              呼出
            </button>
            <button
              type="button"
              className="cm-btn-xs cm-btn-danger-xs"
              disabled={!selectedCustom}
              onClick={handleDeleteSlot}
            >
              削除
            </button>
          </div>

          {saveNotice && <span className="cm-save-notice">{saveNotice}</span>}
        </div>
      </div>

      <div className="cm-stats-summary cm-garage-sticky-summary">
        <div className="cm-stat-row">
          <span>総重量</span>
          <div className="cm-bar cm-bar--lg">
            <div
              className={`cm-bar-fill ${stats.overweight ? 'cm-bar-overheat' : 'cm-bar-single'}`}
              style={{ width: `${weightPct}%` }}
            />
          </div>
          <span className={stats.overweight ? 'cm-text-danger' : ''}>
            {stats.totalWeight.toFixed(1)} / {stats.loadCapacity.toFixed(1)} t
          </span>
          <span className={remainingTons < -0.001 ? 'cm-rem-pill is-over' : 'cm-rem-pill'}>
            {remainingTons >= -0.001
              ? `残り ${Math.max(0, remainingTons).toFixed(1)}t`
              : `+${Math.abs(remainingTons).toFixed(1)}t 超過`}
          </span>
        </div>

        <div className="cm-weight-breakdown">
          内訳: 骨格 {stats.skeletonWeight.toFixed(1)}t ＋ ブースト {stats.boosterWeight.toFixed(1)}t ＋
          ECM {stats.ecmWeight.toFixed(1)}t ＋ ROM {stats.romWeight.toFixed(1)}t ＋ 冷却器{' '}
          {stats.heatSinkWeight.toFixed(1)}t ＋ 弾薬 {stats.ammoWeight.toFixed(1)}t ＋ 武装{' '}
          {stats.weaponsWeight.toFixed(1)}t ＋ 装甲 {stats.armorWeight.toFixed(1)}t
        </div>

        <div className="cm-stat-pills">
          <span>階級: {WEIGHT_CLASS_LABEL[stats.weightClass]}</span>
          <span>体格: {(stats.sizeScale * 10).toFixed(1)}m (×{stats.sizeScale.toFixed(2)})</span>
          <span>冷却: -{stats.heatDissipationPerSec.toFixed(1)}熱/s (上限{stats.maxHeat})</span>
          <span>前進/後退: {stats.walkSpeed.toFixed(1)} / {(stats.walkSpeed * 0.65).toFixed(1)}</span>
          <span>
            斜め跳躍(60°):{' '}
            {!stats.hasBoosterMount
              ? '非搭載'
              : stats.boosterActive
                ? `${stats.jumpImpulse.toFixed(1)} (ON)`
                : 'OFF'}
          </span>
          <span>旋回: {Math.round(stats.turnDegPerSec)}°/s (停止時超信地)</span>
          <span>腰旋回: ±{stats.torsoTwistMaxDeg}° ({stats.torsoTwistRateDegPerSec}°/s)</span>
          <span>
            光学視界: {stats.visionFovHalfDeg * 2}° (±{stats.visionFovHalfDeg}° / {stats.radarRange}m) ・ 被探知RCS {stats.radarSignatureRange}m
          </span>
          <span>総装甲/構造: {stats.totalArmorPoints}/{stats.totalStructureHp}</span>
        </div>

        {stats.validationErrors.length > 0 && (
          <div className="cm-error-box">
            {stats.validationErrors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}
      </div>

      <div className="cm-garage-mobile-tabs" role="tablist" aria-label="ガレージ表示切替">
        {(
          [
            { id: 'all', label: 'すべて' },
            { id: 'chassis', label: 'フレーム' },
            { id: 'weapons', label: '武装・G' },
            { id: 'armor', label: '装甲' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={mobileSection === tab.id ? 'cm-garage-mobile-tab is-active' : 'cm-garage-mobile-tab'}
            onClick={() => setMobileSection(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="cm-garage-cols">
        <div className={`cm-garage-card cm-garage-card--chassis ${mobileHiddenClass('chassis')}`}>
          <div className="cm-subhead">1. フレームスケルトン（機体固有・固定）</div>
          <label className="cm-select-row">
            <span>機体フレーム</span>
            <select value={chassis.id} onChange={(e) => handleSelectChassis(e.target.value)}>
              {MECH_CHASSIS_CATALOG.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} [{c.hasJumpBoosterMount ? 'ブースト可' : 'ブーストなし'}]
                </option>
              ))}
            </select>
          </label>

          <div className="cm-chassis-spec-box">
            <div>
              <strong>{chassis.name}</strong>
            </div>
            <div>
              骨格固定重量 {chassis.skeletonWeight.toFixed(1)}t / 上限 {chassis.maxTonnage}t
            </div>
            <div>
              基礎歩行 {chassis.walkSpeed.toFixed(1)} ／ 基礎旋回 {chassis.turnDegPerSec}°/s
            </div>
            <div className="cm-chassis-desc">{chassis.description}</div>
          </div>

          <div className="cm-subhead" style={{ marginTop: '0.2rem' }}>
            2. 中央胴追加パーツ（ブースト／ジャンプ）
          </div>
          {chassis.hasJumpBoosterMount ? (
            <div className="cm-booster-box">
              <label className="cm-check-inline">
                <input
                  type="checkbox"
                  checked={Boolean(blueprint.boosterEnabled)}
                  onChange={handleToggleBooster}
                />
                <span>
                  中央胴追加ブースト／ジャンプを<strong>{blueprint.boosterEnabled ? 'ON' : 'OFF'}</strong>
                  （+{chassis.boosterModuleWeight.toFixed(1)}t）
                </span>
              </label>
              <div className="cm-booster-note">
                ※ OFF にすると {chassis.boosterModuleWeight.toFixed(1)}t 軽量化し装甲や武装に回せます（脚部損傷時はブースト・跳躍性能も低下／喪失します）
              </div>
            </div>
          ) : (
            <div className="cm-booster-locked">
              未装着（この機体フレームにはブースト／ジャンプを後付けできません）
            </div>
          )}

          <div className="cm-subhead" style={{ marginTop: '0.2rem' }}>
            2b. 追加ヒートシンク（排熱強化）
          </div>
          <div className="cm-stepper-row">
            <span>
              追加冷却器: +{stats.extraHeatSinks} 基（{stats.extraHeatSinks}.0t / 排熱 +
              {(stats.extraHeatSinks * HEAT_SINK_DISSIPATION_PER_UNIT).toFixed(1)}/s）
            </span>
            <div className="cm-stepper">
              <button
                type="button"
                className="cm-btn-xs"
                disabled={stats.extraHeatSinks <= 0}
                onClick={() => updateExtraHeatSinks(-1)}
              >
                －
              </button>
              <span>{stats.extraHeatSinks}/{MAX_EXTRA_HEAT_SINKS}</span>
              <button
                type="button"
                className="cm-btn-xs"
                disabled={stats.extraHeatSinks >= MAX_EXTRA_HEAT_SINKS}
                onClick={() => updateExtraHeatSinks(1)}
              >
                ＋
              </button>
            </div>
          </div>

          <div className="cm-subhead" style={{ marginTop: '0.2rem' }}>
            2c. 制御コンピュータ＆搭載 ROM（{stats.romWeight.toFixed(1)}t）
          </div>
          <label className="cm-select-row">
            <span>制御モード</span>
            <select
              value={tierSpec.id}
              onChange={(e) => handleSelectControlTier(e.target.value as MechControlTier)}
            >
              {CONTROL_TIER_CATALOG.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="cm-booster-note">
            {tierSpec.description} パイロット席 0.5t は骨格に確保済。搭載 ROM は一律 4×4 ({ROM_WEIGHT_4X4.toFixed(1)}t)／未搭載 0.0t（最大5枠 = 2.5t）。
          </div>

          <div className="cm-rom-slot-list">
            {MECH_SUBROUTINE_SLOT_SPECS.filter((s) => tierSpec.enabledSlots.includes(s.slotId)).map(
              (spec) => {
                const refId = blueprint.romSlots?.[spec.slotId];
                const inlineSub = blueprint.subroutines.find((s) => s.slotId === spec.slotId);
                const resolvedRom = typeof refId === 'string' ? findRomById(allRoms, refId) : undefined;
                const isMissingRef = typeof refId === 'string' && !resolvedRom;
                const isUnmounted = refId === null || (!inlineSub && refId === undefined);
                const slotTons = isUnmounted || isMissingRef ? 0 : ROM_WEIGHT_4X4;
                const selectValue =
                  refId === null
                    ? '__none__'
                    : typeof refId === 'string'
                      ? refId
                      : inlineSub
                        ? '__inline__'
                        : '__none__';
                const issues = romIssues[spec.slotId];
                const slotCat = resolvedRom
                  ? getRomCategory(resolvedRom)
                  : inlineSub
                    ? inlineSub.category ?? getRomCategory({ cells: inlineSub.cells })
                    : null;
                const catSpec = slotCat
                  ? ROM_CATEGORY_SPECS.find((c) => c.id === slotCat)
                  : undefined;
                return (
                  <div key={spec.slotId} className="cm-rom-slot-row">
                    <div className="cm-rom-slot-top">
                      <span className="cm-rom-slot-label">
                        {spec.slotId} (4×4枠)
                      </span>
                      <span className="cm-rom-slot-badges">
                        {catSpec && (
                          <span className={`cm-rom-cat-pill is-cat-${catSpec.id}`}>
                            {catSpec.label}
                          </span>
                        )}
                        <span
                          className={`cm-rom-wt-pill ${slotTons === 0 ? 'is-empty' : ''}`}
                        >
                          {slotTons.toFixed(1)}t
                        </span>
                      </span>
                    </div>
                    <select
                      className="cm-weapon-select"
                      aria-label={`${spec.slotId} 搭載ROM`}
                      value={selectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__inline__') return;
                        handleMountRom(spec.slotId, v);
                      }}
                    >
                      <option value="__none__">未搭載 (0.0t)</option>
                      {selectValue === '__inline__' && inlineSub && (
                        <option value="__inline__">
                          直接編集: {inlineSub.name} ({slotTons.toFixed(1)}t)
                        </option>
                      )}
                      {isMissingRef && typeof refId === 'string' && (
                        <option value={refId}>⚠ 欠損ROM ({refId})</option>
                      )}
                      {userRomList.length > 0 && (
                        <optgroup label="自作 ROM">
                          {userRomList.map((r) => {
                            const tags = getRomFeatureTags(r);
                            const cSpec = ROM_CATEGORY_SPECS.find(
                              (c) => c.id === getRomCategory(r)
                            );
                            return (
                              <option key={r.id} value={r.id}>
                                [{cSpec?.short ?? '制'}] {formatRomLabel(r)} [{ROM_WEIGHT_4X4.toFixed(1)}t]
                                {tags.length > 0 ? ` (${tags.join('/')})` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      <optgroup label="標準 ROM">
                        {builtInRomList.map((r) => {
                          const tags = getRomFeatureTags(r);
                          const cSpec = ROM_CATEGORY_SPECS.find(
                            (c) => c.id === getRomCategory(r)
                          );
                          return (
                            <option key={r.id} value={r.id}>
                              [{cSpec?.short ?? '制'}] {formatRomLabel(r)} [{ROM_WEIGHT_4X4.toFixed(1)}t]
                              {tags.length > 0 ? ` (${tags.join('/')})` : ''}
                            </option>
                          );
                        })}
                      </optgroup>
                    </select>
                    {issues.length > 0 && (
                      <div className="cm-rom-issue-list">
                        {issues.map((iss, idx) => (
                          <span
                            key={idx}
                            className={`cm-rom-issue ${iss.level === 'error' ? 'is-error' : 'is-warn'}`}
                          >
                            ⚠ {iss.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </div>

        <div className={`cm-garage-card cm-garage-card--weapons ${mobileHiddenClass('weapons')}`}>
          <div className="cm-garage-weapons-head">
            <div className="cm-subhead" style={{ marginBottom: 0 }}>
              3. 武装カスタマイズ（4枠）＋追加弾薬
            </div>
            <div className="cm-seg">
              <button
                type="button"
                className={(blueprint.lrmFireMode ?? 'salvo') === 'salvo' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
                onClick={() => handleSetLrmMode('salvo')}
                title="全弾同時発射：AMS を飽和突破しやすい"
              >
                一斉斉射
              </button>
              <button
                type="button"
                className={blueprint.lrmFireMode === 'stream' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
                onClick={() => handleSetLrmMode('stream')}
                title="連続垂れ流し：高精度で断続的に制圧（AMS に落とされやすい）"
              >
                垂れ流し
              </button>
            </div>
          </div>
          {(
            [
              {
                key: 'rightArmWeapon',
                slot: 'rightArm',
                label: '右腕武装',
                noneId: 'arm_none',
                catalog: ARM_WEAPONS,
                spec: getArmWeaponSpec(blueprint.parts.rightArmWeapon),
              },
              {
                key: 'leftArmWeapon',
                slot: 'leftArm',
                label: '左腕武装',
                noneId: 'arm_none',
                catalog: ARM_WEAPONS,
                spec: getArmWeaponSpec(blueprint.parts.leftArmWeapon),
              },
              {
                key: 'rightShoulderWeapon',
                slot: 'rightShoulder',
                label: '右胴武装',
                noneId: 'shd_none',
                catalog: SHOULDER_WEAPONS,
                spec: getShoulderWeaponSpec(blueprint.parts.rightShoulderWeapon),
              },
              {
                key: 'leftShoulderWeapon',
                slot: 'leftShoulder',
                label: '左胴武装',
                noneId: 'shd_none',
                catalog: SHOULDER_WEAPONS,
                spec: getShoulderWeaponSpec(blueprint.parts.leftShoulderWeapon),
              },
            ] as const
          ).map((row) => {
            const extraTons = getWeaponSlotExtraAmmoTons(blueprint, row.slot);
            const ammoPerTon = row.spec.ammoPerTon ?? row.spec.maxAmmo;
            const totalAmmo =
              row.spec.maxAmmo > 0 ? row.spec.maxAmmo + extraTons * ammoPerTon : row.spec.maxAmmo;
            const maxMount = getWeaponMaxMountCount(row.spec);
            const curMount = getWeaponSlotMountCount(blueprint, row.slot);
            const passive = isPassiveModuleSpec(row.spec);
            const isEmpty = row.spec.id === row.noneId;
            const slotTotalTons = row.spec.weight * curMount + extraTons;
            return (
              <div key={row.slot} className="cm-weapon-slot-block">
                <div className="cm-weapon-slot-head">
                  <span className="cm-weapon-slot-title">{row.label}</span>
                  <span className={isEmpty ? 'cm-weapon-slot-badge is-empty' : 'cm-weapon-slot-badge'}>
                    {isEmpty
                      ? '未装備'
                      : `${passive ? '常時稼働 ' : ''}${curMount > 1 ? `×${curMount} ・ ` : ''}${slotTotalTons.toFixed(1)}t`}
                  </span>
                </div>
                <select
                  className="cm-weapon-select"
                  aria-label={row.label}
                  value={blueprint.parts[row.key]}
                  onChange={(e) => updateWeapon(row.key, e.target.value)}
                >
                  {row.catalog.map((p) => {
                    const ecmLocked = Boolean(p.requiresEcmChassis && !chassis.hasEcmMount);
                    const pPassive = isPassiveModuleSpec(p);
                    const rangeTxt =
                      p.maxRange && p.maxRange > p.range
                        ? `射程${p.range}-${p.maxRange}m`
                        : p.range > 0
                          ? `${pPassive ? '効果' : '射程'}${p.range}m`
                          : '';
                    const burnTxt = p.burnDurationSec ? ` / 照射${p.burnDurationSec}s` : '';
                    const ammoTxt =
                      p.maxAmmo > 0
                        ? `${p.maxAmmo}発`
                        : pPassive
                          ? '常時'
                          : p.damage > 0
                            ? '∞'
                            : '-';
                    const mountTxt = (p.maxMountCount ?? 1) > 1 ? ` / 最大×${p.maxMountCount}` : '';
                    return (
                      <option key={p.id} value={p.id} disabled={ecmLocked}>
                        {p.name} ({p.weight.toFixed(1)}t / 熱{p.heatCost} / {ammoTxt}
                        {rangeTxt ? ` / ${rangeTxt}` : ''}
                        {burnTxt}
                        {mountTxt}
                        {ecmLocked ? ' ※ECM対応機限定' : ''})
                      </option>
                    );
                  })}
                </select>
                {maxMount > 1 && !passive && (
                  <div className="cm-weapon-subrow">
                    <span>
                      連装数: <strong>×{curMount}</strong>（計 {(row.spec.weight * curMount).toFixed(1)}t / 威力{' '}
                      {Math.round(row.spec.damage * row.spec.burstCount * curMount)} / 熱{' '}
                      {row.spec.heatCost * curMount}）
                    </span>
                    <div className="cm-seg">
                      {([1, 2, 3] as const).map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          disabled={cnt > maxMount}
                          className={curMount === cnt ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
                          onClick={() => updateMountCount(row.slot, cnt)}
                        >
                          ×{cnt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {row.spec.maxAmmo > 0 && (
                  <div className="cm-weapon-subrow">
                    <span>
                      弾薬: <strong>{totalAmmo}発</strong>（標準{row.spec.maxAmmo} ＋ 追加
                      {extraTons * ammoPerTon} / +{extraTons}.0t）
                    </span>
                    <div className="cm-stepper">
                      <button
                        type="button"
                        className="cm-btn-xs"
                        disabled={extraTons <= 0}
                        onClick={() => updateExtraAmmo(row.slot, -1)}
                        aria-label={`${row.label} 弾薬を減らす`}
                      >
                        －
                      </button>
                      <span>+{extraTons}t</span>
                      <button
                        type="button"
                        className="cm-btn-xs"
                        disabled={extraTons >= MAX_EXTRA_AMMO_TONS}
                        onClick={() => updateExtraAmmo(row.slot, 1)}
                        aria-label={`${row.label} 弾薬を増やす`}
                      >
                        ＋
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="cm-subhead" style={{ marginTop: '0.25rem' }}>
            3b. 武装グループ割当 (G1〜G4)
          </div>
          <div className="cm-wgroup-matrix">
            {(
              [
                { slot: 'rightArm', label: '右腕', spec: getArmWeaponSpec(blueprint.parts.rightArmWeapon), noneId: 'arm_none' },
                { slot: 'leftArm', label: '左腕', spec: getArmWeaponSpec(blueprint.parts.leftArmWeapon), noneId: 'arm_none' },
                { slot: 'rightShoulder', label: '右胴', spec: getShoulderWeaponSpec(blueprint.parts.rightShoulderWeapon), noneId: 'shd_none' },
                { slot: 'leftShoulder', label: '左胴', spec: getShoulderWeaponSpec(blueprint.parts.leftShoulderWeapon), noneId: 'shd_none' },
              ] as const
            ).map((row) => {
              const passive = isPassiveModuleSpec(row.spec);
              const curMount = getWeaponSlotMountCount(blueprint, row.slot);
              const equipped = row.spec.id !== row.noneId && !passive;
              return (
                <div key={row.slot} className={`cm-wgroup-row ${equipped ? '' : 'is-empty-slot'}`}>
                  <span className="cm-wgroup-slot-label">
                    <b>{row.label}</b>: {row.spec.id !== row.noneId ? `${row.spec.name}${curMount > 1 ? `×${curMount}` : ''}` : '未装備'}
                  </span>
                  <div className="cm-wgroup-btns">
                    {WEAPON_GROUP_IDS.map((gid) => {
                      const active = resolvedGroups[gid].includes(row.slot);
                      return (
                        <button
                          key={gid}
                          type="button"
                          disabled={passive}
                          className={`cm-wgroup-btn ${active ? `is-active is-${gid.toLowerCase()}` : ''}`}
                          onClick={() => toggleGroupMember(gid, row.slot)}
                          title={passive ? '常時稼働モジュールのためグループ対象外' : `${gid} に ${row.label} を含める/外す`}
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
          <div className="cm-wgroup-summary">
            {WEAPON_GROUP_IDS.map((gid) => {
              const sum = getWeaponGroupSummary(blueprint, gid);
              return (
                <div key={gid} className="cm-wgroup-sum-pill">
                  <b>{gid}:</b>{' '}
                  {sum.equippedItems.length > 0
                    ? `${sum.equippedItems.map((i) => `${i.spec.name}${i.mountCount > 1 ? `×${i.mountCount}` : ''}`).join(' + ')} (威力${sum.totalDamage} / 熱${sum.totalHeat})`
                    : '未割当'}
                </div>
              );
            })}
          </div>
        </div>

        <div className={`cm-garage-card cm-garage-card--armor ${mobileHiddenClass('armor')}`}>
          <div className="cm-subhead">
            4. 装甲配分（{stats.armorWeight.toFixed(1)}t / 上限 {(maxTotalArmorPoints / 100).toFixed(1)}t）
          </div>

          <div className="cm-armor-actions">
            <button
              type="button"
              className="cm-btn-primary-xs"
              onClick={handleFitRemainingArmor}
              title="現在の部位比率を保ったまま、残り積載トン数ぴったりに自動調整します"
            >
              残り重量に自動フィット
            </button>
            <button
              type="button"
              className="cm-btn-xs"
              onClick={() => applyTorsoFrontRatio(0.78, false)}
            >
              最大
            </button>
            <button
              type="button"
              className="cm-btn-xs"
              onClick={() => applyTorsoFrontRatio(0.84, true)}
            >
              正面重視
            </button>
            <button
              type="button"
              className="cm-btn-xs"
              onClick={() => applyTorsoFrontRatio(0.7, true)}
            >
              バランス
            </button>
          </div>

          <div className="cm-armor-master-box">
            <div className="cm-armor-btn-bar">
              <span className="cm-armor-bar-label">全体厚み</span>
              <button type="button" className="cm-btn-xs" onClick={() => handleAdjustTotalArmorTons(-1.0)}>-1.0t</button>
              <button type="button" className="cm-btn-xs" onClick={() => handleAdjustTotalArmorTons(-0.5)}>-0.5t</button>
              <div className="cm-armor-prog">
                <div className="cm-armor-prog-fill" style={{ width: `${totalArmorPct}%` }} />
                <span>{totalArmorPct}% ({stats.armorWeight.toFixed(1)}t)</span>
              </div>
              <button type="button" className="cm-btn-xs" onClick={() => handleAdjustTotalArmorTons(0.5)}>+0.5t</button>
              <button type="button" className="cm-btn-xs" onClick={() => handleAdjustTotalArmorTons(1.0)}>+1.0t</button>
            </div>

            <div className="cm-armor-btn-bar">
              <span className="cm-armor-bar-label">胴前後比</span>
              <button type="button" className="cm-btn-xs" onClick={() => shiftGlobalTorsoFrontRatio(-5)}>後+5%</button>
              <div className="cm-armor-dual-prog">
                <div className="cm-armor-dual-front" style={{ width: `${globalFrontPct}%` }} />
                <span>前 {globalFrontPct}% ／ 後 {100 - globalFrontPct}%</span>
              </div>
              <button type="button" className="cm-btn-xs" onClick={() => shiftGlobalTorsoFrontRatio(5)}>前+5%</button>
            </div>

            <label className="cm-check-inline">
              <input
                type="checkbox"
                checked={symLock}
                onChange={(e) => setSymLock(e.target.checked)}
              />
              <span>左右対称ロック（右胴↔左胴 / 右腕↔左腕 / 右脚↔左脚 を連動）</span>
            </label>
          </div>

          {/* Clickable 8-Part BattleMech Paperdoll + Selected Part Button Controls */}
          <div className="cm-armor-doll-wrap">
            <div className="cm-doll-stage">
              <MechPaperdoll
                mode="garage"
                chassis={chassis}
                armor={blueprint.armor}
                selectedPart={selectedPart}
                pairedPart={symLock ? SYMMETRIC_PAIR[selectedPart] : undefined}
                onSelectPart={setSelectedPart}
              />
              <div className="cm-doll-legend">
                <span><i className="cm-doll-dot is-high" />厚 75%+</span>
                <span><i className="cm-doll-dot is-mid" />標準</span>
                <span><i className="cm-doll-dot is-low" />薄</span>
                <span><i className="cm-doll-dot is-zero" />0</span>
                <span>黄枠: 選択 / 青破線: 対称</span>
              </div>
            </div>

            <div className="cm-armor-part-editor">
              {selectedPart in DUAL_KEYS ? (() => {
                const pid = selectedPart as DualArmorPartId;
                const k = DUAL_KEYS[pid];
                const cap = chassis.maxTorsoArmorTotals[pid];
                const frontVal = blueprint.armor[k.front];
                const rearVal = blueprint.armor[k.rear];
                const curSum = frontVal + rearVal;
                const partFrontPct = curSum > 0 ? Math.round((frontVal / curSum) * 100) : 78;
                return (
                  <>
                    <div className="cm-armor-sel-title">
                      選択部位: <strong>{k.label}</strong>（構造HP {chassis.structureHp[pid]} / 前後上限 {cap}）
                    </div>
                    <div className="cm-armor-btn-bar">
                      <button type="button" className="cm-btn-xs" onClick={() => adjustDualPartSum(pid, 0)}>0</button>
                      <button type="button" className="cm-btn-xs" onClick={() => adjustDualPartSum(pid, curSum - 25)}>-25</button>
                      <button type="button" className="cm-btn-xs" onClick={() => adjustDualPartSum(pid, curSum - 5)}>-5</button>
                      <div className="cm-armor-prog">
                        <div className="cm-armor-prog-fill" style={{ width: `${Math.round((curSum / Math.max(1, cap)) * 100)}%` }} />
                        <span>合計 {curSum}/{cap}</span>
                      </div>
                      <button type="button" className="cm-btn-xs" onClick={() => adjustDualPartSum(pid, curSum + 5)}>+5</button>
                      <button type="button" className="cm-btn-xs" onClick={() => adjustDualPartSum(pid, curSum + 25)}>+25</button>
                      <button type="button" className="cm-btn-xs" onClick={() => adjustDualPartSum(pid, cap)}>MAX</button>
                    </div>
                    <div className="cm-armor-btn-bar">
                      <button type="button" className="cm-btn-xs" onClick={() => shiftDualPartFront(pid, -10)}>後+10</button>
                      <div className="cm-armor-dual-prog">
                        <div className="cm-armor-dual-front" style={{ width: `${partFrontPct}%` }} />
                        <span>前 {frontVal} ┃ 後 {rearVal}</span>
                      </div>
                      <button type="button" className="cm-btn-xs" onClick={() => shiftDualPartFront(pid, 10)}>前+10</button>
                    </div>
                  </>
                );
              })() : (() => {
                const pid = selectedPart as SingleArmorPartId;
                const info = SINGLE_KEYS[pid];
                const cur = blueprint.armor[info.key];
                const cap = chassis.maxArmor[info.key];
                return (
                  <>
                    <div className="cm-armor-sel-title">
                      選択部位: <strong>{info.label}</strong>（構造HP {chassis.structureHp[pid]} / 上限 {cap}）
                    </div>
                    <div className="cm-armor-btn-bar">
                      <button type="button" className="cm-btn-xs" onClick={() => adjustSinglePartArmor(pid, 0)}>0</button>
                      <button type="button" className="cm-btn-xs" onClick={() => adjustSinglePartArmor(pid, cur - 25)}>-25</button>
                      <button type="button" className="cm-btn-xs" onClick={() => adjustSinglePartArmor(pid, cur - 5)}>-5</button>
                      <div className="cm-armor-prog">
                        <div className="cm-armor-prog-fill" style={{ width: `${Math.round((cur / Math.max(1, cap)) * 100)}%` }} />
                        <span>{cur}/{cap}</span>
                      </div>
                      <button type="button" className="cm-btn-xs" onClick={() => adjustSinglePartArmor(pid, cur + 5)}>+5</button>
                      <button type="button" className="cm-btn-xs" onClick={() => adjustSinglePartArmor(pid, cur + 25)}>+25</button>
                      <button type="button" className="cm-btn-xs" onClick={() => adjustSinglePartArmor(pid, cap)}>MAX</button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          <details className="cm-armor-details">
            <summary>詳細リスト（全部位 11 項目をボタンで微調整）</summary>
            <div className="cm-armor-detail-list">
              {armorSliders.map((item) => (
                <div key={item.key} className="cm-armor-detail-row">
                  <span>{item.label}</span>
                  <div className="cm-stepper">
                    <button type="button" className="cm-btn-xs" onClick={() => adjustDetailField(item.key, -25)}>-25</button>
                    <button type="button" className="cm-btn-xs" onClick={() => adjustDetailField(item.key, -5)}>-5</button>
                    <span className="cm-armor-detail-val">{blueprint.armor[item.key]}/{item.max}</span>
                    <button type="button" className="cm-btn-xs" onClick={() => adjustDetailField(item.key, 5)}>+5</button>
                    <button type="button" className="cm-btn-xs" onClick={() => adjustDetailField(item.key, 25)}>+25</button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
