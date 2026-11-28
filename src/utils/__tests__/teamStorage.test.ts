import { describe, expect, it } from 'vitest';
import { DEFAULT_PILOT_PROFILE, PRESET_ABC, PRESET_ABH, PRESET_ABL, STARTER_MECHS } from '../../data/presets';
import {
  DEFAULT_TEAM_TONNAGE_CAP,
  buildRandomSquad,
  computeTeamTonnage,
  evaluateTeamTonnageLimit,
  formatTeamSubmissionText,
} from '../teamStorage';
import { extractMechCodesFromText } from '../shareMech';

describe('teamStorage & 180t team tonnage regulation', () => {
  it('evaluates 180t manual limit and 1.2x-1.5x random match tolerance', () => {
    expect(computeTeamTonnage([PRESET_ABC, PRESET_ABL, PRESET_ABH])).toBe(165);

    const okManual = evaluateTeamTonnageLimit(180, DEFAULT_TEAM_TONNAGE_CAP, false);
    expect(okManual.allowed).toBe(true);
    expect(okManual.effectiveCap).toBe(180);

    const overManual = evaluateTeamTonnageLimit(195, DEFAULT_TEAM_TONNAGE_CAP, false);
    expect(overManual.allowed).toBe(false);
    expect(overManual.overBy).toBe(15);

    // Random match at 1.35x -> 243t allowed
    const okRandom = evaluateTeamTonnageLimit(230, DEFAULT_TEAM_TONNAGE_CAP, true, 1.35);
    expect(okRandom.allowed).toBe(true);
    expect(okRandom.effectiveCap).toBe(243);

    const overRandom = evaluateTeamTonnageLimit(250, DEFAULT_TEAM_TONNAGE_CAP, true, 1.35);
    expect(overRandom.allowed).toBe(false);
    expect(overRandom.overBy).toBe(7);

    // 1.2x -> 216t, 1.5x -> 270t
    expect(evaluateTeamTonnageLimit(216, 180, true, 1.2).allowed).toBe(true);
    expect(evaluateTeamTonnageLimit(217, 180, true, 1.2).allowed).toBe(false);
    expect(evaluateTeamTonnageLimit(270, 180, true, 1.5).allowed).toBe(true);

    // cap <= 0 -> unlimited
    expect(evaluateTeamTonnageLimit(300, 0, false).allowed).toBe(true);
  });

  it('builds 3-mech random squads within effective cap (1.2x - 1.5x)', () => {
    const pool = STARTER_MECHS.map((mech) => ({
      mech,
      pilot: structuredClone(DEFAULT_PILOT_PROFILE),
    }));
    for (let s = 1; s <= 20; s++) {
      let state = s * 9973;
      const rng = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0xffffffff;
      };
      const squad = buildRandomSquad(pool, 3, 180, 1.35, rng);
      expect(squad).toHaveLength(3);
      expect(computeTeamTonnage(squad.map((m) => m.mech))).toBeLessThanOrEqual(243);
    }
  });

  it('formats 3-mech team submission text with team tag round-trippable by extractMechCodesFromText', () => {
    const txt = formatTeamSubmissionText(
      '第一小隊',
      [
        { mech: PRESET_ABC, pilot: DEFAULT_PILOT_PROFILE },
        { mech: PRESET_ABL, pilot: DEFAULT_PILOT_PROFILE },
        { mech: PRESET_ABH, pilot: DEFAULT_PILOT_PROFILE },
      ],
      { battleOnly: true }
    );
    const extracted = extractMechCodesFromText(txt);
    expect(extracted.warnings).toEqual([]);
    expect(extracted.candidates).toHaveLength(3);
    expect(extracted.candidates.every((c) => c.teamTag === '第一小隊' && c.battleOnly)).toBe(true);
  });
});
