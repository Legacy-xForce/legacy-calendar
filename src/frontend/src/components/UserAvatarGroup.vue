<script lang="ts" setup>
import type { EventParticipant } from '../types/Event';
import UserAvatar from './UserAvatar.vue';
import Avatar from 'primevue/avatar';
import AvatarGroup from 'primevue/avatargroup';

defineProps({
    participants: {
        type: Array<EventParticipant>,
        required: true
    },
    showLimit: {
        type: Number,
        default: 4
    }
});
</script>

<template>
    <AvatarGroup v-if="participants.length > 0">
        <UserAvatar
            v-for="p in participants.slice(0, showLimit)"
            :key="p.id"
            :profile-picture-url="p.profilePictureUrl"
            :username="p.username"
        />
        <Avatar v-if="participants.length > showLimit" :label="`+${participants.length - showLimit}`" shape="circle" />
    </AvatarGroup>
</template>
