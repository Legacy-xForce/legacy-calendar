import type { AddressDetails } from '../types/Address';
import { createLogger } from './logger';

/**
 * Location autocomplete against the Mapbox Search Box API.
 *
 * The REST API is used directly instead of `@mapbox/search-js-core`: the app
 * only needs `/suggest`, `/retrieve` and `/forward`, while the SDK mainly adds
 * UI/session helpers we would not use. Direct requests keep the bundle smaller
 * and let us map results straight to the location shape the event form saves.
 *
 * Searches are intentionally not limited to addresses. Any place Mapbox can
 * return (venues, cities, regions, countries, addresses, ...) is a valid event
 * location.
 *
 * The token is a public browser token, so it is inlined into the client bundle
 * and must never be a secret token. The Search Box API requires no token scopes;
 * a public token with URL restrictions for the app's origins is enough.
 */
const MAPBOX_SEARCH_URL = 'https://api.mapbox.com/search/searchbox/v1';
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESULTS = 8;

const logger = createLogger('MapboxSearch');

export interface AddressSuggestion {
    mapboxId: string;
    /** Display label for the result, including the venue/place name when relevant. */
    formattedAddress: string;
    /** Primary result label, e.g. a venue, city or street address. */
    name: string;
    /** Secondary context line shown below the name. */
    description?: string;
    street?: string;
    houseNumber?: string;
    city?: string;
    postcode?: string;
    country?: string;
    countryCode?: string;
    /** The Mapbox search session this suggestion belongs to (used by `/retrieve`). */
    sessionToken: string;
}

type MapboxContextItem = {
    name?: string;
    address_number?: string;
    street_name?: string;
    country_code?: string;
};

type MapboxContext = {
    address?: MapboxContextItem;
    street?: MapboxContextItem;
    place?: MapboxContextItem;
    locality?: MapboxContextItem;
    postcode?: MapboxContextItem;
    country?: MapboxContextItem;
};

type MapboxAddressParts = {
    name?: string;
    address?: string;
    full_address?: string;
    place_formatted?: string;
};

type MapboxSuggestion = MapboxAddressParts & {
    mapbox_id?: string;
    feature_type?: string;
    context?: MapboxContext;
};

type MapboxSuggestResponse = {
    suggestions?: MapboxSuggestion[];
};

type MapboxRetrieveFeature = {
    geometry?: {
        coordinates?: [number, number];
    };
    properties?: MapboxAddressParts & {
        mapbox_id?: string;
        context?: MapboxContext;
        coordinates?: {
            latitude?: number;
            longitude?: number;
        };
    };
};

type MapboxFeatureResponse = {
    features?: MapboxRetrieveFeature[];
};

export function isAddressSearchConfigured(): boolean {
    return Boolean(accessToken());
}

/** A new token must be used for each independent search session. */
export function createAddressSearchSessionToken(): string {
    // randomUUID is only exposed in secure contexts, so keep a fallback for
    // plain-HTTP LAN development. The value only needs to be unique.
    return crypto.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function suggestAddresses(query: string, sessionToken: string, limit = 5): Promise<AddressSuggestion[]> {
    const token = requireAccessToken();
    const url = new URL(`${MAPBOX_SEARCH_URL}/suggest`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), MAX_RESULTS)));
    url.searchParams.set('session_token', sessionToken);
    url.searchParams.set('access_token', token);

    const payload = await fetchSearchJson<MapboxSuggestResponse>(url);
    const seen = new Set<string>();
    const results: AddressSuggestion[] = [];

    for (const suggestion of payload.suggestions ?? []) {
        const mapped = mapSuggestion(suggestion, sessionToken);
        if (!mapped || seen.has(mapped.mapboxId)) continue;
        seen.add(mapped.mapboxId);
        results.push(mapped);
    }

    logger.debug('Location suggestions received', { query, count: results.length });
    return results;
}

export async function retrieveAddress(suggestion: AddressSuggestion): Promise<AddressDetails | null> {
    const token = requireAccessToken();
    const url = new URL(`${MAPBOX_SEARCH_URL}/retrieve/${encodeURIComponent(suggestion.mapboxId)}`);
    url.searchParams.set('session_token', suggestion.sessionToken);
    url.searchParams.set('access_token', token);

    const payload = await fetchSearchJson<MapboxFeatureResponse>(url);
    return mapRetrievedAddress(payload.features?.[0], suggestion);
}

