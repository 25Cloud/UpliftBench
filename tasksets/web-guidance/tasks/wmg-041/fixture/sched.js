export function enqueue(work) {
  setTimeout(function () {
    work();
  }, 0);
}

export async function runChunked(items, handle) {
  const start = performance.now();
  for (const item of items) {
    if (performance.now() - start > 50) {
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    handle(item);
  }
}
