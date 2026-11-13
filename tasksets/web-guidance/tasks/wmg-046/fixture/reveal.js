export function reveal(el) {
  el.style.opacity = '0';
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      el.classList.add('shown');
      el.style.opacity = '1';
    });
  });
}
