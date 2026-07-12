/**
 * Deterministic, seed-based shuffling for the "shuffle question order" and
 * "shuffle answer options" anti-cheat features. Nothing here is a security
 * boundary — it only needs to be stable per seed and reasonably well mixed,
 * not cryptographically unpredictable.
 */

function seedFromString(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a permutation array `perm` of length `n` such that
 * `perm[displayPosition] = originalIndex`. The same seed always produces
 * the same permutation.
 */
export function seededPermutation(n: number, seed: string): number[] {
  const rand = mulberry32(seedFromString(seed));
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

/** Reorders `items` for display according to a seeded permutation. */
export function applySeededShuffle<T>(items: T[], seed: string): T[] {
  const perm = seededPermutation(items.length, seed);
  return perm.map((originalIndex) => items[originalIndex]);
}

/**
 * Picks the next unanswered question for a candidate.
 * When `shuffle` is false, behaves exactly like the pre-existing behavior:
 * first question (in the given order) not present in `answeredIds`.
 * When `shuffle` is true, the question list is reordered per-seed first.
 */
export function pickNextQuestion<Q extends { id: string }>(
  questions: Q[],
  answeredIds: string[],
  seed: string,
  shuffle: boolean,
): Q | undefined {
  const ordered = shuffle ? applySeededShuffle(questions, seed) : questions;
  return ordered.find((q) => !answeredIds.includes(q.id));
}

/**
 * Translates a display-position index (what the candidate clicked, in their
 * shuffled view) back into the canonical index stored in the database.
 */
export function translateDisplayIndexToCanonical(
  displayIndex: number,
  optionCount: number,
  seed: string,
): number {
  const perm = seededPermutation(optionCount, seed);
  return perm[displayIndex];
}
