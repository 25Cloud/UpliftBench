export function onScroll(el, cb) {
  el.addEventListener('scroll', function () {
    setInterval(function () {
      cb();
    }, 16);
  });
}
