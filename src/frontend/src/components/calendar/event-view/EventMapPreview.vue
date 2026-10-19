<script setup lang="ts">
import GoogleMapsEmbed from './GoogleMapsEmbed.vue';

defineProps<{
    location?: string;
    lat: number;
    lon: number;
}>();

const emit = defineEmits<{
    (e: 'open-map'): void;
}>();
</script>

<template>
    <button
        type="button"
        class="border-line group relative block h-40 w-full overflow-hidden rounded-2xl border sm:h-56"
        aria-label="Open map"
        @click="emit('open-map')"
    >
        <GoogleMapsEmbed :query="location" :lat="lat" :lon="lon" :zoom="14" />
        <span
            class="text-meta text-fg bg-surface-950/80 group-hover:bg-surface-950 absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors"
        >
            <i class="pi pi-map text-[0.6875rem]"></i>
            Open map
        </span>
    </button>
</template>
