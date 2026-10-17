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
            class="text-meta text-fg absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-black/80 px-3 py-1.5 font-medium transition-colors group-hover:bg-black"
        >
            <i class="pi pi-map text-[0.6875rem]"></i>
            Open map
        </span>
    </button>
</template>
