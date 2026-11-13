export function sum(list) {
  var total = 0;
  for (var i in list) {
    total += list[i];
  }
  return total;
}
