<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import MultiSelect from 'primevue/multiselect';
import SelectButton from 'primevue/selectbutton';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import type { CreateEventDto, Event, EventFeature } from '../../types/Event';
import type { User } from '../../types/User';
import { VISIBILITY_OPTIONS, type EventVisibility } from '../../constants/visibility';
import { DEFAULT_COLOR } from '../../constants/colors';
import UserAvatar from '../UserAvatar.vue';
import DateTimeField from '../DateTimeField.vue';
import FeatureBudgetForm from './FeatureBudgetForm.vue';
import EventColorSelector from './EventColorSelector.vue';
import {
    createNullFeatureRecord,
    featureFlagsFromSelection,
    featurePricesFromEvent,
    getEventStartDateBounds,
    isEventStartTimeWithinAllowedRange,
    selectedFeaturesFromEvent
} from '../../utils/event';

/**
 * Shared form for creating and editing events. The parent owns the dialog and buttons and calls
 * `submit()`; a valid form emits `save` with the DTO.
 */
const props = defineProps<{
    event?: Event | null;
    initialDate?: Date;
    users: User[];
    /** Hidden from the participant picker (the creator invites everyone else). */
    excludeUserId?: number;
}>();

const emit = defineEmits<{
    (e: 'save', dto: CreateEventDto): void;
}>();

const isEdit = computed(() => !!props.event);

const title = ref('');
const description = ref('');
const location = ref('');
const eventVisibility = ref<EventVisibility>('open');
const eventColor = ref(DEFAULT_COLOR);
const start = ref<Date | null>(null);
const end = ref<Date | null>(null);
const deadline = ref<Date | null>(null);
const selectedParticipants = ref<number[]>([]);
const selectedFeatures = ref<EventFeature[]>([]);
const featurePrices = ref<Record<EventFeature, number | null>>(createNullFeatureRecord());
const showEnd = ref(false);
const showDeadline = ref(false);
const submitted = ref(false);

const bounds = getEventStartDateBounds();
const userMap = computed(() => new Map(props.users.map((u) => [u.id, u])));
const participantOptions = computed(() => props.users.filter((user) => user.id !== props.excludeUserId));

const initialize = () => {
    submitted.value = false;
    const event = props.event;
    if (event) {
        title.value = event.title;
        description.value = event.description || '';
        location.value = event.location || '';
        eventColor.value = event.color || DEFAULT_COLOR;
        eventVisibility.value = event.isPrivate ? 'private' : event.isOpen ? 'open' : 'standard';
        start.value = new Date(event.startTime);
        end.value = event.endTime ? new Date(event.endTime) : null;
        deadline.value = event.participationDeadline ? new Date(event.participationDeadline) : null;
        selectedParticipants.value = event.participants?.map((participant) => participant.id) || [];
        selectedFeatures.value = selectedFeaturesFromEvent(event);
        featurePrices.value = featurePricesFromEvent(event);
    } else {
        title.value = '';
        description.value = '';
        location.value = '';
        eventColor.value = DEFAULT_COLOR;
        eventVisibility.value = 'open';
        start.value = props.initialDate ? new Date(props.initialDate) : null;
        end.value = null;
        deadline.value = null;
        selectedParticipants.value = [];
        selectedFeatures.value = [];
        featurePrices.value = createNullFeatureRecord();
    }
    showEnd.value = !!end.value;
    showDeadline.value = !!deadline.value;
};

watch(() => [props.event, props.initialDate], initialize, { immediate: true });

const addEnd = () => {
    showEnd.value = true;
    if (!end.value && start.value) end.value = new Date(start.value.getTime() + 3 * 60 * 60 * 1000);
};

const addDeadline = () => {
    showDeadline.value = true;
    if (!deadline.value && start.value) {
        const value = new Date(start.value.getTime() - 24 * 60 * 60 * 1000);
        deadline.value = value > new Date() ? value : new Date(start.value.getTime() - 60 * 60 * 1000);
    }
};

