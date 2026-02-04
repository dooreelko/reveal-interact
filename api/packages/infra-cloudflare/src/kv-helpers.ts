/**
 * Helpers for prefix-based KV storage with indexed documents.
 * Storage key format: index1:index2:...:id
 * This enables efficient prefix-based listing via KV.list({ prefix }).
 */

/**
 * Separator used when constructing compound storage keys from indices.
 */
export const INDEX_SEPARATOR = ":";

/**
 * IndexedKey type - contains all index fields plus unique id.
 */
export type IndexedKey<TIndices extends string> = { id: string } & Record<TIndices, string>;

/**
 * Build a compound storage key from an IndexedKey.
 * Format: index1:index2:...:id
 */
export function buildStorageKey<TIndices extends string>(
  key: IndexedKey<TIndices>,
  indices: readonly TIndices[]
): string {
  if (indices.length === 0) {
    return key.id;
  }
  const indexValues = indices.map(idx => String(key[idx]));
  return [...indexValues, key.id].join(INDEX_SEPARATOR);
}

/**
 * Build a prefix for listing from partial filters.
 * Only consecutive indices from the start can form a prefix.
 * Returns the prefix string and whether all filters were used.
 */
export function buildListPrefix<TDoc, TIndices extends keyof TDoc>(
  filters: Partial<Pick<TDoc, TIndices>> | undefined,
  indices: readonly TIndices[]
): { prefix: string; usedAll: boolean } {
  if (!filters || indices.length === 0) {
    return { prefix: "", usedAll: !filters || Object.keys(filters).length === 0 };
  }

  const prefixParts: string[] = [];
  for (const idx of indices) {
    if (idx in filters) {
      prefixParts.push(String(filters[idx]));
    } else {
      break; // Stop at first missing index
    }
  }

  const usedAll = prefixParts.length === Object.keys(filters).length;
  const prefix = prefixParts.length > 0 ? prefixParts.join(INDEX_SEPARATOR) + INDEX_SEPARATOR : "";
  return { prefix, usedAll };
}
