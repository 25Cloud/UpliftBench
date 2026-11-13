export function setupMenu(btn, panel) {
  let open = false;
  btn.addEventListener('click', function () {
    open = !open;
    panel.classList.toggle('open', open);
  });
  document.addEventListener('click', function (e) {
    if (!panel.contains(e.target) && e.target !== btn) {
      open = false;
      panel.classList.remove('open');
    }
  });
}
