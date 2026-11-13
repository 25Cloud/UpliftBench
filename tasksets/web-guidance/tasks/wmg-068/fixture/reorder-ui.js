export function move(list, from, to) {
  const el = list.children[from];
  el.style.opacity = '0';
  setTimeout(() => {
    list.insertBefore(el, list.children[to] ?? null);
    el.style.opacity = '1';
  }, 150);
}
