export function safeParse(input) {
  try {
    return new URL(input);
  } catch (err) {
    return null;
  }
}

export function isLink(input) {
  try {
    new URL(input);
    return true;
  } catch (err) {
    return false;
  }
}

export function hostOf(input) {
  const parsed = safeParse(input);
  return parsed ? parsed.host : '';
}
