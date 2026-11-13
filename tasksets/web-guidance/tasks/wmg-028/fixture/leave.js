export function saveOnLeave(save) {
  window.addEventListener('unload', function () {
    save();
  });
}
