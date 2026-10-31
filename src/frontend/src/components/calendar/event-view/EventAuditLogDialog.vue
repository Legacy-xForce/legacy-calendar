<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import { useRouter } from 'vue-router';
import { format, startOfDay } from 'date-fns';
import type { Event } from '../../../types/Event';
import type { AuditLogActionType, AuditLogEntry, AuditLogUserRef } from '../../../types/AuditLog';
import API from '../../../services/API';
import UserAvatar from '../../UserAvatar.vue';
import { useMediaQuery, MOBILE_QUERY } from '../../../composables/useMediaQuery';
import { dayLabel, formatTimestamp } from '../../../utils/format';

type DiffKind = 'added' | 'removed' | 'updated';

type ActionMeta = {
    label: string;
    icon: string;
    colorClass: string;
};

type DiffItem = {
    fieldName: string;
    beforeText: string;
    afterText: string;
    beforeUser: AuditLogUserRef | null;
    afterUser: AuditLogUserRef | null;
    kind: DiffKind;
};

// Keep in sync with DIFF_USER_ID_FIELDS in backend/src/audit-log/audit-log.service.ts
const DIFF_USER_ID_FIELDS = new Set(['hostId', 'userId', 'participantId', 'passengerId', 'driverId', 'coHostId']);

const props = defineProps<{
    visible: boolean;
    event: Event | null;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
}>();

const router = useRouter();
const isMobile = useMediaQuery(MOBILE_QUERY);

const entries = ref<AuditLogEntry[]>([]);
const expandedEntryIds = ref<number[]>([]);
const loading = ref(false);
const errorMessage = ref<string | null>(null);
const requestKey = ref(0);
const displayedEntries = computed(() => [...entries.value].reverse());
const totalChangeCount = computed(() =>
    displayedEntries.value.reduce((total, entry) => total + getDiffItems(entry).length, 0)
);

const entryGroups = computed(() => {
    const groups: { key: string; label: string; entries: AuditLogEntry[] }[] = [];
    for (const entry of displayedEntries.value) {
        const day = startOfDay(new Date(entry.createdAt));
        const key = day.toISOString();
        let group = groups.at(-1);
        if (group?.key !== key) {
            group = { key, label: dayLabel(day, { includeYear: true }), entries: [] };
            groups.push(group);
        }
        group.entries.push(entry);
    }
    return groups;
});
const entryDiffItems = computed(
    () => new Map(displayedEntries.value.map((entry) => [entry.id, getDiffItems(entry)] as const))
);

const showDialog = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value)
});

const dialogPt = computed(() => ({
    root: {
        class: isMobile.value ? 'rounded-none! border-none!' : ''
    },
    header: {
        class: 'border-b border-line py-3!'
    },
    content: {
        class: `p-0! ${isMobile.value ? 'w-full' : 'h-[min(80vh,48rem)] w-[40rem]'}`
    }
}));

onBeforeUnmount(() => {
    requestKey.value += 1;
});

const loadAuditLog = async () => {
    if (!props.event?.id) {
        entries.value = [];
        errorMessage.value = null;
        return;
    }

    const nextRequestKey = requestKey.value + 1;
    requestKey.value = nextRequestKey;
    loading.value = true;
    errorMessage.value = null;

    try {
        const response = await API.getEventAuditLog(props.event.id);
        if (requestKey.value !== nextRequestKey) {
            return;
        }

        entries.value = response.data;
    } catch (error: any) {
        if (requestKey.value !== nextRequestKey) {
            return;
        }

        const status = error?.response?.status;
        if (status === 403) {
            await router.replace({ name: 'forbidden' });
            return;
        }

        if (status === 404) {
            await router.replace({ name: 'not-found' });
            return;
        }

        errorMessage.value = error?.response?.data?.message || error?.message || 'Failed to load activity';
        entries.value = [];
    } finally {
        if (requestKey.value === nextRequestKey) {
            loading.value = false;
        }
    }
};

