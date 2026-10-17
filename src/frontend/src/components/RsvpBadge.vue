<script setup lang="ts">
import { computed } from 'vue';
import type { UserEventRole } from '../utils/event';

const props = defineProps<{
    role: UserEventRole;
}>();

const config = computed(() => {
    switch (props.role) {
        case 'hosting':
            return { label: 'Hosting', icon: 'pi pi-star-fill', class: 'bg-surface-850 text-fg' };
        case 'going':
            return { label: 'Going', icon: 'pi pi-check', class: 'bg-emerald-400/12 text-emerald-300' };
        case 'invited':
            return { label: 'Invited', icon: 'pi pi-envelope', class: 'bg-amber-300/12 text-amber-200' };
        case 'declined':
            return { label: 'Declined', icon: 'pi pi-times', class: 'bg-surface-900 text-subtle' };
        default:
            return null;
    }
});
</script>

<template>
    <span
        v-if="config"
        class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.75rem] leading-none font-medium"
        :class="config.class"
    >
        <i :class="config.icon" class="text-[0.625rem]"></i>
        {{ config.label }}
    </span>
</template>
