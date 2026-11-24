import { expect, test } from 'bun:test';

test('default start is strictly in the future even late at night', async () => {
    const { defaultEventStart } = await import('../src/utils/event.js');
    const now = new Date('2026-11-24T23:30:00.000Z');

    const start = defaultEventStart(now, now);

    expect(start.getTime()).toBeGreaterThan(now.getTime());
    expect(start.toISOString()).toBe('2026-11-25T00:00:00.000Z');
});

test('default start keeps the next full hour during the day', async () => {
    const { defaultEventStart } = await import('../src/utils/event.js');
    const now = new Date('2026-11-24T10:05:00.000Z');

    expect(defaultEventStart(now, now).toISOString()).toBe('2026-11-24T11:00:00.000Z');
});

test('a future day still defaults to 20:00', async () => {
    const { defaultEventStart } = await import('../src/utils/event.js');
    const day = new Date('2026-12-01T09:00:00.000Z');
    const now = new Date('2026-11-24T10:05:00.000Z');

    expect(defaultEventStart(day, now).getHours()).toBe(20);
});
