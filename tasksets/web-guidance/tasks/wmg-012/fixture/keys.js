export function onEnter(input, submit) {
  input.addEventListener('keydown', function (event) {
    if (event.keyCode === 13) {
      submit();
    }
  });
}
