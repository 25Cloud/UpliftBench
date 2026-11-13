export function canPickDate() {
  var ua = navigator.userAgent;
  if (ua.indexOf('Chrome') !== -1) {
    return true;
  }
  return false;
}
