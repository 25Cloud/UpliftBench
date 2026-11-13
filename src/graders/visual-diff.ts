import path from 'node:path';
import fsp from 'node:fs/promises';
import type { GradeContext, GradeOutcome, Grader } from './tests.js';

/**
 * 可选依赖的加载器。
 *
 * 用 new Function 而不是 `await import('pngjs')`，是为了让 TypeScript 不去解析
 * 这两个可选依赖——没人会因为跑 A 级任务集而被迫安装像素比对库。
 */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<any>;

/**
 * B 级 visual-diff 评分器（协议 §4.4）。
 *
 * 依赖是可选的：pixelmatch + pngjs 没装就老实回 grader_error，
 * 不把「没测」伪装成「通过」。装了就把 screenshot.png 与参考图逐像素比。
 */
export const visualDiffGrader: Grader = {
  kind: 'visual-diff',
  async grade(ctx: GradeContext, _verifyPath: string | null): Promise<GradeOutcome> {
    const g = ctx.taskset.grader;
    const threshold = g.threshold ?? 0.02;
    const task = ctx.taskset.tasks.find((t) => t.id === ctx.taskId) as
      | (Record<string, unknown> & { id: string })
      | undefined;
    const shotRel = (task?.screenshot as string | undefined) ?? 'screenshot.png';
    const shotPath = path.join(ctx.workspace, shotRel);
    const refPath = path.join(ctx.tasksetDir, 'tasks', ctx.taskId, 'reference.png');

    for (const p of [shotPath, refPath]) {
      try {
        await fsp.access(p);
      } catch {
        return { pass: null, detail: '', graderError: `缺少图片：${p}` };
      }
    }

    let PNG: any;
    let pixelmatch: any;
    try {
      const pngMod = await dynamicImport('pngjs');
      PNG = pngMod?.PNG ?? pngMod?.default?.PNG;
      const pmMod = await dynamicImport('pixelmatch');
      pixelmatch = pmMod?.default ?? pmMod;
      if (!PNG || typeof pixelmatch !== 'function') throw new Error('not installed');
    } catch {
      return {
        pass: null,
        detail: '',
        graderError: 'visual-diff 需要可选依赖 pngjs + pixelmatch（pnpm add -D pngjs pixelmatch）'
      };
    }

    const img1 = PNG.sync.read(await fsp.readFile(shotPath));
    const img2 = PNG.sync.read(await fsp.readFile(refPath));
    if (img1.width !== img2.width || img1.height !== img2.height) {
      return { pass: false, detail: `尺寸不一致 ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}` };
    }
    const diff = new PNG({ width: img1.width, height: img1.height });
    const pixels = pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, { threshold: 0.1 });
    const ratio = pixels / (img1.width * img1.height);
    return {
      pass: ratio <= threshold,
      detail: `像素差异 ${(ratio * 100).toFixed(2)}%（阈值 ${(threshold * 100).toFixed(1)}%）`,
      metrics: { diff_ratio: ratio }
    };
  }
};
