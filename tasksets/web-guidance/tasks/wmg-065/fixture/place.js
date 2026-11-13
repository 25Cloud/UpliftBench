export function place(btn, tip) {
  const r = btn.getBoundingClientRect();
  const above = r.top > tip.offsetHeight + 8;
  tip.style.top = (above ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + 'px';
  tip.style.left = r.left + 'px';
}
