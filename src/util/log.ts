/**
 * 终端输出：轻量 ANSI，不引重型 TUI 库（docs/06 §10）。
 * NO_COLOR / --no-color 都会关掉颜色。
 */

let colorEnabled = process.env.NO_COLOR ? false : true;

export function setColor(enabled: boolean): void {
  colorEnabled = enabled;
}

export function colorEnabledNow(): boolean {
  return colorEnabled;
}

const wrap = (open: string) => (s: string) =>
  colorEnabled ? `\u001b[${open}m${s}\u001b[0m` : s;

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),
  bgRed: wrap('41')
};

export const sym = {
  ok: '✓',
  err: '✗',
  warn: '⚠️',
  bullet: '·'
};

export function heading(title: string, subtitle?: string): string {
  const line = '─'.repeat(Math.max(40, Math.min(64, (title.length + (subtitle?.length ?? 0)) + 12)));
  return subtitle ? `${c.bold(title)}  ${c.dim(subtitle)}\n${c.gray(line)}` : `${c.bold(title)}\n${c.gray(line)}`;
}

export function kv(key: string, value: string, pad = 14): string {
  return `  ${key.padEnd(pad)} ${value}`;
}

export function warnLine(msg: string): string {
  return `${c.yellow(sym.warn)} ${msg}`;
}

export function errLine(msg: string): string {
  return `${c.red(sym.err)} ${msg}`;
}

/** docs/06 §11：错误必须带「发生了什么 / 为什么 / 怎么修」 */
export class UpliftError extends Error {
  constructor(
    public what: string,
    public why?: string,
    public fix?: string,
    public exitCode = 1
  ) {
    super(what);
    this.name = 'UpliftError';
  }

  format(): string {
    const lines = [errLine(this.what)];
    if (this.why) lines.push(`  ${c.dim('原因：')}${this.why}`);
    if (this.fix) lines.push(`  ${c.dim('修复：')}${this.fix}`);
    return lines.join('\n');
  }
}
