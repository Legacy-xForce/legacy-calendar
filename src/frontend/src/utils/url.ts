/** Whether a location string is an absolute http(s) URL (i.e. an online meeting). */
export function isOnlineLocation(location?: string | null): boolean {
    return /^https?:\/\//i.test(location ?? '');
}

/** Stored links may be bare (`paypal.me/foo`); make them absolute for `href`. */
export function toAbsoluteUrl(value: string): string {
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** Readable label for a link, without protocol or leading `www.`. */
export function formatDisplayUrl(value: string): string {
    return value.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
}
