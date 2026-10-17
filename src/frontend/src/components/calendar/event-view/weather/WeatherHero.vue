<script setup lang="ts">
import { injectWeatherDialogState } from './useWeatherDialogState';
import MeteoconIcon from '../../../MeteoconIcon.vue';

const { displayInfo, displayTemp } = injectWeatherDialogState();
</script>

<template>
    <div class="flex items-center gap-4 py-2">
        <MeteoconIcon :slug="displayInfo.meteoconSlug" :size="88" />
        <div>
            <p class="font-display tabular m-0 flex items-start text-[3.5rem] leading-none font-semibold">
                {{ displayTemp }}<span class="text-subtle text-[2rem] font-normal">°</span>
            </p>
            <p class="text-body text-muted m-0 mt-1">{{ displayInfo.summary }}</p>
        </div>
    </div>
</template>
