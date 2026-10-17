<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { storeToRefs } from 'pinia';
import type { CreateEventDto } from '../../types/Event';
import { useSessionStore } from '../../stores/session';
import { useUsersStore } from '../../stores/users';
import EventForm from './EventForm.vue';

const props = defineProps<{
    visible: boolean;
    initialDate: Date;
    loading?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
    (e: 'save', event: CreateEventDto): void;
}>();

const sessionStore = useSessionStore();
const usersStore = useUsersStore();
const { users } = storeToRefs(usersStore);

const formRef = ref<InstanceType<typeof EventForm> | null>(null);
// Remount the form on every open so it starts clean, while staying visible during the close animation
const formKey = ref(0);

watch(
    () => props.visible,
    (visible) => {
        if (!visible) return;
        formKey.value += 1;
        void usersStore.fetchUsers();
    }
);
</script>

<template>
    <Dialog
        :visible="visible"
        @update:visible="emit('update:visible', $event)"
        modal
        header="New event"
        :style="{ width: '34rem' }"
        dismissableMask
        :draggable="false"
        :pt="{ footer: { class: 'border-t! border-line! pt-3!' } }"
    >
        <EventForm
            :key="formKey"
            ref="formRef"
            :initial-date="initialDate"
            :users="users"
            :exclude-user-id="sessionStore.currentUser?.id"
            @save="emit('save', $event)"
        />

        <template #footer>
            <div class="flex w-full gap-2 sm:justify-end">
                <Button
                    label="Cancel"
                    severity="secondary"
                    text
                    class="flex-1 sm:flex-none"
                    @click="emit('update:visible', false)"
                />
                <Button
                    label="Create event"
                    icon="pi pi-check"
                    :loading="loading"
                    class="flex-1 sm:flex-none"
                    @click="formRef?.submit()"
                />
            </div>
        </template>
    </Dialog>
</template>
