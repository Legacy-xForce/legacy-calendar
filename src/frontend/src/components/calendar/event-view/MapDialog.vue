<script setup lang="ts">
import { computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { injectEventView } from '../../../composables/useEventView';
import GoogleMapsEmbed from './GoogleMapsEmbed.vue';

const props = defineProps<{
    visible: boolean;
    lat: number;
    lon: number;
    location?: string;
}>();

const { openNavigation } = injectEventView();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
}>();

const showDialog = computed({
    get: () => props.visible,
    set: (value) => emit('update:visible', value)
});
</script>

<template>
    <Dialog
        v-model:visible="showDialog"
        modal
        dismissableMask
        :draggable="false"
        :style="{ width: '64rem' }"
        :pt="{
            header: { class: 'border-b border-line py-3!' },
            content: { class: 'p-0! h-[70dvh] sm:h-[80vh]' }
        }"
    >
        <template #header>
            <div class="flex min-w-0 flex-1 items-center gap-3">
                <div class="min-w-0 flex-1">
                    <h2 class="text-title m-0 truncate">{{ location || 'Map' }}</h2>
                    <p class="text-meta text-muted m-0">Location</p>
                </div>
                <Button
                    label="Directions"
                    icon="pi pi-directions"
                    size="small"
                    severity="secondary"
                    :disabled="!location"
                    @click="openNavigation(location!)"
                />
            </div>
        </template>

        <div class="relative h-full w-full">
            <GoogleMapsEmbed :query="location" :lat="lat" :lon="lon" :zoom="15" interactive />
        </div>
    </Dialog>
</template>
