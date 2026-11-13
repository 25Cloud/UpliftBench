export function moveToTop(list, item) {
  list.removeChild(item);
  list.insertBefore(item, list.firstChild);
}

export function swapSections(parent, a, b) {
  const anchor = a.nextSibling;
  parent.removeChild(a);
  parent.insertBefore(a, b);
}
