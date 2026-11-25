import { describe, expect, it } from 'vitest';
import { PRESET_VANGUARD } from '../../data/presets';
import { MechPartId } from '../../types/mech';
import {
  applyDamageToMechParts,
  computeArmorDamageResult,
  getMechMobilityMultipliers,
  testProjectileHitMech,
} from '../hitbox';
import { createSimulation, DEFAULT_MATCH_RULES } from '../mechSim';

function createDummyMech() {
  const sim = createSimulation({
    seed: 100,
    entries: [
      { id: 'm1', name: 'Target', teamId: 'A', blueprint: PRESET_VANGUARD },
      { id: 'm2', name: 'Enemy', teamId: 'B', blueprint: PRESET_VANGUARD },
    ],
  });
  const m = sim.mechs[0];
  // Place target facing North (0 deg: front = -Y, rear = +Y, right = +X, left = -X)
  m.pos = { x: 300, y: 300, z: 0 };
  m.yawDeg = 0;
  return m;
}

describe('8-part hitbox, front/rear armor, ricochet, and part destruction', () => {
  it('hits each of the 8 mech parts accurately with targeted rays', () => {
    const pos = { x: 300, y: 300, z: 0 };
    const yaw = 0; // Front is -Y, Right is +X, Left is -X

    const cases: Array<{ part: MechPartId; from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number } }> = [
      { part: 'head', from: { x: 300, y: 290, z: 9.35 }, to: { x: 300, y: 310, z: 9.35 } },
      { part: 'torso', from: { x: 300, y: 290, z: 6.5 }, to: { x: 300, y: 310, z: 6.5 } },
      { part: 'rightShoulder', from: { x: 301.8, y: 290, z: 8.1 }, to: { x: 301.8, y: 310, z: 8.1 } },
      { part: 'leftShoulder', from: { x: 298.2, y: 290, z: 8.1 }, to: { x: 298.2, y: 310, z: 8.1 } },
      { part: 'rightArm', from: { x: 302.0, y: 290, z: 5.8 }, to: { x: 302.0, y: 310, z: 5.8 } },
      { part: 'leftArm', from: { x: 298.0, y: 290, z: 5.8 }, to: { x: 298.0, y: 310, z: 5.8 } },
      { part: 'rightLeg', from: { x: 300.8, y: 290, z: 2.3 }, to: { x: 300.8, y: 310, z: 2.3 } },
      { part: 'leftLeg', from: { x: 299.2, y: 290, z: 2.3 }, to: { x: 299.2, y: 310, z: 2.3 } },
    ];

    for (const c of cases) {
      const hit = testProjectileHitMech(c.from, c.to, pos, yaw);
      expect(hit).not.toBeNull();
      expect(hit!.partId).toBe(c.part);
    }
  });

  it('keeps head hit rate very low (< 5%) across uniform silhouette spray', () => {
    const pos = { x: 300, y: 300, z: 0 };
    let totalHits = 0;
    let headHits = 0;

    for (let ix = -27; ix <= 27; ix++) {
      for (let iz = 0; iz <= 102; iz++) {
        const x = 300 + ix * 0.1;
        const z = iz * 0.1;
        const hit = testProjectileHitMech({ x, y: 290, z }, { x, y: 310, z }, pos, 0);
        if (hit) {
          totalHits += 1;
          if (hit.partId === 'head') headHits += 1;
        }
      }
    }

    const headRatio = headHits / Math.max(1, totalHits);
    expect(totalHits).toBeGreaterThan(1000);
    expect(headRatio).toBeLessThan(0.05);
  });

  it('separates front and rear armor on torso, rightShoulder, and leftShoulder', () => {
    const mech = createDummyMech();

    const frontTorsoBefore = mech.parts.torso.frontArmor;
    const rearTorsoBefore = mech.parts.torso.rearArmor;
    const rearTorsoHit = testProjectileHitMech(
      { x: 300, y: 312, z: 6.5 },
      { x: 300, y: 290, z: 6.5 },
      mech.pos,
      mech.yawDeg
    )!;
    expect(rearTorsoHit.partId).toBe('torso');
    expect(rearTorsoHit.face).toBe('rear');
    applyDamageToMechParts(mech, rearTorsoHit, 40, DEFAULT_MATCH_RULES);
    expect(mech.parts.torso.rearArmor).toBe(rearTorsoBefore - 40);
    expect(mech.parts.torso.frontArmor).toBe(frontTorsoBefore);

    const rShdFrontBefore = mech.parts.rightShoulder.frontArmor;
    const rShdRearBefore = mech.parts.rightShoulder.rearArmor;
    const rearRShdHit = testProjectileHitMech(
      { x: 301.8, y: 312, z: 8.1 },
      { x: 301.8, y: 290, z: 8.1 },
      mech.pos,
      mech.yawDeg
    )!;
    expect(rearRShdHit.partId).toBe('rightShoulder');
    expect(rearRShdHit.face).toBe('rear');
    applyDamageToMechParts(mech, rearRShdHit, 25, DEFAULT_MATCH_RULES);
    expect(mech.parts.rightShoulder.rearArmor).toBe(rShdRearBefore - 25);
    expect(mech.parts.rightShoulder.frontArmor).toBe(rShdFrontBefore);

    const lShdFrontBefore = mech.parts.leftShoulder.frontArmor;
    const lShdRearBefore = mech.parts.leftShoulder.rearArmor;
    const rearLShdHit = testProjectileHitMech(
      { x: 298.2, y: 312, z: 8.1 },
      { x: 298.2, y: 290, z: 8.1 },
      mech.pos,
      mech.yawDeg
    )!;
    expect(rearLShdHit.partId).toBe('leftShoulder');
    expect(rearLShdHit.face).toBe('rear');
    applyDamageToMechParts(mech, rearLShdHit, 25, DEFAULT_MATCH_RULES);
    expect(mech.parts.leftShoulder.rearArmor).toBe(lShdRearBefore - 25);
    expect(mech.parts.leftShoulder.frontArmor).toBe(lShdFrontBefore);
  });

  it('ricochets grazing ballistic shots above ricochetAngleDeg against intact armor', () => {
    const mech = createDummyMech();
    // Grazing shot skimming torso front face (y = 298.95) at steep angle (> 68 deg)
    const grazingHit = testProjectileHitMech(
      { x: 298.9, y: 298.8, z: 6.5 },
      { x: 301.0, y: 299.2, z: 6.5 },
      mech.pos,
      mech.yawDeg
    );
    expect(grazingHit).not.toBeNull();
    expect(grazingHit!.incidenceAngleDeg).toBeGreaterThan(68);

    const evalRicochet = computeArmorDamageResult({
      rawDamage: 100,
      canRicochet: true,
      ricochetAngleDeg: 68,
      hit: grazingHit!,
      targetParts: mech.parts,
    });
    expect(evalRicochet.ricocheted).toBe(true);
    expect(evalRicochet.finalDamage).toBe(0);
  });

  it('applies shoulder overflow to torso, leg mobility penalties, and head destruction rule', () => {
    const mech = createDummyMech();
    const torsoFrontStart = mech.parts.torso.frontArmor;

    // Destroy rightShoulder with massive excess damage => 50% excess goes to torso front
    const rShdHit = testProjectileHitMech(
      { x: 301.8, y: 290, z: 8.1 },
      { x: 301.8, y: 310, z: 8.1 },
      mech.pos,
      mech.yawDeg
    )!;
    const totalRShd = mech.parts.rightShoulder.frontArmor + mech.parts.rightShoulder.structure;
    const resShd = applyDamageToMechParts(mech, rShdHit, totalRShd + 100, DEFAULT_MATCH_RULES);
    expect(mech.parts.rightShoulder.destroyed).toBe(true);
    expect(resShd.newlyDestroyedParts).toContain('rightShoulder');
    expect(mech.parts.torso.frontArmor).toBe(torsoFrontStart - 50);

    // Leg mobility penalties: 1 leg then 2 legs
    const rLegHit = testProjectileHitMech(
      { x: 300.8, y: 290, z: 2.3 },
      { x: 300.8, y: 310, z: 2.3 },
      mech.pos,
      mech.yawDeg
    )!;
    applyDamageToMechParts(mech, rLegHit, 300, DEFAULT_MATCH_RULES);
    expect(mech.parts.rightLeg.destroyed).toBe(true);
    const oneLegMob = getMechMobilityMultipliers(mech.parts);
    expect(oneLegMob.walkMult).toBeCloseTo(0.45, 5);
    expect(oneLegMob.jumpMult).toBeCloseTo(0.45, 5);

    const lLegHit = testProjectileHitMech(
      { x: 299.2, y: 290, z: 2.3 },
      { x: 299.2, y: 310, z: 2.3 },
      mech.pos,
      mech.yawDeg
    )!;
    applyDamageToMechParts(mech, lLegHit, 300, DEFAULT_MATCH_RULES);
    expect(mech.parts.leftLeg.destroyed).toBe(true);
    const twoLegMob = getMechMobilityMultipliers(mech.parts);
    expect(twoLegMob.walkMult).toBe(0);
    expect(twoLegMob.boostMult).toBe(0);
    expect(twoLegMob.jumpMult).toBe(0);
    expect(twoLegMob.turnMult).toBeGreaterThan(0);

    // Head destruction non-lethal vs lethal
    const headHit = testProjectileHitMech(
      { x: 300, y: 290, z: 9.35 },
      { x: 300, y: 310, z: 9.35 },
      mech.pos,
      mech.yawDeg
    )!;
    applyDamageToMechParts(mech, headHit, 999, { headDestructionKills: false });
    expect(mech.parts.head.destroyed).toBe(true);
    expect(mech.alive).toBe(true);

    const mech2 = createDummyMech();
    const headHit2 = testProjectileHitMech(
      { x: 300, y: 290, z: 9.35 },
      { x: 300, y: 310, z: 9.35 },
      mech2.pos,
      mech2.yawDeg
    )!;
    const resHead = applyDamageToMechParts(mech2, headHit2, 999, { headDestructionKills: true });
    expect(resHead.mechKilled).toBe(true);
    expect(mech2.alive).toBe(false);
    expect(mech2.destroyedReason).toBe('head_destroyed');
  });

  it('splits upper-body torso twist space from lower-body leg space on hit detection', () => {
    const pos = { x: 300, y: 300, z: 0 };
    const legYaw = 0; // Legs face North (-Y)
    const torsoYaw = 90; // Waist twisted 90 deg East (+X = front, -X = rear, +Y = right side)

    // Shot from East (+X -> -X) at torso height hits torso front armor when twisted East
    const torsoEastHit = testProjectileHitMech(
      { x: 312, y: 300, z: 6.5 },
      { x: 290, y: 300, z: 6.5 },
      pos,
      legYaw,
      torsoYaw
    );
    expect(torsoEastHit).not.toBeNull();
    expect(torsoEastHit!.partId).toBe('torso');
    expect(torsoEastHit!.face).toBe('front');

    // Shot from North (-Y -> +Y) at x=300.8, z=2.3 still hits rightLeg (legs remain facing North)
    const legNorthHit = testProjectileHitMech(
      { x: 300.8, y: 290, z: 2.3 },
      { x: 300.8, y: 310, z: 2.3 },
      pos,
      legYaw,
      torsoYaw
    );
    expect(legNorthHit).not.toBeNull();
    expect(legNorthHit!.partId).toBe('rightLeg');

    // Shot from North at x=300, z=6.5 hits rotated left side (leftArm) of torso (not leg)
    const torsoNorthHit = testProjectileHitMech(
      { x: 300, y: 290, z: 6.5 },
      { x: 300, y: 310, z: 6.5 },
      pos,
      legYaw,
      torsoYaw
    );
    expect(torsoNorthHit).not.toBeNull();
    expect(torsoNorthHit!.partId).toBe('leftArm');
  });

  it('scales 8-part hitboxes proportionally by chassis sizeScale (Light 0.80 vs Medium 1.00 vs Assault 1.35)', () => {
    const pos = { x: 300, y: 300, z: 0 };

    // Assault head (z = 9.35 * 1.35 = 12.62m) hits Assault (1.35) but misses Medium (1.0) and Light (0.80)
    const highHeadFrom = { x: 300, y: 290, z: 12.62 };
    const highHeadTo = { x: 300, y: 310, z: 12.62 };
    expect(testProjectileHitMech(highHeadFrom, highHeadTo, pos, 0, 0, 1.35)?.partId).toBe('head');
    expect(testProjectileHitMech(highHeadFrom, highHeadTo, pos, 0, 0, 1.0)).toBeNull();
    expect(testProjectileHitMech(highHeadFrom, highHeadTo, pos, 0, 0, 0.8)).toBeNull();

    // Assault wide arm (x = 303.2, z = 7.8) hits Assault rightArm (1.92*1.35..2.75*1.35 = 2.59..3.71) but misses Medium (max 2.75)
    const wideArmFrom = { x: 303.2, y: 290, z: 7.8 };
    const wideArmTo = { x: 303.2, y: 310, z: 7.8 };
    expect(testProjectileHitMech(wideArmFrom, wideArmTo, pos, 0, 0, 1.35)?.partId).toBe('rightArm');
    expect(testProjectileHitMech(wideArmFrom, wideArmTo, pos, 0, 0, 1.0)).toBeNull();

    // Medium head (z = 9.35m) hits Medium (1.0) but passes cleanly over Light (0.80 -> top ~8.0m)
    const medHeadFrom = { x: 300, y: 290, z: 9.35 };
    const medHeadTo = { x: 300, y: 310, z: 9.35 };
    expect(testProjectileHitMech(medHeadFrom, medHeadTo, pos, 0, 0, 1.0)?.partId).toBe('head');
    expect(testProjectileHitMech(medHeadFrom, medHeadTo, pos, 0, 0, 0.8)).toBeNull();
  });
});
