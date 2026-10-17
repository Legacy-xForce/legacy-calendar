<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Skeleton from 'primevue/skeleton';
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
        error.value = err.response?.data?.message || "Couldn't create an invite link.";
    } finally {
        loading.value = false;
    }
};

const copyLink = () => {
    if (!inviteUrl.value) return;
    navigator.clipboard.writeText(inviteUrl.value).then(() => {
        toast.add({ severity: 'success', summary: 'Invite link copied', life: 2500 });
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
        header="Invite a guest"
        :style="{ width: '28rem' }"
        dismissableMask
        :draggable="false"
    >
        <div class="flex flex-col gap-4">
            <p class="text-body text-muted m-0">
                For someone without a Legacy account. With this link they can add their name and choices, and change
                them until the reply deadline.
            </p>

            <Skeleton v-if="loading" height="2.75rem" border-radius="0.75rem" />

            <p v-else-if="error" class="text-meta m-0 rounded-xl bg-rose-400/10 px-3 py-2 text-rose-200" role="alert">
                {{ error }}
            </p>

            <div v-else-if="inviteUrl" class="flex items-center gap-2">
                <InputText
                    :modelValue="inviteUrl"
                    readonly
                    aria-label="Invite link"
                    class="text-meta! tabular"
                    fluid
                    @focus="($event.target as HTMLInputElement).select()"
                />
                <Button label="Copy" icon="pi pi-copy" @click="copyLink" />
            </div>
        </div>

        <template #footer>
            <div class="flex w-full items-center gap-2">
                <Button
                    label="New link"
                    icon="pi pi-refresh"
                    severity="secondary"
                    text
                    :disabled="loading"
                    @click="generateInvite"
                />
                <Button label="Done" severity="secondary" class="ml-auto" @click="emit('update:visible', false)" />
            </div>
        </template>
    </Dialog>
</template>
