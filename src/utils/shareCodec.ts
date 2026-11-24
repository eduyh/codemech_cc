/**
 * Generic LZSS + CRC-16 + XOR-mask + Base64Url framed share codec.
 * Supports chat/email line wrapping and quote-prefix resilience.
 */

const FRAME_PLAIN_FLAG = 0xa0;
const FRAME_MASKED_FLAG = 0xa1;

const LZSS_WINDOW = 4096;
const LZSS_MIN_MATCH = 3;
const LZSS_MAX_MATCH = 18;
const LZSS_HASH_SIZE = 4096;

export function bytesToBase64Url(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunkSize));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  if (!b64url || !/^[A-Za-z0-9_-]+$/.test(b64url)) {
    throw new Error('不正な文字が含まれているか、コードが空です');
  }
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function crc16Ccitt(str: string): number {
  const bytes = new TextEncoder().encode(str);
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc & 0xffff;
}

export function formatCrc16Hex(crc: number): string {
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

export function xorMaskBytes(data: Uint8Array, seed = 0x5a3c96e1): Uint8Array {
  const out = new Uint8Array(data.length);
  let state = (seed >>> 0) || 1;
  for (let i = 0; i < data.length; i++) {
    state ^= (state << 13) >>> 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    state = state >>> 0;
    const mask = (state + ((i * 73) & 0xff)) & 0xff;
    out[i] = data[i] ^ mask;
  }
  return out;
}

export function lzssCompress(input: Uint8Array): Uint8Array {
  const rawLen = input.length;
  const headerLen = 5;
  const writeRaw = (): Uint8Array => {
    const out = new Uint8Array(headerLen + rawLen);
    out[0] = 0x00;
    out[1] = (rawLen >>> 24) & 0xff;
    out[2] = (rawLen >>> 16) & 0xff;
    out[3] = (rawLen >>> 8) & 0xff;
    out[4] = rawLen & 0xff;
    out.set(input, headerLen);
    return out;
  };

  if (rawLen < 16) {
    return writeRaw();
  }

  const head = new Int32Array(LZSS_HASH_SIZE).fill(-1);
  const prev = new Int32Array(rawLen).fill(-1);
  const hash3 = (p: number): number =>
    (((input[p] << 4) ^ (input[p + 1] << 2) ^ input[p + 2]) * 2654435761) >>> 20;

  const insertPos = (p: number) => {
    if (p + 2 >= rawLen) return;
    const h = hash3(p) & (LZSS_HASH_SIZE - 1);
    prev[p] = head[h];
    head[h] = p;
  };

  const chunks: number[] = [];
  let pos = 0;

  while (pos < rawLen) {
    let ctrl = 0;
    const blockBytes: number[] = [];
    for (let bit = 0; bit < 8 && pos < rawLen; bit++) {
      let bestLen = 0;
      let bestDist = 0;
      if (pos + LZSS_MIN_MATCH <= rawLen) {
        const h = hash3(pos) & (LZSS_HASH_SIZE - 1);
        let cand = head[h];
        let chainSteps = 0;
        const maxLen = Math.min(LZSS_MAX_MATCH, rawLen - pos);
        while (cand >= 0 && pos - cand <= LZSS_WINDOW && chainSteps < 32) {
          chainSteps += 1;
          if (
            input[cand] === input[pos] &&
            input[cand + 1] === input[pos + 1] &&
            input[cand + 2] === input[pos + 2]
          ) {
            let matchLen = 3;
            while (matchLen < maxLen && input[cand + matchLen] === input[pos + matchLen]) {
              matchLen += 1;
            }
            if (matchLen > bestLen) {
              bestLen = matchLen;
              bestDist = pos - cand;
              if (bestLen === maxLen) break;
            }
          }
          cand = prev[cand];
        }
      }

      if (bestLen >= LZSS_MIN_MATCH) {
        ctrl |= 1 << bit;
        const encDist = bestDist - 1;
        const encLen = bestLen - LZSS_MIN_MATCH;
        blockBytes.push((encDist >>> 4) & 0xff);
        blockBytes.push(((encDist & 0x0f) << 4) | (encLen & 0x0f));
        for (let k = 0; k < bestLen; k++) {
          insertPos(pos + k);
        }
        pos += bestLen;
      } else {
        blockBytes.push(input[pos]);
        insertPos(pos);
        pos += 1;
      }
    }
    chunks.push(ctrl, ...blockBytes);
    if (chunks.length >= rawLen) {
      return writeRaw();
    }
  }

  const compressed = new Uint8Array(headerLen + chunks.length);
  compressed[0] = 0x01;
  compressed[1] = (rawLen >>> 24) & 0xff;
  compressed[2] = (rawLen >>> 16) & 0xff;
  compressed[3] = (rawLen >>> 8) & 0xff;
  compressed[4] = rawLen & 0xff;
  compressed.set(chunks, headerLen);
  return compressed;
}

export function lzssDecompress(input: Uint8Array, maxBytes: number): Uint8Array {
  if (input.length < 5) {
    throw new Error('圧縮ヘッダーが不足しています（コードが途中で切れています）');
  }
  const flag = input[0];
  if (flag !== 0x00 && flag !== 0x01) {
    throw new Error('未対応の圧縮フラグです');
  }
  const rawLen =
    ((input[1] << 24) | (input[2] << 16) | (input[3] << 8) | input[4]) >>> 0;
  if (rawLen > maxBytes) {
    throw new Error(
      `展開後サイズ (${rawLen} bytes) が安全上限 (${maxBytes} bytes) を超えています`
    );
  }

  const out = new Uint8Array(rawLen);
  if (flag === 0x00) {
    if (input.length !== 5 + rawLen) {
      throw new Error('非圧縮データの長さが一致しません（コードが破損しています）');
    }
    out.set(input.subarray(5));
    return out;
  }

  let inPos = 5;
  let outPos = 0;
  while (outPos < rawLen) {
    if (inPos >= input.length) {
      throw new Error('圧縮データが途中で途切れています');
    }
    const ctrl = input[inPos++];
    for (let bit = 0; bit < 8 && outPos < rawLen; bit++) {
      if ((ctrl & (1 << bit)) === 0) {
        if (inPos >= input.length) {
          throw new Error('圧縮データが途中で途切れています');
        }
        out[outPos++] = input[inPos++];
      } else {
        if (inPos + 1 >= input.length) {
          throw new Error('圧縮データの参照情報が途中で途切れています');
        }
        const b0 = input[inPos++];
        const b1 = input[inPos++];
        const dist = ((b0 << 4) | (b1 >>> 4)) + 1;
        const len = (b1 & 0x0f) + LZSS_MIN_MATCH;
        if (dist < 1 || dist > outPos || outPos + len > rawLen) {
          throw new Error('不正な圧縮参照が含まれています（コードが破損しています）');
        }
        for (let k = 0; k < len; k++) {
          out[outPos] = out[outPos - dist];
          outPos += 1;
        }
      }
    }
  }
  if (inPos !== input.length) {
    throw new Error('圧縮データの末尾に余分なバイトがあります');
  }
  return out;
}

export function sanitizeWrappedCode(raw: string): string {
  let text = String(raw ?? '').trim();
  const delimMatch = text.match(/^>>>([\s\S]*?)<<<$/);
  if (delimMatch) {
    text = delimMatch[1];
  } else {
    text = text.replace(/^>>>/, '').replace(/<<<$/, '');
  }
  const strippedLines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:>+\s*)+/, '').replace(/`/g, '').trim());
  return strippedLines.join('').replace(/[\s\u200B-\u200D\uFEFF`]/g, '');
}

