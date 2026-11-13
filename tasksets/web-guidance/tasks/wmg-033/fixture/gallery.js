export function loadImages(imgs) {
  for (var i = 0; i < imgs.length; i++) {
    imgs[i].setAttribute('src', imgs[i].getAttribute('data-src'));
    imgs[i].setAttribute('onload', 'fadeIn(this)');
  }
}
