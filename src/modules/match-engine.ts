/**
 * Match Engine — Fuzzy text matching for HMIS search result selection.
 *
 * When the extension searches for a diagnosis or investigation in HMIS,
 * the results dropdown may contain multiple items. This module scores
 * each candidate and picks the best match.
 */

/**
 * Finds the best matching element from search results for a given query.
 * Tries the primary selector first, then broader fallback selectors.
 *
 * @param listSelector  CSS selector for the result list items
 * @param query         The search query to match against
 * @returns             The best-matching HTMLElement, or null if no results
 */
export function findBestMatch(listSelector: string, query: string): HTMLElement | null {
    const candidates = document.querySelectorAll(listSelector);
    if (candidates.length === 0) {
        // Try broader selectors as fallback
        const fallbackCandidates = document.querySelectorAll(
            '.dropdown-menu.show li a, .dropdown-menu li a, .autocomplete-result, .search-result-item, ul.list-group li a'
        );
        if (fallbackCandidates.length === 0) return null;
        return findBestFromNodeList(fallbackCandidates, query);
    }
    return findBestFromNodeList(candidates, query);
}

/**
 * Scores and ranks a NodeList of elements against a query string.
 * Returns the highest-scoring match.
 *
 * Scoring heuristic:
 *   100 — Exact text match
 *    80 — Text starts with query
 *    60 — Text contains query
 *    40 — Query contains the element text (partial overlap)
 *   20-40 — Word-level overlap
 *     0 — No match (falls back to first result)
 */
export function findBestFromNodeList(nodes: NodeListOf<Element>, query: string): HTMLElement | null {
    const queryLower = query.toLowerCase().trim();
    let bestMatch: HTMLElement | null = null;
    let bestScore = -1;

    for (const node of Array.from(nodes)) {
        const text = node.textContent?.toLowerCase().trim() || '';
        if (!text) continue;

        const score = scoreMatch(text, queryLower);

        if (score > bestScore) {
            bestScore = score;
            bestMatch = node as HTMLElement;
        }
    }

    // If no decent match, just return the first one
    if (!bestMatch && nodes.length > 0) {
        bestMatch = nodes[0] as HTMLElement;
    }

    return bestMatch;
}

/**
 * Scores how well `candidate` matches `query`.
 * Both inputs should be lowercase and trimmed.
 */
export function scoreMatch(candidate: string, query: string): number {
    // Exact match
    if (candidate === query) return 100;
    // Text starts with query
    if (candidate.startsWith(query)) return 80;
    // Text contains query
    if (candidate.includes(query)) return 60;
    // Query contains text (partial overlap)
    if (query.includes(candidate)) return 40;

    // Word-level overlap
    const queryWords = query.split(/\s+/);
    const candidateWords = candidate.split(/\s+/);
    const matchingWords = queryWords.filter(w =>
        candidateWords.some(cw => cw.includes(w) || w.includes(cw))
    );
    if (matchingWords.length > 0) {
        return 20 + (matchingWords.length / queryWords.length) * 20;
    }

    return 0;
}
