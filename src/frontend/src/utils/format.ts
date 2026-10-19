import { differenceInCalendarDays, format, isSameYear, isToday, isTomorrow, isYesterday } from 'date-fns';

const currencyFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
});

export function formatCurrency(value: number | undefined | null): string {
    if (value === undefined || value === null) return '';
    return currencyFormatter.format(value);
}

/**
 * Human label for a day heading. Future labels can say "Tomorrow", past labels
 * "Yesterday"; `long` keeps the full weekday + date used by chat for older days,
 * and `includeYear` appends the year for dates outside the current year.
 */
export function dayLabel(date: Date, options: { long?: boolean; includeYear?: boolean } = {}): string {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';

    const withinWeek = Math.abs(differenceInCalendarDays(date, new Date())) < 7;
    if (withinWeek && !options.long) return format(date, 'EEEE');

    if (options.long) return format(date, 'EEEE, d MMMM');
    if (options.includeYear && !isSameYear(date, new Date())) return format(date, 'd MMMM yyyy');
    return format(date, 'EEE d MMMM');
}

export function formatTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return format(date, isSameYear(date, new Date()) ? 'EEE d MMM · HH:mm' : 'd MMM yyyy · HH:mm');
}
