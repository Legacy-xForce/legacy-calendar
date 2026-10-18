export type EventSection = 'upcoming' | 'calendar';

/** Which top-level event surface the current route belongs to. */
export function getCurrentSection(path: string, routeName: unknown): EventSection {
    return routeName === 'upcoming' || path.startsWith('/upcoming/') ? 'upcoming' : 'calendar';
}

/** URL segment that prefixes event detail routes for a section. */
export function getEventPathPrefix(section: EventSection): string {
    return section === 'upcoming' ? '/upcoming' : '/event';
}

/** Overlay action encoded as a route suffix. */
export function getRouteAction(path: string): 'chat' | 'audit-log' | 'map' | 'edit' | null {
    if (path.endsWith('/chat')) return 'chat';
    if (path.endsWith('/audit-log')) return 'audit-log';
    if (path.endsWith('/map')) return 'map';
    if (path.endsWith('/edit')) return 'edit';
    return null;
}

/** Route `:id` params can be a string, an array or absent. */
export function parseEventId(value: unknown): number | null {
    if (Array.isArray(value)) {
        return parseEventId(value[0]);
    }

    if (typeof value !== 'string' || value.length === 0) {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}
