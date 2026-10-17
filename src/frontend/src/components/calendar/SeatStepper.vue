<script setup lang="ts">
import Button from 'primevue/button';

const seats = defineModel<number>({ required: true });

withDefaults(
    defineProps<{
        label: string;
        hint?: string;
        min?: number;
        max?: number;
    }>(),
    { hint: 'Including you', min: 2, max: 9 }
);
</script>

<template>
    <div class="flex items-center justify-between gap-3 px-4 py-3">
        <div>
            <p class="text-body text-fg m-0 font-medium">{{ label }}</p>
            <p class="text-meta text-muted m-0">{{ hint }}</p>
        </div>
        <div class="flex items-center gap-1">
            <Button
                icon="pi pi-minus"
                severity="secondary"
                rounded
                size="small"
                :aria-label="`Fewer seats: ${label}`"
                :disabled="seats <= min"
                @click="seats--"
            />
            <span class="text-headline font-display tabular w-8 text-center font-semibold" aria-live="polite">
                {{ seats }}
            </span>
            <Button
                icon="pi pi-plus"
                severity="secondary"
                rounded
                size="small"
                :aria-label="`More seats: ${label}`"
                :disabled="seats >= max"
                @click="seats++"
            />
        </div>
    </div>
</template>
