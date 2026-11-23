// Grades typed answers. Case and punctuation never matter; small typos and
// missing accents count as "almost" (correct, with a note), like Quizlet.

export const norm = s => String(s ?? '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stripAccents = s => s.normalize('NFD').replace(/\p{M}/gu, '');

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Returns { result: 'correct' | 'almost' | 'wrong', note? } */
export function grade(given, expected) {
  const g = norm(given);
  if (!g) return { result: 'wrong' };
  // Text in parentheses is optional: "Ribosome (organelle)" accepts "ribosome".
  const answers = [norm(expected), norm(String(expected).replace(/\([^)]*\)/g, ''))].filter(Boolean);
  if (answers.includes(g)) return { result: 'correct' };
  for (const e of answers) {
    if (stripAccents(g) === stripAccents(e)) return { result: 'almost', note: 'Check your accents.' };
    const tolerance = e.length <= 4 ? 0 : e.length <= 10 ? 1 : Math.min(5, Math.floor(e.length / 10) + 1);
    if (levenshtein(stripAccents(g), stripAccents(e)) <= tolerance) return { result: 'almost', note: 'Watch your spelling.' };
  }
  return { result: 'wrong' };
}
