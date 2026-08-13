<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import api from '../../services/API';

const props = defineProps<{
    visible: boolean;
    eventId: number | null;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
}>();

const toast = useToast();
const loading = ref(false);
const error = ref<string | null>(null);
const inviteUrl = ref<string | null>(null);

const generateInvite = async () => {
    if (!props.eventId) return;

    loading.value = true;
    error.value = null;
    inviteUrl.value = null;
    try {
        const response = await api.createGuestInvite(props.eventId);
        inviteUrl.value = response.data.url;
    } catch (err: any) {
        error.value = err.response?.data?.message || 'Failed to generate the guest invite link';
    } finally {
        loading.value = false;
    }
};

const copyLink = () => {
    if (!inviteUrl.value) return;
    navigator.clipboard.writeText(inviteUrl.value).then(() => {
        toast.add({
            severity: 'success',
            summary: 'Link Copied',
            detail: 'Invite link copied to clipboard',
            life: 3000
        });
    });
};

watch(
    () => props.visible,
    (visible) => {
        if (visible) void generateInvite();
    }
);
</script>

<template>
    <Dialog
        :visible="visible"
        @update:visible="emit('update:visible', $event)"
        modal
        header="Invite a Guest"
        :style="{ width: '480px' }"
        :breakpoints="{ '640px': '95vw' }"
        dismissableMask
        :draggable="false"
    >
        <div class="flex flex-col gap-4 py-2">
            <p class="text-surface-500 m-0 text-sm">
                Share this link with someone who doesn't have a Legacy Calendar account. They'll be able to set their
                name and preferences, and update them any time before the participation deadline.
            </p>

            <div v-if="loading" class="flex justify-center py-6">
                <ProgressSpinner style="width: 40px; height: 40px" />
            </div>

            <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>

            <div v-else-if="inviteUrl" class="flex items-center gap-2">
                <InputText
                    :modelValue="inviteUrl"
                    readonly
                    class="w-full rounded-xl!"
                    @focus="($event.target as HTMLInputElement).select()"
                />
                <Button icon="pi pi-copy" severity="secondary" @click="copyLink" v-tooltip.top="'Copy Link'" />
            </div>
        </div>

        <template #footer>
            <div class="flex w-full justify-between gap-2">
                <Button
                    label="Generate New Link"
                    icon="pi pi-refresh"
                    severity="secondary"
                    text
                    :disabled="loading"
                    @click="generateInvite"
                    class="rounded-xl!"
                />
                <Button label="Close" severity="secondary" @click="emit('update:visible', false)" class="rounded-xl!" />
            </div>
        </template>
    </Dialog>
</template>
