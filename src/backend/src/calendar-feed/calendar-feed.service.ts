import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { CalendarFeedToken } from '../../prisma/generated/client.js';
import { CalendarFeedRepository } from './calendar-feed.repository.js';
import { feedTokenHint, generateFeedToken, hashFeedToken, isFeedTokenShape } from './calendar-feed-token.util.js';
import { buildCalendarIcs } from './ics.util.js';
import { CalendarFeedResponseDto, CreatedCalendarFeedResponseDto } from './dto/calendar-feed.dto.js';

/** How far ahead the feed reaches. Older events would only clutter subscribers. */
const FEED_WINDOW_MONTHS = 6;

@Injectable()
export class CalendarFeedService {
    constructor(@Inject(CalendarFeedRepository) private readonly repository: CalendarFeedRepository) {}

    findLink(userId: number): Promise<CalendarFeedResponseDto | null> {
        return this.repository.findTokenForUser(userId).then((token) => (token ? this.toResponse(token) : null));
    }

    /** Creates the link, or rotates it if this user already has one. */
    async createOrRotate(userId: number): Promise<CreatedCalendarFeedResponseDto> {
        const token = generateFeedToken();
        const record = await this.repository.upsertToken(userId, hashFeedToken(token), feedTokenHint(token));
        return { ...this.toResponse(record), token };
    }

    async revoke(userId: number): Promise<void> {
        if (!(await this.repository.deleteTokenForUser(userId))) {
            throw new NotFoundException('No calendar feed link to revoke');
        }
    }

    resolveToken(rawToken: string): Promise<CalendarFeedToken | null> {
        if (!isFeedTokenShape(rawToken)) return Promise.resolve(null);
        return this.repository.findTokenByHash(hashFeedToken(rawToken));
    }

    /** Builds the document and a content hash so repeat polls can return 304. */
    async buildFeed(userId: number): Promise<{ body: string; etag: string }> {
        const from = new Date();
        from.setUTCHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setUTCMonth(to.getUTCMonth() + FEED_WINDOW_MONTHS);

        const events = await this.repository.findVisibleEvents(userId, from, to);
        const body = buildCalendarIcs(events);
        const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
        return { body, etag };
    }

    private toResponse(token: CalendarFeedToken): CalendarFeedResponseDto {
        return { id: token.id, tokenHint: token.tokenHint, createdAt: token.createdAt };
    }
}
