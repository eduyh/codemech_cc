import {
  ARM_WEAPONS,
  MAX_EXTRA_AMMO_TONS,
  MECH_CHASSIS_CATALOG,
  SHOULDER_WEAPONS,
  applyChassisToBlueprint,
  computeMechStats,
  getArmWeaponSpec,
  getChassisSpec,
  getResolvedWeaponGroups,
  getShoulderWeaponSpec,
  getWeaponGroupSummary,
  getWeaponSlotExtraAmmoTons,
  inferChassisIdFromParts,
} from '../data/parts';
import { STARTER_MECHS } from '../data/presets';
import { clamp } from '../engine/math';
import {
  MechArmorAllocation,
  MechBlueprint,
  MechChassisSpec,
  MechPartsSelection,
  WEAPON_GROUP_IDS,
  WeaponGroupId,
  WeaponSlotId,
} from '../types/mech';

interface MechGarageProps {
  blueprint: MechBlueprint;
  onChange: (next: MechBlueprint) => void;
  onLoadPreset: (bp: MechBlueprint) => void;
}

const COLOR_SWATCHES = [
  '#06b6d4',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ef4444',
  '#3b82f6',
  '#ec4899',
  '#94a3b8',
];

const WEIGHT_CLASS_LABEL: Record<MechChassisSpec['weightClass'], string> = {
  light: '軽量級',
  medium: '中量級',
  heavy: '重量級',
  assault: '超重量級',
};

const LEG_STYLE_LABEL: Record<string, string> = {
  legs_biped_std: '標準二脚',
  legs_reverse_agile: '軽量逆関節',
  legs_heavy_quad: '重装四脚',
  legs_hover: 'ホバーレッグ',
};

function clampArmorToChassis(
  chassis: MechChassisSpec,
  armor: MechArmorAllocation
): MechArmorAllocation {
  const m = chassis.maxArmor;
  return {
    head: clamp(armor.head, 0, m.head),
    torsoFront: clamp(armor.torsoFront, 0, m.torsoFront),
    torsoRear: clamp(armor.torsoRear, 0, m.torsoRear),
    rightShoulderFront: clamp(armor.rightShoulderFront, 0, m.rightShoulderFront),
    rightShoulderRear: clamp(armor.rightShoulderRear, 0, m.rightShoulderRear),
    leftShoulderFront: clamp(armor.leftShoulderFront, 0, m.leftShoulderFront),
    leftShoulderRear: clamp(armor.leftShoulderRear, 0, m.leftShoulderRear),
    rightArm: clamp(armor.rightArm, 0, m.rightArm),
    leftArm: clamp(armor.leftArm, 0, m.leftArm),
    rightLeg: clamp(armor.rightLeg, 0, m.rightLeg),
    leftLeg: clamp(armor.leftLeg, 0, m.leftLeg),
  };
}

