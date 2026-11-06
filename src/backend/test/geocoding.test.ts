import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GeocodingService } from '../src/geocoding/geocoding.service.js';
import { createUser, http, startTestApp, type TestApp } from './helpers.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function serviceWithKey(apiKey?: string): GeocodingService {
    return new GeocodingService({ get: () => apiKey } as unknown as ConfigService);
}

function mapboxFeature(overrides: Record<string, unknown> = {}, context: Record<string, unknown> = {}) {
    return {
        type: 'Feature',
        properties: {
            mapbox_id: 'place-via-roma-10',
            full_address: 'Via Roma 10, 00100 Roma, Italy',
            coordinates: { latitude: 41.9028, longitude: 12.4964 },
            context: {
                address: { name: '10 Via Roma', address_number: '10', street_name: 'Via Roma' },
                place: { name: 'Roma' },
                postcode: { name: '00100' },
                country: { name: 'Italy', country_code: 'IT' },
                ...context
            },
            ...overrides
        }
    };
}

describe('GeocodingService', () => {
    test('maps complete addresses, filters incomplete ones and caches results', async () => {
        let calls = 0;
        let requestedUrl: URL | undefined;

        globalThis.fetch = ((input: URL | RequestInfo) => {
            calls += 1;
            requestedUrl = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
            return Response.json({
                features: [
                    mapboxFeature(),
                    mapboxFeature(),
                    mapboxFeature(
                        { mapbox_id: 'place-street-only' },
                        { address: { name: 'Via Roma', street_name: 'Via Roma' } }
                    ),
                    mapboxFeature({ mapbox_id: 'place-city-only' }, { address: undefined })
                ]
            });
        }) as unknown as typeof fetch;

        const service = serviceWithKey('test-key');
        const results = await service.autocomplete('  via   roma 10 ', 5);

        expect(results).toEqual([
            {
                placeId: 'place-via-roma-10',
                formattedAddress: 'Via Roma 10, 00100 Roma, Italy',
                street: 'Via Roma',
                houseNumber: '10',
                city: 'Roma',
                postcode: '00100',
                country: 'Italy',
                countryCode: 'IT',
                lat: 41.9028,
                lon: 12.4964
            }
        ]);
        expect(requestedUrl?.hostname).toBe('api.mapbox.com');
        expect(requestedUrl?.searchParams.get('q')).toBe('via roma 10');
        expect(requestedUrl?.searchParams.get('limit')).toBe('5');
        expect(requestedUrl?.searchParams.get('types')).toBe('address');
        expect(requestedUrl?.searchParams.get('autocomplete')).toBe('true');
        expect(requestedUrl?.searchParams.get('access_token')).toBe('test-key');

        const cached = await service.autocomplete('VIA ROMA 10', 5);
        expect(cached).toEqual(results);
        expect(calls).toBe(1);
    });

    test('reports a missing API key as unavailable', async () => {
        let error: unknown;
        try {
            await serviceWithKey(undefined).autocomplete('Via Roma 10', 5);
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(ServiceUnavailableException);
    });

    test('reports provider failures as bad gateway', async () => {
        globalThis.fetch = (() => new Response('nope', { status: 500 })) as unknown as typeof fetch;

        let error: unknown;
        try {
            await serviceWithKey('test-key').autocomplete('Via Roma 10', 5);
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(BadGatewayException);
    });

    test('does not call the provider for queries shorter than three characters', async () => {
        let calls = 0;
        globalThis.fetch = (() => {
            calls += 1;
            return Response.json({ features: [mapboxFeature()] });
        }) as unknown as typeof fetch;

        const results = await serviceWithKey('test-key').autocomplete('Ro', 5);
        expect(results).toEqual([]);
        expect(calls).toBe(0);
    });
});

describe('GET /geocoding/autocomplete', () => {
    let app: TestApp;

    beforeAll(async () => {
        process.env.MAPBOX_ACCESS_TOKEN = 'test-key';
        app = await startTestApp();
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('requires authentication', async () => {
        const response = await http(app, 'GET', '/geocoding/autocomplete?q=Via%20Roma%2010');
        expect(response.status).toBe(401);
    });

    test('returns complete street addresses for an authenticated user', async () => {
        const user = await createUser(app, 'geocoder');
        globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
            const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
            if (url.hostname === 'api.mapbox.com') {
                return Response.json({ features: [mapboxFeature()] });
            }
            return originalFetch(input, init);
        }) as unknown as typeof fetch;

        const response = await http<
            Array<{ placeId: string; formattedAddress: string; street: string; houseNumber: string }>
        >(app, 'GET', '/geocoding/autocomplete?q=Via%20Roma%2010', { bearer: user.token });

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0]?.placeId).toBe('place-via-roma-10');
        expect(response.body[0]?.formattedAddress).toBe('Via Roma 10, 00100 Roma, Italy');
        expect(response.body[0]?.street).toBe('Via Roma');
        expect(response.body[0]?.houseNumber).toBe('10');
    });

    test('rejects queries shorter than three characters', async () => {
        const user = await createUser(app, 'shortquery');
        const response = await http(app, 'GET', '/geocoding/autocomplete?q=Ro', { bearer: user.token });
        expect(response.status).toBe(400);
    });
});
