import { ref } from 'vue';
import type { Event } from '../types/Event';
import { createLogger } from '../services/logger';
import { readTimedCache, writeTimedCache } from '../utils/idbCache';

// Persistent Cache Keys (Prefixes)
const GEO_PREFIX = 'weather_geo_';
const GEO_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day

// In-memory tracking for in-flight requests
const pendingGeocodes = new Map<string, Promise<{ lat: number; lon: number; timezone: string } | null>>();
const logger = createLogger('Geocode');

// Throttle for Nominatim (max 1 req/sec)
let nextAvailableGeocodeTime = 0;
const GEOCONTROL_DELAY = 1200;

// Module-level state to share coordinates across components without prop drilling
const coordsByEventId = ref<Record<number, { lat: number; lon: number; location: string } | null>>({});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const performGeocode = async (q: string): Promise<{ lat: number; lon: number; timezone: string } | null> => {
    // Enforce sequential execution with delay
    const now = Date.now();
    const startTime = Math.max(now, nextAvailableGeocodeTime);
    nextAvailableGeocodeTime = startTime + GEOCONTROL_DELAY;

    const waitTime = startTime - now;
    if (waitTime > 0) {
        await delay(waitTime);
    }

    const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=1`,
        {
            headers: {
                'User-Agent': 'legacy-calendar-client/1.0 (contact@iquick.dev)'
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Geocoding failed for "${q}": HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.length === 0) {
        return null;
    }

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        timezone: 'auto'
    };
};

export const geocodeLocation = async (
    location: string
): Promise<{ lat: number; lon: number; timezone: string } | null> => {
    // 0. Check if location is already coordinates (e.g., "(48.1, 11.2)" or "48.1, 11.2")
    const coordRegex = /^\(?\[?\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)?\]?$/;
    const match = location.trim().match(coordRegex);
    if (match) {
        return {
            lat: parseFloat(match[1]),
            lon: parseFloat(match[2]),
            timezone: 'auto'
        };
    }

    const cacheKey = GEO_PREFIX + location;

    // 1. Check persistent cache with TTL (legacy untimestamped entries still hit)
    try {
        const cached = await readTimedCache<{ lat: number; lon: number; timezone: string } | null>(
            cacheKey,
            GEO_CACHE_TTL,
            { allowLegacy: true }
        );
        if (cached.hit) {
            logger.trace('Geocode cache hit', { location, cacheKey });
            return cached.value;
        }
    } catch (e) {
        logger.warn('IndexedDB read error while reading geocode cache', e);
    }

    // 2. Check in-flight requests
    if (pendingGeocodes.has(location)) {
        return pendingGeocodes.get(location)!;
    }

    // 3. Perform request
    const geocodePromise = (async () => {
        try {
            let result;
            try {
                logger.debug('Geocoding location', { location });
                result = await performGeocode(location);

                // Retry with simplified name if it contains a separator
                if (!result && (location.includes(' - ') || location.includes(' @ '))) {
                    const separator = location.includes(' - ') ? ' - ' : ' @ ';
                    const simplified = location.split(separator)[0];
                    logger.debug('Retrying geocode with simplified location', { location, simplified });
                    result = await performGeocode(simplified);
                }

                // Always cache with timestamp (even if it's null/not found)
                await writeTimedCache(cacheKey, result);
                logger.info('Geocode resolved', { location, cacheKey, found: Boolean(result) });
                return result;
            } catch (e) {
                logger.error('Geocoding transient error', e);
                return null; // Don't cache on network/server errors
            }
        } finally {
            pendingGeocodes.delete(location);
        }
    })();

    pendingGeocodes.set(location, geocodePromise);
    return geocodePromise;
};

export function useGeocode() {
    const getOrResolveCoords = async (event: Event) => {
        if (!event.location) return null;

        if (event.locationDetails) {
            const coords = { lat: event.locationDetails.lat, lon: event.locationDetails.lon };
            coordsByEventId.value[event.id] = { ...coords, location: event.location };
            return { ...coords, timezone: 'auto' };
        }

        // Coordinates are only reusable while the event location is unchanged.
        const cached = coordsByEventId.value[event.id];
        if (cached?.location === event.location) {
            logger.trace('Using cached coordinates for event', { eventId: event.id });
            return cached;
        }

        const geo = await geocodeLocation(event.location);
        if (geo) {
            coordsByEventId.value[event.id] = { lat: geo.lat, lon: geo.lon, location: event.location };
            logger.debug('Cached event coordinates', { eventId: event.id, lat: geo.lat, lon: geo.lon });
        }
        return geo;
    };

    const getCoordsForEvent = (eventId: number) => {
        return coordsByEventId.value[eventId] || null;
    };

    return {
        getOrResolveCoords,
        getCoordsForEvent,
        coordsByEventId
    };
}
