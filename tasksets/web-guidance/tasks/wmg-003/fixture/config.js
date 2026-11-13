var apiBase = 'https://example.test';
var retries = 3;
var timeout = 5000;

export function describe() {
  var text = apiBase + ' retries=' + retries;
  return text;
}
