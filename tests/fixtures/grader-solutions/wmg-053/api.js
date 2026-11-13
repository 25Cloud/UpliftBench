export function wrap(err, message) {
  return new Error(message, { cause: err });
}

export async function loadAll(fetchJson, urls) {
  const out = [];
  const errors = [];
  for (const url of urls) {
    try {
      out.push(await fetchJson(url));
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'failed: ' + errors.length + ' urls');
  }
  return out;
}
