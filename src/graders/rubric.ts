import path from 'node:path';
import fsp from 'node:fs/promises';
import { askOnce, OpenAICompatHarness } from '../harness/openai-compat.js';
import { extractJson } from '../util/json.js';
import type { GradeContext, GradeOutcome, Grader } from './tests.js';

export const DEFAULT_PASS_THRESHOLD = 0.6;

/**
 * B 级 rubric 评分器（协议 §4.3）。
 *
 * 硬要求：judge 的精确版本号、prompt 全文、rubric 必须公开（都在 taskset.json / 文件里）。
 * κ < 0.6 的评分器在准入检查里会被降级成 C —— 这里只管打分，不管分级。
 */
export const rubricGrader: Grader = {
  kind: 'rubric',
  async grade(ctx: GradeContext, _verifyPath: string | null): Promise<GradeOutcome> {
    const g = ctx.taskset.grader;
    if (!g.judge_prompt_file || !g.rubric_file) {
      return { pass: null, detail: '', graderError: 'rubric 评分器缺少 judge_prompt_file / rubric_file' };
    }
    let judgePrompt: string;
    let rubric: string;
    let taskPrompt: string;
    try {
      judgePrompt = await fsp.readFile(path.resolve(ctx.tasksetDir, g.judge_prompt_file), 'utf8');
      rubric = await fsp.readFile(path.resolve(ctx.tasksetDir, g.rubric_file), 'utf8');
      const task = ctx.taskset.tasks.find((t) => t.id === ctx.taskId);
      taskPrompt = task ? await fsp.readFile(path.resolve(ctx.tasksetDir, task.prompt_file), 'utf8') : '';
    } catch (e) {
      return { pass: null, detail: '', graderError: `读评分器文件失败：${(e as Error).message}` };
    }

    const scores = (g as { scores?: Array<{ id: string; max: number }> }).scores ?? [
      { id: 'correctness', max: 100 }
    ];
    const scoreSpec = scores.map((s) => `- ${s.id}: 0..${s.max}`).join('\n');
    const user = [
      judgePrompt,
      '',
      '## Rubric',
      rubric,
      '',
      '## Task prompt given to the agent',
      taskPrompt,
      '',
      '## Agent final message',
      ctx.finalText ?? '(empty)',
      '',
      '## Scoring dimensions',
      scoreSpec,
      '',
      'Respond with ONLY a JSON object: ' +
        `{"scores": {${scores.map((s) => `"${s.id}": <number>`).join(', ')}}, "total": <number>, "pass": <boolean>, "why": "<one sentence>"}`,
      `The "total" is the sum of the per-dimension scores (max ${scores.reduce((a, s) => a + s.max, 0)}).`
    ].join('\n');

    let resp: { text: string };
    try {
      resp = await askOnce(new OpenAICompatHarness({ model: g.judge_model }), user, {
        model: g.judge_model,
        maxTokens: 800
      });
    } catch (e) {
      return { pass: null, detail: '', graderError: `judge 调用失败：${(e as Error).message}` };
    }

    const parsed = extractJson<{ total?: number; pass?: boolean; why?: string; scores?: Record<string, number> }>(
      resp.text
    );
    if (!parsed) {
      return { pass: null, detail: '', graderError: `judge 输出无法解析为 JSON：${resp.text.slice(0, 200)}`, raw: resp.text };
    }
    const maxTotal = scores.reduce((a, s) => a + s.max, 0);
    const total = typeof parsed.total === 'number' ? parsed.total : 0;
    const threshold = maxTotal * DEFAULT_PASS_THRESHOLD;
    const pass = typeof parsed.pass === 'boolean' ? parsed.pass : total >= threshold;
    return {
      pass,
      detail: `judge ${total}/${maxTotal}: ${parsed.why ?? ''}`,
      metrics: { total, max_total: maxTotal },
      raw: resp.text.slice(0, 1000)
    };
  }
};
