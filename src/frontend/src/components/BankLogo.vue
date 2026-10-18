<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getBankLogoUrl } from '../utils/bankLogo';

const props = defineProps<{
    iban?: string | null;
    name?: string | null;
}>();

// Falls back to a monogram when there is no logo provider, no known domain, or the
// image fails to load.
const imageFailed = ref(false);
watch(
    () => props.iban,
    () => {
        imageFailed.value = false;
    }
);

const url = computed(() => getBankLogoUrl(props.iban));
const showImage = computed(() => !!url.value && !imageFailed.value);

// Words that carry no brand identity, dropped before taking initials.
const GENERIC = new Set([
    'banca',
    'banco',
    'cassa',
    'istituto',
    'credit',
    'credito',
    'cooperativo',
    'cooperativa',
    'popolare',
    'group',
    'gruppo',
    'di',
    'del',
    'dello',
    'della',
    'dei',
    'degli',
    'delle',
    'e',
    'per'
]);

const initials = computed(() => {
    const words = (props.name ?? '').split(/[\s.,'-]+/).filter((word) => word && !GENERIC.has(word.toLowerCase()));
    const letters = words.slice(0, 2).map((word) => word[0].toUpperCase());
    if (letters.length) return letters.join('');
    return (props.name ?? '?').charAt(0).toUpperCase() || '?';
});

// Stable, low-chroma tint per bank, mirroring UserAvatar.
const HUES = [20, 55, 95, 150, 190, 230, 270, 320];

const tintStyle = computed(() => {
    if (showImage.value || !props.name) return undefined;
    const name = props.name;
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    const hue = HUES[Math.abs(hash) % HUES.length];
    return {
        background: `oklch(0.34 0.05 ${hue})`,
        color: `oklch(0.9 0.04 ${hue})`
    };
});

const containerClass = computed(() => {
    if (showImage.value) return 'bg-white';
    return props.name ? '' : 'bg-surface-900 text-muted';
});
</script>

<template>
    <span
        class="flex shrink-0 items-center justify-center overflow-hidden"
        :class="containerClass"
        :style="tintStyle"
        :title="name ?? undefined"
        aria-hidden="true"
    >
        <img
            v-if="showImage"
            :src="url!"
            alt=""
            loading="lazy"
            draggable="false"
            class="size-full object-contain"
            @error="imageFailed = true"
        />
        <i v-else-if="!name" class="pi pi-building-columns text-sm"></i>
        <span v-else class="font-semibold tracking-tight">{{ initials }}</span>
    </span>
</template>
