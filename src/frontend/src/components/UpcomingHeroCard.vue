<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { differenceInMinutes } from 'date-fns';
import Button from 'primevue/button';
import type { Event } from '../types/Event';
import { useMagicCard } from '../composables/useMagicCard';
import { useShareEvent } from '../composables/useShareEvent';
import { useNow } from '../composables/useNow';
import { hexToRgba, mixHexColors } from '../utils/color';
import UserAvatarGroup from './UserAvatarGroup.vue';
import EventStatusPill from './EventStatusPill.vue';
import { useEventCardStyle } from '../composables/useEventCardStyle';
import { useEventWeather } from '../composables/useEventWeather';
import WeatherDialog from './calendar/event-view/weather/WeatherDialog.vue';

import UpcomingEventWeatherBadge from './UpcomingEventWeatherBadge.vue';

const props = defineProps<{
    event: Event;
}>();

const emit = defineEmits<{
    (e: 'view', event: Event): void;
}>();

const { now } = useNow();
const { shareEvent } = useShareEvent();
const { activityColor, cardStyle, navigationButtonStyle, locationStyle } = useEventCardStyle(
    toRef(props.event, 'color'),
    'hero'
);

const startDate = computed(() => new Date(props.event.startTime));

const isSoon = computed(() => {
    const diff = differenceInMinutes(startDate.value, now.value);
    return diff > 0 && diff <= 60;
});

const isStartingNow = computed(() => {
    const diff = differenceInMinutes(startDate.value, now.value);
    return diff >= 0 && diff <= 5;
});

const heroCardStyle = computed(() => ({
    ...cardStyle.value,
    '--hero-accent-sheen': hexToRgba(mixHexColors(activityColor.value, '#ffffff', 0.24), 0.06),
    '--hero-aura': hexToRgba(activityColor.value, 0.14)
}));

// Smart Action Logic
const isLocationUrl = computed(() => {
    try {
        if (!props.event.location) return false;
        new URL(props.event.location);
        return true;
    } catch {
        return props.event.location?.startsWith('http');
    }
});

const primaryAction = computed(() => {
    if (isLocationUrl.value) {
        return { label: 'Join Meeting', icon: 'pi pi-video', color: 'primary' };
    }
    if (props.event.location && props.event.location.length > 5) {
        return { label: 'Start Navigation', icon: 'pi pi-map', color: 'secondary' };
    }
    return { label: 'Prepare & View', icon: 'pi pi-arrow-right', color: 'primary' };
});

const handleAction = () => {
    if (isLocationUrl.value) {
        window.open(props.event.location!, '_blank');
    } else if (props.event.location) {
        openNavigation(props.event.location);
    } else {
        emit('view', props.event);
    }
};

// @ts-expect-error - used in template
const { cardRef, backgroundStyle } = useMagicCard({
    gradientSize: 400,
    gradientColor: activityColor,
    gradientOpacity: 0.12
});

import { getActiveParticipants, openNavigation } from '../utils/event';

const activeParticipants = computed(() => getActiveParticipants(props.event.participants));
const weatherDetailVisible = ref(false);
const { getWeatherForEvent } = useEventWeather();
const weather = computed(() => getWeatherForEvent(props.event.id));
</script>

