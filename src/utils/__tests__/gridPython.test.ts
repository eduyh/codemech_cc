import { describe, expect, it } from 'vitest';
import { STARTER_MECHS, STARTER_PILOTS } from '../../data/presets';
import { fullProgramToPython, pilotGridToPython, subroutineToPython } from '../gridPython';

describe('gridPython read-only translator (def main + def sub_s1..s5)', () => {
  it('translates all starter pilots and mech subroutines into readable Python', () => {
    expect(STARTER_PILOTS).toHaveLength(3);
    expect(STARTER_MECHS).toHaveLength(3);

    for (const pilot of STARTER_PILOTS) {
      const py = pilotGridToPython(pilot);
      expect(py).toContain('def main(mech, vision, radar):');
      expect(py).toContain('sub_s1');
    }

    for (const mech of STARTER_MECHS) {
      expect(mech.subroutines).toHaveLength(5);
      for (const sub of mech.subroutines) {
        const py = subroutineToPython(sub);
        expect(py).toContain(`def sub_${sub.slotId.toLowerCase()}(target`);
      }
    }

    const full = fullProgramToPython(STARTER_PILOTS[0], STARTER_MECHS[0]);
    expect(full).toContain('def main(mech, vision, radar):');
    expect(full).toContain('def sub_s1(target):');
    expect(full).toContain('def sub_s3(target, arg=None):');
    expect(full).toContain('arg=220');

    const lightPy = pilotGridToPython(STARTER_PILOTS[1]);
    expect(lightPy).toContain('arg=110');

    const heavyPy = pilotGridToPython(STARTER_PILOTS[2]);
    expect(heavyPy).toContain('arg=180');
  });
});
