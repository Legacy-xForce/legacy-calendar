export interface CalendarFeedToken {
    id: number;
    tokenHint: string;
    createdAt: string;
}

/** The full URL is assembled from the token on the client and shown only once. */
export interface CreatedCalendarFeedToken extends CalendarFeedToken {
    token: string;
}