export function MechGarage({ blueprint, onChange, onLoadPreset }: MechGarageProps) {
  const chassisId = blueprint.chassisId || inferChassisIdFromParts(blueprint.parts);
  const chassis = getChassisSpec(chassisId);
  const stats = computeMechStats(blueprint);

  const handleSelectChassis = (nextChassisId: string) => {
    onChange(applyChassisToBlueprint(blueprint, nextChassisId));
  };

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

  const handleToggleEcm = () => {
    if (!chassis.hasEcmMount) return;
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      ecmEnabled: !blueprint.ecmEnabled,
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
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      extraAmmo: Object.keys(nextExtraAmmo).length > 0 ? nextExtraAmmo : undefined,
      parts: nextParts,
      armor: clampArmorToChassis(chassis, blueprint.armor),
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
    const nextVal = clamp(current + delta, 0, 8);
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

  const updateArmor = (key: keyof MechArmorAllocation, value: number) => {
    onChange({
      ...blueprint,
      chassisId: chassis.id,
      armor: clampArmorToChassis(chassis, { ...blueprint.armor, [key]: value }),
    });
  };

  const armorSliders: Array<{ key: keyof MechArmorAllocation; label: string; max: number }> = [
    { key: 'head', label: '頭 (重要部位)', max: chassis.maxArmor.head },
    { key: 'torsoFront', label: '中央胴 (前)', max: chassis.maxArmor.torsoFront },
    { key: 'torsoRear', label: '中央胴 (後)', max: chassis.maxArmor.torsoRear },
    { key: 'rightShoulderFront', label: '右胴 (前)', max: chassis.maxArmor.rightShoulderFront },
    { key: 'rightShoulderRear', label: '右胴 (後)', max: chassis.maxArmor.rightShoulderRear },
    { key: 'leftShoulderFront', label: '左胴 (前)', max: chassis.maxArmor.leftShoulderFront },
    { key: 'leftShoulderRear', label: '左胴 (後)', max: chassis.maxArmor.leftShoulderRear },
    { key: 'rightArm', label: '右腕', max: chassis.maxArmor.rightArm },
    { key: 'leftArm', label: '左腕', max: chassis.maxArmor.leftArm },
    { key: 'rightLeg', label: '右脚', max: chassis.maxArmor.rightLeg },
    { key: 'leftLeg', label: '左脚', max: chassis.maxArmor.leftLeg },
  ];

  const weightPct = Math.min(100, Math.round((stats.totalWeight / Math.max(1, stats.loadCapacity)) * 100));

  return (
    <section className="cm-panel">
      <div className="cm-panel-head">
        <div>
          <h2 className="cm-panel-title">機体ガレージ（固定フレーム・武装＆前後装甲配分）</h2>
          <p className="cm-panel-sub">
            フレーム骨格は機体固有（最大100t）。トン数内で武装・中央胴ブースター有無・8部位前後装甲を調整します
          </p>
        </div>

        <div className="cm-preset-bar">
          {STARTER_MECHS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="cm-btn-xs"
              onClick={() => onLoadPreset(structuredClone(preset))}
            >
              {preset.name.split(' ')[1] ?? preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="cm-garage-meta">
        <label className="cm-field">
          <span>機体名</span>
          <input
            type="text"
            value={blueprint.name}
            onChange={(e) => onChange({ ...blueprint, name: e.target.value })}
          />
        </label>

        <div className="cm-swatches">
          {COLOR_SWATCHES.map((col) => (
            <button
              key={col}
              type="button"
              className={`cm-swatch ${blueprint.color === col ? 'is-selected' : ''}`}
              style={{ backgroundColor: col }}
              onClick={() => onChange({ ...blueprint, color: col })}
              aria-label={`機体色 ${col}`}
            />
          ))}
        </div>
      </div>

      <div className="cm-stats-summary">
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
        </div>

        <div className="cm-weight-breakdown">
          内訳: 骨格 {stats.skeletonWeight.toFixed(1)}t ＋ ブースト {stats.boosterWeight.toFixed(1)}t ＋
          ECM {stats.ecmWeight.toFixed(1)}t ＋ 冷却器 {stats.heatSinkWeight.toFixed(1)}t ＋ 弾薬{' '}
          {stats.ammoWeight.toFixed(1)}t ＋ 武装 {stats.weaponsWeight.toFixed(1)}t ＋ 装甲{' '}
          {stats.armorWeight.toFixed(1)}t
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

      <div className="cm-garage-cols">
        <div className="cm-garage-parts">
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
              <strong>{chassis.name}</strong> — 骨格固定重量 {chassis.skeletonWeight.toFixed(1)}t /
              上限 {chassis.maxTonnage}t
            </div>
            <div>
              脚部方式: {LEG_STYLE_LABEL[chassis.legPartId] ?? chassis.legPartId} ／ 基礎歩行{' '}
              {chassis.walkSpeed.toFixed(1)} ／ 基礎旋回 {chassis.turnDegPerSec}°/s
            </div>
            <div className="cm-chassis-desc">{chassis.description}</div>
          </div>

          <div className="cm-subhead" style={{ marginTop: '0.35rem' }}>
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

          <div className="cm-subhead" style={{ marginTop: '0.35rem' }}>
            2b. 電子戦装備（ECM スイート）
          </div>
          {chassis.hasEcmMount ? (
            <div className="cm-booster-box">
              <label className="cm-check-inline">
                <input
                  type="checkbox"
                  checked={Boolean(blueprint.ecmEnabled)}
                  onChange={handleToggleEcm}
                />
                <span>
                  ECM ジャミングスイートを<strong>{blueprint.ecmEnabled ? 'ON' : 'OFF'}</strong>
                  （+{chassis.ecmModuleWeight.toFixed(1)}t / 半径130m）
                </span>
              </label>
              <div className="cm-booster-note">
                ※ 周囲130mの味方被探知RCS半減・味方データリンク遮断・敵ロック時間2倍（120m接近・BAP・PPC被弾で無効化）
              </div>
            </div>
          ) : (
            <div className="cm-booster-locked">
              未装着（この機体フレームには ECM スイートを搭載できません）
            </div>
          )}

          <div className="cm-subhead" style={{ marginTop: '0.35rem' }}>
            2c. 追加ヒートシンク（排熱強化）
          </div>
          <div className="cm-stepper-row">
            <span>
              追加冷却器: +{stats.extraHeatSinks} 基（{stats.extraHeatSinks}.0t / 排熱 +
              {(stats.extraHeatSinks * 1.8).toFixed(1)}/s）
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
              <span>{stats.extraHeatSinks}</span>
              <button
                type="button"
                className="cm-btn-xs"
                disabled={stats.extraHeatSinks >= 8}
                onClick={() => updateExtraHeatSinks(1)}
              >
                ＋
              </button>
            </div>
          </div>

          <div className="cm-subhead" style={{ marginTop: '0.35rem' }}>
            3. 武装カスタマイズ（4枠）＋追加弾薬
          </div>
          <div className="cm-stepper-row" style={{ marginBottom: '0.35rem' }}>
            <span>LRM 発射モード</span>
            <div className="cm-seg">
              <button
                type="button"
                className={(blueprint.lrmFireMode ?? 'salvo') === 'salvo' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
                onClick={() => handleSetLrmMode('salvo')}
                title="全弾同時発射：AMS を飽和突破しやすい"
              >
                一斉斉射 (Salvo)
              </button>
              <button
                type="button"
                className={blueprint.lrmFireMode === 'stream' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
                onClick={() => handleSetLrmMode('stream')}
                title="連続垂れ流し：高精度で断続的に制圧（AMS に落とされやすい）"
              >
                垂れ流し (Stream)
              </button>
            </div>
          </div>
          {(
            [
              {
                key: 'rightArmWeapon',
                slot: 'rightArm',
                label: '右腕武装',
                catalog: ARM_WEAPONS,
                spec: getArmWeaponSpec(blueprint.parts.rightArmWeapon),
              },
              {
                key: 'leftArmWeapon',
                slot: 'leftArm',
                label: '左腕武装',
                catalog: ARM_WEAPONS,
                spec: getArmWeaponSpec(blueprint.parts.leftArmWeapon),
              },
              {
                key: 'rightShoulderWeapon',
                slot: 'rightShoulder',
                label: '右胴武装',
                catalog: SHOULDER_WEAPONS,
                spec: getShoulderWeaponSpec(blueprint.parts.rightShoulderWeapon),
              },
              {
                key: 'leftShoulderWeapon',
                slot: 'leftShoulder',
                label: '左胴武装',
                catalog: SHOULDER_WEAPONS,
                spec: getShoulderWeaponSpec(blueprint.parts.leftShoulderWeapon),
              },
            ] as const
          ).map((row) => {
            const extraTons = getWeaponSlotExtraAmmoTons(blueprint, row.slot);
            const ammoPerTon = row.spec.ammoPerTon ?? row.spec.maxAmmo;
            const totalAmmo =
              row.spec.maxAmmo > 0 ? row.spec.maxAmmo + extraTons * ammoPerTon : row.spec.maxAmmo;
            return (
              <div key={row.slot} className="cm-weapon-slot-block">
                <label className="cm-select-row">
                  <span>{row.label}</span>
                  <select
                    value={blueprint.parts[row.key]}
                    onChange={(e) => updateWeapon(row.key, e.target.value)}
                  >
                    {row.catalog.map((p) => {
                      const rangeTxt =
                        p.maxRange && p.maxRange > p.range
                          ? `射程${p.range}-${p.maxRange}m`
                          : p.range > 0
                            ? `${p.kind === 'ams' || p.kind === 'bap' ? '効果' : '射程'}${p.range}m`
                            : '';
                      const burnTxt = p.burnDurationSec ? ` / 照射${p.burnDurationSec}s` : '';
                      const ammoTxt =
                        p.maxAmmo > 0
                          ? `${p.maxAmmo}発`
                          : p.kind === 'ams' || p.kind === 'bap'
                            ? '常時'
                            : p.damage > 0
                              ? '∞'
                              : '-';
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.weight.toFixed(1)}t / 熱{p.heatCost} / {ammoTxt}
                          {rangeTxt ? ` / ${rangeTxt}` : ''}
                          {burnTxt})
                        </option>
                      );
                    })}
                  </select>
                </label>
                {row.spec.maxAmmo > 0 && (
                  <div className="cm-ammo-row">
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

          <div className="cm-subhead" style={{ marginTop: '0.55rem' }}>
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
              const isPassive = row.spec.kind === 'ams' || row.spec.kind === 'bap';
              const equipped = row.spec.id !== row.noneId && !isPassive;
              return (
                <div key={row.slot} className={`cm-wgroup-row ${equipped ? '' : 'is-empty-slot'}`}>
                  <span className="cm-wgroup-slot-label">
                    <b>{row.label}</b>: {row.spec.id !== row.noneId ? row.spec.name : '未装備'}
                  </span>
                  <div className="cm-wgroup-btns">
                    {WEAPON_GROUP_IDS.map((gid) => {
                      const active = resolvedGroups[gid].includes(row.slot);
                      return (
                        <button
                          key={gid}
                          type="button"
                          disabled={isPassive}
                          className={`cm-wgroup-btn ${active ? `is-active is-${gid.toLowerCase()}` : ''}`}
                          onClick={() => toggleGroupMember(gid, row.slot)}
                          title={isPassive ? '常時稼働モジュールのためグループ対象外' : `${gid} に ${row.label} を含める/外す`}
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
                  {sum.equippedSpecs.length > 0
                    ? `${sum.equippedSpecs.map((s) => s.name).join(' + ')} (威力${sum.totalDamage} / 熱${sum.totalHeat})`
                    : '未割当'}
                </div>
              );
            })}
          </div>
        </div>

        <div className="cm-garage-armor">
          <div className="cm-subhead">
            4. 部位別・前後装甲配分（{stats.armorWeight.toFixed(1)}t / 100pt=1t）
          </div>
          {armorSliders.map((item) => (
            <label key={item.key} className="cm-armor-slider-row">
              <span>{item.label}</span>
              <input
                type="range"
                min={0}
                max={item.max}
                step={5}
                value={blueprint.armor[item.key]}
                onChange={(e) => updateArmor(item.key, Number(e.target.value))}
              />
              <span>
                {blueprint.armor[item.key]}/{item.max}
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
