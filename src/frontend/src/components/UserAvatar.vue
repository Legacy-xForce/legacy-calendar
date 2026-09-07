<script setup lang="ts">
import Avatar from 'primevue/avatar';
import { ref, watch } from 'vue';

const props = defineProps<{
    profilePictureUrl?: string | null;
    username?: string;
    size?: 'normal' | 'large' | 'xlarge';
    shape?: 'circle' | 'square';
}>();

const imageFailed = ref(false);

watch(
    () => props.profilePictureUrl,
    () => {
        imageFailed.value = false;
    }
);
</script>

<template>
    <Avatar
        :image="!imageFailed ? profilePictureUrl || undefined : undefined"
        :label="!profilePictureUrl || imageFailed ? username?.charAt(0)?.toUpperCase() || 'U' : undefined"
        :shape="shape || 'circle'"
        :size="size"
        class="bg-primary text-primary-contrast border border-white/10"
        :pt="{
            image: {
                draggable: false,
                onError: () => (imageFailed = true)
            }
        }"
    />
</template>
