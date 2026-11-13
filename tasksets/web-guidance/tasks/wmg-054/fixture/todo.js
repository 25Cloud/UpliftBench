export function undoLast(list) {
  return list.reverse();
}

export function rename(list, index, text) {
  list[index] = { ...list[index], text };
  return list;
}

export function removeAt(list, index) {
  list.splice(index, 1);
  return list;
}
