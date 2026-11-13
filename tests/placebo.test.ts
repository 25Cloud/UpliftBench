import { describe, expect, it } from 'vitest';
import {
  generatePlaceboDocument,
  planPlaceboSkills,
  validatePlacebo
} from '../src/placebo/generate.js';
import { countTokens } from '../src/tokenize.js';

describe('安慰剂构造（docs/02 §1.2 硬约束）', () => {
  it('长度落在目标 ±2% 内', () => {
    for (const target of [200, 1000, 4000]) {
      const doc = generatePlaceboDocument({ targetTokens: target, seed: 42 });
      const tokens = countTokens(doc);
      const delta = Math.abs(tokens - target) / target;
      expect(delta, `target=${target} actual=${tokens}`).toBeLessThanOrEqual(0.02);
    }
  });

  it('确定性：同 seed 同目标 → 同一份文本', () => {
    const a = generatePlaceboDocument({ targetTokens: 800, seed: 123 });
    const b = generatePlaceboDocument({ targetTokens: 800, seed: 123 });
    expect(a).toBe(b);
  });

  it('不同 seed 产出不同文本', () => {
    const a = generatePlaceboDocument({ targetTokens: 800, seed: 1 });
    const b = generatePlaceboDocument({ targetTokens: 800, seed: 2 });
    expect(a).not.toBe(b);
  });

  it('语义中性：不出现任务领域关键词', () => {
    const doc = generatePlaceboDocument({ targetTokens: 2000, seed: 9 });
    for (const word of ['fetch', 'XMLHttpRequest', 'task', 'uplift', 'benchmark']) {
      expect(doc.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it('结构相似：有标题层级', () => {
    const doc = generatePlaceboDocument({ targetTokens: 1500, seed: 5 });
    expect(doc).toMatch(/^# /m);
    expect(doc).toMatch(/^## /m);
  });

  it('逐技能对齐：每个技能一份安慰剂，总偏差 ≤2%', () => {
    const skills = [
      { name: 'a', tokens: 800 },
      { name: 'b', tokens: 1500 },
      { name: 'c', tokens: 3000 }
    ];
    const plans = planPlaceboSkills(skills, 'demo-skill-path');
    expect(plans.length).toBe(3);
    const total = skills.reduce((s, x) => s + x.tokens, 0);
    const v = validatePlacebo(total, plans);
    expect(v.ok).toBe(true);
    expect(v.deltaPct).toBeLessThanOrEqual(0.02);
  });
});
