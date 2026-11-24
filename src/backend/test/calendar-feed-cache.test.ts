import { expect, test } from 'bun:test';
import { CalendarFeedService } from '../src/calendar-feed/calendar-feed.service.js';
import type { CalendarFeedRepository } from '../src/calendar-feed/calendar-feed.repository.js';

test('repeat feed polls reuse the built document while nothing changed', async () => {
    let signature = 'v1';
    let fullBuilds = 0;
    const repository = {
        findVisibleEvents: () => {
            fullBuilds++;
            return Promise.resolve([]);
        },
        getFeedSignature: () => Promise.resolve(signature)
    } as unknown as CalendarFeedRepository;
    const service = new CalendarFeedService(repository);

    const first = await service.buildFeed(7);
    const second = await service.buildFeed(7);
    expect(second.etag).toBe(first.etag);
    expect(fullBuilds).toBe(1);

    signature = 'v2';
    const third = await service.buildFeed(7);
    expect(fullBuilds).toBe(2);
    expect(third.body).toBe(first.body); // empty feed, but rebuilt after the change
});
