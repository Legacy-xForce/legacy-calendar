<script setup lang="ts">
import { computed, ref, watch, onMounted, defineAsyncComponent } from 'vue';
import type { Event } from '../../../types/Event';
import { format, formatDistanceToNowStrict, isSameDay, parseISO } from 'date-fns';
import { injectEventView } from '../../../composables/useEventView';
import api from '../../../services/API';
import type { ChatMessage } from '../../../types/Chat';
import { useRoute, useRouter } from 'vue-router';
import UserAvatar from '../../UserAvatar.vue';
import LinkifiedText from '../../LinkifiedText.vue';
import UpcomingEventWeatherBadge from '../../UpcomingEventWeatherBadge.vue';
import { useEventWeather } from '../../../composables/useEventWeather';
import { useGeocode } from '../../../composables/useGeocode';
import { useNow } from '../../../composables/useNow';

const WeatherDialog = defineAsyncComponent(() => import('./weather/WeatherDialog.vue'));
const EventMapPreview = defineAsyncComponent(() => import('./EventMapPreview.vue'));
const MapDialog = defineAsyncComponent(() => import('./MapDialog.vue'));

const props = defineProps<{
    event: Event;
}>();

const emit = defineEmits<{
    (e: 'open-chat'): void;
}>();

const route = useRoute();
const router = useRouter();
const { now } = useNow();
const { getWeatherForEvent } = useEventWeather();
const { getCoordsForEvent, getOrResolveCoords } = useGeocode();
const { openNavigation, canAccessChat, isDeadlinePassed } = injectEventView();

const weather = computed(() => getWeatherForEvent(props.event.id));
const coords = computed(() => getCoordsForEvent(props.event.id));
const weatherDetailVisible = ref(false);

const currentSection = computed(() =>
    route.name === 'upcoming' || route.path.startsWith('/upcoming/') ? 'upcoming' : 'calendar'
);
const eventPath = computed(() => `${currentSection.value === 'upcoming' ? '/upcoming' : '/event'}/${props.event.id}`);
const mapDialogVisible = computed({
    get: () => route.path.endsWith('/map'),
    set: (visible: boolean) => {
        if (visible) {
            void router.push({ path: `${eventPath.value}/map` });
        } else {
            void router.replace({ path: eventPath.value });
        }
    }
});

