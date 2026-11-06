<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useFeaturesStore } from '../../stores/features';
import type { EventFeatureDraft } from '../../types/Event';
import ToggleSwitch from 'primevue/toggleswitch';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import EmojiPickerPanel from '../EmojiPickerPanel.vue';
import UserMultiSelect from '../UserMultiSelect.vue';

const MAX_ONE_TIME_FEATURES = 10;
const MAX_NAME_LENGTH = 32;

const drafts = defineModel<EventFeatureDraft[]>({ required: true });
const props = defineProps<{
    /** Registered people and magic-link guests (negative ids) who can be made eligible for a feature. */
    userOptions: Array<{ id: number; username: string; profilePictureUrl?: string | null }>;
}>();

const featuresStore = useFeaturesStore();

onMounted(() => {
    if (featuresStore.features.length === 0) void featuresStore.fetchFeatures();
});

const catalog = computed(() => featuresStore.features);
const draftOf = (featureId: number) => drafts.value.find((draft) => draft.featureId === featureId);
const oneTimeDrafts = computed(() => drafts.value.filter((draft) => draft.oneTime));
// The people picker stays open for as long as the host wants to limit a feature, even with nobody picked yet.
const restricting = ref(new Set<string>());
const isRestricted = (draft: EventFeatureDraft) => draft.eligibleUserIds.length > 0 || restricting.value.has(draft.key);

const toggleCatalog = (feature: { id: number; name: string; emoji: string }) => {
    const existing = draftOf(feature.id);
    if (existing) {
        drafts.value = drafts.value.filter((draft) => draft !== existing);
        return;
    }
    drafts.value = [
        ...drafts.value,
        {
            key: `feature-${feature.id}`,
            featureId: feature.id,
            name: feature.name,
            emoji: feature.emoji,
            oneTime: false,
            price: null,
            mandatory: false,
            eligibleUserIds: []
        }
    ];
};

const setRestricted = (draft: EventFeatureDraft, restricted: boolean) => {
    const next = new Set(restricting.value);
    if (restricted) next.add(draft.key);
    else {
        next.delete(draft.key);
        draft.eligibleUserIds = [];
    }
    restricting.value = next;
};

const removeDraft = (draft: EventFeatureDraft) => {
    drafts.value = drafts.value.filter((entry) => entry !== draft);
};

// ---- one-time feature entry
const newName = ref('');
const newEmoji = ref('');
const emojiPopover = ref();
const error = ref<string | null>(null);
const canAddMore = computed(() => oneTimeDrafts.value.length < MAX_ONE_TIME_FEATURES);

const onEmojiSelect = (picked: { i: string }) => {
    newEmoji.value = picked.i;
    emojiPopover.value.hide();
};

