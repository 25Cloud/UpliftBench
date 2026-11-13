export function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  let out = '';
  if (h > 0) out += h + ' 小时 ';
  if (m > 0) out += m + ' 分 ';
  out += s + ' 秒';
  return out.trim();
}
