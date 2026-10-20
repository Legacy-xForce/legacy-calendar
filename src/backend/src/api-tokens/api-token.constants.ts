export const MAX_API_TOKENS_PER_USER = 25;

export const API_TOKEN_DEFAULT_NAME = 'API token';

/** Writes `lastUsedAt` at most once a minute per token to avoid a write per request. */
export const API_TOKEN_LAST_USED_REFRESH_MS = 60_000;
