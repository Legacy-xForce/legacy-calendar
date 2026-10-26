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

function geoapifyResult(overrides: Record<string, unknown> = {}) {
    return {
        place_id: 'place-via-roma-10',
        formatted: 'Via Roma 10, 00100 Roma, Italy',
        street: 'Via Roma',
        housenumber: '10',
        city: 'Roma',
        postcode: '00100',
        country: 'Italy',
        country_code: 'it',
        lat: 41.9028,
        lon: 12.4964,
        ...overrides
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
                results: [
                    geoapifyResult(),
                    geoapifyResult(),
                    geoapifyResult({ place_id: 'place-street-only', housenumber: undefined }),
                    geoapifyResult({ place_id: 'place-city-only', street: undefined, housenumber: undefined })
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
        expect(requestedUrl?.searchParams.get('text')).toBe('via roma 10');
        expect(requestedUrl?.searchParams.get('limit')).toBe('5');
        expect(requestedUrl?.searchParams.get('format')).toBe('json');
        expect(requestedUrl?.searchParams.get('apiKey')).toBe('test-key');

        const cached = await service.autocomplete('VIA ROMA 10', 5);
        expect(cached).toEqual(results);
        expect(calls).toBe(1);
    });

    test('supports GeoJSON feature responses', async () => {
        globalThis.fetch = (() =>
            Response.json({ features: [{ properties: geoapifyResult() }] })) as unknown as typeof fetch;

        const [result] = await serviceWithKey('test-key').autocomplete('Via Roma 10', 5);
        expect(result?.placeId).toBe('place-via-roma-10');
        expect(result?.countryCode).toBe('IT');
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
            return Response.json({ results: [geoapifyResult()] });
        }) as unknown as typeof fetch;

        const results = await serviceWithKey('test-key').autocomplete('Ro', 5);
        expect(results).toEqual([]);
        expect(calls).toBe(0);
    });
});

describe('GET /geocoding/autocomplete', () => {
    let app: TestApp;

    beforeAll(async () => {
        process.env.GEOAPIFY_API_KEY = 'test-key';
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
            if (url.hostname === 'api.geoapify.com') {
                return Response.json({ results: [geoapifyResult()] });
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
