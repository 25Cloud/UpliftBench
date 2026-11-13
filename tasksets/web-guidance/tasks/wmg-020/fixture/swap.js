export function swap(el, node) {
  el.outerHTML = '<section>' + node.textContent + '</section>';
}
