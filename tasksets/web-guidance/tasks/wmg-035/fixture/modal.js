export function confirmAction(msg, onYes) {
  if (window.confirm(msg)) {
    onYes();
  }
  var box = document.getElementById('box');
  box.setAttribute('tabindex', '3');
  box.setAttribute('onclick', 'ok()');
}
