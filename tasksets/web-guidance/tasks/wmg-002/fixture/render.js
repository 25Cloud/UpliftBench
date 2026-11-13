export function renderList(items) {
  document.write('<ul>');
  for (var i = 0; i < items.length; i++) {
    document.write('<li>' + items[i] + '</li>');
  }
  document.write('</ul>');
}
