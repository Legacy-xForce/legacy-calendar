import type { AddressDetails } from '../types/Address';
import { createLogger } from './logger';

/**
 * Address autocomplete against the Mapbox Search Box API.
 *
 * The REST API is used directly instead of `@mapbox/search-js-core`: the app
 * only needs `/suggest` + `/retrieve`, while the SDK mainly adds UI/session
 * helpers we would not use. Direct requests keep the bundle smaller and let us
 * map results straight to the address shape the event form already saves.
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
    formattedAddress: string;
    street: string;
    houseNumber: string;
    city: string;
    postcode?: string;
    country: string;
    countryCode: string;
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

type MapboxSuggestion = {
    name?: string;
    mapbox_id?: string;
    feature_type?: string;
    address?: string;
    full_address?: string;
    place_formatted?: string;
    context?: MapboxContext;
};

type MapboxSuggestResponse = {
    suggestions?: MapboxSuggestion[];
};

type MapboxRetrieveFeature = {
    geometry?: {
        coordinates?: [number, number];
    };
    properties?: {
        mapbox_id?: string;
        full_address?: string;
        place_formatted?: string;
        context?: MapboxContext;
        coordinates?: {
            latitude?: number;
            longitude?: number;
        };
    };
};

type MapboxRetrieveResponse = {
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
    url.searchParams.set('types', 'address');
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

    logger.debug('Address suggestions received', { query, count: results.length });
    return results;
}

export async function retrieveAddress(suggestion: AddressSuggestion): Promise<AddressDetails | null> {
    const token = requireAccessToken();
    const url = new URL(`${MAPBOX_SEARCH_URL}/retrieve/${encodeURIComponent(suggestion.mapboxId)}`);
    url.searchParams.set('session_token', suggestion.sessionToken);
    url.searchParams.set('access_token', token);

    const payload = await fetchSearchJson<MapboxRetrieveResponse>(url);
    return mapRetrievedAddress(payload.features?.[0], suggestion);
}

function accessToken(): string {
    return import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? '';
}

function requireAccessToken(): string {
    const token = accessToken();
    if (!token) {
        throw new Error('Address search is not configured');
    }
    return token;
}

async function fetchSearchJson<T>(url: URL): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
        logger.warn('Address search request failed', error);
        throw new Error('Address search is unavailable', { cause: error });
    }

    if (!response.ok) {
        logger.warn('Address search provider returned an error', { status: response.status });
        throw new Error('Address search is unavailable');
    }

    try {
        return (await response.json()) as T;
    } catch (error) {
        logger.warn('Address search returned an invalid payload', error);
        throw new Error('Address search is unavailable', { cause: error });
    }
}

function mapSuggestion(raw: MapboxSuggestion, sessionToken: string): AddressSuggestion | null {
    if (raw.feature_type !== 'address' || !raw.mapbox_id) {
        return null;
    }

    const address = buildAddressFields(raw.context);
    const formattedAddress = buildFormattedAddress(raw);
    if (!address || !formattedAddress) {
        return null;
    }

    return {
        mapboxId: raw.mapbox_id,
        formattedAddress,
        ...address,
        sessionToken
    };
}

function mapRetrievedAddress(
    feature: MapboxRetrieveFeature | undefined,
    suggestion: AddressSuggestion
): AddressDetails | null {
    const properties = feature?.properties;
    const address = buildAddressFields(properties?.context, suggestion);
    const coordinates = feature?.geometry?.coordinates;
    const lat = properties?.coordinates?.latitude ?? coordinates?.[1];
    const lon = properties?.coordinates?.longitude ?? coordinates?.[0];

    if (typeof lat !== 'number' || typeof lon !== 'number' || !address) {
        return null;
    }

    return {
        placeId: properties?.mapbox_id ?? suggestion.mapboxId,
        formattedAddress: properties?.full_address?.trim() || suggestion.formattedAddress,
        ...address,
        lat,
        lon
    };
}

function buildAddressFields(
    context: MapboxContext | undefined,
    fallback?: AddressSuggestion
): Pick<AddressSuggestion, 'street' | 'houseNumber' | 'city' | 'postcode' | 'country' | 'countryCode'> | null {
    const street = context?.address?.street_name ?? context?.street?.name ?? fallback?.street;
    const houseNumber = context?.address?.address_number ?? fallback?.houseNumber;
    const city = context?.place?.name ?? context?.locality?.name ?? fallback?.city;
    const country = context?.country?.name ?? fallback?.country;
    const countryCode = context?.country?.country_code ?? fallback?.countryCode;

    if (!street || !houseNumber || !city || !country || !countryCode) {
        return null;
    }

    return {
        street,
        houseNumber,
        city,
        postcode: context?.postcode?.name ?? fallback?.postcode,
        country,
        countryCode: countryCode.toUpperCase()
    };
}

function buildFormattedAddress(suggestion: MapboxSuggestion): string {
    const fullAddress = suggestion.full_address?.trim();
    if (fullAddress) {
        return fullAddress;
    }

    return [suggestion.address ?? suggestion.name, suggestion.place_formatted]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(', ');
}
