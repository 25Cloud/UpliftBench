export function safeParse(input) {
  return URL.parse(input);
}

export function isLink(input) {
  return URL.canParse(input);
}

export function hostOf(input) {
  const parsed = URL.parse(input);
  return parsed ? parsed.host : '';
}
