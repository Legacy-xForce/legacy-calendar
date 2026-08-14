<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useRouter } from 'vue-router';
import type { Event } from '../../../types/Event';
import type { AuditLogActionType, AuditLogEntry, AuditLogUserRef } from '../../../types/AuditLog';
import API from '../../../services/API';
import UserAvatar from '../../UserAvatar.vue';

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

const DIFF_USER_ID_FIELDS = new Set(['hostId', 'userId', 'passengerId', 'driverId']);

const props = defineProps<{
    visible: boolean;
    event: Event | null;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
}>();

const router = useRouter();
const isMobile = ref(false);
let mobileMediaQuery: MediaQueryList | null = null;

const entries = ref<AuditLogEntry[]>([]);
const expandedEntryIds = ref<number[]>([]);
const loading = ref(false);
const errorMessage = ref<string | null>(null);
const requestKey = ref(0);
const displayedEntries = computed(() => [...entries.value].reverse());
const totalChangeCount = computed(() =>
    displayedEntries.value.reduce((total, entry) => total + getDiffItems(entry).length, 0)
);
const entryDiffItems = computed(
    () => new Map(displayedEntries.value.map((entry) => [entry.id, getDiffItems(entry)] as const))
);

const showDialog = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value)
});

const dialogPt = computed(() => ({
    root: {
        class: isMobile.value ? 'rounded-none border-none!' : 'rounded-2xl border border-zinc-800 shadow-2xl'
    },
    pcMaximizeButton: {
        root: {
            class: isMobile.value ? 'hidden!' : ''
        }
    },
    header: {
        class: 'border-b border-zinc-800'
    },
    content: {
        class: `h-[85vh] p-0! ${isMobile.value ? 'w-full' : 'w-[640px]'}`
    }
}));

const syncIsMobile = (source?: MediaQueryList | MediaQueryListEvent) => {
    isMobile.value = source?.matches ?? mobileMediaQuery?.matches ?? false;
};

onMounted(() => {
    mobileMediaQuery = window.matchMedia('(max-width: 767px)');
    syncIsMobile(mobileMediaQuery);
    mobileMediaQuery.addEventListener('change', syncIsMobile);
});

