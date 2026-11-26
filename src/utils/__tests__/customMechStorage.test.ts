import { describe, expect, it } from 'vitest';
import { PRESET_ABC, PRESET_ABH, PRESET_ABL } from '../../data/presets';
import {
  deleteSavedCustomMech,
  extractCustomTagFromName,
  formatCustomMechName,
  formatMechDropdownLabel,
  getBaseMechName,
  getBaseMechPrefix,
  getChassisRoleName,
  getDefaultModelTagForBlueprint,
  getEditableModelTagFromBlueprint,
  getRevertMechName,
  isStarterMechId,
  normalizeCustomTag,
  saveCustomMech,
} from '../customMechStorage';

describe('customMechStorage', () => {
  it('normalizes model suffix strings while preserving Japanese, hyphens, and clamping at 8 characters', () => {
    expect(normalizeCustomTag('  ＡＢＣＤＥ  ')).toBe('ABCDE');
    expect(normalizeCustomTag('狙撃A1-カスタムテスト')).toBe('狙撃A1-カスタ');
    expect(normalizeCustomTag('x_2z / []')).toBe('x_2z');
    expect(normalizeCustomTag('改－２')).toBe('改-2');
  });

  it('formats ABC-TAG / LLB-TAG / XHD-TAG model names and keeps legacy CM-XX/TAG compatibility', () => {
    expect(formatCustomMechName('ABC-T1', 'X2')).toBe('ABC-X2');
    expect(extractCustomTagFromName('ABC-X2')).toBe('X2');

    expect(formatCustomMechName('LLB-T1', '改')).toBe('LLB-改');
    expect(extractCustomTagFromName('LLB-改')).toBe('改');

    expect(formatCustomMechName('XHD-T1', '')).toBe('XHD-T1');
    expect(extractCustomTagFromName('XHD-T1')).toBe('T1');

    expect(formatCustomMechName('ABC', 'T1')).toBe('ABC-T1');
    expect(getBaseMechPrefix('chassis_abc')).toBe('ABC');
    expect(getBaseMechPrefix('chassis_abl')).toBe('LLB');
    expect(getBaseMechPrefix('chassis_abh')).toBe('XHD');
    expect(getBaseMechName('chassis_fnt')).toBe('FNT-T1');
    expect(getBaseMechPrefix('chassis_fnt')).toBe('FNT');
    expect(getBaseMechName('chassis_ftr')).toBe('FTR-T1');
    expect(getBaseMechPrefix('chassis_ftr')).toBe('FTR');
    expect(getEditableModelTagFromBlueprint(PRESET_ABC)).toBe('');
    expect(getEditableModelTagFromBlueprint(PRESET_ABL)).toBe('');
    expect(getEditableModelTagFromBlueprint(PRESET_ABH)).toBe('');
    expect(getDefaultModelTagForBlueprint(PRESET_ABL)).toBe('T1');
    expect(getDefaultModelTagForBlueprint(PRESET_ABH)).toBe('T1');
    expect(getRevertMechName(PRESET_ABH)).toBe('XHD-T1');
    expect(getEditableModelTagFromBlueprint({ id: PRESET_ABH.id, name: 'XHD-Z9' })).toBe('Z9');

    // Legacy compatibility
    const formatted = formatCustomMechName('CM-01 ヴァンガード', 'ABC');
    expect(formatted).toBe('CM-01/ABC ヴァンガード');
    expect(extractCustomTagFromName(formatted)).toBe('ABC');
    expect(extractCustomTagFromName('ABC/T1')).toBe('T1');
    expect(extractCustomTagFromName('CM-01 ヴァンガード')).toBe('');
    expect(extractCustomTagFromName('CM-03 フォートレス [Z2]')).toBe('Z2');
  });

  it('saves new custom mechs with hyphen model suffix, falls back to T2, and overwrites same chassis+tag', () => {
    const first = saveCustomMech([], PRESET_ABH, 'L20X', 1000);
    expect(first.updated).toBe(false);
    expect(first.saved.tag).toBe('L20X');
    expect(first.saved.blueprint.name).toBe('XHD-L20X');
    expect(first.nextList).toHaveLength(1);

    // Blank tag receives automatic fallback "T2" so it does not collide with starter "T1"
    const autoTagged = saveCustomMech(first.nextList, PRESET_ABC, '   ', 2000);
    expect(autoTagged.updated).toBe(false);
    expect(autoTagged.saved.tag).toBe('T2');
    expect(autoTagged.saved.blueprint.name).toBe('ABC-T2');
    expect(autoTagged.nextList).toHaveLength(2);

    const autoHeavy = saveCustomMech(autoTagged.nextList, PRESET_ABH, '   ', 2500);
    expect(autoHeavy.saved.tag).toBe('T2');
    expect(autoHeavy.saved.blueprint.name).toBe('XHD-T2');

    // Same chassis + tag updates in place without duplicating
    const mutatedHeavy = { ...structuredClone(PRESET_ABH), extraHeatSinks: 3 };
    const overwrite = saveCustomMech(autoHeavy.nextList, mutatedHeavy, 'L20X', 3000);
    expect(overwrite.updated).toBe(true);
    expect(overwrite.saved.id).toBe(first.saved.id);
    expect(overwrite.saved.blueprint.extraHeatSinks).toBe(3);
    expect(overwrite.nextList).toHaveLength(3);

    // Mutating original input after saving does not affect saved blueprint
    mutatedHeavy.extraHeatSinks = 0;
    const stored = overwrite.nextList.find((m) => m.id === first.saved.id);
    expect(stored?.blueprint.extraHeatSinks).toBe(3);
  });

  it('deletes saved custom mechs cleanly by id and stores pilotId with starter check', () => {
    expect(isStarterMechId(PRESET_ABH.id)).toBe(true);
    expect(isStarterMechId('custom_nonexistent')).toBe(false);

    const s1 = saveCustomMech([], PRESET_ABH, 'A1', 1000, 'pilot_custom_alpha');
    expect(s1.saved.pilotId).toBe('pilot_custom_alpha');
    expect(s1.saved.blueprint.defaultPilotId).toBe('pilot_custom_alpha');
    expect(isStarterMechId(s1.saved.id)).toBe(false);

    const s2 = saveCustomMech(s1.nextList, PRESET_ABC, 'B2', 2000);
    const remaining = deleteSavedCustomMech(s2.nextList, s1.saved.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].tag).toBe('B2');
  });

  it('formats unified Japanese-role-first dropdown labels for chassis and mech instances', () => {
    expect(getChassisRoleName('chassis_abc')).toBe('基本ミドル');
    expect(getChassisRoleName('chassis_fnt')).toBe('高機動ライト');
    expect(getChassisRoleName('chassis_abl')).toBe('基本ライト');
    expect(getChassisRoleName('chassis_abh')).toBe('基本ヘビー');

    expect(formatMechDropdownLabel('chassis_abc', 'ABC-T1')).toBe('基本ミドル ABC-T1');
    expect(formatMechDropdownLabel('chassis_abl', 'LLB-X2')).toBe('基本ライト LLB-X2');
    expect(formatMechDropdownLabel('chassis_abh', 'XHD-T1')).toBe('基本ヘビー XHD-T1');
    expect(formatMechDropdownLabel('chassis_fnt', 'FNT-改')).toBe('高機動ライト FNT-改');
    expect(formatMechDropdownLabel('chassis_abc', '基本ミドル ABC-T1')).toBe('基本ミドル ABC-T1');
  });
});
