import { BadGatewayException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../logging/app-logger.js';
import { AddressDetailsDto } from './dto/address-details.dto.js';

const MAPBOX_FORWARD_URL = 'https://api.mapbox.com/search/geocode/v6/forward';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 5_000;

type MapboxContextItem = {
    name?: string;
    address_number?: string;
    street_name?: string;
    country_code?: string;
};

type MapboxFeature = {
    properties?: {
        mapbox_id?: string;
        full_address?: string;
        coordinates?: { latitude?: number; longitude?: number };
        context?: {
            address?: MapboxContextItem;
            street?: MapboxContextItem;
            place?: MapboxContextItem;
            locality?: MapboxContextItem;
            postcode?: MapboxContextItem;
            country?: MapboxContextItem;
        };
    };
};

type MapboxResponse = {
    features?: MapboxFeature[];
};

type CacheEntry = {
    expiresAt: number;
    results: AddressDetailsDto[];
};

@Injectable()
export class GeocodingService {
    private readonly logger = new AppLogger(GeocodingService.name);
    private readonly cache = new Map<string, CacheEntry>();
    private missingKeyWarningLogged = false;

    constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

    async autocomplete(query: string, limit: number): Promise<AddressDetailsDto[]> {
        const normalizedQuery = query.trim().replace(/\s+/g, ' ');
        if (normalizedQuery.length < 3) {
            return [];
        }

        const safeLimit = Math.min(Math.max(limit, 1), 8);
        const cacheKey = `${safeLimit}:${normalizedQuery.toLowerCase()}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.results;
        }
        if (cached) {
            this.cache.delete(cacheKey);
        }

        const results = await this.fetchSuggestions(normalizedQuery, safeLimit);
        this.writeCache(cacheKey, results);
        return results;
    }

    private async fetchSuggestions(query: string, limit: number): Promise<AddressDetailsDto[]> {
        const apiKey = this.configService.get<string>('MAPBOX_ACCESS_TOKEN')?.trim();
        if (!apiKey) {
            if (!this.missingKeyWarningLogged) {
                this.logger.warn('Address search requested without MAPBOX_ACCESS_TOKEN');
                this.missingKeyWarningLogged = true;
            }
            throw new ServiceUnavailableException('Address search is not configured');
        }

        const url = new URL(MAPBOX_FORWARD_URL);
        url.searchParams.set('q', query);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('types', 'address');
        url.searchParams.set('autocomplete', 'true');
        url.searchParams.set('access_token', apiKey);

        let response: Response;
        try {
            response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        } catch (error) {
            this.logger.error('Address search request failed', error);
            throw new BadGatewayException('Address search is unavailable');
        }

        if (!response.ok) {
            this.logger.warn('Address search provider returned an error', {
                status: response.status
            });
            throw new BadGatewayException('Address search is unavailable');
        }

        let payload: MapboxResponse;
        try {
            payload = (await response.json()) as MapboxResponse;
        } catch (error) {
            this.logger.error('Address search returned an invalid payload', error);
            throw new BadGatewayException('Address search is unavailable');
        }

        const rawResults = payload.features ?? [];
        const seen = new Set<string>();
        const results: AddressDetailsDto[] = [];

        for (const rawResult of rawResults) {
            const address = mapAddress(rawResult);
            if (!address || seen.has(address.placeId)) {
                continue;
            }
            seen.add(address.placeId);
            results.push(address);
        }

        this.logger.debug('Address search completed', { resultCount: results.length });
        return results;
    }

    private writeCache(cacheKey: string, results: AddressDetailsDto[]): void {
        if (this.cache.size >= CACHE_MAX_ENTRIES) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results });
    }
}

function mapAddress(feature: MapboxFeature): AddressDetailsDto | null {
    const props = feature.properties;
    const context = props?.context;
    const street = context?.address?.street_name ?? context?.street?.name;
    const houseNumber = context?.address?.address_number;
    const city = context?.place?.name ?? context?.locality?.name;
    const country = context?.country;
    const lat = props?.coordinates?.latitude;
    const lon = props?.coordinates?.longitude;

    if (
        !props?.mapbox_id ||
        !props.full_address ||
        !street ||
        !houseNumber ||
        !city ||
        !country?.name ||
        !country.country_code ||
        typeof lat !== 'number' ||
        typeof lon !== 'number'
    ) {
        return null;
    }

    return {
        placeId: props.mapbox_id,
        formattedAddress: props.full_address,
        street,
        houseNumber,
        city,
        postcode: context?.postcode?.name,
        country: country.name,
        countryCode: country.country_code.toUpperCase(),
        lat,
        lon
    };
}
