export function show(el, data) {
  el.innerHTML = '<b>' + data.name + '</b>';
  var cfg = eval('(' + data.config + ')');
  document.write('<i>done</i>');
  return cfg;
}
