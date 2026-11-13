/**
 * 成本折算表。
 *
 * 中转站/自建端点常在 usage 里直接回 `credit`（本次调用记了多少额度），
 * 那就用它的；没有就按公开价目表算；再没有就标 unpriced——
 * **不许瞎猜一个美元数字填进 cost_usd**（协议 §3.2 的数字要能对账）。
 */
export interface Price {
  /** 每 1M input token 的美元价 */
  input: number;
  /** 每 1M output token 的美元价 */
  output: number;
}

export const PRICE_TABLE: Record<string, Price> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-opus-4': { input: 15, output: 75 },
  'deepseek-chat': { input: 0.27, output: 1.1 }
};

export function priceFor(model: string): Price | null {
  if (PRICE_TABLE[model]) return PRICE_TABLE[model];
  const lower = model.toLowerCase();
  const key = Object.keys(PRICE_TABLE).find((k) => lower.startsWith(k.toLowerCase()));
  return key ? PRICE_TABLE[key] : null;
}

export function costFromUsage(model: string, promptTokens: number, completionTokens: number): number | null {
  const price = priceFor(model);
  if (!price) return null;
  return (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
}
