import {
  ARM_WEAPONS,
  MAX_EXTRA_HEAT_SINKS,
  MECH_CHASSIS_CATALOG,
  SHOULDER_WEAPONS,
  applyChassisToBlueprint,
  clampArmorAllocationToChassis,
  computeMechStats,
  getArmWeaponSpec,
  getChassisSpec,
  getResolvedWeaponGroups,
  getShoulderWeaponSpec,
  isPassiveModuleSpec,
} from '../data/parts';
import {
  MechArmorAllocation,
  MechBlueprint,
  WEAPON_GROUP_IDS,
  WeaponGroupId,
  WeaponSlotId,
} from '../types/mech';

interface CurriculumMechEditorProps {
  mech: MechBlueprint;
  onChange: (next: MechBlueprint) => void;
}

const ARMOR_FIELDS: ReadonlyArray<{
  key: keyof MechArmorAllocation;
  label: string;
  maxKey:
    | 'head'
    | 'torsoFront'
    | 'torsoRear'
    | 'rightShoulderFront'
    | 'leftShoulderFront'
    | 'rightArm'
    | 'leftArm'
    | 'rightLeg'
    | 'leftLeg';
}> = [
  { key: 'torsoFront', label: '中央胴(前)', maxKey: 'torsoFront' },
  { key: 'torsoRear', label: '中央胴(後)', maxKey: 'torsoRear' },
  { key: 'rightShoulderFront', label: '右胴(前)', maxKey: 'rightShoulderFront' },
  { key: 'leftShoulderFront', label: '左胴(前)', maxKey: 'leftShoulderFront' },
  { key: 'rightArm', label: '右腕', maxKey: 'rightArm' },
  { key: 'leftArm', label: '左腕', maxKey: 'leftArm' },
  { key: 'rightLeg', label: '右脚', maxKey: 'rightLeg' },
  { key: 'leftLeg', label: '左脚', maxKey: 'leftLeg' },
];