const retry = () => {
    void loadAuditLog();
};

const isEntryExpanded = (entryId: number) => expandedEntryIds.value.includes(entryId);

const toggleEntry = (entryId: number) => {
    if (isEntryExpanded(entryId)) {
        expandedEntryIds.value = expandedEntryIds.value.filter((id) => id !== entryId);
        return;
    }

    expandedEntryIds.value = [...expandedEntryIds.value, entryId];
};

watch(
    () => [props.visible, props.event?.id],
    ([visible, eventId], previous) => {
        const [previousVisible, previousEventId] = previous ?? [];
        if (!visible) {
            errorMessage.value = null;
            expandedEntryIds.value = [];
            return;
        }

        if (eventId && (!previousVisible || previousEventId !== eventId)) {
            void loadAuditLog();
        }
    },
    { immediate: true }
);

const actionMeta: Record<AuditLogActionType, ActionMeta> = {
    EVENT_CREATED: { label: 'created the event', icon: 'pi pi-calendar-plus', colorClass: 'bg-surface-800 text-fg' },
    EVENT_UPDATED: { label: 'updated the event', icon: 'pi pi-pencil', colorClass: 'bg-sky-950 text-sky-300' },
    EVENT_DELETED: { label: 'deleted the event', icon: 'pi pi-trash', colorClass: 'bg-rose-950 text-rose-300' },
    PARTICIPANT_JOINED: {
        label: 'joined the event',
        icon: 'pi pi-user-plus',
        colorClass: 'bg-emerald-950 text-emerald-300'
    },
    PARTICIPANT_DECLINED: {
        label: 'declined the invitation',
        icon: 'pi pi-user-minus',
        colorClass: 'bg-rose-950 text-rose-300'
    },
    PARTICIPANT_REMOVED: {
        label: 'was removed from the event',
        icon: 'pi pi-user-minus',
        colorClass: 'bg-rose-950 text-rose-300'
    },
    PARTICIPANT_UPDATED: {
        label: 'updated their participation',
        icon: 'pi pi-sliders-h',
        colorClass: 'bg-sky-950 text-sky-300'
    },
    PARTICIPANT_INVITED: {
        label: 'invited a user',
        icon: 'pi pi-envelope',
        colorClass: 'bg-emerald-950 text-emerald-300'
    },
    CO_HOST_ADDED: {
        label: 'added a co-host',
        icon: 'pi pi-user-plus',
        colorClass: 'bg-emerald-950 text-emerald-300'
    },
    CO_HOST_REMOVED: {
        label: 'removed a co-host',
        icon: 'pi pi-user-minus',
        colorClass: 'bg-rose-950 text-rose-300'
    },
    RIDE_ASSIGNED: { label: 'assigned a ride', icon: 'pi pi-car', colorClass: 'bg-sky-950 text-sky-300' },
    RIDE_UNASSIGNED: {
        label: 'unassigned a ride',
        icon: 'pi pi-times-circle',
        colorClass: 'bg-sky-950 text-sky-300'
    }
};

const diffDotClass: Record<DiffKind, string> = {
    added: 'bg-emerald-400',
    removed: 'bg-rose-400',
    updated: 'bg-sky-400'
};

const fieldLabels: Record<string, string> = {
    title: 'Title',
    color: 'Color',
    description: 'Description',
    location: 'Location',
    startTime: 'Start time',
    endTime: 'End time',
    hostId: 'Host',
    isOpen: 'Visibility',
    hasAlcohol: 'Alcohol',
    hasFood: 'Food',
    hasSleep: 'Sleep',
    hasWeed: 'Weed',
    alcoholPrice: 'Alcohol price',
    beerPrice: 'Beer price',
    foodPrice: 'Food price',
    hasBeer: 'Beer',
    features: 'Features',
    sleepPrice: 'Sleep price',
    weedPrice: 'Weed price',
    isPrivate: 'Privacy',
    participationDeadline: 'Participation deadline',
    userId: 'User',
    status: 'Status',
    joinedAt: 'Joined at',
    wantsAlcohol: 'Wants alcohol',
    wantsBeer: 'Wants beer',
    wantsFood: 'Wants food',
    wantsSleep: 'Wants sleep',
    wantsWeed: 'Wants weed',
    transportMode: 'Transport mode',
    vehicleSeats: 'Vehicle seats',
    passengerId: 'Passenger',
    driverId: 'Driver',
    coHostId: 'Co-host',
    hasPaid: 'Paid',
    username: 'Name'
};

