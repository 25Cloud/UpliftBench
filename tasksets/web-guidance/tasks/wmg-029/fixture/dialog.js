export function ask(message) {
  var answer = window.showModalDialog('prompt.html', message);
  return answer;
}
