import { describe, expect, it } from 'vitest';
import { PRESET_FORTRESS, PRESET_VANGUARD } from '../../data/presets';
import {
  deleteSavedCustomMech,
  extractCustomTagFromName,
  formatCustomMechName,
  isStarterMechId,
  normalizeCustomTag,
  saveCustomMech,
} from '../customMechStorage';

describe('customMechStorage', () => {
  it('normalizes tags to half-width ASCII alphanumeric/_/- up to 3 characters', () => {
    expect(normalizeCustomTag('  ＡＢＣＤＥ  ')).toBe('ABC');
    expect(normalizeCustomTag('狙撃A1-カスタム')).toBe('A1-');
    expect(normalizeCustomTag('x_2z')).toBe('x_2');
  });

  it('formats CM-XX/TAG code prefixes and extracts tags back', () => {
    const formatted = formatCustomMechName('CM-01 ヴァンガード', 'ABC');
    expect(formatted).toBe('CM-01/ABC ヴァンガード');
    expect(extractCustomTagFromName(formatted)).toBe('ABC');
    expect(formatCustomMechName('ABC', 'T1')).toBe('ABC/T1');
    expect(extractCustomTagFromName('ABC/T1')).toBe('T1');
    expect(extractCustomTagFromName('CM-01 ヴァンガード')).toBe('');
    expect(extractCustomTagFromName('CM-03 フォートレス [Z2]')).toBe('Z2');
  });

  it('saves new custom mechs, generates half-width fallback tags, and overwrites same chassis+tag', () => {
    const first = saveCustomMech([], PRESET_FORTRESS, 'L20X', 1000);
    expect(first.updated).toBe(false);
    expect(first.saved.tag).toBe('L20');
    expect(first.saved.blueprint.name).toBe('CM-03/L20 フォートレス');
    expect(first.nextList).toHaveLength(1);

    // Blank tag receives automatic half-width fallback "C1"
    const autoTagged = saveCustomMech(first.nextList, PRESET_VANGUARD, '   ', 2000);
    expect(autoTagged.updated).toBe(false);
    expect(autoTagged.saved.tag).toBe('C1');
    expect(autoTagged.saved.blueprint.name).toBe('CM-01/C1 ヴァンガード');
    expect(autoTagged.nextList).toHaveLength(2);

    // Same chassis + tag updates in place without duplicating
    const mutatedFortress = { ...structuredClone(PRESET_FORTRESS), extraHeatSinks: 3 };
    const overwrite = saveCustomMech(autoTagged.nextList, mutatedFortress, 'L20', 3000);
    expect(overwrite.updated).toBe(true);
    expect(overwrite.saved.id).toBe(first.saved.id);
    expect(overwrite.saved.blueprint.extraHeatSinks).toBe(3);
    expect(overwrite.nextList).toHaveLength(2);

    // Mutating original input after saving does not affect saved blueprint
    mutatedFortress.extraHeatSinks = 0;
    const stored = overwrite.nextList.find((m) => m.id === first.saved.id);
    expect(stored?.blueprint.extraHeatSinks).toBe(3);
  });

  it('deletes saved custom mechs cleanly by id and stores pilotId with starter check', () => {
    expect(isStarterMechId(PRESET_FORTRESS.id)).toBe(true);
    expect(isStarterMechId('custom_nonexistent')).toBe(false);

    const s1 = saveCustomMech([], PRESET_FORTRESS, 'A1', 1000, 'pilot_custom_alpha');
    expect(s1.saved.pilotId).toBe('pilot_custom_alpha');
    expect(s1.saved.blueprint.defaultPilotId).toBe('pilot_custom_alpha');
    expect(isStarterMechId(s1.saved.id)).toBe(false);

    const s2 = saveCustomMech(s1.nextList, PRESET_VANGUARD, 'B2', 2000);
    const remaining = deleteSavedCustomMech(s2.nextList, s1.saved.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].tag).toBe('B2');
  });
});
