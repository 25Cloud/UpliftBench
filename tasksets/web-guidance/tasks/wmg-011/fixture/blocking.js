export function getUserSync(id) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/users/' + id, false);
  xhr.send(null);
  return JSON.parse(xhr.responseText);
}
