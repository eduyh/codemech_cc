import { getWeaponSlotMountCount, getWeaponSpec } from '../data/parts';
import { isMechAmsActive, isMechBapActive, isMechEcmActive } from '../engine/mechSim';
import {
  DualArmorPartRuntimeState,
  MechRuntimeState,
  SingleArmorPartRuntimeState,
  WeaponSlotId,
} from '../types/mech';
import { MechPaperdoll } from './MechPaperdoll';

interface MechPartsHudProps {
  mech: MechRuntimeState | undefined;
  roleLabel?: string;
  accent?: 'ally' | 'enemy';
  selected?: boolean;
  compact?: boolean;
  onSelect?: () => void;
}

function pct(cur: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
}

function DualPartCard({
  title,
  part,
  areaClass,
}: {
  title: string;
  part: DualArmorPartRuntimeState;
  areaClass?: string;
}) {
  return (
    <div
      className={`cm-part-box ${part.destroyed ? 'is-broken' : ''} ${areaClass ?? ''}`}
      title={`構造HP ${Math.round(part.structure)}/${part.maxStructure}`}
    >
      <div className="cm-part-name">
        <span>{title}</span>
        <span>{part.destroyed ? '破壊' : `内${Math.round(part.structure)}`}</span>
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
  areaClass,
}: {
  title: string;
  part: SingleArmorPartRuntimeState;
  critical?: boolean;
  areaClass?: string;
}) {
  return (
    <div
      className={`cm-part-box ${part.destroyed ? 'is-broken' : ''} ${areaClass ?? ''}`}
      title={`構造HP ${Math.round(part.structure)}/${part.maxStructure}`}
    >
      <div className="cm-part-name">
        <span>{title}{critical ? '★' : ''}</span>
        <span>{part.destroyed ? '破壊' : `内${Math.round(part.structure)}`}</span>
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

export function MechPartsHud({
  mech,
  roleLabel,
  accent,
  selected,
  compact,
  onSelect,
}: MechPartsHudProps) {
  if (!mech) return null;
  const heatPct = Math.min(100, pct(mech.heat, mech.maxHeat));
  const p = mech.parts;

  const torsoYaw =
    mech.torsoYawOffsetDeg >= 0
      ? `+${Math.round(mech.torsoYawOffsetDeg)}°`
      : `${Math.round(mech.torsoYawOffsetDeg)}°`;
  const visionDeg = Math.round(mech.stats.visionFovHalfDeg * (p.head.destroyed ? 0.55 : 1)) * 2;
  const radarM = Math.round(mech.stats.radarRange * (p.head.destroyed ? 0.4 : 1));
  const lockPct =
    mech.lockTargetId && mech.lockRequiredSec > 0
      ? Math.round(Math.min(100, (mech.lockProgressSec / mech.lockRequiredSec) * 100))
      : null;

  const rootClasses = [
    'cm-parts-hud',
    accent ? `is-${accent}` : '',
    selected ? 'is-selected' : '',
    compact ? 'is-compact' : '',
    onSelect ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const telemetryNode = (
    <div className="cm-hud-telemetry">
      <span>高度 {mech.pos.z.toFixed(1)}m</span>
      <span>腰 {torsoYaw}</span>
      <span>視野 {visionDeg}° / {radarM}m</span>
      <span>RCS {mech.stats.radarSignatureRange}m</span>
      {mech.stats.hasBoosterMount && (
        <span>{mech.stats.boosterActive ? 'ブーストON' : 'ブーストOFF'}</span>
      )}
      {(mech.stats.ecmActive || isMechEcmActive(mech)) && (
        <span>
          {mech.ecmDisruptedTicks > 0
            ? 'ECM:EMP停止'
            : isMechEcmActive(mech)
              ? 'ECM稼働'
              : 'ECM停止'}
        </span>
      )}
      {mech.stats.hasBap && <span>{isMechBapActive(mech) ? 'シーカー稼働' : 'シーカー停止'}</span>}
      {mech.stats.hasAms && <span>{isMechAmsActive(mech) ? 'AMS稼働' : 'AMS停止'}</span>}
      {lockPct !== null && <span>LOCK {lockPct}%</span>}
    </div>
  );

  const heatNode = (
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
  );

  return (
    <div
      className={rootClasses}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      <div className="cm-hud-top">
        <div className="cm-hud-title-group">
          {roleLabel && (
            <span className={`cm-hud-role-badge ${accent === 'enemy' ? 'is-enemy' : 'is-ally'}`}>
              {roleLabel}
            </span>
          )}
          <strong>{mech.name}</strong>
          <span className="cm-hud-meta-badge">
            {mech.teamId} · {mech.stats.loadCapacity}t
          </span>
          {!mech.alive && (
            <span className="cm-hud-dead-badge">撃破 ({mech.destroyedReason})</span>
          )}
        </div>
        <div className="cm-hud-stats">
          与 {Math.round(mech.damageDealt)} / 被 {Math.round(mech.damageTaken)} / 撃破 {mech.kills}
        </div>
      </div>

      {compact ? (
        <>
          {heatNode}
          <div className="cm-hud-compact-hero">
            <MechPaperdoll mode="battle" parts={p} className="cm-silhouette-svg" />
            {telemetryNode}
          </div>
          <div className="cm-parts-grid is-two-col">
            <SinglePartCard title="頭" part={p.head} critical />
            <DualPartCard title="中央胴" part={p.torso} />
            <DualPartCard title="右胴" part={p.rightShoulder} />
            <DualPartCard title="左胴" part={p.leftShoulder} />
            <SinglePartCard title="右腕" part={p.rightArm} />
            <SinglePartCard title="左腕" part={p.leftArm} />
            <SinglePartCard title="右脚" part={p.rightLeg} />
            <SinglePartCard title="左脚" part={p.leftLeg} />
          </div>
        </>
      ) : (
        <>
          {telemetryNode}
          {heatNode}
          <div className="cm-hud-body">
            <MechPaperdoll mode="battle" parts={p} className="cm-silhouette-svg" />

            <div className="cm-parts-grid is-anatomical">
              <SinglePartCard title="頭" part={p.head} critical areaClass="cm-area-head" />
              <DualPartCard title="右胴" part={p.rightShoulder} areaClass="cm-area-rtorso" />
              <DualPartCard title="中央胴" part={p.torso} areaClass="cm-area-ctorso" />
              <DualPartCard title="左胴" part={p.leftShoulder} areaClass="cm-area-ltorso" />
              <SinglePartCard title="右腕" part={p.rightArm} areaClass="cm-area-rarm" />
              <SinglePartCard title="左腕" part={p.leftArm} areaClass="cm-area-larm" />
              <SinglePartCard title="右脚" part={p.rightLeg} areaClass="cm-area-rleg" />
              <SinglePartCard title="左脚" part={p.leftLeg} areaClass="cm-area-lleg" />
            </div>
          </div>
        </>
      )}

      <div className="cm-weapon-pills">
        {(['rightArm', 'leftArm', 'rightShoulder', 'leftShoulder'] as WeaponSlotId[]).map((slot) => {
          const wState = mech.weapons[slot];
          if (wState.weaponId === 'shd_none' || wState.weaponId === 'arm_none') return null;
          const spec = getWeaponSpec(wState.weaponId);
          const mountCount = getWeaponSlotMountCount(mech.blueprint, slot);
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
              {SLOT_LABELS[slot]}:{spec.name.split(' ')[0] ?? spec.name}
              {mountCount > 1 ? `×${mountCount}` : ''}{' '}
              {partBroken
                ? '破壊'
                : outOfAmmo
                  ? '弾切れ'
                  : wState.ammoRemaining > 0
                    ? `残${wState.ammoRemaining}`
                    : spec.maxAmmo < 0
                      ? '∞'
                      : '稼働'}
            </span>
          );
        })}
      </div>
    </div>
  );
}
