<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
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
import GuestInviteDialog from './GuestInviteDialog.vue';
import { useUserGroupsStore } from '../../stores/userGroups';
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
const toast = useToast();
const userGroupsStore = useUserGroupsStore();
const { groups: userGroups } = storeToRefs(userGroupsStore);

const title = ref('');
const description = ref('');
const location = ref('');
const eventVisibility = ref<EventVisibility>('open');
const eventColor = ref(DEFAULT_COLOR);
const start = ref<Date | null>(null);
const end = ref<Date | null>(null);
const deadline = ref<Date | null>(null);
const selectedParticipants = ref<number[]>([]);
const selectedCoHosts = ref<number[]>([]);
const showGuestInvite = ref(false);
const selectedFeatures = ref<EventFeature[]>([]);
const featurePrices = ref<Record<EventFeature, number | null>>(createNullFeatureRecord());
const showEnd = ref(false);
const showDeadline = ref(false);
const submitted = ref(false);

const bounds = getEventStartDateBounds();

// Guests are not in the users list, so fall back to the event's own participant data for them
const people = computed(() => {
    const byId = new Map<number, { id: number; username: string; profilePictureUrl?: string | null }>(
        props.users.map((user) => [user.id, user])
    );
    for (const participant of props.event?.participants ?? []) {
        if (!byId.has(participant.id)) byId.set(participant.id, participant);
    }
    return byId;
});
const userMap = people;
const hostId = computed(() => props.event?.hostId ?? props.event?.host?.id ?? props.excludeUserId);
const participantOptions = computed(() => [...people.value.values()].filter((user) => user.id !== props.excludeUserId));

// Co-hosts must be invited, and can edit the event like the host
const coHostOptions = computed(() =>
    selectedParticipants.value
        .filter((id) => id !== hostId.value)
        .map((id) => people.value.get(id))
        .filter((person): person is NonNullable<typeof person> => !!person)
);

watch(selectedParticipants, (next, previous) => {
    const removed = (previous ?? []).filter((id) => !next.includes(id));
    if (removed.length) selectedCoHosts.value = selectedCoHosts.value.filter((id) => !removed.includes(id));
});

// Invitation groups: add a saved list of people in one tap, or save the current selection as one
const applyGroup = (memberIds: number[]) => {
    const allowed = new Set(participantOptions.value.map((user) => user.id));
    selectedParticipants.value = [...new Set([...selectedParticipants.value, ...memberIds])].filter((id) =>
        allowed.has(id)
    );
};

const savingGroup = ref(false);
const groupNameDraft = ref<string | null>(null);

const saveSelectionAsGroup = async () => {
    const name = groupNameDraft.value?.trim();
    if (!name || selectedParticipants.value.length === 0) return;
    savingGroup.value = true;
    try {
        await userGroupsStore.createGroup({ name, memberIds: [...selectedParticipants.value] });
        toast.add({
            severity: 'success',
            summary: `Saved "${name}"`,
            detail: 'Find it next time you invite people.',
            life: 2500
        });
        groupNameDraft.value = null;
    } catch {
        toast.add({ severity: 'error', summary: "Couldn't save the group", detail: 'Please try again.', life: 3000 });
    } finally {
        savingGroup.value = false;
    }
};

onMounted(() => {
    void userGroupsStore.fetchGroups();
});

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
        selectedCoHosts.value = event.coHosts?.map((coHost) => coHost.id) ?? [];
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
        selectedCoHosts.value = [];
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
    else if (!isEdit.value && end.value && !isEventStartTimeWithinAllowedRange(end.value)) {
        result.end = 'End must be between today and one year from now.';
    }
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
        participants: isEdit.value || selectedParticipants.value.length > 0 ? selectedParticipants.value : undefined,
        coHosts: isEdit.value || selectedCoHosts.value.length > 0 ? selectedCoHosts.value : undefined,
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

                <!-- Invitation groups -->
                <div
                    v-if="userGroups.length || selectedParticipants.length"
                    class="flex flex-wrap items-center gap-1.5 pt-1"
                >
                    <button
                        v-for="group in userGroups"
                        :key="group.id"
                        type="button"
                        class="pressable border-line text-meta text-fg hover:bg-surface-900 flex h-8 items-center gap-1.5 rounded-full border px-3 font-medium"
                        :aria-label="`Invite everyone in ${group.name}`"
                        @click="applyGroup(group.memberIds)"
                    >
                        <i class="pi pi-users text-[0.6875rem]"></i>
                        {{ group.name }}
                        <span class="text-subtle tabular">{{ group.memberIds.length }}</span>
                    </button>
                    <button
                        v-if="selectedParticipants.length && groupNameDraft === null"
                        type="button"
                        class="pressable text-meta text-muted hover:text-fg flex h-8 items-center gap-1.5 rounded-full px-2 font-medium"
                        @click="groupNameDraft = ''"
                    >
                        <i class="pi pi-bookmark text-[0.6875rem]"></i>
                        Save as group
                    </button>
                </div>
                <div v-if="groupNameDraft !== null" class="animate-rise-in flex items-center gap-2 pt-1">
                    <InputText
                        v-model="groupNameDraft"
                        placeholder="Group name, e.g. Weekend crew"
                        aria-label="Group name"
                        autofocus
                        fluid
                        @keydown.enter.prevent="saveSelectionAsGroup"
                        @keydown.esc="groupNameDraft = null"
                    />
                    <Button
                        icon="pi pi-check"
                        aria-label="Save group"
                        :loading="savingGroup"
                        :disabled="!groupNameDraft.trim()"
                        @click="saveSelectionAsGroup"
                    />
                    <Button
                        icon="pi pi-times"
                        severity="secondary"
                        text
                        aria-label="Cancel"
                        @click="groupNameDraft = null"
                    />
                </div>

                <button
                    v-if="isEdit && event"
                    type="button"
                    class="pressable text-meta text-accent mt-1 flex items-center gap-1.5 self-start font-medium hover:underline"
                    @click="showGuestInvite = true"
                >
                    <i class="pi pi-link text-[0.6875rem]"></i>
                    Invite someone without an account
                </button>
            </div>

            <div v-if="coHostOptions.length || selectedCoHosts.length" class="flex flex-col gap-1.5">
                <label for="event-cohosts" class="text-meta text-muted font-medium">
                    Co-hosts
                    <span v-if="selectedCoHosts.length" class="tabular">· {{ selectedCoHosts.length }}</span>
                </label>
                <MultiSelect
                    inputId="event-cohosts"
                    v-model="selectedCoHosts"
                    :options="coHostOptions"
                    optionLabel="username"
                    optionValue="id"
                    placeholder="Choose from who you invited"
                    display="chip"
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
                <small class="text-meta text-subtle">Co-hosts can edit the event and manage people, like you.</small>
            </div>
        </section>

        <GuestInviteDialog v-if="isEdit && event" v-model:visible="showGuestInvite" :eventId="event.id" />

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
