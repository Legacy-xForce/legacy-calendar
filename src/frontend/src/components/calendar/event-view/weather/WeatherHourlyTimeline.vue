<script setup lang="ts">
import { injectWeatherDialogState } from './useWeatherDialogState';
import { mapWeatherCodeToSummary } from '../../../../composables/useEventWeather';
import MeteoconIcon from '../../../MeteoconIcon.vue';

const {
    hourlyForSelectedDay,
    // @ts-expect-error - hourlyScrollContainer is needed, otherwise autoscroll won't work!
    hourlyScrollContainer,
    isSelected,
    selectHour,
    formatHour,
    resetSelection,
    isModified
} = injectWeatherDialogState();
</script>

<template>
    <div v-if="hourlyForSelectedDay.length" class="mt-5">
        <div class="mb-2 flex items-center justify-between">
            <h3 class="eyebrow m-0">Hourly</h3>
            <button
                v-if="isModified"
                type="button"
                class="text-meta text-muted hover:text-fg flex items-center gap-1.5 font-medium"
                @click="resetSelection"
            >
                <i class="pi pi-refresh text-[0.625rem]"></i>
                Event time
            </button>
        </div>
        <div ref="hourlyScrollContainer" class="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            <button
                v-for="hour in hourlyForSelectedDay"
                :key="hour.time"
                :data-active="isSelected(hour)"
                @click="selectHour(hour)"
                type="button"
                class="pressable flex min-w-15 flex-col items-center gap-1.5 rounded-2xl border py-3 transition-colors"
                :class="[
                    isSelected(hour)
                        ? 'border-line-strong bg-surface-800'
                        : 'bg-surface-900 hover:bg-surface-850 border-transparent'
                ]"
            >
                <span class="text-muted tabular text-[0.75rem] font-medium">{{ formatHour(hour.time) }}</span>
                <MeteoconIcon :slug="mapWeatherCodeToSummary(hour.weatherCode, hour.isDay).meteoconSlug" :size="42" />
                <span class="text-sm font-bold">{{ Math.round(hour.temperature) }}°</span>
            </button>
        </div>
    </div>
</template>
