import { getFrontendUrl } from '../config/frontend-url.js';
import type { FeedEvent, FeedLocationDetails } from './calendar-feed.repository.js';

const CRLF = '\r\n';

/** RFC 5545 TEXT escaping. Order matters: backslashes must be doubled first. */
function escapeText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n');
}

/** Lines are folded at 75 octets; continuations start with a single space. */
function foldLine(line: string): string {
    const encoder = new TextEncoder();
    const parts: string[] = [];
    let current = '';
    let bytes = 0;

    for (const char of line) {
        const size = encoder.encode(char).length;
        if (bytes + size > 75) {
            parts.push(current);
            current = ` ${char}`;
            bytes = 1 + size;
        } else {
            current += char;
            bytes += size;
        }
    }
    parts.push(current);
    return parts.join(CRLF);
}

/** `2026-02-04T10:00:00.000Z` -> `20260204T100000Z` (UTC, no VTIMEZONE needed). */
function stamp(date: Date): string {
    return date
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
}

function endTimeOf(event: FeedEvent): Date {
    return event.endTime ?? new Date(event.startTime.getTime() + 60 * 60 * 1000);
}

export function buildCalendarIcs(events: FeedEvent[]): string {
    const frontendUrl = getFrontendUrl().replace(/\/$/, '');
    const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Legacy Calendar//Calendar Feed//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:Legacy Calendar',
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H'
    ];

    for (const event of events) {
        const details = event.locationDetails as FeedLocationDetails | null;
        const label = details?.formattedAddress || event.location || '';
        const hasGeo = typeof details?.lat === 'number' && typeof details?.lon === 'number';
        const eventUrl = `${frontendUrl}/event/${event.id}`;
        const description = [
            event.description?.trim(),
            `Host: ${event.host.username}`,
            `Open in Legacy Calendar: ${eventUrl}`
        ]
            .filter(Boolean)
            .join('\n');

        lines.push(
            'BEGIN:VEVENT',
            // Stable across regenerations so subscribers update instead of duplicating.
            `UID:event-${event.id}@legacy-calendar`,
            `DTSTAMP:${stamp(event.updatedAt)}`,
            `DTSTART:${stamp(event.startTime)}`,
            `DTEND:${stamp(endTimeOf(event))}`,
            `SUMMARY:${escapeText(event.title)}`,
            `DESCRIPTION:${escapeText(description)}`,
            ...(label ? [`LOCATION:${escapeText(label)}`] : []),
            ...(hasGeo ? [`GEO:${details.lat};${details.lon}`] : []),
            `URL:${eventUrl}`,
            'STATUS:CONFIRMED',
            'END:VEVENT'
        );
    }

    lines.push('END:VCALENDAR');
    return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}