const start = computed(() => parseISO(props.event.startTime));
const end = computed(() => (props.event.endTime ? parseISO(props.event.endTime) : null));
const isOnline = computed(() => /^https?:\/\//i.test(props.event.location ?? ''));

const whenPrimary = computed(() => format(start.value, 'EEEE d MMMM'));
const whenSecondary = computed(() => {
    const startTime = format(start.value, 'HH:mm');
    if (!end.value) return startTime;
    if (isSameDay(start.value, end.value)) return `${startTime} – ${format(end.value, 'HH:mm')}`;
    return `${startTime} → ${format(end.value, 'EEE d MMM, HH:mm')}`;
});

const deadline = computed(() =>
    props.event.participationDeadline ? parseISO(props.event.participationDeadline) : null
);
const deadlineSecondary = computed(() => {
    if (!deadline.value) return '';
    if (isDeadlinePassed.value) return 'Replies are closed';
    return `Closes in ${formatDistanceToNowStrict(deadline.value)}`;
});
// Re-evaluate the countdown every tick
const deadlineLabel = computed(() => (now.value && deadline.value ? deadlineSecondary.value : ''));

const recentMessages = ref<ChatMessage[]>([]);

const loadRecentMessages = async () => {
    if (!props.event?.id || !canAccessChat.value) {
        recentMessages.value = [];
        return;
    }

    try {
        const response = await api.getChatHistory(props.event.id, undefined, 3);
        recentMessages.value = [...response.data.messages].reverse();
    } catch {
        recentMessages.value = [];
    }
};

onMounted(() => {
    void getOrResolveCoords(props.event);
});

watch(
    () => [props.event?.id, canAccessChat.value],
    () => {
        void loadRecentMessages();
        if (props.event) {
            void getOrResolveCoords(props.event);
        }
    },
    { immediate: true }
);

const openLocation = () => {
    if (isOnline.value) window.open(props.event.location!, '_blank');
    else openNavigation(props.event.location);
};
</script>

<template>
    <div class="flex flex-col gap-6">
        <!-- Key facts -->
        <div class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border">
            <div class="flex items-center gap-3.5 px-4 py-3.5">
                <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                    <i class="pi pi-calendar text-sm"></i>
                </span>
                <div class="min-w-0 flex-1">
                    <p class="text-body text-fg m-0 font-medium">{{ whenPrimary }}</p>
                    <p class="text-meta text-muted tabular m-0">{{ whenSecondary }}</p>
                </div>
            </div>

            <div
                v-if="event.location"
                role="button"
                tabindex="0"
                class="hover:bg-surface-950 flex w-full cursor-pointer items-center gap-3.5 px-4 py-3.5 text-left transition-colors"
                @click="openLocation"
                @keydown.enter.prevent="openLocation"
            >
                <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                    <i :class="isOnline ? 'pi pi-video' : 'pi pi-map-marker'" class="text-sm"></i>
                </span>
                <div class="min-w-0 flex-1">
                    <p class="text-body text-fg m-0 line-clamp-2 font-medium break-words">
                        {{ isOnline ? 'Online meeting' : event.location }}
                    </p>
                    <p class="text-meta text-muted m-0">{{ isOnline ? 'Open link' : 'Get directions' }}</p>
                </div>
                <UpcomingEventWeatherBadge :event="event" @open-detail="weatherDetailVisible = true" />
                <i class="pi pi-chevron-right text-subtle text-xs"></i>
            </div>

            <div v-if="deadline" class="flex items-center gap-3.5 px-4 py-3.5">
                <span
                    class="flex size-9 shrink-0 items-center justify-center rounded-xl"
                    :class="isDeadlinePassed ? 'bg-amber-300/12 text-amber-200' : 'bg-surface-900 text-muted'"
                >
                    <i class="pi pi-clock text-sm"></i>
                </span>
                <div class="min-w-0 flex-1">
                    <p class="text-body text-fg m-0 font-medium">Reply by {{ format(deadline, 'EEE d MMM, HH:mm') }}</p>
                    <p class="text-meta m-0" :class="isDeadlinePassed ? 'text-amber-200' : 'text-muted'">
                        {{ deadlineLabel }}
                    </p>
                </div>
            </div>
        </div>

        <EventMapPreview
            v-if="coords && !isOnline"
            :location="event.location"
            :lat="coords.lat"
            :lon="coords.lon"
            @open-map="mapDialogVisible = true"
        />

        <section v-if="event.description" class="flex flex-col gap-2">
            <h3 class="eyebrow m-0">About</h3>
            <p class="text-body text-surface-200 m-0 max-w-prose whitespace-pre-wrap">
                <LinkifiedText :text="event.description" />
            </p>
        </section>

        <section v-if="canAccessChat" class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
                <h3 class="eyebrow m-0">Chat</h3>
                <button
                    type="button"
                    class="text-meta text-accent font-medium hover:underline"
                    @click="emit('open-chat')"
                >
                    Open chat
                </button>
            </div>
            <button
                v-if="recentMessages.length"
                type="button"
                class="border-line bg-raised hover:bg-surface-950 divide-line flex flex-col divide-y overflow-hidden rounded-2xl border text-left transition-colors"
                @click="emit('open-chat')"
            >
                <span v-for="msg in recentMessages" :key="msg.id" class="flex items-center gap-3 px-4 py-3">
                    <UserAvatar :username="msg.authorUsername" class="size-7! text-[0.6875rem]!" />
                    <span class="min-w-0 flex-1">
                        <span class="flex items-baseline justify-between gap-2">
                            <span class="text-meta text-fg truncate font-semibold">{{ msg.authorUsername }}</span>
                            <span class="text-subtle shrink-0 text-[0.75rem]">
                                {{ formatDistanceToNowStrict(parseISO(String(msg.createdAt)), { addSuffix: true }) }}
                            </span>
                        </span>
                        <span class="text-meta text-muted block truncate">
                            {{
                                msg.text ||
                                `Sent ${msg.mediaType === 'image' ? 'a photo' : `a ${msg.mediaType || 'file'}`}`
                            }}
                        </span>
                    </span>
                </span>
            </button>
            <button
                v-else
                type="button"
                class="border-line text-meta text-muted hover:text-fg rounded-2xl border border-dashed px-4 py-4 text-center transition-colors"
                @click="emit('open-chat')"
            >
                No messages yet. Say hi to the group.
            </button>
        </section>

        <WeatherDialog v-model:visible="weatherDetailVisible" :event="event" :weather="weather" />
        <MapDialog
            v-model:visible="mapDialogVisible"
            :lat="coords?.lat ?? 0"
            :lon="coords?.lon ?? 0"
            :location="event.location"
        />
    </div>
</template>
