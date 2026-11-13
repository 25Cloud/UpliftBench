export function buildUrl(q) {
  return '/search?q=' + escape(q);
}

export function readQuery(s) {
  return unescape(s);
}
