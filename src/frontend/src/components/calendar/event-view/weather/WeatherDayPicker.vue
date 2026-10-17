<script setup lang="ts">
import { injectWeatherDialogState } from './useWeatherDialogState';

const {
    availableDays,
    // @ts-expect-error - dayScrollContainer is needed, otherwise autoscroll won't work!
    dayScrollContainer,
    selectDay,
    formatDay,
    formatDayFull,
    resetSelection,
    isModified,
    isSelectedDay
} = injectWeatherDialogState();
</script>

<template>
    <div v-if="availableDays.length > 1" class="mt-5">
        <div class="mb-2 flex items-center justify-between">
            <h3 class="eyebrow m-0">Daily</h3>
            <button
                v-if="isModified"
                type="button"
                class="text-meta text-muted hover:text-fg flex items-center gap-1.5 font-medium"
                @click="resetSelection"
            >
                <i class="pi pi-refresh text-[0.625rem]"></i>
                Event day
            </button>
        </div>
        <div ref="dayScrollContainer" class="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            <button
                v-for="day in availableDays"
                :key="day.toISOString()"
                :data-active="isSelectedDay(day)"
                @click="selectDay(day)"
                type="button"
                class="pressable flex min-w-18 flex-col items-center gap-0.5 rounded-2xl px-2 py-2.5 transition-colors"
                :class="[isSelectedDay(day) ? 'bg-fg' : 'bg-surface-900 hover:bg-surface-850']"
            >
                <span
                    class="text-[0.75rem] font-medium"
                    :class="isSelectedDay(day) ? 'text-surface-600' : 'text-muted'"
                >
                    {{ formatDay(day) }}
                </span>
                <span class="text-meta tabular font-semibold" :class="isSelectedDay(day) ? 'text-black' : 'text-fg'">
                    {{ formatDayFull(day) }}
                </span>
            </button>
        </div>
    </div>
</template>
