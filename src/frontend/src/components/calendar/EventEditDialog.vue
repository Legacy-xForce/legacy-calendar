<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import type { Event, CreateEventDto } from '../../types/Event';
import { useEventsStore } from '../../stores/events';
import { useUsersStore } from '../../stores/users';
import EventForm from './EventForm.vue';
import { storeToRefs } from 'pinia';

const props = defineProps<{
    visible: boolean;
    event: Event | null;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
    (e: 'saved'): void;
    (e: 'deleted', id: number): void;
}>();

const eventsStore = useEventsStore();
const usersStore = useUsersStore();
const toast = useToast();

const { users } = storeToRefs(usersStore);
const formRef = ref<InstanceType<typeof EventForm> | null>(null);

const handleSave = async (dto: CreateEventDto) => {
    if (!props.event) return;

    const success = await eventsStore.updateEvent(props.event.id, dto);
    if (success) {
        toast.add({ severity: 'success', summary: 'Changes saved', life: 2500 });
        emit('update:visible', false);
        emit('saved');
    } else {
        toast.add({
            severity: 'error',
            summary: 'Could not save changes',
            detail: eventsStore.error || 'Please try again.',
            life: 5000
        });
    }
};

const onDelete = () => {
    if (props.event) {
        emit('deleted', props.event.id);
    }
};

watch(
    () => props.visible,
    (visible) => {
        if (visible) {
            usersStore.fetchUsers();
        }
    }
);
</script>

<template>
    <Dialog
        :visible="visible"
        @update:visible="emit('update:visible', $event)"
        modal
        header="Edit event"
        :style="{ width: '34rem' }"
        dismissableMask
        :draggable="false"
        :pt="{ footer: { class: 'border-t! border-line! pt-3!' } }"
    >
        <EventForm v-if="event" ref="formRef" :event="event" :users="users" @save="handleSave" />

        <template #footer>
            <div class="flex w-full items-center gap-2">
                <Button
                    icon="pi pi-trash"
                    severity="danger"
                    text
                    aria-label="Delete event"
                    v-tooltip.top="'Delete event'"
                    :disabled="eventsStore.loading"
                    @click="onDelete"
                />
                <Button
                    label="Cancel"
                    severity="secondary"
                    text
                    class="ml-auto"
                    :disabled="eventsStore.loading"
                    @click="emit('update:visible', false)"
                />
                <Button
                    label="Save"
                    icon="pi pi-check"
                    class="flex-1 sm:flex-none"
                    :loading="eventsStore.loading"
                    @click="formRef?.submit()"
                />
            </div>
        </template>
    </Dialog>
</template>
