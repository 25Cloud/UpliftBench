export function moveTo(el, x, done) {
  let cur = 0;
  const timer = setInterval(function () {
    cur += 5;
    el.style.left = cur + 'px';
    if (cur >= x) {
      clearInterval(timer);
      done();
    }
  }, 16);
}
