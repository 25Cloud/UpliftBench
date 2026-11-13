export function createGate() {
  const { promise, resolve, reject } = Promise.withResolvers();
  return { promise, resolve, reject };
}

export async function collect(iterable) {
  return Array.fromAsync(iterable);
}
