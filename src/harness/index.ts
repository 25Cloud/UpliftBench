import { ClaudeCodeHarness } from './claude-code.js';
import { MockHarness } from './mock.js';
import { OpenAICompatHarness } from './openai-compat.js';
import type { Harness } from './types.js';

export type HarnessName = 'openai-compat' | 'mock' | 'claude-code' | 'none';

export interface CreateHarnessOptions {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  mockSeed?: number;
  hookLog?: string;
}

export function createHarness(name: HarnessName, opts: CreateHarnessOptions = {}): Harness {
  switch (name) {
    case 'openai-compat':
      return new OpenAICompatHarness({ model: opts.model, baseUrl: opts.baseUrl, apiKey: opts.apiKey });
    case 'mock':
      return new MockHarness({ seed: opts.mockSeed });
    case 'claude-code':
      return new ClaudeCodeHarness({ model: opts.model, hookLog: opts.hookLog });
    case 'none':
      throw new Error('harness=none 不能执行 run；probing 时请用 --only static-cost');
    default:
      throw new Error(`unknown harness: ${String(name)}`);
  }
}

export * from './types.js';
export { OpenAICompatHarness, MockHarness, ClaudeCodeHarness };
export { buildSystemPrompt } from './openai-compat.js';
