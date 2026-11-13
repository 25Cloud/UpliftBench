export function cloneState(state) {
  return structuredClone(state);
}

export function merged(a, b) {
  return a.union(b);
}

export function shared(a, b) {
  return a.intersection(b);
}

export function onlyA(a, b) {
  return a.difference(b);
}
