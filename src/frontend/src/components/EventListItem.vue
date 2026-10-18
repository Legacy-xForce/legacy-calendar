<script setup lang="ts">
import { computed, ref } from 'vue';
import { format, isSameDay } from 'date-fns';
import type { Event } from '../types/Event';
import { useSessionStore } from '../stores/session';
import { getActiveParticipants, getEventEnd, getUserEventRole } from '../utils/event';
import { normalizeHexColor } from '../utils/color';
import { isOnlineLocation } from '../utils/url';
import { DEFAULT_COLOR } from '../constants/colors';
import { useEventWeather } from '../composables/useEventWeather';
import UserAvatarGroup from './UserAvatarGroup.vue';
import RsvpBadge from './RsvpBadge.vue';
import UpcomingEventWeatherBadge from './UpcomingEventWeatherBadge.vue';
import WeatherDialog from './calendar/event-view/weather/WeatherDialog.vue';

const props = withDefaults(
    defineProps<{
        event: Event;
        showWeather?: boolean;
    }>(),
    { showWeather: true }
);

const emit = defineEmits<{
    (e: 'open', event: Event): void;
}>();

const sessionStore = useSessionStore();
const { getWeatherForEvent } = useEventWeather();

const start = computed(() => new Date(props.event.startTime));
const end = computed(() => (props.event.endTime ? getEventEnd(props.event) : null));
const endsOnOtherDay = computed(() => !!end.value && !isSameDay(start.value, end.value));
const color = computed(() => normalizeHexColor(props.event.color, DEFAULT_COLOR));
const role = computed(() => getUserEventRole(props.event, sessionStore.currentUser?.id));
const going = computed(() => getActiveParticipants(props.event.participants));
const isOnline = computed(() => isOnlineLocation(props.event.location));
const weather = computed(() => getWeatherForEvent(props.event.id));
const weatherVisible = ref(false);
</script>

<template>
    <div
        role="button"
        tabindex="0"
        class="event-row pressable group flex w-full cursor-pointer gap-3.5 rounded-2xl p-3.5 text-left"
        :style="{ '--event-color': color }"
        @click="emit('open', event)"
        @keydown.enter.prevent="emit('open', event)"
        @keydown.space.prevent="emit('open', event)"
    >
        <div class="tabular flex w-11 shrink-0 flex-col pt-px">
            <span class="text-body text-fg font-semibold">{{ format(start, 'HH:mm') }}</span>
            <span v-if="end" class="text-meta text-subtle">
                {{ format(end, 'HH:mm') }}<sup v-if="endsOnOtherDay" class="ml-px text-[0.625rem]">+1</sup>
            </span>
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex items-start gap-2">
                <span class="mt-[0.4375rem] size-2 shrink-0 rounded-full bg-(--event-color)"></span>
                <h3 class="text-title text-fg m-0 line-clamp-2 min-w-0 flex-1 font-semibold break-words">
                    {{ event.title }}
                </h3>
                <i
                    v-if="event.isPrivate"
                    class="pi pi-lock text-subtle mt-1.5 text-[0.6875rem]"
                    aria-label="Private"
                ></i>
            </div>

            <div
                v-if="event.location || (showWeather && weather)"
                class="text-meta text-muted flex min-w-0 items-center gap-2 pl-4"
            >
                <span v-if="event.location" class="flex min-w-0 items-center gap-1.5">
                    <i :class="isOnline ? 'pi pi-video' : 'pi pi-map-marker'" class="text-[0.6875rem]"></i>
                    <span class="truncate">{{ isOnline ? 'Online' : event.location }}</span>
                </span>
                <UpcomingEventWeatherBadge
                    v-if="showWeather"
                    :event="event"
                    class="ml-auto"
                    @open-detail="weatherVisible = true"
                />
            </div>

            <div v-if="going.length > 0 || role" class="flex items-center gap-2 pt-0.5 pl-4">
                <UserAvatarGroup v-if="going.length > 0" :participants="going" :show-limit="4" size="sm" />
                <span v-if="going.length > 0" class="text-meta text-muted tabular">{{ going.length }} going</span>
                <RsvpBadge :role="role" class="ml-auto" />
            </div>
        </div>

        <WeatherDialog v-if="showWeather" v-model:visible="weatherVisible" :event="event" :weather="weather" />
    </div>
</template>

<style scoped>
.event-row {
    background: color-mix(in oklab, var(--event-color) 7%, var(--color-raised));
}

.event-row:hover {
    background: color-mix(in oklab, var(--event-color) 11%, var(--color-raised));
}

.event-row:focus-visible {
    outline-offset: 0;
}
</style>
