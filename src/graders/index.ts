import type { TaskSetJson } from '../types.js';
import type { GradeContext, GradeOutcome, Grader } from './tests.js';
import { testsGrader } from './tests.js';
import { exactGrader } from './exact.js';
import { rubricGrader } from './rubric.js';
import { visualDiffGrader } from './visual-diff.js';

export const GRADERS: Record<TaskSetJson['grader']['kind'], Grader> = {
  tests: testsGrader,
  exact: exactGrader,
  rubric: rubricGrader,
  'visual-diff': visualDiffGrader,
  human: {
    kind: 'human',
    async grade(): Promise<GradeOutcome> {
      return { pass: null, detail: 'human 评分器不进榜，只用于给 B 级评分器算 κ', graderError: 'human grader 需要人工流程' };
    }
  }
};

export function pickGrader(taskset: TaskSetJson): Grader {
  return GRADERS[taskset.grader.kind];
}

export type { GradeContext, GradeOutcome, Grader };
