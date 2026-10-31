<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { useFeaturesStore } from '../stores/features';
import type { Feature } from '../types/Event';

const toast = useToast();
const confirm = useConfirm();
const store = useFeaturesStore();

const MAX_NAME_LENGTH = 32;

const editingId = ref<number | null>(null);
const name = ref('');
const emoji = ref('');
const saving = ref(false);
const formError = ref<string | null>(null);

const isEditing = computed(() => editingId.value !== null);
const canSave = computed(() => name.value.trim().length > 0 && emoji.value.trim().length > 0 && !saving.value);

// Same rule the server applies, so duplicates are flagged before saving
const duplicateOf = computed(() => {
    const key = name.value.trim().toLowerCase();
    const symbol = emoji.value.trim();
    return store.features.find(
        (feature) =>
            feature.id !== editingId.value &&
            ((key !== '' && feature.name.toLowerCase() === key) || (symbol !== '' && feature.emoji === symbol))
    );
});

const duplicateMessage = computed(() => {
    const other = duplicateOf.value;
    if (!other) return null;
    return other.name.toLowerCase() === name.value.trim().toLowerCase()
        ? `A feature named "${other.name}" already exists.`
        : `${other.emoji} is already used by "${other.name}".`;
});

const reset = () => {
    editingId.value = null;
    name.value = '';
    emoji.value = '';
    formError.value = null;
};

const startEdit = (feature: Feature) => {
    editingId.value = feature.id;
    name.value = feature.name;
    emoji.value = feature.emoji;
    formError.value = null;
};

const save = async () => {
    if (!canSave.value) return;
    if (duplicateMessage.value) {
        formError.value = duplicateMessage.value;
        return;
    }

    saving.value = true;
    formError.value = null;
    try {
        const dto = { name: name.value.trim(), emoji: emoji.value.trim() };
        if (editingId.value === null) await store.createFeature(dto);
        else await store.updateFeature(editingId.value, dto);
        toast.add({
            severity: 'success',
            summary: isEditing.value ? 'Feature updated' : 'Feature added',
            life: 3000
        });
        reset();
    } catch (err: any) {
        const message = err.response?.data?.message;
        formError.value = Array.isArray(message) ? message.join(', ') : message || 'Could not save the feature.';
    } finally {
        saving.value = false;
    }
};

const remove = async (feature: Feature) => {
    try {
        await store.deleteFeature(feature.id);
        if (editingId.value === feature.id) reset();
        toast.add({ severity: 'success', summary: `${feature.name} deleted`, life: 3000 });
    } catch (err: any) {
        toast.add({
            severity: 'error',
            summary: "Couldn't delete feature",
            detail: err.response?.data?.message || 'Please try again.',
            life: 3000
        });
    }
};

const confirmDelete = (feature: Feature) => {
    confirm.require({
        message: `${feature.emoji} ${feature.name} will be removed from every event and from everyone who opted in. This can't be undone.`,
        header: `Delete ${feature.name}?`,
        icon: 'pi pi-exclamation-triangle',
        rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
        acceptProps: { label: 'Delete', severity: 'danger' },
        accept: () => remove(feature)
    });
};

onMounted(() => {
    void store.fetchFeatures();
});
</script>

<template>
    <section class="flex flex-col gap-3" aria-labelledby="features-heading">
        <div>
            <h2 id="features-heading" class="text-headline m-0">Features</h2>
            <p class="text-meta text-muted m-0 mt-1">
                Extras hosts can offer on an event. Guests opt in when they join.
            </p>
        </div>

        <div
            v-if="store.features.length"
            class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border"
        >
            <div v-for="feature in store.features" :key="feature.id" class="flex items-center gap-3 px-4 py-2.5">
                <span
                    class="font-emoji bg-surface-900 flex size-9 shrink-0 items-center justify-center rounded-xl text-lg"
                >
                    {{ feature.emoji }}
                </span>
                <p class="text-body text-fg m-0 min-w-0 flex-1 truncate font-medium">{{ feature.name }}</p>
                <div class="flex shrink-0 items-center">
                    <Button
                        icon="pi pi-pencil"
                        text
                        rounded
                        severity="secondary"
                        :aria-label="`Edit ${feature.name}`"
                        @click="startEdit(feature)"
                    />
                    <Button
                        icon="pi pi-trash"
                        text
                        rounded
                        severity="danger"
                        :aria-label="`Delete ${feature.name}`"
                        @click="confirmDelete(feature)"
                    />
                </div>
            </div>
        </div>
        <p v-else-if="!store.loading" class="text-body text-muted m-0">No features yet.</p>

        <form class="flex flex-col gap-2" @submit.prevent="save">
            <h3 class="eyebrow m-0">{{ isEditing ? 'Edit feature' : 'Add a feature' }}</h3>
            <div class="flex items-start gap-2">
                <InputText
                    v-model="emoji"
                    placeholder="🎤"
                    aria-label="Emoji"
                    class="font-emoji w-16 text-center"
                    :maxlength="16"
                />
                <InputText
                    v-model="name"
                    placeholder="Name, e.g. Karaoke"
                    aria-label="Feature name"
                    :maxlength="MAX_NAME_LENGTH"
                    class="min-w-0 flex-1"
                />
                <Button
                    type="submit"
                    :label="isEditing ? 'Save' : 'Add'"
                    :loading="saving"
                    :disabled="!canSave || !!duplicateMessage"
                />
                <Button v-if="isEditing" type="button" label="Cancel" text severity="secondary" @click="reset" />
            </div>
            <p v-if="duplicateMessage || formError" class="text-meta m-0 text-rose-300" role="alert">
                {{ formError ?? duplicateMessage }}
            </p>
        </form>
    </section>
</template>
