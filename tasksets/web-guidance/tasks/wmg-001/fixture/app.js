export function loadUsers(cb) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/users');
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        cb(JSON.parse(xhr.responseText));
      } else {
        console.log('failed');
      }
    }
  };
  xhr.send();
}
