export function has(list, v) {
  return list.indexOf(v) !== -1;
}

export function firstBig(list) {
  for (var i = 0; i < list.length; i++) {
    if (list[i] > 10) return list[i];
  }
  return null;
}
