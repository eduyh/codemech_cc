import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PILOT_PROFILE,
  STARTER_MECHS,
  STARTER_PILOTS,
} from '../../data/presets';
import {
  MAX_MECH_PAYLOAD_BYTES,
  decodeChallengeCode,
  decodeMechCode,
  decodePilotCode,
  decodeReplayCode,
  decodeRuleCode,
  deduplicateExtractedCandidates,
  encodeChallengeCode,
  encodeMechCode,
  encodePilotCode,
  encodeReplayCode,
  encodeRuleCode,
  extractMechCodesFromText,
  formatMechSubmissionText,
  normalizeBattlefieldRule,
  parseMechFileText,
  serializeMechFile,
} from '../shareMech';
import { lzssCompress, lzssDecompress, wrapCodeLines } from '../shareCodec';

function base64UrlToUtf8Lossy(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

describe('shareMech closed-network packages & codec', () => {
  it('compresses and decompresses LZSS payloads and blocks decompression bombs', () => {
    const empty = lzssDecompress(lzssCompress(new Uint8Array(0)), 1024);
    expect(empty.length).toBe(0);

    const payload = new TextEncoder().encode(JSON.stringify(STARTER_MECHS[0]).repeat(3));
    const compressed = lzssCompress(payload);
    expect(compressed.length).toBeLessThan(payload.length);
    expect(lzssDecompress(compressed, payload.length + 64)).toEqual(payload);

    const bomb = new Uint8Array([0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x41]);
    expect(() => lzssDecompress(bomb, MAX_MECH_PAYLOAD_BYTES)).toThrow('安全上限');
  });

  it('round-trips CMM1- mech+pilot packages across all starter mechs and pilots', () => {
    for (let i = 0; i < STARTER_MECHS.length; i++) {
      const mech = STARTER_MECHS[i];
      const pilot = STARTER_PILOTS[i % STARTER_PILOTS.length];
      const code = encodeMechCode({ mech, pilot, teamTag: `T${i + 1}` });
      expect(code.startsWith('CMM1-')).toBe(true);
      expect(code).toMatch(/^CMM1-[A-Za-z0-9_-]+\.[0-9A-F]{4}$/);

      const decoded = decodeMechCode(code);
      expect(decoded.mech.name).toBe(mech.name);
      expect(decoded.mech.parts).toEqual(mech.parts);
      expect(decoded.mech.armor).toEqual(mech.armor);
      expect(decoded.mech.subroutines).toEqual(mech.subroutines);
      expect(decoded.mech.ecmEnabled).toBe(Boolean(mech.ecmEnabled));
      expect(decoded.mech.lrmFireMode).toBe(mech.lrmFireMode ?? 'salvo');
      expect(decoded.pilot.name).toBe(pilot.name);
      expect(decoded.pilot.grid).toEqual(pilot.grid);
      expect(decoded.battleOnly).toBe(false);
    }
  });

  it('obfuscates CMM1B- battleOnly payloads so plaintext mech/author names do not leak', () => {
    const secretMech = {
      ...structuredClone(STARTER_MECHS[0]),
      name: '秘密の試作機X',
      authorName: 'SecretPilotAuthor',
    };
    const code = encodeMechCode({ mech: secretMech, pilot: DEFAULT_PILOT_PROFILE }, { battleOnly: true });
    expect(code.startsWith('CMM1B-')).toBe(true);

    const rawB64 = code.slice('CMM1B-'.length, code.lastIndexOf('.'));
    const rawText = base64UrlToUtf8Lossy(rawB64);
    expect(rawText).not.toContain('秘密の試作機X');
    expect(rawText).not.toContain('SecretPilotAuthor');

    const decoded = decodeMechCode(code);
    expect(decoded.battleOnly).toBe(true);
    expect(decoded.mech.name).toBe('秘密の試作機X');
  });

  it('round-trips CMP1-, CMR1-, CMC1-, CMW1-, and JSON files', () => {
    const pilotCode = encodePilotCode(DEFAULT_PILOT_PROFILE);
    expect(pilotCode.startsWith('CMP1-')).toBe(true);
    expect(decodePilotCode(pilotCode).grid).toEqual(DEFAULT_PILOT_PROFILE.grid);

    const rule = normalizeBattlefieldRule({
      format: 'short_league',
      arenaPreset: 'twin_mesas',
      maxSeconds: 150,
      teamUnitSize: 3,
      leagueMaxRounds: 4,
    });
    const ruleCode = encodeRuleCode({ title: '秋季リーグ', rule });
    expect(ruleCode.startsWith('CMR1-')).toBe(true);
    expect(decodeRuleCode(ruleCode).rule).toEqual(rule);

    const chalCode = encodeChallengeCode({
      title: '3機小隊からの挑戦',
      teamTag: 'Alpha隊',
      challengers: STARTER_MECHS.slice(0, 3).map((m) => ({
        mech: m,
        pilot: DEFAULT_PILOT_PROFILE,
        battleOnly: true,
      })),
      rule,
      matchSeed: 777,
    });
    expect(chalCode.startsWith('CMC1-')).toBe(true);
    const decodedChal = decodeChallengeCode(chalCode);
    expect(decodedChal.challengers).toHaveLength(3);
    expect(decodedChal.challengers[0].battleOnly).toBe(true);
    expect(decodedChal.matchSeed).toBe(777);

    const replayCode = encodeReplayCode({
      title: '決勝',
      recordedAt: '2026-11-24T00:00:00Z',
      matchSeed: 55,
      rules: {
        maxSeconds: 180,
        friendlyFire: false,
        headDestructionKills: true,
        arenaPreset: 'plains_ridge',
        arenaWidth: 600,
        arenaDepth: 600,
      },
      participants: [
        {
          id: 'p1',
          name: 'P1',
          teamId: 'T1',
          mech: STARTER_MECHS[0],
          pilot: DEFAULT_PILOT_PROFILE,
        },
      ],
    });
    expect(replayCode.startsWith('CMW1-')).toBe(true);
    expect(decodeReplayCode(replayCode).matchSeed).toBe(55);

    const jsonText = serializeMechFile({ mech: STARTER_MECHS[1], pilot: DEFAULT_PILOT_PROFILE });
    expect(parseMechFileText(jsonText).mech.id).toBe(STARTER_MECHS[1].id);
  });

  it('rejects CRC corruption and CodePanzer VST2- codes clearly', () => {
    const code = encodeMechCode({ mech: STARTER_MECHS[0], pilot: DEFAULT_PILOT_PROFILE });
    const truncated = code.slice(0, Math.floor(code.length / 2));
    expect(() => decodeMechCode(truncated)).toThrow('チェックサム');

    const flipped = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
    expect(() => decodeMechCode(flipped)).toThrow('チェックサムが一致しません');

    expect(() => decodeMechCode('VST2-dummyPayload.1234')).toThrow('CodePanzer');
  });

  it('extracts wrapped/quoted chat logs, associates team tags, and deduplicates latest', () => {
    const m1 = { ...structuredClone(STARTER_MECHS[0]), name: '機体A', authorName: 'Student1' };
    const m1New = { ...structuredClone(STARTER_MECHS[1]), name: '機体A', authorName: 'Student1' };
    const m2 = { ...structuredClone(STARTER_MECHS[2]), name: '機体B', authorName: 'Student2' };

    const card1 = formatMechSubmissionText({ mech: m1, pilot: DEFAULT_PILOT_PROFILE, teamTag: 'A班' });
    const quotedNew =
      '再提出します #A班\n' +
      wrapCodeLines(encodeMechCode({ mech: m1New, pilot: DEFAULT_PILOT_PROFILE }, { battleOnly: true }), 50)
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    const card2 = `チーム: B班\n${encodeMechCode({ mech: m2, pilot: DEFAULT_PILOT_PROFILE })}`;

    const chatLog = `${card1}\n\n${quotedNew}\n\n>>>${encodeMechCode({ mech: m1New, pilot: DEFAULT_PILOT_PROFILE }, { battleOnly: true })}<<<\n\n${card2}\n\nVST2-corrupt.0000`;
    const extracted = extractMechCodesFromText(chatLog);
    expect(extracted.warnings.length).toBeGreaterThan(0);
    expect(extracted.candidates.length).toBeGreaterThanOrEqual(3);

    const latest = deduplicateExtractedCandidates(extracted.candidates, 'latest');
    expect(latest).toHaveLength(2);
    expect(latest[0].mech.parts.legs).toBe(m1New.parts.legs);
    expect(latest[1].teamTag).toBe('B班');
  });

  it('preserves custom weaponGroups across share code encode/decode and builds defaults if missing', () => {
    const customMech = structuredClone(STARTER_MECHS[0]);
    customMech.weaponGroups = {
      G1: ['rightArm', 'rightShoulder'],
      G2: ['leftArm'],
      G3: ['rightArm', 'leftArm', 'rightShoulder'],
      G4: [],
    };
    const code = encodeMechCode({ mech: customMech, pilot: DEFAULT_PILOT_PROFILE });
    const decoded = decodeMechCode(code);
    expect(decoded.mech.weaponGroups).toEqual(customMech.weaponGroups);

    const legacyWithoutGroups = structuredClone(STARTER_MECHS[0]);
    delete legacyWithoutGroups.weaponGroups;
    const legacyCode = encodeMechCode({ mech: legacyWithoutGroups, pilot: DEFAULT_PILOT_PROFILE });
    const repaired = decodeMechCode(legacyCode);
    expect(repaired.mech.weaponGroups).toBeDefined();
    expect(repaired.mech.weaponGroups?.G1.length).toBeGreaterThan(0);
    expect(repaired.mech.controlTier).toBeUndefined();

    const directMech = {
      ...structuredClone(STARTER_MECHS[0]),
      controlTier: 'direct_4x4' as const,
      weaponMountCounts: { leftArm: 3 as const },
    };
    directMech.parts.leftShoulderWeapon = 'ams_bap_pod';
    const directCode = encodeMechCode({ mech: directMech, pilot: DEFAULT_PILOT_PROFILE });
    const decodedDirect = decodeMechCode(directCode);
    expect(decodedDirect.mech.controlTier).toBe('direct_4x4');
    expect(decodedDirect.mech.weaponMountCounts).toEqual({ leftArm: 3 });
    expect(decodedDirect.mech.parts.leftShoulderWeapon).toBe('ams_bap_pod');

    const dualLrmMech = structuredClone(STARTER_MECHS[0]);
    dualLrmMech.parts.rightShoulderWeapon = 'lrm5';
    dualLrmMech.parts.leftShoulderWeapon = 'lrm10';
    dualLrmMech.lrmFireModes = {
      rightArm: 'stream',
      rightShoulder: 'salvo',
      leftShoulder: 'stream',
    };
    const lrmCode = encodeMechCode({ mech: dualLrmMech, pilot: DEFAULT_PILOT_PROFILE });
    const decodedLrm = decodeMechCode(lrmCode);
    expect(decodedLrm.mech.lrmFireModes).toEqual({
      rightShoulder: 'salvo',
      leftShoulder: 'stream',
    });
  });
});
