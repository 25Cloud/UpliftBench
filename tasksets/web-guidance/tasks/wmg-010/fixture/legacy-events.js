export function bindClick(btn, handler) {
  if (btn.attachEvent) {
    btn.attachEvent('onclick', handler);
  }
}
