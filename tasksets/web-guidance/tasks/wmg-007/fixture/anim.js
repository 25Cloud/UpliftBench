export function slide(el) {
  let x = 0;
  function step() {
    x += 2;
    el.style.transform = 'translateX(' + x + 'px)';
    if (x < 200) {
      setTimeout(step, 16);
    }
  }
  step();
}