/**
 * Resolve free-text locations to coordinates for weather forecasts.
 *
 * Events created from the location picker already carry coordinates, so this
 * is only used for legacy/free-text locations. `/forward` shares the same
 * Search Box token and ranking behaviour as `/suggest`.
 */
export async function forwardGeocode(query: string): Promise<{ lat: number; lon: number } | null> {
    const token = requireAccessToken();
    const url = new URL(`${MAPBOX_SEARCH_URL}/forward`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '1');
    // Mapbox defaults proximity to the caller's IP, so no explicit proximity
    // parameter is needed.
    url.searchParams.set('access_token', token);

    const payload = await fetchSearchJson<MapboxFeatureResponse>(url);
    const feature = payload.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    const lat = feature?.properties?.coordinates?.latitude ?? coordinates?.[1];
    const lon = feature?.properties?.coordinates?.longitude ?? coordinates?.[0];

    if (typeof lat !== 'number' || typeof lon !== 'number') {
        logger.debug('Forward geocode returned no coordinates', { query });
        return null;
    }

    logger.debug('Forward geocode resolved', { query, lat, lon });
    return { lat, lon };
}

function accessToken(): string {
    return import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? '';
}

function requireAccessToken(): string {
    const token = accessToken();
    if (!token) {
        throw new Error('Location search is not configured');
    }
    return token;
}

async function fetchSearchJson<T>(url: URL): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
        logger.warn('Location search request failed', error);
        throw new Error('Location search is unavailable', { cause: error });
    }

    if (!response.ok) {
        logger.warn('Location search provider returned an error', { status: response.status });
        throw new Error('Location search is unavailable');
    }

    try {
        return (await response.json()) as T;
    } catch (error) {
        logger.warn('Location search returned an invalid payload', error);
        throw new Error('Location search is unavailable', { cause: error });
    }
}

function mapSuggestion(raw: MapboxSuggestion, sessionToken: string): AddressSuggestion | null {
    if (!raw.mapbox_id) {
        return null;
    }

    const formattedAddress = buildFormattedAddress(raw);
    const name = raw.name?.trim() || raw.address?.trim() || raw.full_address?.trim();
    if (!name || !formattedAddress) {
        return null;
    }

    return {
        mapboxId: raw.mapbox_id,
        formattedAddress,
        name,
        description: raw.place_formatted?.trim() || undefined,
        ...buildAddressFields(raw.context),
        sessionToken
    };
}

function mapRetrievedAddress(
    feature: MapboxRetrieveFeature | undefined,
    suggestion: AddressSuggestion
): AddressDetails | null {
    const properties = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    const lat = properties?.coordinates?.latitude ?? coordinates?.[1];
    const lon = properties?.coordinates?.longitude ?? coordinates?.[0];

    if (typeof lat !== 'number' || typeof lon !== 'number') {
        return null;
    }

    return {
        placeId: properties?.mapbox_id ?? suggestion.mapboxId,
        formattedAddress: buildFormattedAddress(properties ?? {}) || suggestion.formattedAddress,
        ...buildAddressFields(properties?.context),
        lat,
        lon
    };
}

function buildAddressFields(
    context: MapboxContext | undefined
): Pick<AddressSuggestion, 'street' | 'houseNumber' | 'city' | 'postcode' | 'country' | 'countryCode'> {
    const countryCode = context?.country?.country_code;

    return {
        street: context?.address?.street_name ?? context?.street?.name,
        houseNumber: context?.address?.address_number,
        city: context?.place?.name ?? context?.locality?.name,
        postcode: context?.postcode?.name,
        country: context?.country?.name,
        countryCode: countryCode?.toUpperCase()
    };
}

function buildFormattedAddress(source: MapboxAddressParts): string {
    const name = source.name?.trim();
    const fullAddress = source.full_address?.trim();
    const placeFormatted = source.place_formatted?.trim();
    const address = source.address?.trim();

    // `full_address` already contains the street for addresses but may omit the
    // venue name for POIs, so prepend the name when it is not already present.
    if (fullAddress) {
        return name && !fullAddress.toLowerCase().includes(name.toLowerCase())
            ? `${name}, ${fullAddress}`
            : fullAddress;
    }

    return [name, address, placeFormatted]
        .map((part) => part?.trim())
        .filter((part, index, parts): part is string => Boolean(part) && parts.indexOf(part) === index)
        .join(', ');
}
