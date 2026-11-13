import { describe, expect, it } from 'vitest';
import { countTokens, estimateTokens, TOKENIZER_ID } from '../src/tokenize.js';

describe('token 近似计数', () => {
  it('纯英文按 chars/4', () => {
    const e = estimateTokens('abcdefgh');
    expect(e.tokens).toBe(2);
    expect(e.tokenizer).toBe(TOKENIZER_ID);
  });

  it('中文按 chars/1.7', () => {
    const e = estimateTokens('这是一个中文句子');
    expect(e.cjk_chars).toBe(8);
    expect(e.tokens).toBe(Math.ceil(8 / 1.7));
  });

  it('中英混排分别计数再相加', () => {
    const e = estimateTokens('hello 世界');
    expect(e.cjk_chars).toBe(2);
    expect(e.tokens).toBe(Math.ceil(2 / 1.7 + 6 / 4));
  });

  it('空串是 0', () => {
    expect(countTokens('')).toBe(0);
  });

  it('tokenizer 标识必须写明是近似值（协议要求）', () => {
    expect(TOKENIZER_ID).toBe('approx:weighted');
  });
});
