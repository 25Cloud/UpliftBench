export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function merged(a, b) {
  return new Set([...a, ...b]);
}

export function shared(a, b) {
  return new Set([...a].filter((x) => b.has(x)));
}

export function onlyA(a, b) {
  return new Set([...a].filter((x) => !b.has(x)));
}
