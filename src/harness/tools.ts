import path from 'node:path';
import fsp from 'node:fs/promises';
import { runShell } from '../util/shell.js';
import { walkFiles, relPath } from '../util/fsx.js';
import type { InstalledSkill } from './types.js';

export interface ToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolOutcome {
  ok: boolean;
  content: string;
  /** 副作用标记 */
  activatedSkill?: string;
  finished?: boolean;
  finalText?: string;
}

const MAX_READ_BYTES = 48_000;
const MAX_TOOL_OUTPUT = 6_000;

/** 路径必须留在 workspace 内（防 ../ 逃逸） */
function safeResolve(cwd: string, p: string): string {
  const abs = path.resolve(cwd, p);
  const rel = path.relative(cwd, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel) === false && rel === '') {
    // 允许 cwd 自身
    if (rel === '') return abs;
  }
  if (rel.startsWith('..')) throw new Error(`路径越界：${p}`);
  return abs;
}

export const ALL_TOOLS = ['activate_skill', 'list_files', 'read_file', 'write_file', 'run_command', 'finish'] as const;
export type ToolName = (typeof ALL_TOOLS)[number];

export function buildToolSpecs(skillNames: string[], allowShell: boolean): ToolSpec[] {
  const specs: ToolSpec[] = [
    {
      type: 'function',
      function: {
        name: 'activate_skill',
        description:
          'Load a skill\'s full instructions into the conversation. Call this BEFORE doing task work when a skill matches.',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string', enum: skillNames, description: 'skill name from the catalog' } },
          required: ['name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_files',
        description: 'List files in the workspace (recursive, capped).',
        parameters: {
          type: 'object',
          properties: { subdir: { type: 'string', description: 'relative subdirectory, default "."' } }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a UTF-8 text file in the workspace.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            offset: { type: 'integer', description: '1-based first line' },
            limit: { type: 'integer', description: 'max lines (default 400)' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Create or overwrite a UTF-8 text file in the workspace. Content is the FULL new file.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } },
          required: ['path', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'finish',
        description: 'Declare the task done. Call when the workspace is in its final state.',
        parameters: {
          type: 'object',
          properties: { summary: { type: 'string' } },
          required: ['summary']
        }
      }
    }
  ];
  if (allowShell) {
    specs.splice(4, 0, {
      type: 'function',
      function: {
        name: 'run_command',
        description: 'Run a shell command in the workspace (no network guarantee, 30s timeout).',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command']
        }
      }
    });
  }
  return specs;
}

export function filterToolSpecs(specs: ToolSpec[], allowed?: string[]): ToolSpec[] {
  if (!allowed || allowed.length === 0) return specs;
  const set = new Set(allowed);
  return specs.filter((s) => set.has(s.function.name));
}

export async function executeTool(
  cwd: string,
  skills: InstalledSkill[],
  name: string,
  args: Record<string, unknown>,
  opts: { shellTimeoutMs?: number } = {}
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case 'activate_skill': {
        const want = String(args.name ?? '');
        const skill = skills.find((s) => s.name === want) ?? skills.find((s) => s.dir === want);
        if (!skill) {
          return { ok: false, content: `unknown skill: ${want}. available: ${skills.map((s) => s.name).join(', ') || '(none)'}` };
        }
        const resources = skill.resources?.length ? `\n\n[available files] ${skill.resources.join(', ')}` : '';
        return {
          ok: true,
          activatedSkill: skill.name,
          content: `# Skill loaded: ${skill.name}\n\n${skill.body}${resources}`
        };
      }
      case 'list_files': {
        const sub = String(args.subdir ?? '.');
        const abs = safeResolve(cwd, sub);
        const files = await walkFiles(abs, { maxFiles: 400 });
        return { ok: true, content: files.map((f) => relPath(cwd, f)).sort().join('\n') || '(empty)' };
      }
      case 'read_file': {
        const abs = safeResolve(cwd, String(args.path ?? ''));
        const raw = await fsp.readFile(abs, 'utf8');
        const offset = Number(args.offset ?? 1);
        const limit = Number(args.limit ?? 400);
        const lines = raw.split(/\r?\n/);
        const slice = lines.slice(offset - 1, offset - 1 + limit);
        let body = slice.map((l, i) => `${offset + i}\t${l}`).join('\n');
        if (body.length > MAX_READ_BYTES) body = `${body.slice(0, MAX_READ_BYTES)}\n…(truncated)`;
        const more = offset - 1 + limit < lines.length ? `\n…(${lines.length - (offset - 1 + limit)} more lines)` : '';
        return { ok: true, content: body + more };
      }
      case 'write_file': {
        const abs = safeResolve(cwd, String(args.path ?? ''));
        const content = String(args.content ?? '');
        await fsp.mkdir(path.dirname(abs), { recursive: true });
        await fsp.writeFile(abs, content, 'utf8');
        return { ok: true, content: `wrote ${Buffer.byteLength(content, 'utf8')} bytes to ${args.path}` };
      }
      case 'run_command': {
        const cmd = String(args.command ?? '');
        const res = await runShell(cmd, { cwd, timeoutMs: opts.shellTimeoutMs ?? 30_000 });
        const text = `exit=${res.code}${res.timedOut ? ' (timeout)' : ''}\n--- stdout ---\n${res.stdout.slice(0, MAX_TOOL_OUTPUT)}\n--- stderr ---\n${res.stderr.slice(0, 2000)}`;
        return { ok: res.code === 0, content: text };
      }
      case 'finish': {
        return { ok: true, content: 'acknowledged', finished: true, finalText: String(args.summary ?? '') };
      }
      default:
        return { ok: false, content: `unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, content: `tool error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export { safeResolve };
