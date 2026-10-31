<script setup lang="ts">
import EmojiPicker from 'vue3-emoji-picker';
import 'vue3-emoji-picker/css';

const emit = defineEmits<{ select: [emoji: any] }>();
</script>

<template>
    <div>
        <EmojiPicker :native="true" theme="dark" :hide-group-names="false" @select="emit('select', $event)" />
    </div>
</template>

<style scoped>
/* Emoji picker, matched to the surface tokens */
:deep(.v3-emoji-picker) {
    --v3-bg: var(--color-surface-900) !important;
    --v3-border-color: transparent !important;
    --v3-text-color: var(--color-fg) !important;
    --v3-input-bg: var(--color-surface-850) !important;
    --v3-input-border-color: var(--color-line) !important;
    --v3-input-text-color: var(--color-fg) !important;
    --v3-input-placeholder-color: var(--color-subtle) !important;
    --v3-group-h-bg: var(--color-surface-900) !important;
    --v3-hover-bg: var(--color-surface-800) !important;
    width: 20rem;
    height: 22rem;
    border-radius: 0;
    box-shadow: none;
    font-family: inherit;
    background-color: var(--color-surface-900) !important;
}

:deep(.v3-header) {
    padding: 0.625rem 0.625rem 0.375rem;
    border-bottom: 0;
}

:deep(.v3-emoji-picker input) {
    border-radius: 0.75rem !important;
    padding: 0.5rem 0.75rem !important;
    font-size: 1rem !important;
    width: 100% !important;
}

:deep(.v3-emoji-picker input:focus) {
    border-color: var(--color-accent) !important;
    outline: none !important;
}

:deep(.v3-body-inner) {
    padding: 0 0.625rem !important;
}

:deep(.v3-group h5) {
    font-size: 0.75rem !important;
    font-weight: 600 !important;
    color: var(--color-muted) !important;
    padding: 0.5rem 0 !important;
    margin: 0 !important;
    background-color: var(--color-surface-900) !important;
}

:deep(.v3-footer) {
    display: none;
}
</style>
