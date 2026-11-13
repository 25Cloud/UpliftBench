import { randomUUID, createHash } from 'node:crypto';

export const PROTOCOL_VERSION = 'protocol/1.0.0';
export const SCHEMA_VERSION = '1.0.0';
export const SOFTWARE_VERSION = '0.1.2';
export const DEFAULT_BUDGET_TOKENS = 10_000;
export const DEFAULT_ADMIN_LIMITS = {
  totalTokensWarn: 10_000,
  singleFileWarn: 5_000,
  duplicateWarnPct: 10
};

export function uuid(): string {
  return randomUUID();
}

/** 稳定短 id：同一输入同一输出，便于 resume 去重 */
export function stableId(...parts: string[]): string {
  return createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 16);
}

/** mulberry32：可复现 PRNG（bootstrap / 任务乱序都用它） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function hashSeed(text: string): number {
  const h = createHash('sha256').update(text, 'utf8').digest();
  return h.readUInt32BE(0);
}

export function nowIso(): string {
  return new Date().toISOString();
}
