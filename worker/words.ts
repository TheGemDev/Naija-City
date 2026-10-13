// The Scrabble dictionary: about 168,000 English words (the public-domain ENABLE list, 2 to 15 letters, one
// per line, sorted) plus Naija words every player knows. The list is searched where it lies, by halving,
// so nothing is built or parsed when the Worker starts.

import WORDS from './data/words.txt';

/** Words the English list does not have but a Kaduna player would rightly expect to count. */
const NAIJA = new Set([
  'abeg', 'aboki', 'agbada', 'agbero', 'ajebo', 'akara', 'amala', 'ankara', 'aso', 'ashewo', 'asun', 'ayo', 'baba', 'babalawo', 'banga', 'boli',
  'buka', 'chai', 'chin', 'chop', 'dabaru', 'danfo', 'dara', 'dodo', 'egusi', 'eba', 'ewedu', 'fufu', 'garri', 'gele', 'gida', 'gbese', 'gist',
  'iro', 'jara', 'japa', 'jollof', 'kai', 'keke', 'kilishi', 'kobo', 'kpomo', 'kuli', 'kunu', 'mallam', 'masa', 'moimoi', 'molue', 'mugu',
  'naira', 'nepa', 'nyash', 'oba', 'oga', 'ogbono', 'ogogoro', 'okada', 'okro', 'omo', 'owambe', 'oyibo', 'oyinbo', 'pele', 'pepper', 'sabi',
  'sapa', 'shaki', 'shayo', 'suya', 'tuwo', 'ugu', 'ugwu', 'wahala', 'wayo', 'wetin', 'whot', 'yahoo', 'zobo',
]);

export function isWord(word: string): boolean {
  const w = word.toLowerCase();
  if (NAIJA.has(w)) return true;
  let lo = 0;
  let hi = WORDS.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    // The line that `mid` falls in.
    const start = WORDS.lastIndexOf('\n', mid - 1) + 1;
    const stop = WORDS.indexOf('\n', start);
    const end = stop < 0 ? WORDS.length : stop;
    const found = WORDS.slice(start, end);
    if (found === w) return true;
    if (found < w) lo = end + 1;
    else hi = start;
  }
  return false;
}
