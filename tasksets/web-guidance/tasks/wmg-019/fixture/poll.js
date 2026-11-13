export function poll(url, done) {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      done(xhr.responseText);
    }
  };
  xhr.open('GET', url);
  xhr.send();
}
