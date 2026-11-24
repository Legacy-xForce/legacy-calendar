import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Only the fields the ICS document needs, plus host/visibility information. */
export const FEED_EVENT_SELECT = {
    id: true,
    title: true,
    description: true,
    location: true,
    locationDetails: true,
    startTime: true,
    endTime: true,
    updatedAt: true,
    isPrivate: true,
    host: { select: { username: true } }
} satisfies Prisma.EventSelect;

export type FeedEvent = Prisma.EventGetPayload<{ select: typeof FEED_EVENT_SELECT }>;

export type FeedLocationDetails = {
    formattedAddress?: string;
    lat?: number;
    lon?: number;
};

@Injectable()
export class CalendarFeedRepository {
    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    findTokenForUser(userId: number) {
        return this.prisma.calendarFeedToken.findUnique({ where: { userId } });
    }

    findTokenByHash(tokenHash: string) {
        return this.prisma.calendarFeedToken.findUnique({ where: { tokenHash } });
    }

    /** One link per user: creating again rotates the existing one. */
    upsertToken(userId: number, tokenHash: string, tokenHint: string) {
        return this.prisma.calendarFeedToken.upsert({
            where: { userId },
            create: { userId, tokenHash, tokenHint },
            update: { tokenHash, tokenHint, createdAt: new Date() }
        });
    }

    async deleteTokenForUser(userId: number): Promise<boolean> {
        const result = await this.prisma.calendarFeedToken.deleteMany({ where: { userId } });
        return result.count > 0;
    }

    /**
     * Mirrors EventsRepository's visibility rules: public events, plus anything
     * the feed owner hosts, co-hosts or participates in (including private ones).
     * No date filter: the calendar UI can browse any month, so the feed can too.
     */
    /**
     * Cheap change signal for the built ICS document: event count, newest
     * update, and the user's attendance count (visibility changes).
     */
    async getFeedSignature(userId: number): Promise<string> {
        const where = {
            OR: [
                { isPrivate: false },
                { hostId: userId },
                { participants: { some: { userId } } },
                { coHosts: { some: { userId } } }
            ]
        };
        const [eventCount, latest, attendanceCount] = await Promise.all([
            this.prisma.event.count({ where }),
            this.prisma.event.findFirst({
                where,
                orderBy: { updatedAt: 'desc' },
                select: { updatedAt: true }
            }),
            this.prisma.attendance.count({ where: { userId } })
        ]);
        return `${eventCount}:${latest?.updatedAt.getTime() ?? 0}:${attendanceCount}`;
    }

    findVisibleEvents(userId: number): Promise<FeedEvent[]> {
        return this.prisma.event.findMany({
            where: {
                OR: [
                    { isPrivate: false },
                    { hostId: userId },
                    { participants: { some: { userId } } },
                    { coHosts: { some: { userId } } }
                ]
            },
            select: FEED_EVENT_SELECT,
            orderBy: [{ startTime: 'asc' }, { id: 'asc' }]
        });
    }
}
