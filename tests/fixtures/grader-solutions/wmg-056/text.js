const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemes(s) {
  return [...SEGMENTER.segment(s)].map((part) => part.segment);
}

export function normalize(s) {
  return s.normalize('NFC');
}

export function fold(s) {
  return s.toLocaleLowerCase('tr');
}
