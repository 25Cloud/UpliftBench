/**
 * token 近似计数（docs/11 Q5 默认值）。
 *
 * 为什么不用 tiktoken：体积大、且和 harness 真实 tokenizer 并不一致——
 * 一个「精确但错」的数字比一个「标注清楚的近似」更危险。
 * 输出里必须带 `tokenizer: "approx:weighted"`，Tier 1 用 harness 真实 usage。
 */
export interface TokenEstimate {
  tokens: number;
  chars: number;
  cjk_chars: number;
  tokenizer: string;
}

export const TOKENIZER_ID = 'approx:weighted';

/** CJK 汉字 / 假名 / 全角标点：1 字 ≈ 0.59 token */
const CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;

const CJK_DIVISOR = 1.7;
const LATIN_DIVISOR = 4;

export function estimateTokens(text: string): TokenEstimate {
  const chars = [...text].length;
  const cjkChars = (text.match(CJK_RE) ?? []).length;
  const latinChars = chars - cjkChars;
  const tokens = Math.ceil(cjkChars / CJK_DIVISOR + latinChars / LATIN_DIVISOR);
  return { tokens, chars, cjk_chars: cjkChars, tokenizer: TOKENIZER_ID };
}

export function countTokens(text: string): number {
  return estimateTokens(text).tokens;
}

/**
 * 反解：生成「约 N token」的中性文本需要多少字符。
 * 安慰剂臂构造用（docs/02 §1.2 的 ±2% 长度匹配）。
 */
export function charsForTokens(tokens: number): number {
  return Math.ceil(tokens * LATIN_DIVISOR);
}

export function tokenDeltaPct(actual: number, target: number): number {
  if (target === 0) return actual === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(actual - target) / target;
}
