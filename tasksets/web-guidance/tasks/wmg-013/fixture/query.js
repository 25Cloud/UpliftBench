export function markAll() {
  var nodes = document.getElementsByClassName('todo');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].classList.add('done');
  }
}
