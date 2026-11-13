export async function getJson(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1000;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const res = await fetch(url, { signal });
  return await res.json();
}
