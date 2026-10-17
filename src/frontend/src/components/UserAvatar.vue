<script setup lang="ts">
import { computed } from 'vue';
import Avatar from 'primevue/avatar';

const props = defineProps<{
    profilePictureUrl?: string | null;
    username?: string;
    size?: 'normal' | 'large' | 'xlarge';
    shape?: 'circle' | 'square';
}>();

// Stable, low-chroma tint per person so initials-only avatars are still tellable apart.
const HUES = [20, 55, 95, 150, 190, 230, 270, 320];

const initialsStyle = computed(() => {
    if (props.profilePictureUrl) return undefined;
    const name = props.username ?? '';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    const hue = HUES[Math.abs(hash) % HUES.length];
    return {
        background: `oklch(0.34 0.05 ${hue})`,
        color: `oklch(0.9 0.04 ${hue})`
    };
});
</script>

<template>
    <Avatar
        :image="profilePictureUrl || undefined"
        :label="!profilePictureUrl ? username?.charAt(0)?.toUpperCase() || '?' : undefined"
        :shape="shape || 'circle'"
        :size="size"
        :style="initialsStyle"
        class="shrink-0 overflow-hidden font-semibold"
        :aria-label="username"
        :pt="{
            image: {
                draggable: false,
                alt: '',
                loading: 'lazy'
            }
        }"
    />
</template>
