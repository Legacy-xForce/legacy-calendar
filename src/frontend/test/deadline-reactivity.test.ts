import { expect, mock, test } from 'bun:test';
import { nextTick, ref } from 'vue';

const now = ref(new Date('2026-01-01T00:00:00.000Z'));

await mock.module('../src/composables/useNow', () => ({ useNow: () => ({ now }) }));
await mock.module('pinia', () => ({ storeToRefs: (store: unknown) => store }));
await mock.module('../src/stores/session', () => ({
    useSessionStore: () => ({
        currentUser: { id: 1, username: 'tester', isAdmin: false },
        getAccessToken: () => Promise.resolve('t')
    })
}));
await mock.module('../src/stores/users', () => ({ useUsersStore: () => ({ users: ref([]) }) }));
await mock.module('../src/services/API', () => ({
    default: { getChatHistory: () => Promise.resolve({ data: { messages: [] } }) }
}));
await mock.module('../src/services/logger', () => ({
    createLogger: () => ({ info: () => {}, debug: () => {}, trace: () => {}, warn: () => {}, error: () => {} })
}));

const { useEventView } = await import('../src/composables/useEventView.js');

test('deadline state updates when the shared clock advances', async () => {
    const event = ref({
        id: 1,
        hostId: 1,
        title: 'Deadline event',
        participants: [],
        coHosts: [],
        features: [],
        rideAssignments: [],
        participationDeadline: '2026-02-01T00:00:00.000Z',
        endTime: null,
        isOpen: true,
        isPrivate: false
    });
    const view = useEventView(event as never, { guestMode: true });

    expect(view.isDeadlinePassed.value).toBe(false);
    now.value = new Date('2026-03-01T00:00:00.000Z');
    await nextTick();

    expect(view.isDeadlinePassed.value).toBe(true);
});
