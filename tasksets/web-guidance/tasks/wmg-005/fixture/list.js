export function showComments(el, comments) {
  let html = '';
  for (const c of comments) {
    html += '<div class="comment">' + c.text + '</div>';
  }
  el.innerHTML = html;
}