const addOneTime = () => {
    const name = newName.value.trim();
    if (!name || !newEmoji.value) {
        error.value = 'Give it a name and an emoji';
        return;
    }
    const taken = drafts.value.some(
        (draft) => draft.name.toLowerCase() === name.toLowerCase() || draft.emoji === newEmoji.value
    );
    if (taken) {
        error.value = 'This event already has a feature with that name or emoji';
        return;
    }
    error.value = null;
    drafts.value = [
        ...drafts.value,
        {
            key: `one-time-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            emoji: newEmoji.value,
            oneTime: true,
            price: null,
            mandatory: false,
            eligibleUserIds: []
        }
    ];
    newName.value = '';
    newEmoji.value = '';
};
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border">
            <template v-for="feature in catalog" :key="feature.id">
                <div class="flex flex-col px-4 py-2.5">
                    <label class="flex cursor-pointer items-center gap-3" :for="`feature-toggle-${feature.id}`">
                        <span
                            class="font-emoji bg-surface-900 flex size-9 shrink-0 items-center justify-center rounded-xl text-lg transition-opacity"
                            :class="draftOf(feature.id) ? '' : 'opacity-50'"
                        >
                            {{ feature.emoji }}
                        </span>
                        <span
                            class="text-body flex-1 font-medium"
                            :class="draftOf(feature.id) ? 'text-fg' : 'text-muted'"
                        >
                            {{ feature.name }}
                        </span>
                        <ToggleSwitch
                            :inputId="`feature-toggle-${feature.id}`"
                            :modelValue="!!draftOf(feature.id)"
                            @update:modelValue="toggleCatalog(feature)"
                        />
                    </label>
                    <template v-for="draft in drafts.filter((d) => d.featureId === feature.id)" :key="draft.key">
                        <div class="animate-rise-in flex flex-col gap-2.5 pt-2.5 pb-1 pl-12">
                            <div class="flex items-center gap-3">
                                <label :for="`price-${draft.key}`" class="text-meta text-muted flex-1">
                                    Total budget, split between everyone in
                                </label>
                                <InputNumber
                                    :inputId="`price-${draft.key}`"
                                    v-model="draft.price"
                                    mode="currency"
                                    currency="EUR"
                                    locale="de-DE"
                                    placeholder="0,00 €"
                                    :min="0"
                                    :max="10000"
                                    class="w-32 shrink-0"
                                    inputClass="w-full text-right tabular"
                                />
                            </div>
                            <label class="flex cursor-pointer items-center gap-3" :for="`required-${draft.key}`">
                                <span class="text-meta text-muted flex-1">Required for everyone who joins</span>
                                <ToggleSwitch :inputId="`required-${draft.key}`" v-model="draft.mandatory" />
                            </label>
                            <label class="flex cursor-pointer items-center gap-3" :for="`limit-${draft.key}`">
                                <span class="text-meta text-muted flex-1">Only for specific people</span>
                                <ToggleSwitch
                                    :inputId="`limit-${draft.key}`"
                                    :modelValue="isRestricted(draft)"
                                    @update:modelValue="setRestricted(draft, $event)"
                                />
                            </label>
                            <UserMultiSelect
                                v-if="isRestricted(draft)"
                                v-model="draft.eligibleUserIds"
                                :inputId="`eligible-${draft.key}`"
                                :options="props.userOptions"
                                placeholder="Who can pick this?"
                                filter
                                bulkActions
                            />
                        </div>
                    </template>
                </div>
            </template>
        </div>

        <!-- One-time features: exist on this event only -->
        <div class="flex flex-col gap-2">
            <h4 class="text-meta text-muted m-0 font-medium">Just for this event</h4>
            <div
                v-if="oneTimeDrafts.length"
                class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border"
            >
                <div v-for="draft in oneTimeDrafts" :key="draft.key" class="flex flex-col px-4 py-2.5">
                    <div class="flex items-center gap-3">
                        <span
                            class="font-emoji bg-surface-900 flex size-9 shrink-0 items-center justify-center rounded-xl text-lg"
                        >
                            {{ draft.emoji }}
                        </span>
                        <span class="text-body text-fg flex-1 font-medium">{{ draft.name }}</span>
                        <Button
                            type="button"
                            icon="pi pi-times"
                            text
                            rounded
                            severity="secondary"
                            :aria-label="`Remove ${draft.name}`"
                            @click="removeDraft(draft)"
                        />
                    </div>
                    <div class="animate-rise-in flex flex-col gap-2.5 pt-2.5 pb-1 pl-12">
                        <div class="flex items-center gap-3">
                            <label :for="`price-${draft.key}`" class="text-meta text-muted flex-1">
                                Total budget, split between everyone in
                            </label>
                            <InputNumber
                                :inputId="`price-${draft.key}`"
                                v-model="draft.price"
                                mode="currency"
                                currency="EUR"
                                locale="de-DE"
                                placeholder="0,00 €"
                                :min="0"
                                :max="10000"
                                class="w-32 shrink-0"
                                inputClass="w-full text-right tabular"
                            />
                        </div>
                        <label class="flex cursor-pointer items-center gap-3" :for="`required-${draft.key}`">
                            <span class="text-meta text-muted flex-1">Required for everyone who joins</span>
                            <ToggleSwitch :inputId="`required-${draft.key}`" v-model="draft.mandatory" />
                        </label>
                        <label class="flex cursor-pointer items-center gap-3" :for="`limit-${draft.key}`">
                            <span class="text-meta text-muted flex-1">Only for specific people</span>
                            <ToggleSwitch
                                :inputId="`limit-${draft.key}`"
                                :modelValue="isRestricted(draft)"
                                @update:modelValue="setRestricted(draft, $event)"
                            />
                        </label>
                        <UserMultiSelect
                            v-if="isRestricted(draft)"
                            v-model="draft.eligibleUserIds"
                            :inputId="`eligible-${draft.key}`"
                            :options="props.userOptions"
                            placeholder="Who can pick this?"
                            filter
                            bulkActions
                        />
                    </div>
                </div>
            </div>

            <div v-if="canAddMore" class="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outlined"
                    severity="secondary"
                    class="font-emoji size-10! shrink-0 p-0! text-lg!"
                    :label="newEmoji || '🙂'"
                    aria-label="Pick an emoji"
                    @click="emojiPopover.toggle($event)"
                />
                <InputText
                    v-model="newName"
                    :maxlength="MAX_NAME_LENGTH"
                    placeholder="Add a one-time feature"
                    class="min-w-0 flex-1"
                    @keydown.enter.prevent="addOneTime"
                />
                <Button type="button" icon="pi pi-plus" aria-label="Add feature" @click="addOneTime" />
            </div>
            <p v-else class="text-meta text-subtle m-0">That's the maximum of {{ MAX_ONE_TIME_FEATURES }}.</p>
            <p v-if="error" class="text-meta m-0 text-rose-300" role="alert">{{ error }}</p>
        </div>

        <Popover
            ref="emojiPopover"
            :pt="{
                root: { class: 'rounded-2xl! overflow-hidden!' },
                content: { class: 'p-0!' }
            }"
        >
            <EmojiPickerPanel @select="onEmojiSelect" />
        </Popover>
    </div>
</template>
