import { expect, mock, test } from 'bun:test';
import { nextTick, ref } from 'vue';

let fetchCalls = 0;
let resolveFetch: ((value: unknown) => void) | null = null;

await mock.module('openmeteo', () => ({
    fetchWeatherApi: () => {
        fetchCalls++;
        return new Promise((resolve) => {
            resolveFetch = resolve;
        });
    }
}));
await mock.module('../src/composables/useGeocode', () => ({
    useGeocode: () => ({ getOrResolveCoords: () => Promise.resolve({ lat: 41.9, lon: 12.5 }) })
}));
await mock.module('../src/utils/idbCache', () => ({
    readTimedCache: () => Promise.resolve({ hit: false }),
    writeTimedCache: () => Promise.resolve()
}));
await mock.module('../src/services/logger', () => ({
    createLogger: () => ({ info: () => {}, debug: () => {}, trace: () => {}, warn: () => {}, error: () => {} })
}));

const { useEventWeather } = await import('../src/composables/useEventWeather.js');

const makeEvent = (id: number) => ({
    id,
    location: 'Rome',
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    locationDetails: { lat: 41.9, lon: 12.5 }
});

test('an event change during an in-flight weather batch is not silently dropped', async () => {
    const events = ref([makeEvent(1)]);
    const weather = useEventWeather(events as never);

    const firstRun = weather.loadWeatherForEvents();
    for (let index = 0; index < 5; index++) await nextTick();
    expect(fetchCalls).toBe(1);

    events.value = [makeEvent(2)];
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Resolve the slow in-flight forecast; the queued rerun should start.
    resolveFetch?.([]);
    await firstRun;
    for (let index = 0; index < 5; index++) await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchCalls).toBeGreaterThan(1);
});