const DATE_FIELDS = new Set(['startTime', 'endTime', 'joinedAt', 'participationDeadline']);

const formatTime = (value: string) => format(new Date(value), 'HH:mm');

const formatDiffValue = (value: unknown, fieldName: string) => {
    if (value === null || value === undefined) {
        return '(none)';
    }

    if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
    }

    if (typeof value === 'string') {
        if (DATE_FIELDS.has(fieldName)) {
            return formatTimestamp(value);
        }

        if (/^[A-Z][A-Z0-9_]*$/.test(value)) {
            const words = value.toLowerCase().replaceAll('_', ' ');
            return words.charAt(0).toUpperCase() + words.slice(1);
        }

        return value;
    }

    if (typeof value === 'number') {
        return String(value);
    }

    return JSON.stringify(value);
};

const hasField = (record: Record<string, unknown>, field: string) =>
    Object.prototype.hasOwnProperty.call(record, field);

const getEntryActionLabel = (entry: AuditLogEntry) => {
    const participantId = entry.payloadDiff?.after?.participantId ?? entry.payloadDiff?.before?.participantId;
    const participant = typeof participantId === 'number' ? entry.resolvedUsers?.[participantId] : null;
    const hasPaymentChange = hasField(entry.payloadDiff?.after ?? {}, 'hasPaid');

    if (entry.actionType === 'PARTICIPANT_UPDATED' && hasPaymentChange && participant) {
        const status = entry.payloadDiff.after.hasPaid === true ? 'paid' : 'unpaid';
        const who = participant.id === entry.actorId ? 'themselves' : participant.username;
        return `marked ${who} as ${status}`;
    }

    return actionMeta[entry.actionType].label;
};

const hasDiffBlock = (entry: AuditLogEntry) => {
    const before = entry.payloadDiff?.before ?? {};
    const after = entry.payloadDiff?.after ?? {};
    return Object.keys(before).length > 0 || Object.keys(after).length > 0;
};

const getFieldLabel = (fieldName: string) => {
    return (
        fieldLabels[fieldName] ??
        fieldName
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .toLowerCase()
            .replace(/^./, (char) => char.toUpperCase())
    );
};

const getDiffItems = (entry: AuditLogEntry): DiffItem[] => {
    const before = entry.payloadDiff?.before ?? {};
    const after = entry.payloadDiff?.after ?? {};
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
        (fieldName) => fieldName !== 'participantId'
    );

    return keys.map((fieldName) => {
        const beforeExists = hasField(before, fieldName);
        const afterExists = hasField(after, fieldName);
        const beforeValue = beforeExists ? before[fieldName] : undefined;
        const afterValue = afterExists ? after[fieldName] : undefined;
        const beforeIsEmpty = Object.keys(before).length === 0;
        const afterIsEmpty = Object.keys(after).length === 0;

        let kind: DiffKind = 'updated';
        if (!beforeExists || beforeIsEmpty) {
            kind = 'added';
        } else if (!afterExists || afterIsEmpty) {
            kind = 'removed';
        }

        const resolveUser = (value: unknown): AuditLogUserRef | null => {
            if (!DIFF_USER_ID_FIELDS.has(fieldName) || typeof value !== 'number') {
                return null;
            }
            return entry.resolvedUsers?.[value] ?? null;
        };

        return {
            fieldName,
            beforeText: kind === 'added' ? '(none)' : formatDiffValue(beforeValue, fieldName),
            afterText: kind === 'removed' ? '(removed)' : formatDiffValue(afterValue, fieldName),
            beforeUser: kind === 'added' ? null : resolveUser(beforeValue),
            afterUser: kind === 'removed' ? null : resolveUser(afterValue),
            kind
        };
    });
};

