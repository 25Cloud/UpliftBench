export function place(btn, tip) {
  const rect = btn.getBoundingClientRect();
  tip.style.left = rect.left + 'px';
  tip.style.top = rect.top - tip.offsetHeight - 8 + 'px';
  tip.style.opacity = '1';
}
