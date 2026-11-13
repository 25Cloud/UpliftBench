export function moveToTop(list, item) {
  const first = list.firstChild;
  if (first === item) return;
  if (typeof list.moveBefore === 'function') {
    list.moveBefore(item, first);
    return;
  }
  list.removeChild(item);
  list.insertBefore(item, first);
}

export function swapSections(parent, a, b) {
  if (typeof parent.moveBefore === 'function') {
    parent.moveBefore(a, b);
    return;
  }
  parent.removeChild(a);
  parent.insertBefore(a, b);
}
