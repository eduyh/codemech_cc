import { getWeaponSpec } from '../data/parts';
import {
  DualArmorPartRuntimeState,
  MechRuntimeState,
  SingleArmorPartRuntimeState,
  WeaponSlotId,
} from '../types/mech';

interface MechPartsHudProps {
  mech: MechRuntimeState | undefined;
}

function pct(cur: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
}

function partColor(destroyed: boolean, ratio: number): string {
  if (destroyed) return '#334155';
  if (ratio > 0.7) return '#22c55e';
  if (ratio > 0.35) return '#f59e0b';
  return '#ef4444';
}

function dualRatio(p: DualArmorPartRuntimeState): number {
  const cur = p.frontArmor + p.rearArmor + p.structure;
  const max = p.maxFrontArmor + p.maxRearArmor + p.maxStructure;
  return max > 0 ? cur / max : 0;
}

function singleRatio(p: SingleArmorPartRuntimeState): number {
  const cur = p.armor + p.structure;
  const max = p.maxArmor + p.maxStructure;
  return max > 0 ? cur / max : 0;
}

function DualPartCard({
  title,
  part,
}: {
  title: string;
  part: DualArmorPartRuntimeState;
}) {
  return (
    <div className={`cm-part-box ${part.destroyed ? 'is-broken' : ''}`}>
      <div className="cm-part-name">
        <span>{title}</span>
        <span>{part.destroyed ? '破壊' : `${Math.round(part.structure)}/${part.maxStructure}`}</span>
      </div>
      <div className="cm-bar-row">
        <span>前</span>
        <div className="cm-bar">
          <div className="cm-bar-fill cm-bar-front" style={{ width: `${pct(part.frontArmor, part.maxFrontArmor)}%` }} />
        </div>
        <span>{Math.round(part.frontArmor)}</span>
      </div>
      <div className="cm-bar-row">
        <span>後</span>
        <div className="cm-bar">
          <div className="cm-bar-fill cm-bar-rear" style={{ width: `${pct(part.rearArmor, part.maxRearArmor)}%` }} />
        </div>
        <span>{Math.round(part.rearArmor)}</span>
      </div>
    </div>
  );
}

function SinglePartCard({
  title,
  part,
  critical,
}: {
  title: string;
  part: SingleArmorPartRuntimeState;
  critical?: boolean;
}) {
  return (
    <div className={`cm-part-box ${part.destroyed ? 'is-broken' : ''}`}>
      <div className="cm-part-name">
        <span>{title}{critical ? '★' : ''}</span>
        <span>{part.destroyed ? '破壊' : `${Math.round(part.structure)}/${part.maxStructure}`}</span>
      </div>
      <div className="cm-bar-row">
        <span>甲</span>
        <div className="cm-bar">
          <div className="cm-bar-fill cm-bar-single" style={{ width: `${pct(part.armor, part.maxArmor)}%` }} />
        </div>
        <span>{Math.round(part.armor)}</span>
      </div>
    </div>
  );
}

const SLOT_LABELS: Record<WeaponSlotId, string> = {
  rightArm: '右腕',
  leftArm: '左腕',
  rightShoulder: '右胴',
  leftShoulder: '左胴',
};

