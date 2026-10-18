/**
 * Deduplicate / coerce a list of numeric ids coming from request payloads.
 * Order is preserved (first occurrence wins).
 */
export function normalizeIdList(ids: readonly (number | string)[], options: { positiveOnly?: boolean } = {}): number[] {
    const numeric = ids.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    const filtered = options.positiveOnly ? numeric.filter((id) => id > 0) : numeric;
    return [...new Set(filtered)];
}