export function CurriculumMechEditor({ mech, onChange }: CurriculumMechEditorProps) {
  const stats = computeMechStats(mech);
  const chassis = getChassisSpec(mech.chassisId);
  const groups = getResolvedWeaponGroups(mech);

  const toggleGroupSlot = (gid: WeaponGroupId, slot: WeaponSlotId) => {
    const cur = groups[gid] ?? [];
    const nextGroup = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot];
    onChange({
      ...mech,
      weaponGroups: {
        ...groups,
        [gid]: nextGroup,
      },
    });
  };

  const setWeapon = (
    partKey:
      | 'rightArmWeapon'
      | 'leftArmWeapon'
      | 'rightShoulderWeapon'
      | 'leftShoulderWeapon',
    value: string
  ) => {
    onChange({
      ...mech,
      parts: {
        ...mech.parts,
        [partKey]: value,
      },
    });
  };

  const setArmor = (key: keyof MechArmorAllocation, val: number) => {
    const clamped = clampArmorAllocationToChassis(chassis, {
      ...mech.armor,
      [key]: Math.max(0, Math.round(val)),
    });
    onChange({ ...mech, armor: clamped });
  };

  const weaponRows: Array<{
    slot: WeaponSlotId;
    partKey:
      | 'rightArmWeapon'
      | 'leftArmWeapon'
      | 'rightShoulderWeapon'
      | 'leftShoulderWeapon';
    label: string;
    isArm: boolean;
  }> = [
    { slot: 'rightArm', partKey: 'rightArmWeapon', label: '右腕', isArm: true },
    { slot: 'leftArm', partKey: 'leftArmWeapon', label: '左腕', isArm: true },
    { slot: 'rightShoulder', partKey: 'rightShoulderWeapon', label: '右胴', isArm: false },
    { slot: 'leftShoulder', partKey: 'leftShoulderWeapon', label: '左胴', isArm: false },
  ];

  return (
    <div className="cm-curr-mech-editor">
      <div className="cm-curr-mech-summary">
        <span className={`cm-curr-weight-badge ${stats.overweight || !stats.valid ? 'is-over' : 'is-ok'}`}>
          重量 {stats.totalWeight.toFixed(1)} / {stats.loadCapacity}t ・ {stats.valid ? '有効' : '要調整'}
        </span>
        <span className="cm-curr-stat-chip">放熱 {stats.heatDissipationPerSec.toFixed(1)}/s</span>
        <span className="cm-curr-stat-chip">総装甲 {stats.totalArmorPoints}</span>
      </div>

      {!stats.valid && stats.validationErrors.length > 0 && (
        <div className="cm-error-box">{stats.validationErrors.join(' / ')}</div>
      )}

      <div className="cm-curr-mech-row">
        <label className="cm-curr-field">
          <span>シャーシ</span>
          <select
            value={mech.chassisId}
            onChange={(e) => {
              onChange(applyChassisToBlueprint(mech, e.target.value));
            }}
          >
            {MECH_CHASSIS_CATALOG.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (最大 {c.maxTonnage}t)
              </option>
            ))}
          </select>
        </label>

        <label className="cm-curr-field">
          <span>追加放熱シンク ({mech.extraHeatSinks ?? 0}基)</span>
          <div className="cm-curr-stepper">
            <button
              type="button"
              className="cm-btn-xs"
              onClick={() =>
                onChange({ ...mech, extraHeatSinks: Math.max(0, (mech.extraHeatSinks ?? 0) - 1) })
              }
            >
              -1
            </button>
            <span>{mech.extraHeatSinks ?? 0}t</span>
            <button
              type="button"
              className="cm-btn-xs"
              onClick={() =>
                onChange({
                  ...mech,
                  extraHeatSinks: Math.min(MAX_EXTRA_HEAT_SINKS, (mech.extraHeatSinks ?? 0) + 1),
                })
              }
            >
              +1
            </button>
          </div>
        </label>

        <label className="cm-curr-field">
          <span>ブースター</span>
          <button
            type="button"
            className={`cm-btn-xs ${mech.boosterEnabled ? 'is-active' : ''}`}
            disabled={!chassis.boosterSpecId}
            onClick={() => onChange({ ...mech, boosterEnabled: !mech.boosterEnabled })}
          >
            {!chassis.boosterSpecId ? '非対応' : mech.boosterEnabled ? 'ON (跳躍可)' : 'OFF'}
          </button>
        </label>
      </div>

      <div className="cm-curr-weapons-grid">
        {weaponRows.map((row) => {
          const list = row.isArm ? ARM_WEAPONS : SHOULDER_WEAPONS;
          const val = mech.parts[row.partKey];
          const spec = row.isArm ? getArmWeaponSpec(val) : getShoulderWeaponSpec(val);
          const passive = isPassiveModuleSpec(spec);
          return (
            <div key={row.slot} className="cm-curr-weapon-card">
              <div className="cm-curr-weapon-head">
                <strong>{row.label}</strong>
                <div className="cm-wgroup-btns">
                  {WEAPON_GROUP_IDS.map((gid) => {
                    const active = groups[gid].includes(row.slot);
                    return (
                      <button
                        key={gid}
                        type="button"
                        disabled={passive || spec.damage <= 0}
                        className={`cm-wgroup-btn ${active ? `is-active is-${gid.toLowerCase()}` : ''}`}
                        onClick={() => toggleGroupSlot(gid, row.slot)}
                      >
                        {gid}
                      </button>
                    );
                  })}
                </div>
              </div>
              <select value={val} onChange={(e) => setWeapon(row.partKey, e.target.value)}>
                {list.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.weight}t)
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="cm-curr-armor-grid">
        {ARMOR_FIELDS.map((af) => {
          const maxVal = chassis.maxArmor[af.maxKey];
          const val = Math.min(maxVal, mech.armor[af.key] ?? 0);
          return (
            <label key={af.key} className="cm-curr-armor-item">
              <span>
                {af.label}: <b>{val}</b>/{maxVal}
              </span>
              <input
                type="range"
                min={0}
                max={maxVal}
                step={5}
                value={val}
                onChange={(e) => setArmor(af.key, Number(e.target.value))}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
