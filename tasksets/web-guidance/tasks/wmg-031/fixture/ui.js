export function render(el, items) {
  var html = '';
  for (var i = 0; i < items.length; i++) {
    html += '<li class="item">' + items[i] + '</li>';
  }
  el.innerHTML = html;
}
