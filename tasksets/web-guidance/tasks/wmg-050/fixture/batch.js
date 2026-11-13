export function createGate() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function collect(iterable) {
  const out = [];
  for await (const value of iterable) out.push(value);
  return out;
}
