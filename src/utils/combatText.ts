import { getWeaponSpec } from '../data/parts';
import { ArmorFace, MechPartId, SimCombatEvent } from '../types/mech';

export const PART_LABEL_JA: Record<MechPartId, string> = {
  head: '頭',
  torso: '中央胴',
  rightShoulder: '右胴',
  rightArm: '右腕',
  leftShoulder: '左胴',
  leftArm: '左腕',
  rightLeg: '右脚',
  leftLeg: '左脚',
};

export function formatKillCauseJa(detail?: string, face?: ArmorFace): string {
  if (detail === 'heat_meltdown') return '過熱融解（自爆）';
  if (detail === 'head_destroyed') return '頭部破壊';
  if (detail === 'torso_destroyed') {
    return face === 'rear' ? '背面コア撃破' : '中央胴コア撃破';
  }
  return '撃破';
}

export function resolveWeaponNameJa(weaponId?: string): string {
  if (!weaponId) return '';
  return getWeaponSpec(weaponId).name;
}

export function formatKillBanner(
  ev: SimCombatEvent,
  mechNameById: Map<string, string>
): { headline: string; detail: string } {
  const victim = mechNameById.get(ev.targetId ?? ev.actorId) ?? '機体';
  if (ev.detail === 'heat_meltdown') {
    return {
      headline: `${victim} 過熱融解!!`,
      detail: 'オーバーヒートにより中央胴が融解（自爆）',
    };
  }
  const killer =
    ev.actorId && ev.actorId !== (ev.targetId ?? '')
      ? mechNameById.get(ev.actorId) ?? '攻撃機'
      : '戦場ダメージ';
  const weaponName = resolveWeaponNameJa(ev.weaponId);
  const cause = formatKillCauseJa(ev.detail, ev.face);
  return {
    headline: `${victim} 撃破!!`,
    detail: `撃破者: ${killer} ／ ${weaponName ? `${weaponName}・` : ''}${cause}`,
  };
}

export function formatKillFeedLine(
  ev: SimCombatEvent,
  mechNameById: Map<string, string>
): string {
  const victim = mechNameById.get(ev.targetId ?? ev.actorId) ?? '機体';
  const killer =
    ev.actorId && ev.actorId !== (ev.targetId ?? '')
      ? mechNameById.get(ev.actorId) ?? ''
      : '';
  const weaponName = resolveWeaponNameJa(ev.weaponId);

  if (ev.type === 'mech_destroyed') {
    if (ev.detail === 'heat_meltdown') {
      return `${victim} 過熱融解 [自爆]`;
    }
    const cause = formatKillCauseJa(ev.detail, ev.face);
    const reasonTag = weaponName ? `${weaponName}・${cause}` : cause;
    return killer
      ? `${victim} 撃破 ← ${killer} [${reasonTag}]`
      : `${victim} 撃破 [${reasonTag}]`;
  }

  if (ev.type === 'part_destroyed' && ev.partId) {
    const partLabel = PART_LABEL_JA[ev.partId] ?? ev.partId;
    const byWho = killer ? ` ← ${killer}` : '';
    const byWeapon = weaponName ? ` [${weaponName}]` : '';
    return `${victim} ${partLabel}破壊${byWho}${byWeapon}`;
  }

  if (ev.type === 'thermal_shutdown') {
    const actor = mechNameById.get(ev.actorId) ?? '機体';
    return `${actor} 熱シャットダウン`;
  }

  return `${victim}`;
}