export function wrapCodeLines(code: string, width = 72): string {
  if (width <= 0 || code.length <= width) return code;
  const lines: string[] = [];
  for (let i = 0; i < code.length; i += width) {
    lines.push(code.slice(i, i + width));
  }
  return lines.join('\n');
}

export function encodeFramedJson(
  prefix: string,
  payload: unknown,
  opts: { obfuscate: boolean; maskSeed: number }
): string {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const compressed = lzssCompress(jsonBytes);
  const body = opts.obfuscate ? xorMaskBytes(compressed, opts.maskSeed) : compressed;

  const framed = new Uint8Array(1 + body.length);
  framed[0] = opts.obfuscate ? FRAME_MASKED_FLAG : FRAME_PLAIN_FLAG;
  framed.set(body, 1);

  const b64 = bytesToBase64Url(framed);
  const bodyToken = `${prefix}${b64}`;
  const crc = formatCrc16Hex(crc16Ccitt(bodyToken));
  return `${bodyToken}.${crc}`;
}

export function decodeFramedJson<T>(
  raw: string,
  allowedPrefixes: readonly string[],
  maxBytes: number,
  seedByPrefix: Record<string, number>
): { prefix: string; data: T } {
  const cleaned = sanitizeWrappedCode(raw);
  const prefix = allowedPrefixes.find((p) => cleaned.startsWith(p));
  if (!prefix) {
    throw new Error(`対応するコード接頭辞 (${allowedPrefixes.join(' / ')}) が見つかりません`);
  }

  const dotIdx = cleaned.lastIndexOf('.');
  if (dotIdx <= prefix.length) {
    throw new Error('チェックサム (.XXXX) が欠落しています（コードが途中で切れています）');
  }

  const bodyToken = cleaned.slice(0, dotIdx);
  const crcHex = cleaned.slice(dotIdx + 1).toUpperCase();
  if (!/^[0-9A-F]{4}$/.test(crcHex)) {
    throw new Error('チェックサム形式が不正です');
  }
  const expectedCrc = formatCrc16Hex(crc16Ccitt(bodyToken));
  if (crcHex !== expectedCrc) {
    throw new Error(`チェックサムが一致しません（コード破損または途中切れ: ${crcHex} != ${expectedCrc}）`);
  }

  const b64 = bodyToken.slice(prefix.length);
  const framed = base64UrlToBytes(b64);
  if (framed.length < 6) {
    throw new Error('ペイロード長が不足しています');
  }

  const flag = framed[0];
  const payloadBytes = framed.subarray(1);
  let compressed: Uint8Array;
  if (flag === FRAME_PLAIN_FLAG) {
    compressed = payloadBytes;
  } else if (flag === FRAME_MASKED_FLAG) {
    compressed = xorMaskBytes(payloadBytes, seedByPrefix[prefix] ?? 0x5a3c96e1);
  } else {
    throw new Error('未対応のフレームフラグです');
  }

  const jsonBytes = lzssDecompress(compressed, maxBytes);
  const jsonStr = new TextDecoder().decode(jsonBytes);
  const data = JSON.parse(jsonStr) as T;
  return { prefix, data };
}