const errors = computed(() => {
    const result: Partial<Record<'title' | 'start' | 'end' | 'deadline', string>> = {};
    if (!title.value.trim()) result.title = 'Give it a name.';
    if (!start.value) result.start = 'Pick when it starts.';
    else if (!isEdit.value && !isEventStartTimeWithinAllowedRange(start.value)) {
        result.start = 'Start must be between today and one year from now.';
    }
    if (start.value && end.value && end.value <= start.value) result.end = 'End must be after the start.';
    if (start.value && deadline.value && deadline.value > start.value) {
        result.deadline = 'The reply deadline must be before the start.';
    }
    return result;
});

const isValid = computed(() => Object.keys(errors.value).length === 0);
const showError = (field: keyof typeof errors.value) => (submitted.value ? errors.value[field] : undefined);

const visibilityHint = computed(
    () => VISIBILITY_OPTIONS.find((option) => option.value === eventVisibility.value)?.description
);

const submit = () => {
    submitted.value = true;
    if (!isValid.value || !start.value) return false;

    emit('save', {
        title: title.value.trim(),
        description: description.value || undefined,
        location: location.value || undefined,
        startTime: start.value.toISOString(),
        endTime: showEnd.value && end.value ? end.value.toISOString() : undefined,
        participants: isEdit.value
            ? selectedParticipants.value
            : selectedParticipants.value.length > 0
              ? selectedParticipants.value
              : undefined,
        isOpen: eventVisibility.value === 'open',
        isPrivate: eventVisibility.value === 'private',
        color: eventColor.value,
        ...featureFlagsFromSelection(selectedFeatures.value),
        foodPrice: featurePrices.value.FOOD ?? undefined,
        weedPrice: featurePrices.value.WEED ?? undefined,
        sleepPrice: featurePrices.value.SLEEP ?? undefined,
        alcoholPrice: featurePrices.value.ALCOHOL ?? undefined,
        beerPrice: featurePrices.value.BEER ?? undefined,
        participationDeadline: showDeadline.value && deadline.value ? deadline.value.toISOString() : undefined
    });
    return true;
};

defineExpose({ submit });
</script>

