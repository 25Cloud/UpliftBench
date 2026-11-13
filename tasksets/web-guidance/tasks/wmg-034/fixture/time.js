export function formatStamp(ts) {
  var d = new Date(ts);
  return d.getYear() + '-' + d.getMonth();
}

export function parseStamp(s) {
  var d = new Date(s);
  return d.getTime();
}
