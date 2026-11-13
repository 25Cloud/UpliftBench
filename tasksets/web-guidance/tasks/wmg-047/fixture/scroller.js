export function onScrollEnd(el, cb) {
  let timer = null;
  el.addEventListener('scroll', function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      cb();
    }, 200);
  });
}
