export function wrap(err, message) {
  const wrapped = new Error(message + ': ' + err.message);
  wrapped.originalError = err;
  return wrapped;
}

export async function loadAll(fetchJson, urls) {
  const out = [];
  const failed = [];
  for (const url of urls) {
    try {
      out.push(await fetchJson(url));
    } catch (err) {
      failed.push(err);
    }
  }
  if (failed.length > 0) {
    throw new Error('failed: ' + failed.map((e) => e.message).join('; '));
  }
  return out;
}
