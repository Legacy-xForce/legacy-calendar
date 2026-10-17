<script setup lang="ts">
import { computed, ref } from 'vue';
import { format, isToday, isTomorrow } from 'date-fns';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import type { Event } from '../types/Event';
import { useShareEvent } from '../composables/useShareEvent';
import { useEventWeather } from '../composables/useEventWeather';
import { useSessionStore } from '../stores/session';
import { getActiveParticipants, getEventEnd, getUserEventRole, openNavigation } from '../utils/event';
import { normalizeHexColor } from '../utils/color';
import { DEFAULT_COLOR } from '../constants/colors';
import UserAvatarGroup from './UserAvatarGroup.vue';
import LinkifiedText from './LinkifiedText.vue';
import EventStatusPill from './EventStatusPill.vue';
import RsvpBadge from './RsvpBadge.vue';
import UpcomingEventWeatherBadge from './UpcomingEventWeatherBadge.vue';
import WeatherDialog from './calendar/event-view/weather/WeatherDialog.vue';

const props = defineProps<{
    event: Event;
}>();

const emit = defineEmits<{
    (e: 'view', event: Event): void;
}>();

const router = useRouter();
const sessionStore = useSessionStore();
const { shareEvent } = useShareEvent();
const { getWeatherForEvent } = useEventWeather();

const color = computed(() => normalizeHexColor(props.event.color, DEFAULT_COLOR));
const start = computed(() => new Date(props.event.startTime));
const role = computed(() => getUserEventRole(props.event, sessionStore.currentUser?.id));
const going = computed(() => getActiveParticipants(props.event.participants));
const weather = computed(() => getWeatherForEvent(props.event.id));
const weatherVisible = ref(false);
const isOnline = computed(() => /^https?:\/\//i.test(props.event.location ?? ''));
const canChat = computed(() => role.value === 'going' || role.value === 'hosting');

const whenLabel = computed(() => {
    const dayLabel = isToday(start.value)
        ? 'Today'
        : isTomorrow(start.value)
          ? 'Tomorrow'
          : format(start.value, 'EEEE d MMMM');
    const time = format(start.value, 'HH:mm');
    const end = props.event.endTime ? ` – ${format(getEventEnd(props.event), 'HH:mm')}` : '';
    return `${dayLabel} · ${time}${end}`;
});

const primaryAction = computed(() => {
    if (role.value === 'invited')
        return { label: 'Respond', icon: 'pi pi-envelope', run: () => emit('view', props.event) };
    if (isOnline.value) {
        return { label: 'Join call', icon: 'pi pi-video', run: () => window.open(props.event.location!, '_blank') };
    }
    if (props.event.location) {
        return { label: 'Directions', icon: 'pi pi-directions', run: () => openNavigation(props.event.location) };
    }
    return { label: 'View details', icon: 'pi pi-arrow-right', run: () => emit('view', props.event) };
});

const openChat = () => {
    void router.push({ path: `/upcoming/${props.event.id}/chat` });
};
</script>

<template>
    <article
        class="hero pressable flex cursor-pointer flex-col gap-4 rounded-3xl border p-5 md:p-6"
        :style="{ '--event-color': color }"
        @click="emit('view', event)"
    >
        <div class="flex items-center gap-2">
            <EventStatusPill :event="event" />
            <RsvpBadge :role="role" />
            <i v-if="event.isPrivate" class="pi pi-lock text-subtle ml-auto text-xs" aria-label="Private"></i>
        </div>

        <div class="flex flex-col gap-1.5">
            <h2 class="text-display md:text-display-lg text-fg m-0 break-words">{{ event.title }}</h2>
            <p class="text-body text-muted tabular m-0">{{ whenLabel }}</p>
        </div>

        <p v-if="event.description" class="text-body text-muted m-0 line-clamp-2 max-w-prose">
            <LinkifiedText :text="event.description" />
        </p>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <span v-if="event.location" class="text-body text-fg flex min-w-0 items-center gap-2">
                <i :class="isOnline ? 'pi pi-video' : 'pi pi-map-marker'" class="text-muted text-sm"></i>
                <span class="truncate">{{ isOnline ? 'Online' : event.location }}</span>
            </span>
            <UpcomingEventWeatherBadge :event="event" :compact="false" @open-detail="weatherVisible = true" />
            <span v-if="going.length" class="flex items-center gap-2">
                <UserAvatarGroup :participants="going" :show-limit="5" />
                <span class="text-meta text-muted tabular">{{ going.length }} going</span>
            </span>
        </div>

        <div class="flex items-center gap-2 pt-1" @click.stop>
            <Button
                :label="primaryAction.label"
                :icon="primaryAction.icon"
                class="flex-1 md:flex-none"
                @click="primaryAction.run"
            />
            <Button
                v-if="canChat"
                icon="pi pi-comments"
                severity="secondary"
                aria-label="Open chat"
                v-tooltip.top="'Chat'"
                @click="openChat"
            />
            <Button
                icon="pi pi-share-alt"
                severity="secondary"
                aria-label="Copy link"
                v-tooltip.top="'Copy link'"
                @click="shareEvent(event.id)"
            />
        </div>

        <WeatherDialog v-model:visible="weatherVisible" :event="event" :weather="weather" />
    </article>
</template>

<style scoped>
.hero {
    background: color-mix(in oklab, var(--event-color) 10%, var(--color-raised));
    border-color: color-mix(in oklab, var(--event-color) 22%, transparent);
}

.hero:hover {
    border-color: color-mix(in oklab, var(--event-color) 36%, transparent);
}

.hero:active {
    transform: scale(0.99);
}
</style>
