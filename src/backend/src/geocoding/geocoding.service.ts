import { BadGatewayException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../logging/app-logger.js';
import { AddressDetailsDto } from './dto/address-details.dto.js';

const GEOAPIFY_AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 5_000;

type GeoapifyResult = {
    place_id?: string;
    formatted?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
    lat?: number;
    lon?: number;
};

type GeoapifyResponse = {
    results?: GeoapifyResult[];
    features?: Array<{ properties?: GeoapifyResult }>;
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
        const apiKey = this.configService.get<string>('GEOAPIFY_API_KEY')?.trim();
        if (!apiKey) {
            if (!this.missingKeyWarningLogged) {
                this.logger.warn('Address search requested without GEOAPIFY_API_KEY');
                this.missingKeyWarningLogged = true;
            }
            throw new ServiceUnavailableException('Address search is not configured');
        }

        const url = new URL(GEOAPIFY_AUTOCOMPLETE_URL);
        url.searchParams.set('text', query);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('format', 'json');
        url.searchParams.set('apiKey', apiKey);

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

        let payload: GeoapifyResponse;
        try {
            payload = (await response.json()) as GeoapifyResponse;
        } catch (error) {
            this.logger.error('Address search returned an invalid payload', error);
            throw new BadGatewayException('Address search is unavailable');
        }

        const rawResults = payload.results ?? payload.features?.map((feature) => feature.properties ?? {}) ?? [];
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

function mapAddress(result: GeoapifyResult): AddressDetailsDto | null {
    if (
        !result.place_id ||
        !result.formatted ||
        !result.street ||
        !result.housenumber ||
        !result.city ||
        !result.country ||
        !result.country_code ||
        typeof result.lat !== 'number' ||
        typeof result.lon !== 'number'
    ) {
        return null;
    }

    return {
        placeId: result.place_id,
        formattedAddress: result.formatted,
        street: result.street,
        houseNumber: result.housenumber,
        city: result.city,
        postcode: result.postcode,
        country: result.country,
        countryCode: result.country_code.toUpperCase(),
        lat: result.lat,
        lon: result.lon
    };
}