const getEntryDiffItems = (entry: AuditLogEntry) => entryDiffItems.value.get(entry.id) ?? [];

const getActorLabel = (entry: AuditLogEntry) => entry.impersonatorUsername ?? entry.actorUsername;

const getActorAvatarProps = (entry: AuditLogEntry) =>
    entry.impersonatorUsername
        ? { username: entry.impersonatorUsername, profilePictureUrl: entry.impersonatorProfilePictureUrl }
        : { username: entry.actorUsername, profilePictureUrl: entry.actorProfilePictureUrl };
</script>

<template>
    <Dialog
        v-model:visible="showDialog"
        modal
        dismissableMask
        :class="isMobile ? 'p-dialog-maximized' : ''"
        :header="event ? `Activity · ${event.title}` : 'Activity'"
        :pt="dialogPt"
        :draggable="false"
    >
        <template #header>
            <div class="min-w-0">
                <h2 class="text-title m-0 truncate">Activity</h2>
                <p class="text-meta text-muted tabular m-0 truncate">
                    <template v-if="!loading && !errorMessage && displayedEntries.length">
                        {{ displayedEntries.length }} {{ displayedEntries.length === 1 ? 'update' : 'updates' }} ·
                        {{ totalChangeCount }} {{ totalChangeCount === 1 ? 'change' : 'changes' }}
                    </template>
                    <template v-else>{{ event?.title }}</template>
                </p>
            </div>
        </template>

        <div v-if="loading" class="flex flex-col gap-3 p-4" aria-busy="true">
            <Skeleton width="5rem" height="1rem" />
            <Skeleton height="4.25rem" border-radius="1rem" />
            <Skeleton height="4.25rem" border-radius="1rem" />
            <Skeleton height="4.25rem" border-radius="1rem" />
        </div>

        <div v-else-if="errorMessage" class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <i class="pi pi-history text-subtle text-2xl"></i>
            <h3 class="text-headline m-0">Couldn't load activity</h3>
            <p class="text-body text-muted m-0 max-w-xs">{{ errorMessage }}</p>
            <Button label="Try again" icon="pi pi-refresh" severity="secondary" class="mt-2" @click="retry" />
        </div>

        <div
            v-else-if="entries.length === 0"
            class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        >
            <i class="pi pi-history text-subtle text-2xl"></i>
            <h3 class="text-headline m-0">No activity yet</h3>
            <p class="text-body text-muted m-0 max-w-xs">Edits, replies and rides for this event show up here.</p>
        </div>

        <div v-else class="flex h-full flex-col gap-6 overflow-y-auto p-4">
            <section v-for="group in entryGroups" :key="group.key" class="flex flex-col gap-2">
                <h3 class="text-body text-fg m-0 font-semibold">{{ group.label }}</h3>
                <ul
                    class="border-line bg-raised divide-line m-0 list-none divide-y overflow-hidden rounded-2xl border p-0"
                >
                    <li v-for="entry in group.entries" :key="entry.id">
                        <component
                            :is="hasDiffBlock(entry) ? 'button' : 'div'"
                            :type="hasDiffBlock(entry) ? 'button' : undefined"
                            :aria-expanded="hasDiffBlock(entry) ? isEntryExpanded(entry.id) : undefined"
                            class="flex w-full items-center gap-3 px-4 py-3 text-left"
                            :class="hasDiffBlock(entry) ? 'hover:bg-surface-900 cursor-pointer transition-colors' : ''"
                            @click="hasDiffBlock(entry) && toggleEntry(entry.id)"
                        >
                            <span class="relative shrink-0">
                                <UserAvatar v-bind="getActorAvatarProps(entry)" class="text-body! size-10!" />
                                <span
                                    class="ring-raised absolute -right-1 -bottom-1 flex size-[1.125rem] items-center justify-center rounded-full ring-2"
                                    :class="actionMeta[entry.actionType].colorClass"
                                    aria-hidden="true"
                                >
                                    <i :class="actionMeta[entry.actionType].icon" class="text-[0.5625rem]"></i>
                                </span>
                            </span>

                            <span class="min-w-0 flex-1">
                                <span class="text-body text-muted block">
                                    <span class="text-fg font-semibold">{{ getActorLabel(entry) }}</span>
                                    <template v-if="entry.impersonatorUsername"> as {{ entry.actorUsername }}</template>
                                    {{ ' ' }}{{ getEntryActionLabel(entry) }}
                                </span>
                                <span
                                    v-if="hasDiffBlock(entry)"
                                    class="text-meta text-subtle mt-0.5 flex items-center gap-1"
                                >
                                    {{ getEntryDiffItems(entry).length }}
                                    {{ getEntryDiffItems(entry).length === 1 ? 'change' : 'changes' }}
                                    <i
                                        class="pi pi-chevron-down text-[0.625rem] transition-transform duration-200"
                                        :class="isEntryExpanded(entry.id) ? 'rotate-180' : ''"
                                    ></i>
                                </span>
                            </span>

                            <time
                                :datetime="entry.createdAt"
                                :title="formatTimestamp(entry.createdAt)"
                                class="text-meta text-subtle tabular shrink-0 self-start pt-0.5"
                            >
                                {{ formatTime(entry.createdAt) }}
                            </time>
                        </component>

                        <dl
                            v-if="hasDiffBlock(entry) && isEntryExpanded(entry.id)"
                            class="bg-surface-900 animate-fade-in text-meta mx-4 mt-0 mb-3 ml-[4.25rem] flex flex-col gap-2 rounded-xl p-3"
                        >
                            <div
                                v-for="item in getEntryDiffItems(entry)"
                                :key="item.fieldName"
                                class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1"
                            >
                                <span class="size-1.5 shrink-0 rounded-full" :class="diffDotClass[item.kind]"></span>
                                <dt class="text-muted">{{ getFieldLabel(item.fieldName) }}</dt>
                                <dd class="m-0 flex min-w-0 flex-wrap items-center gap-1.5">
                                    <template v-if="item.kind !== 'added'">
                                        <span v-if="item.beforeUser" class="flex items-center gap-1">
                                            <UserAvatar
                                                :username="item.beforeUser.username"
                                                :profile-picture-url="item.beforeUser.profilePictureUrl"
                                                class="size-4! text-[0.5625rem]!"
                                            />
                                            <span class="text-subtle line-through">{{ item.beforeUser.username }}</span>
                                        </span>
                                        <span v-else class="text-subtle break-all line-through">{{
                                            item.beforeText
                                        }}</span>
                                    </template>
                                    <i
                                        v-if="item.kind === 'updated'"
                                        class="pi pi-arrow-right text-subtle text-[0.625rem]"
                                        aria-label="changed to"
                                    ></i>
                                    <template v-if="item.kind !== 'removed'">
                                        <span v-if="item.afterUser" class="flex items-center gap-1">
                                            <UserAvatar
                                                :username="item.afterUser.username"
                                                :profile-picture-url="item.afterUser.profilePictureUrl"
                                                class="size-4! text-[0.5625rem]!"
                                            />
                                            <span class="text-fg">{{ item.afterUser.username }}</span>
                                        </span>
                                        <span v-else class="text-fg break-all">{{ item.afterText }}</span>
                                    </template>
                                </dd>
                            </div>
                        </dl>
                    </li>
                </ul>
            </section>
        </div>
    </Dialog>
</template>
