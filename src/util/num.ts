/**
 * 数字格式化。
 *
 * 存在理由：对外数字四舍五入到整数会**改结论**。−2.50pp 显示成 −3pp 不是精度问题，
 * 是把一个「不显著的小负值」说成「-3」。所以卡片、榜单、badge tooltip 统一用
 * 「一位小数、去掉尾随 .0」：−2.5 / +5.6 / 0。
 *
 * badge 正面（`uplift 41% (base 40 → …)`）是协议规定的整数格式，不走这里。
 */

/** 一位小数，去掉尾随 .0：-2.50 → "-2.5"，31.00 → "31" */
export function trim1(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/** 带符号的一位小数：2.5 → "+2.5"，-2.5 → "-2.5"，0 → "0"（零不带符号，"+0"看着像有增益） */
export function signed1(n: number): string {
  const body = trim1(n);
  if (body === '0' || body === '-0') return '0';
  return `${n > 0 ? '+' : ''}${body}`;
}