onBeforeUnmount(() => {
    mobileMediaQuery?.removeEventListener('change', syncIsMobile);
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

        errorMessage.value = error?.response?.data?.message || error?.message || 'Failed to load audit log';
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
    EVENT_CREATED: { label: 'created the event', icon: 'pi pi-calendar-plus', colorClass: 'bg-zinc-800 text-zinc-300' },
    EVENT_UPDATED: { label: 'updated the event', icon: 'pi pi-pencil', colorClass: 'bg-sky-500/10 text-sky-400' },
    EVENT_DELETED: { label: 'deleted the event', icon: 'pi pi-trash', colorClass: 'bg-rose-500/10 text-rose-400' },
    PARTICIPANT_JOINED: {
        label: 'joined the event',
        icon: 'pi pi-user-plus',
        colorClass: 'bg-emerald-500/10 text-emerald-400'
    },
    PARTICIPANT_DECLINED: {
        label: 'declined the invitation',
        icon: 'pi pi-user-minus',
        colorClass: 'bg-rose-500/10 text-rose-400'
    },
    PARTICIPANT_REMOVED: {
        label: 'was removed from the event',
        icon: 'pi pi-user-minus',
        colorClass: 'bg-rose-500/10 text-rose-400'
    },
    PARTICIPANT_UPDATED: {
        label: 'updated their participation',
        icon: 'pi pi-sliders-h',
        colorClass: 'bg-sky-500/10 text-sky-400'
    },
    PARTICIPANT_INVITED: {
        label: 'invited a user',
        icon: 'pi pi-envelope',
        colorClass: 'bg-emerald-500/10 text-emerald-400'
    },
    RIDE_ASSIGNED: { label: 'assigned a ride', icon: 'pi pi-car', colorClass: 'bg-sky-500/10 text-sky-400' },
    RIDE_UNASSIGNED: {
        label: 'unassigned a ride',
        icon: 'pi pi-times-circle',
        colorClass: 'bg-sky-500/10 text-sky-400'
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
    username: 'Username'
};

const formatTimestamp = (value: string) => {
    const date = new Date(value);
    const locale = navigator.language || 'en-GB';
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parts = new Intl.DateTimeFormat(locale, {
        timeZone,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date);

    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${lookup.day} ${lookup.month} ${lookup.year}, ${lookup.hour}:${lookup.minute}`;
};

const formatDiffValue = (value: unknown) => {
    if (value === null || value === undefined) {
        return '(none)';
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return JSON.stringify(value);
};

const hasField = (record: Record<string, unknown>, field: string) =>
    Object.prototype.hasOwnProperty.call(record, field);

const hasDiffBlock = (entry: AuditLogEntry) => {
    const before = entry.payloadDiff?.before ?? {};
    const after = entry.payloadDiff?.after ?? {};
    return Object.keys(before).length > 0 || Object.keys(after).length > 0;
};

const getFieldLabel = (fieldName: string) => {
    return (
        fieldLabels[fieldName] ??
        fieldName.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase())
    );
};

const getDiffItems = (entry: AuditLogEntry): DiffItem[] => {
    const before = entry.payloadDiff?.before ?? {};
    const after = entry.payloadDiff?.after ?? {};
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];

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
            beforeText: kind === 'added' ? '(none)' : formatDiffValue(beforeValue),
            afterText: kind === 'removed' ? '(removed)' : formatDiffValue(afterValue),
            beforeUser: kind === 'added' ? null : resolveUser(beforeValue),
            afterUser: kind === 'removed' ? null : resolveUser(afterValue),
            kind
        };
    });
};

const getEntryDiffItems = (entry: AuditLogEntry) => entryDiffItems.value.get(entry.id) ?? [];

const getActorLabel = (entry: AuditLogEntry) =>
    entry.impersonatorUsername ? `${entry.impersonatorUsername} (as ${entry.actorUsername})` : entry.actorUsername;

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
        :header="event ? `Audit Log · ${event.title}` : 'Audit Log'"
        :pt="dialogPt"
        :draggable="false"
    >
        <template #header>
            <div class="min-w-0">
                <h2 class="truncate text-lg font-bold">Audit log</h2>
                <p class="m-0 truncate text-xs text-zinc-500">
                    <template v-if="!loading && !errorMessage">
                        {{ displayedEntries.length }} event{{ displayedEntries.length === 1 ? '' : 's' }} ·
                        {{ totalChangeCount }} change{{ totalChangeCount === 1 ? '' : 's' }}
                    </template>
                    <template v-else>{{ event?.title }}</template>
                </p>
            </div>
        </template>

        <div v-if="loading" class="flex h-full items-center justify-center">
            <i class="pi pi-spin pi-spinner text-2xl text-zinc-500"></i>
        </div>

        <div v-else-if="errorMessage" class="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <div class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10">
                <i class="pi pi-exclamation-triangle text-2xl text-rose-400"></i>
            </div>
            <div class="max-w-sm space-y-1">
                <h3 class="text-lg font-bold text-white">Could not load audit log</h3>
                <p class="text-sm text-zinc-400">{{ errorMessage }}</p>
            </div>
            <Button label="Retry" icon="pi pi-refresh" severity="secondary" text @click="retry" />
        </div>

        <div
            v-else-if="entries.length === 0"
            class="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
        >
            <div class="flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/10">
                <i class="pi pi-clock text-2xl text-sky-400"></i>
            </div>
            <div class="max-w-sm space-y-1">
                <h3 class="text-lg font-bold text-white">No activity yet</h3>
                <p class="text-sm text-zinc-400">Changes to this event will show up here.</p>
            </div>
        </div>

        <div v-else class="h-full overflow-y-auto p-4">
            <div class="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
                <div v-for="entry in displayedEntries" :key="entry.id" class="p-3.5">
                    <div class="flex items-start gap-3">
                        <div
                            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                            :class="actionMeta[entry.actionType].colorClass"
                        >
                            <i :class="`${actionMeta[entry.actionType].icon} text-sm`"></i>
                        </div>

                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                                <div class="flex min-w-0 items-center gap-2">
                                    <UserAvatar v-bind="getActorAvatarProps(entry)" size="normal" />
                                    <p class="m-0 min-w-0 text-sm text-zinc-200">
                                        <span class="font-semibold text-white">{{ getActorLabel(entry) }}</span>
                                        {{ ' ' }}{{ actionMeta[entry.actionType].label }}
                                    </p>
                                </div>
                                <span class="shrink-0 text-xs text-zinc-500">{{
                                    formatTimestamp(entry.createdAt)
                                }}</span>
                            </div>

                            <button
                                v-if="hasDiffBlock(entry)"
                                type="button"
                                class="mt-1.5 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
                                @click="toggleEntry(entry.id)"
                            >
                                <i
                                    :class="isEntryExpanded(entry.id) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                                    class="text-[10px]"
                                ></i>
                                {{ getEntryDiffItems(entry).length }} change{{
                                    getEntryDiffItems(entry).length === 1 ? '' : 's'
                                }}
                            </button>

                            <div
                                v-if="hasDiffBlock(entry) && isEntryExpanded(entry.id)"
                                class="mt-2 space-y-1.5 rounded-lg bg-zinc-900/60 p-2.5 text-sm"
                            >
                                <div
                                    v-for="item in getEntryDiffItems(entry)"
                                    :key="item.fieldName"
                                    class="flex flex-wrap items-center gap-1.5"
                                >
                                    <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="diffDotClass[item.kind]"></span>
                                    <span class="text-zinc-400">{{ getFieldLabel(item.fieldName) }}:</span>
                                    <template v-if="item.kind === 'added'">
                                        <span v-if="item.afterUser" class="flex items-center gap-1">
                                            <UserAvatar
                                                :username="item.afterUser.username"
                                                :profile-picture-url="item.afterUser.profilePictureUrl"
                                                class="h-4! w-4! text-[10px]!"
                                            />
                                            <span class="text-zinc-100">{{ item.afterUser.username }}</span>
                                        </span>
                                        <span v-else class="text-zinc-100">{{ item.afterText }}</span>
                                    </template>
                                    <template v-else-if="item.kind === 'removed'">
                                        <span v-if="item.beforeUser" class="flex items-center gap-1">
                                            <UserAvatar
                                                :username="item.beforeUser.username"
                                                :profile-picture-url="item.beforeUser.profilePictureUrl"
                                                class="h-4! w-4! text-[10px]!"
                                            />
                                            <span class="text-zinc-500 line-through">{{ item.beforeUser.username }}</span>
                                        </span>
                                        <span v-else class="text-zinc-500 line-through">{{ item.beforeText }}</span>
                                    </template>
                                    <template v-else>
                                        <span v-if="item.beforeUser" class="flex items-center gap-1">
                                            <UserAvatar
                                                :username="item.beforeUser.username"
                                                :profile-picture-url="item.beforeUser.profilePictureUrl"
                                                class="h-4! w-4! text-[10px]!"
                                            />
                                            <span class="text-zinc-500 line-through">{{ item.beforeUser.username }}</span>
                                        </span>
                                        <span v-else class="text-zinc-500 line-through">{{ item.beforeText }}</span>
                                        <i class="pi pi-arrow-right text-[10px] text-zinc-600"></i>
                                        <span v-if="item.afterUser" class="flex items-center gap-1">
                                            <UserAvatar
                                                :username="item.afterUser.username"
                                                :profile-picture-url="item.afterUser.profilePictureUrl"
                                                class="h-4! w-4! text-[10px]!"
                                            />
                                            <span class="text-zinc-100">{{ item.afterUser.username }}</span>
                                        </span>
                                        <span v-else class="text-zinc-100">{{ item.afterText }}</span>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Dialog>
</template>
