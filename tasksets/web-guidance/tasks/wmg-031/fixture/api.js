export function load(url, apply) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      apply(JSON.parse(xhr.responseText));
    }
  };
  xhr.send();
}
