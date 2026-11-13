import { spawn } from 'node:child_process';

export interface ShellResult {
  code: number | null;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
}

export interface ShellOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
  input?: string;
  maxBuffer?: number;
}

/**
 * 统一子进程入口。Windows 走 shell（.cmd/.ps1 兼容），POSIX 走 /bin/sh。
 * 超时主动 kill，并把 timedOut 标出来（协议 §3.4 的 timeout 分类靠它）。
 */
export function runShell(command: string, opts: ShellOptions = {}): Promise<ShellResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const started = Date.now();
  const isWin = process.platform === 'win32';
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: opts.cwd,
      shell: isWin ? true : '/bin/sh',
      env: { ...process.env, ...(opts.env ?? {}) } as NodeJS.ProcessEnv,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const cap = opts.maxBuffer ?? 8 * 1024 * 1024;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill(isWin ? undefined : 'SIGKILL');
      if (isWin) {
        // Windows 上 shell:true 会起一个 cmd.exe 中间层，直接 taskkill 整棵树
        void runShell(`taskkill /pid ${child.pid} /T /F`, { timeoutMs: 10_000 });
      }
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < cap) stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < cap) stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        code: null,
        stdout,
        stderr: `${stderr}${err.message}`,
        signal: null,
        timedOut,
        durationMs: Date.now() - started
      });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, signal, timedOut, durationMs: Date.now() - started });
    });

    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    } else {
      child.stdin?.end();
    }
  });
}

/** 不经 shell 的 argv 形式：grader 脚本可控参数时更安全 */
export function runArgv(
  argv: string[],
  opts: ShellOptions = {}
): Promise<ShellResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const started = Date.now();
  return new Promise((resolve) => {
    const [cmd, ...args] = argv;
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) } as NodeJS.ProcessEnv,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: err.message, signal: null, timedOut, durationMs: Date.now() - started });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, signal, timedOut, durationMs: Date.now() - started });
    });
    if (opts.input !== undefined) child.stdin?.end(opts.input);
    else child.stdin?.end();
  });
}
