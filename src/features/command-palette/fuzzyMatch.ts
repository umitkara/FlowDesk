/** Scores a candidate string against a query using fuzzy matching. Returns 0 for no match. */
export function fuzzyScore(query: string, candidate: string): number {
  if (!query) return 1;

  const q = query.toLowerCase();
  const c = candidate.toLowerCase();

  // Exact match gets highest score
  if (c === q) return 100;

  // Starts with gets high score
  if (c.startsWith(q)) return 80;

  // Contains gets decent score
  if (c.includes(q)) return 60;

  // Fuzzy character matching
  let qi = 0;
  let score = 0;
  let consecutive = 0;

  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] === q[qi]) {
      qi++;
      consecutive++;
      score += consecutive * 2; // Bonus for consecutive matches
      // Bonus for matching at word boundaries
      if (ci === 0 || c[ci - 1] === " " || c[ci - 1] === "-" || c[ci - 1] === "_") {
        score += 5;
      }
    } else {
      consecutive = 0;
    }
  }

  return qi === q.length ? Math.min(score, 59) : 0;
}

/** Filters and sorts commands by fuzzy match score. */
export function filterCommands<T extends { title: string; keywords?: string[] }>(
  items: T[],
  query: string,
  maxResults = 50,
): T[] {
  if (!query) return items.slice(0, maxResults);

  const scored = items
    .map((item) => {
      const titleScore = fuzzyScore(query, item.title);
      const keywordScore = (item.keywords ?? []).reduce(
        (best, kw) => Math.max(best, fuzzyScore(query, kw)),
        0,
      );
      return { item, score: Math.max(titleScore, keywordScore) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map((s) => s.item);
}