<template>
    <form class="flex flex-col gap-7" novalidate @submit.prevent="submit">
        <!-- Details -->
        <section class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
                <label for="event-title" class="sr-only">Title</label>
                <InputText
                    id="event-title"
                    v-model="title"
                    placeholder="What's happening?"
                    :autofocus="!isEdit"
                    :invalid="!!showError('title')"
                    class="font-display h-13 text-[1.25rem]! font-semibold"
                    fluid
                    enterkeyhint="next"
                />
                <small v-if="showError('title')" class="text-meta text-rose-300">{{ showError('title') }}</small>
            </div>

            <EventColorSelector v-model="eventColor" />

            <div class="flex flex-col gap-1.5">
                <label for="event-location" class="text-meta text-muted font-medium">Where</label>
                <IconField>
                    <InputIcon class="pi pi-map-marker" />
                    <InputText id="event-location" v-model="location" placeholder="Address, venue or link" fluid />
                </IconField>
            </div>

            <div class="flex flex-col gap-1.5">
                <label for="event-desc" class="text-meta text-muted font-medium">Details</label>
                <Textarea
                    id="event-desc"
                    v-model="description"
                    rows="3"
                    autoResize
                    placeholder="What should people know or bring?"
                    fluid
                />
            </div>
        </section>

        <!-- When -->
        <section class="flex flex-col gap-4">
            <h3 class="eyebrow m-0">When</h3>
            <div class="flex flex-col gap-1.5">
                <label for="event-start" class="text-meta text-muted font-medium">Starts</label>
                <DateTimeField
                    id="event-start"
                    v-model="start"
                    :min="isEdit ? undefined : bounds.minDate"
                    :max="isEdit ? undefined : bounds.maxDate"
                    :invalid="!!showError('start')"
                />
                <small v-if="showError('start')" class="text-meta text-rose-300">{{ showError('start') }}</small>
            </div>

            <div v-if="showEnd" class="flex flex-col gap-1.5">
                <label for="event-end" class="text-meta text-muted font-medium">Ends</label>
                <DateTimeField
                    id="event-end"
                    v-model="end"
                    :min="start ?? undefined"
                    :invalid="!!showError('end')"
                    clearable
                    @update:model-value="(value) => !value && (showEnd = false)"
                />
                <small v-if="showError('end')" class="text-meta text-rose-300">{{ showError('end') }}</small>
            </div>

            <div v-if="showDeadline" class="flex flex-col gap-1.5">
                <label for="event-deadline" class="text-meta text-muted font-medium">Reply by</label>
                <DateTimeField
                    id="event-deadline"
                    v-model="deadline"
                    :max="start ?? undefined"
                    :invalid="!!showError('deadline')"
                    clearable
                    @update:model-value="(value) => !value && (showDeadline = false)"
                />
                <small v-if="showError('deadline')" class="text-meta text-rose-300">{{ showError('deadline') }}</small>
                <small v-else class="text-meta text-subtle"
                    >After this, people can't join or change their choices.</small
                >
            </div>

            <div v-if="!showEnd || !showDeadline" class="flex flex-wrap gap-2">
                <button
                    v-if="!showEnd"
                    type="button"
                    class="pressable border-line text-meta text-fg hover:bg-surface-900 flex h-9 items-center gap-2 rounded-full border px-3.5 font-medium"
                    @click="addEnd"
                >
                    <i class="pi pi-plus text-[0.625rem]"></i>
                    End time
                </button>
                <button
                    v-if="!showDeadline"
                    type="button"
                    class="pressable border-line text-meta text-fg hover:bg-surface-900 flex h-9 items-center gap-2 rounded-full border px-3.5 font-medium"
                    @click="addDeadline"
                >
                    <i class="pi pi-plus text-[0.625rem]"></i>
                    Reply deadline
                </button>
            </div>
        </section>

        <!-- Who -->
        <section class="flex flex-col gap-4">
            <h3 class="eyebrow m-0">Who</h3>
            <div class="flex flex-col gap-1.5">
                <SelectButton
                    v-model="eventVisibility"
                    :options="VISIBILITY_OPTIONS"
                    optionLabel="label"
                    optionValue="value"
                    :allowEmpty="false"
                    fluid
                    aria-label="Visibility"
                >
                    <template #option="slotProps">
                        <span class="flex items-center gap-1.5">
                            <span class="max-[379px]:hidden"
                                ><i :class="slotProps.option.icon" class="text-xs"></i
                            ></span>
                            <span class="text-meta font-medium whitespace-nowrap">{{ slotProps.option.label }}</span>
                        </span>
                    </template>
                </SelectButton>
                <small class="text-meta text-subtle">{{ visibilityHint }}</small>
            </div>

            <div class="flex flex-col gap-1.5">
                <label for="event-participants" class="text-meta text-muted font-medium">
                    Invite
                    <span v-if="selectedParticipants.length" class="tabular">· {{ selectedParticipants.length }}</span>
                </label>
                <MultiSelect
                    inputId="event-participants"
                    v-model="selectedParticipants"
                    :options="participantOptions"
                    optionLabel="username"
                    optionValue="id"
                    placeholder="Choose friends"
                    display="chip"
                    filter
                    filterPlaceholder="Search"
                    :showToggleAll="false"
                    fluid
                >
                    <template #option="slotProps">
                        <div class="flex items-center gap-2.5">
                            <UserAvatar
                                :profilePictureUrl="slotProps.option.profilePictureUrl"
                                :username="slotProps.option.username"
                                class="size-7! text-[0.6875rem]!"
                            />
                            <span>{{ slotProps.option.username }}</span>
                        </div>
                    </template>
                    <template #chip="slotProps">
                        <span
                            class="bg-surface-800 text-meta text-fg flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5"
                        >
                            <UserAvatar
                                :profilePictureUrl="userMap.get(slotProps.value)?.profilePictureUrl"
                                :username="userMap.get(slotProps.value)?.username"
                                class="size-5! text-[0.5625rem]!"
                            />
                            {{ userMap.get(slotProps.value)?.username }}
                        </span>
                    </template>
                </MultiSelect>
            </div>
        </section>

        <!-- Extras -->
        <section class="flex flex-col gap-3">
            <div>
                <h3 class="eyebrow m-0">Extras</h3>
                <p class="text-meta text-subtle m-0 mt-1">People pick what they're in for when they join.</p>
            </div>
            <FeatureBudgetForm v-model:selectedFeatures="selectedFeatures" v-model:featurePrices="featurePrices" />
        </section>
    </form>
</template>
