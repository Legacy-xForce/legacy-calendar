<script setup lang="ts">
import UserAvatar from '../UserAvatar.vue';
import Badge from 'primevue/badge';
import Chip from 'primevue/chip';
import type { Event } from '../../types/Event';
import { useMagicCard } from '../../composables/useMagicCard';

const props = defineProps<{
    event: Event;
}>();

const emit = defineEmits<{
    (e: 'click', event: Event): void;
}>();

// @ts-expect-error - used in template
const { cardRef, backgroundStyle } = useMagicCard({
    gradientSize: 150,
    gradientColor: () => props.event.color || '#ffffff',
    gradientOpacity: 0.15
});
</script>

<template>
    <div
        ref="cardRef"
        class="event-card-wrapper group relative mb-0 flex flex-col overflow-hidden md:mb-1"
        @click.stop="emit('click', event)"
    >
        <Chip
            :label="event.title"
            class="w-full cursor-pointer justify-between! transition-all hover:brightness-95"
            :style="event.color ? { borderLeft: `3px solid ${event.color}` } : {}"
            :pt="{
                root: {
                    class: '!rounded-md md:!rounded-md shadow-sm border border-white/5 !px-1 !py-0.5 md:!px-2 md:!py-1 min-h-0'
                },
                label: { class: 'flex-1 truncate font-medium text-[9px] md:text-sm z-10 leading-tight' }
            }"
        >
            <template #icon>
                <div class="z-10 ml-auto hidden shrink-0 items-center gap-1 md:flex">
                    <UserAvatar
                        :profilePictureUrl="event.host?.profilePictureUrl"
                        :username="event.host?.username"
                        class="bg-surface-0/50 dark:bg-surface-900/50 h-6! w-6! text-[10px]! shadow-sm backdrop-blur-sm"
                    />

                    <i
                        v-if="event.isPrivate"
                        class="pi pi-lock text-[10px] text-zinc-400 dark:text-zinc-500"
                        title="Private Event"
                    ></i>

                    <Badge
                        v-if="event.participants && event.participants.length > 0"
                        :value="event.participants.length"
                        severity="contrast"
                        class="h-4! min-w-4! text-[10px]! leading-3!"
                    />
                </div>
            </template>
        </Chip>

        <!-- Magic card spotlight overlay -->
        <div class="magic-spotlight" :style="backgroundStyle"></div>
    </div>
</template>

<style scoped>
.magic-spotlight {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
    z-index: 5;
}

.event-card-wrapper:hover .magic-spotlight {
    opacity: 1;
}

.event-card-wrapper {
    transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
}

.event-card-wrapper:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
</style>
