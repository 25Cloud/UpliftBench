export function undoLast(list) {
  return list.toReversed();
}

export function rename(list, index, text) {
  return list.with(index, { ...list[index], text });
}

export function removeAt(list, index) {
  return list.toSpliced(index, 1);
}