<template>
    <div
        ref="cardRef"
        class="hero-card relative rounded-2xl border p-4 transition-all duration-500"
        :class="{ 'soon-pulse': isSoon || isStartingNow }"
        :style="heroCardStyle"
        @click="emit('view', event)"
    >
        <div class="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div class="flex flex-1 flex-col gap-4">
                <!-- Top row: Pill -->
                <div class="flex items-center gap-2">
                    <EventStatusPill :event="event" />
                    <i
                        v-if="props.event.isPrivate"
                        class="pi pi-lock text-surface-500 ml-auto"
                        title="Private Event"
                    ></i>
                </div>

                <!-- Title & Countdown -->
                <div class="flex flex-col gap-1">
                    <div class="flex items-start justify-between gap-4">
                        <h2 class="text-3xl font-black tracking-tight text-white md:text-4xl lg:text-5xl">
                            {{ event.title }}
                        </h2>
                        <Button
                            severity="secondary"
                            text
                            rounded
                            v-tooltip.left="'Share Event'"
                            icon="pi pi-share-alt"
                            class="hover:bg-transparent! hover:brightness-120!"
                            @click.stop="shareEvent(event.id)"
                        />
                    </div>
                </div>

                <!-- Description Snippet -->
                <p v-if="event.description" class="line-clamp-2 max-w-2xl text-sm text-zinc-400 md:text-base">
                    {{ event.description }}
                </p>

                <!-- Metadata Row -->
                <div class="mt-2 flex flex-wrap items-center gap-6">
                    <!-- Location -->
                    <div v-if="event.location" class="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                        <div class="flex h-8 w-8 items-center justify-center rounded-lg border" :style="locationStyle">
                            <i :class="isLocationUrl ? 'pi pi-external-link' : 'pi pi-map-marker'"></i>
                        </div>
                        <span class="max-w-50 truncate font-medium">{{ event.location }}</span>
                        <UpcomingEventWeatherBadge
                            :event="event"
                            :compact="false"
                            @open-detail="weatherDetailVisible = true"
                        />
                    </div>

                    <!-- Participants -->
                    <div
                        v-if="activeParticipants.length > 0"
                        class="flex w-full items-center justify-start gap-3 md:w-fit md:justify-center"
                    >
                        <UserAvatarGroup :participants="activeParticipants" />
                        <span class="text-surface-400 text-xs font-medium sm:text-sm">
                            {{ activeParticipants.length }} attending
                        </span>
                    </div>
                </div>
            </div>

            <!-- Primary Action Button -->
            <div class="mt-4 flex shrink-0 flex-col gap-3 md:mt-0 md:min-w-50">
                <Button
                    :label="primaryAction.label"
                    :icon="primaryAction.icon"
                    class="hero-button w-full rounded-xl! py-3! text-base! font-bold! transition-all duration-300 active:scale-[0.98] md:py-4! md:text-lg!"
                    :style="navigationButtonStyle"
                    :severity="primaryAction.color === 'primary' ? 'primary' : 'secondary'"
                    @click.stop="handleAction"
                />
                <Button
                    label="Event Details"
                    severity="secondary"
                    text
                    class="text-sm! hover:bg-transparent! hover:brightness-120!"
                    @click.stop="emit('view', event)"
                />
            </div>
        </div>

        <!-- Background Effects -->
        <div class="magic-spotlight" :style="backgroundStyle"></div>
        <div class="hero-card__trail"></div>
        <WeatherDialog v-model:visible="weatherDetailVisible" :event="event" :weather="weather" />
    </div>
</template>

<style scoped>
.hero-card {
    border: 1px solid #262626;
    cursor: pointer;
    background:
        radial-gradient(circle at top right, var(--hero-accent-faint) 0%, transparent 30%),
        linear-gradient(145deg, #141414 0%, #111111 100%);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.hero-card::after {
    content: '';
    position: absolute;
    inset: -1px;
    background: linear-gradient(135deg, transparent, var(--hero-accent-sheen), transparent);
    border-radius: inherit;
    z-index: 0;
    pointer-events: none;
}

.hero-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    opacity: 0.7;
    pointer-events: none;
    z-index: 0;
}

.countdown-ticking {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
}

.hero-button {
    border-width: 1px;
    border-style: solid;
}

.hero-button:hover {
    filter: brightness(1.04);
    border-color: var(--hero-action-border-hover);
}

.hero-card__trail {
    position: absolute;
    top: -54px;
    right: -62px;
    width: 220px;
    height: 220px;
    border-radius: 999px;
    background: radial-gradient(circle, var(--hero-accent-faint) 0%, transparent 68%);
    filter: blur(54px);
    opacity: 0.65;
    pointer-events: none;
    z-index: 0;
}

.magic-spotlight {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
    opacity: 0.55;
    border-radius: 16px;
}

@keyframes pulse-subtle {
    0%,
    100% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.95;
        transform: scale(1.005);
    }
}

.soon-pulse {
    animation: pulse-subtle 4s infinite ease-in-out;
}

@media (max-width: 1023px) {
    .hero-card {
        background:
            radial-gradient(circle at top right, var(--hero-accent-faint) 0%, transparent 30%),
            linear-gradient(145deg, #141414 0%, #111111 100%);
        box-shadow: none;
    }

    .hero-card:hover {
        background:
            radial-gradient(circle at top right, var(--hero-accent-soft) 0%, transparent 34%),
            linear-gradient(145deg, #1a1a1a 0%, #121212 100%);
        border-color: var(--hero-accent-border);
        transform: translateY(-2px);
        box-shadow:
            0 12px 28px -20px var(--hero-accent-shadow),
            0 12px 40px -10px rgba(0, 0, 0, 0.42);
    }

    .hero-card::after {
        display: none;
    }

    .hero-card::before {
        border: 1px solid transparent;
        background:
            linear-gradient(#0000, #0000) padding-box,
            linear-gradient(155deg, var(--hero-accent-border), rgba(255, 255, 255, 0.03), transparent) border-box;
        box-shadow: none;
        opacity: 1;
    }

    .hero-card__trail {
        display: none;
    }

    .magic-spotlight {
        opacity: 0;
    }

    .hero-card:hover .magic-spotlight {
        opacity: 0.6;
    }
}

@media (min-width: 1024px) {
    .hero-card {
        background:
            radial-gradient(circle at top right, var(--hero-accent-faint) 0%, transparent 30%),
            linear-gradient(140deg, rgba(10, 10, 10, 1) 0%, rgba(18, 18, 18, 1) 52%, rgba(12, 12, 12, 1) 100%);
    }

    .hero-card:hover {
        border-color: rgba(63, 63, 70, 1);
    }
}
</style>