export function MechPartsHud({ mech }: MechPartsHudProps) {
  if (!mech) return null;
  const heatPct = Math.min(100, pct(mech.heat, mech.maxHeat));
  const p = mech.parts;

  const headFill = partColor(p.head.destroyed, singleRatio(p.head));
  const torsoFrontFill = partColor(
    p.torso.destroyed,
    p.torso.maxFrontArmor > 0 ? p.torso.frontArmor / p.torso.maxFrontArmor : p.torso.structure / p.torso.maxStructure
  );
  const torsoRearFill = partColor(
    p.torso.destroyed,
    p.torso.maxRearArmor > 0 ? p.torso.rearArmor / p.torso.maxRearArmor : p.torso.structure / p.torso.maxStructure
  );
  const rTorsoFrontFill = partColor(
    p.rightShoulder.destroyed,
    p.rightShoulder.maxFrontArmor > 0
      ? p.rightShoulder.frontArmor / p.rightShoulder.maxFrontArmor
      : dualRatio(p.rightShoulder)
  );
  const rTorsoRearFill = partColor(
    p.rightShoulder.destroyed,
    p.rightShoulder.maxRearArmor > 0
      ? p.rightShoulder.rearArmor / p.rightShoulder.maxRearArmor
      : dualRatio(p.rightShoulder)
  );
  const lTorsoFrontFill = partColor(
    p.leftShoulder.destroyed,
    p.leftShoulder.maxFrontArmor > 0
      ? p.leftShoulder.frontArmor / p.leftShoulder.maxFrontArmor
      : dualRatio(p.leftShoulder)
  );
  const lTorsoRearFill = partColor(
    p.leftShoulder.destroyed,
    p.leftShoulder.maxRearArmor > 0
      ? p.leftShoulder.rearArmor / p.leftShoulder.maxRearArmor
      : dualRatio(p.leftShoulder)
  );
  const rArmFill = partColor(p.rightArm.destroyed, singleRatio(p.rightArm));
  const lArmFill = partColor(p.leftArm.destroyed, singleRatio(p.leftArm));
  const rLegFill = partColor(p.rightLeg.destroyed, singleRatio(p.rightLeg));
  const lLegFill = partColor(p.leftLeg.destroyed, singleRatio(p.leftLeg));

  return (
    <div className="cm-parts-hud">
      <div className="cm-hud-top">
        <div>
          <strong>{mech.name}</strong> ({mech.teamId} / {mech.stats.loadCapacity}t) —{' '}
          {mech.alive ? `高度 ${mech.pos.z.toFixed(1)}m` : `撃破 (${mech.destroyedReason})`}{' '}
          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
            [
            {!mech.stats.hasBoosterMount
              ? 'ブースト非搭載'
              : mech.stats.boosterActive
                ? 'ブーストON'
                : 'ブーストOFF'}
            {' / '}
            腰 {mech.torsoYawOffsetDeg >= 0 ? `+${Math.round(mech.torsoYawOffsetDeg)}` : Math.round(mech.torsoYawOffsetDeg)}°
            {' / '}
            視野 ±{Math.round(mech.stats.visionFovHalfDeg * (mech.parts.head.destroyed ? 0.55 : 1))}°
            {' / '}
            レーダー {Math.round(mech.stats.radarRange * (mech.parts.head.destroyed ? 0.4 : 1))}m
            ]
          </span>
        </div>
        <div className="cm-hud-stats">
          与ダメ {Math.round(mech.damageDealt)} / 被ダメ {Math.round(mech.damageTaken)} / 撃破 {mech.kills}
        </div>
      </div>

      <div className="cm-en-row">
        <span>HEAT</span>
        <div className="cm-bar cm-bar--lg">
          <div
            className={`cm-bar-fill ${
              mech.thermalShutdown || mech.heat >= mech.maxHeat * 0.85
                ? 'cm-bar-overheat'
                : 'cm-bar-en'
            }`}
            style={{ width: `${heatPct}%` }}
          />
        </div>
        <span>
          {Math.round(mech.heat)}/{mech.maxHeat}{' '}
          {mech.thermalShutdown
            ? 'SHUTDOWN'
            : mech.overrideShutdownActive
              ? 'OVERRIDE (熱ダメ!)'
              : mech.heat >= mech.maxHeat * 0.8
                ? 'HIGH HEAT'
                : ''}
        </span>
      </div>

      <div className="cm-hud-body">
        <svg
          className="cm-silhouette-svg"
          viewBox="0 0 120 132"
          aria-label="機体8部位 BattleMech シルエット"
        >
          {/* Recessed Cockpit Head */}
          <rect x="49" y="6" width="22" height="14" rx="4" fill={headFill} stroke="#0f172a" strokeWidth="1.5" />
          <text x="60" y="15.5" textAnchor="middle" fontSize="7" fill="#020617" fontWeight="800">頭</text>
          {/* Right Torso (viewer-left) front & rear */}
          <rect x="24" y="23" width="21" height="24" rx="3" fill={rTorsoFrontFill} stroke="#0f172a" strokeWidth="1.5" />
          <rect x="24" y="48" width="21" height="14" rx="2" fill={rTorsoRearFill} stroke="#0f172a" strokeWidth="1.5" />
          {/* Center Torso front & rear */}
          <rect x="47" y="21" width="26" height="26" rx="3" fill={torsoFrontFill} stroke="#0f172a" strokeWidth="1.5" />
          <rect x="47" y="48" width="26" height="15" rx="2" fill={torsoRearFill} stroke="#0f172a" strokeWidth="1.5" />
          {/* Left Torso (viewer-right) front & rear */}
          <rect x="75" y="23" width="21" height="24" rx="3" fill={lTorsoFrontFill} stroke="#0f172a" strokeWidth="1.5" />
          <rect x="75" y="48" width="21" height="14" rx="2" fill={lTorsoRearFill} stroke="#0f172a" strokeWidth="1.5" />
          {/* Outboard Arms */}
          <rect x="7" y="29" width="14" height="39" rx="3" fill={rArmFill} stroke="#0f172a" strokeWidth="1.5" />
          <rect x="99" y="29" width="14" height="39" rx="3" fill={lArmFill} stroke="#0f172a" strokeWidth="1.5" />
          {/* Pelvis & Legs */}
          <rect x="40" y="64" width="40" height="7" rx="2" fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
          <rect x="37" y="72" width="17" height="53" rx="3" fill={rLegFill} stroke="#0f172a" strokeWidth="1.5" />
          <rect x="66" y="72" width="17" height="53" rx="3" fill={lLegFill} stroke="#0f172a" strokeWidth="1.5" />
          <text x="34.5" y="37" textAnchor="middle" fontSize="6.8" fill="#020617" fontWeight="700">右胴</text>
          <text x="60" y="36" textAnchor="middle" fontSize="7" fill="#020617" fontWeight="800">中胴</text>
          <text x="85.5" y="37" textAnchor="middle" fontSize="6.8" fill="#020617" fontWeight="700">左胴</text>
          <text x="60" y="58" textAnchor="middle" fontSize="7" fill="#020617" fontWeight="700">後</text>
          <text x="14" y="51" textAnchor="middle" fontSize="6.8" fill="#020617" fontWeight="700">右</text>
          <text x="106" y="51" textAnchor="middle" fontSize="6.8" fill="#020617" fontWeight="700">左</text>
        </svg>

        <div className="cm-parts-grid">
          <SinglePartCard title="頭" part={p.head} critical />
          <DualPartCard title="中央胴" part={p.torso} />
          <DualPartCard title="右胴" part={p.rightShoulder} />
          <DualPartCard title="左胴" part={p.leftShoulder} />
          <SinglePartCard title="右腕" part={p.rightArm} />
          <SinglePartCard title="左腕" part={p.leftArm} />
          <SinglePartCard title="右脚" part={p.rightLeg} />
          <SinglePartCard title="左脚" part={p.leftLeg} />
        </div>
      </div>

      <div className="cm-weapon-pills">
        {(['rightArm', 'leftArm', 'rightShoulder', 'leftShoulder'] as WeaponSlotId[]).map((slot) => {
          const wState = mech.weapons[slot];
          if (wState.weaponId === 'shd_none' || wState.weaponId === 'arm_none') return null;
          const spec = getWeaponSpec(wState.weaponId);
          const partBroken = mech.parts[slot].destroyed;
          const outOfAmmo = spec.maxAmmo > 0 && wState.ammoRemaining <= 0;
          return (
            <span
              key={slot}
              className={`cm-wep-pill ${
                partBroken || outOfAmmo
                  ? 'is-broken'
                  : wState.cooldownRemaining <= 0
                    ? 'is-ready'
                    : ''
              }`}
            >
              {SLOT_LABELS[slot]}:{spec.name.split(' ')[0] ?? spec.name}{' '}
              {partBroken
                ? '破壊'
                : outOfAmmo
                  ? '弾切れ'
                  : wState.ammoRemaining > 0
                    ? `残${wState.ammoRemaining}`
                    : '∞'}
            </span>
          );
        })}
      </div>
    </div>
  );
}
