const FRONT = ['big', 'oga', 'chief', 'baba', 'mama', 'sir', 'aunty', 'omo', 'alhaji', 'madam', 'king', 'queen', 'lil', 'real', 'only1', 'sabi', 'sharp', 'fine', 'soft', 'odogwu'];
const NAMES = ['musa', 'tunde', 'chidi', 'amina', 'emeka', 'bisi', 'sani', 'ngozi', 'kunle', 'zainab', 'femi', 'halima', 'obi', 'kemi', 'yusuf', 'ada', 'bayo', 'hauwa', 'uche', 'segun', 'ife', 'danjuma', 'tolu', 'efe'];
const TAILS = ['kd', 'abj', 'lag', 'naija', '9ja', 'baller', 'vibes', 'boss', 'hustle', 'money', 'gee', 'wire', 'jollof', 'suya', 'danfo', 'okada', 'steeze', 'wahala'];

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];

/** A random handle for the username picker's dice, always a valid one (3–15 of a-z, 0-9, _). */
export function randomUsername(): string {
  const shapes = [
    () => `${pick(FRONT)}_${pick(NAMES)}`,
    () => `${pick(NAMES)}_${pick(TAILS)}`,
    () => `${pick(FRONT)}${pick(NAMES)}`,
    () => `${pick(NAMES)}${pick(TAILS)}`,
  ];
  // Two digits on the end keep it from clashing with the last person who rolled the same words.
  const digits = String(10 + Math.floor(Math.random() * 90));
  for (let i = 0; i < 20; i++) {
    const base = shapes[Math.floor(Math.random() * shapes.length)]();
    if (base.length + digits.length <= 15) return base + digits;
  }
  return pick(NAMES) + digits;
}
