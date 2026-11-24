import { expect, mock, test } from 'bun:test';
import { nextTick } from 'vue';
import { startOfDay } from 'date-fns';

const spanningEvent = {
    id: 42,
    title: 'Overnight',
    startTime: '2026-08-28T23:30:00.000Z',
    endTime: '2026-08-29T01:30:00.000Z'
};

await mock.module('../src/stores/events', () => ({
    useEventsStore: () => ({
        events: [spanningEvent],
        prefetchCalendarEvents: () => Promise.resolve(),
        fetchCalendarEvents: () => Promise.resolve()
    })
}));

const { useCalendar } = await import('../src/composables/useCalendar.js');

test('an event spanning midnight appears on both days', async () => {
    const calendar = useCalendar();
    calendar.currentDate.value = new Date('2026-08-15T12:00:00.000Z');
    await nextTick();

    const firstDay = startOfDay(new Date('2026-08-28T12:00:00.000Z')).getTime();
    const nextDay = startOfDay(new Date('2026-08-29T12:00:00.000Z')).getTime();
    const eventsOn = (key: number) =>
        calendar.days.value.find((day) => day.date.getTime() === key)?.events ?? [];

    expect(eventsOn(firstDay).some((event) => event.id === 42)).toBe(true);
    expect(eventsOn(nextDay).some((event) => event.id === 42)).toBe(true);
});
