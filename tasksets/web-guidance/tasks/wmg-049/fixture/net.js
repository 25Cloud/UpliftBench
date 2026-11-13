export async function getJson(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  // bug：调用方给了 signal 就只监听它，超时彻底失效
  const signal = options.signal ?? controller.signal;
  try {
    const res = await fetch(url, { signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
