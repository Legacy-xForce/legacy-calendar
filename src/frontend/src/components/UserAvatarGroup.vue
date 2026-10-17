<script lang="ts" setup>
import type { EventPersonSummary } from '../types/Event';
import UserAvatar from './UserAvatar.vue';

withDefaults(
    defineProps<{
        participants: EventPersonSummary[];
        showLimit?: number;
        size?: 'sm' | 'md';
    }>(),
    { showLimit: 4, size: 'md' }
);
</script>

<template>
    <div v-if="participants.length > 0" class="flex items-center">
        <UserAvatar
            v-for="(p, index) in participants.slice(0, showLimit)"
            :key="p.id"
            :profile-picture-url="p.profilePictureUrl"
            :username="p.username"
            class="ring-raised ring-2"
            :class="[
                size === 'sm' ? 'size-6! text-[0.625rem]!' : 'size-7! text-[0.6875rem]!',
                index > 0 ? '-ml-1.5' : ''
            ]"
        />
        <span
            v-if="participants.length > showLimit"
            class="bg-surface-800 text-muted ring-raised tabular -ml-1.5 flex items-center justify-center rounded-full font-semibold ring-2"
            :class="size === 'sm' ? 'size-6 text-[0.625rem]' : 'size-7 text-[0.6875rem]'"
        >
            +{{ participants.length - showLimit }}
        </span>
    </div>
</template>
