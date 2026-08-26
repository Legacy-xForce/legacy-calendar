<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import DatePicker from 'primevue/datepicker';
import MultiSelect from 'primevue/multiselect';
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import type { CreateEventDto, EventFeature } from '../../types/Event';
import { useSessionStore } from '../../stores/session';
import { VISIBILITY_OPTIONS } from '../../constants/visibility';
import { useUsersStore } from '../../stores/users';
import { storeToRefs } from 'pinia';
import UserAvatar from '../UserAvatar.vue';
import FeatureBudgetForm from './FeatureBudgetForm.vue';
import EventColorSelector from './EventColorSelector.vue';
import { DEFAULT_COLOR } from '../../constants/colors';
import {
    combineDateAndTime,
    createNullFeatureRecord,
    featureFlagsFromSelection,
    getEventStartDateBounds,
    isEventStartTimeWithinAllowedRange
} from '../../utils/event';

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
const { fetchUsers } = usersStore;

const userMap = computed(() => new Map(users.value.map((u) => [u.id, u])));

const title = ref('');
const description = ref('');
const location = ref('');
const eventVisibility = ref('open');
const selectedFeatures = ref<EventFeature[]>([]);
const featurePrices = ref<Record<EventFeature, number | null>>(createNullFeatureRecord());

const eventColor = ref(DEFAULT_COLOR);

const startDateOnly = ref<Date | null>(null);
const startTimeOnly = ref<Date | null>(null);

const endDateOnly = ref<Date | null>(null);
const endTimeOnly = ref<Date | null>(null);

const deadlineDateOnly = ref<Date | null>(null);
const deadlineTimeOnly = ref<Date | null>(null);

const selectedParticipants = ref<number[]>([]);
const selectedCoHosts = ref<number[]>([]);
const saveAttempted = ref(false);
const startDateBounds = getEventStartDateBounds();

const availableParticipants = computed(() => users.value.filter((user) => user.id !== sessionStore.currentUser?.id));

const coHostOptions = computed(() =>
    users.value.filter(
        (user) => selectedParticipants.value.includes(user.id) && user.id !== sessionStore.currentUser?.id
    )
);

watch(selectedParticipants, () => {
    selectedCoHosts.value = selectedCoHosts.value.filter((id) => selectedParticipants.value.includes(id));
});

const titleError = computed(() => {
    if (!title.value) return 'Title is required.';
    return null;
});

const startError = computed(() => {
    if (!startDateOnly.value || !startTimeOnly.value) return 'Start date and time are required.';

    const start = combineDateAndTime(startDateOnly.value, startTimeOnly.value);
    if (!isEventStartTimeWithinAllowedRange(start)) {
        return 'Start date must be today or within 1 year from today.';
    }

    return null;
});

const endError = computed(() => {
    if (endDateOnly.value && endTimeOnly.value) {
        const end = combineDateAndTime(endDateOnly.value, endTimeOnly.value);
        if (!isEventStartTimeWithinAllowedRange(end)) {
            return 'End date must be today or within 1 year from today.';
        }
    }

    return null;
});

const deadlineError = computed(() => {
    if (deadlineDateOnly.value && deadlineTimeOnly.value) {
        const deadline = combineDateAndTime(deadlineDateOnly.value, deadlineTimeOnly.value);
        const start = combineDateAndTime(startDateOnly.value!, startTimeOnly.value!);
        if (deadline > start) {
            return 'Participation deadline must be before the event start time.';
        }
    }

    return null;
});

const validationError = computed(() => titleError.value ?? startError.value ?? endError.value ?? deadlineError.value);

const showValidationError = computed(() => saveAttempted.value && validationError.value !== null);

watch(
    () => props.visible,
    (newVal) => {
        if (newVal) {
            saveAttempted.value = false;
            title.value = '';
            description.value = '';
            location.value = '';
            selectedParticipants.value = [];
            selectedCoHosts.value = [];
            eventVisibility.value = 'open';
            selectedFeatures.value = [];
            featurePrices.value = createNullFeatureRecord();
            eventColor.value = DEFAULT_COLOR;

            startDateOnly.value = new Date(props.initialDate);
            startTimeOnly.value = new Date(props.initialDate);

            endDateOnly.value = null;
            endTimeOnly.value = null;

            deadlineDateOnly.value = null;
            deadlineTimeOnly.value = null;

            fetchUsers();
        }
    }
);

const onSave = () => {
    saveAttempted.value = true;

    if (validationError.value) return;

    if (!startDateOnly.value || !startTimeOnly.value) return;

    const start = combineDateAndTime(startDateOnly.value, startTimeOnly.value);

    let end: Date | undefined;
    if (endDateOnly.value && endTimeOnly.value) {
        end = combineDateAndTime(endDateOnly.value, endTimeOnly.value);
    }

    emit('save', {
        title: title.value,
        description: description.value || undefined,
        location: location.value || undefined,
        startTime: start.toISOString(),
        endTime: end ? end.toISOString() : undefined,
        participants: selectedParticipants.value.length > 0 ? selectedParticipants.value : undefined,
        coHosts: selectedCoHosts.value.length > 0 ? selectedCoHosts.value : undefined,
        isOpen: eventVisibility.value === 'open',
        isPrivate: eventVisibility.value === 'private',
        ...featureFlagsFromSelection(selectedFeatures.value),
        color: eventColor.value,
        foodPrice: featurePrices.value.FOOD ?? undefined,
        weedPrice: featurePrices.value.WEED ?? undefined,
        sleepPrice: featurePrices.value.SLEEP ?? undefined,
        alcoholPrice: featurePrices.value.ALCOHOL ?? undefined,
        beerPrice: featurePrices.value.BEER ?? undefined,
        participationDeadline:
            deadlineDateOnly.value && deadlineTimeOnly.value
                ? combineDateAndTime(deadlineDateOnly.value, deadlineTimeOnly.value).toISOString()
                : undefined
    });
};
</script>

<template>
    <Dialog
        :visible="visible"
        @update:visible="emit('update:visible', $event)"
        modal
        header="Add New Event"
        :style="{ width: '500px' }"
        :breakpoints="{ '640px': '95vw' }"
        class="p-fluid"
        dismissableMask
        :draggable="false"
    >
        <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
                <label for="title" class="font-semibold">Title</label>
                <InputText id="title" v-model="title" placeholder="Event Title" autofocus class="rounded-xl!" />
            </div>

            <div class="flex flex-col gap-2">
                <label for="desc" class="font-semibold">Description</label>
                <Textarea
                    id="desc"
                    v-model="description"
                    rows="3"
                    placeholder="Add a description..."
                    class="rounded-xl!"
                />
            </div>

            <div class="flex flex-col gap-2">
                <label class="font-semibold">Event Color</label>
                <EventColorSelector v-model="eventColor" />
            </div>

            <div class="flex flex-col gap-2">
                <label for="location" class="font-semibold">Location</label>
                <InputText
                    id="location"
                    v-model="location"
                    placeholder="Meeting Room, Online, etc."
                    class="rounded-xl!"
                />
            </div>

            <div class="flex flex-col gap-2">
                <label class="font-semibold">Start</label>
                <div class="flex gap-2">
                    <DatePicker
                        v-model="startDateOnly"
                        class="flex-1"
                        placeholder="Date"
                        dateFormat="d MM yy"
                        :minDate="startDateBounds.minDate"
                        :maxDate="startDateBounds.maxDate"
                        inputClass="rounded-xl!"
                    />
                    <DatePicker
                        v-model="startTimeOnly"
                        timeOnly
                        class="w-24"
                        placeholder="Time"
                        inputClass="rounded-xl!"
                    />
                </div>
                <small v-if="showValidationError" class="text-red-500">{{ validationError }}</small>
            </div>

            <div class="flex flex-col gap-2">
                <label class="font-semibold">End (Optional)</label>
                <div class="flex gap-2">
                    <DatePicker
                        v-model="endDateOnly"
                        class="flex-1"
                        placeholder="Date"
                        dateFormat="d MM yy"
                        :minDate="startDateBounds.minDate"
                        :maxDate="startDateBounds.maxDate"
                        inputClass="rounded-xl!"
                    />
                    <DatePicker
                        v-model="endTimeOnly"
                        timeOnly
                        class="w-24"
                        placeholder="Time"
                        inputClass="rounded-xl!"
                    />
                </div>
            </div>

            <div class="flex flex-col gap-2">
                <label class="font-semibold">Participation Deadline (Optional)</label>
                <div class="flex gap-2">
                    <DatePicker
                        v-model="deadlineDateOnly"
                        class="flex-1"
                        placeholder="Date"
                        :minDate="startDateBounds.minDate"
                        :maxDate="startDateBounds.maxDate"
                        inputClass="rounded-xl!"
                    />
                    <DatePicker
                        v-model="deadlineTimeOnly"
                        timeOnly
                        class="w-24"
                        placeholder="Time"
                        inputClass="rounded-xl!"
                    />
                </div>
                <small class="text-center text-zinc-500">
                    Users won't be able to join or edit participation after this time.
                </small>
            </div>

            <div class="flex flex-col gap-2">
                <label for="participants" class="font-semibold">Participants</label>
                <MultiSelect
                    id="participants"
                    v-model="selectedParticipants"
                    :options="availableParticipants"
                    optionLabel="username"
                    optionValue="id"
                    placeholder="Select Participants"
                    display="chip"
                    filter
                    class="w-full rounded-xl!"
                >
                    <template #option="slotProps">
                        <div class="flex items-center gap-2">
                            <UserAvatar
                                :profilePictureUrl="slotProps.option.profilePictureUrl"
                                :username="slotProps.option.username"
                            />
                            <span>{{ slotProps.option.username }}</span>
                        </div>
                    </template>
                    <template #chip="slotProps">
                        <div class="flex items-center gap-1 px-1">
                            <UserAvatar
                                :profilePictureUrl="userMap.get(slotProps.value)?.profilePictureUrl"
                                :username="userMap.get(slotProps.value)?.username"
                                class="h-4! w-4! text-[10px]!"
                            />
                            <span>{{ userMap.get(slotProps.value)?.username }}</span>
                        </div>
                    </template>
                </MultiSelect>
            </div>

            <div class="flex flex-col gap-2">
                <label for="cohosts" class="font-semibold">Co-Hosts ({{ coHostOptions.length }} available)</label>
                <MultiSelect
                    id="cohosts"
                    v-model="selectedCoHosts"
                    :options="coHostOptions"
                    optionLabel="username"
                    optionValue="id"
                    placeholder="Select Co-Hosts"
                    display="chip"
                    filter
                    class="w-full rounded-xl!"
                >
                    <template #option="slotProps">
                        <div class="flex items-center gap-2">
                            <UserAvatar
                                :profilePictureUrl="slotProps.option.profilePictureUrl"
                                :username="slotProps.option.username"
                            />
                            <span>{{ slotProps.option.username }}</span>
                        </div>
                    </template>
                    <template #chip="slotProps">
                        <div class="flex items-center gap-1 px-1">
                            <UserAvatar
                                :profilePictureUrl="userMap.get(slotProps.value)?.profilePictureUrl"
                                :username="userMap.get(slotProps.value)?.username"
                                class="h-4! w-4! text-[10px]!"
                            />
                            <span>{{ userMap.get(slotProps.value)?.username }}</span>
                        </div>
                    </template>
                </MultiSelect>
                <small class="text-center text-zinc-500">
                    Only invited participants can be made co-hosts. They can edit the event like you.
                </small>
            </div>

            <div class="flex flex-col gap-2">
                <label class="text-sm font-semibold tracking-widest text-zinc-500 uppercase">Event Visibility</label>
                <SelectButton
                    v-model="eventVisibility"
                    :options="VISIBILITY_OPTIONS"
                    optionLabel="label"
                    optionValue="value"
                    :allowEmpty="false"
                    class="rounded-xl!"
                    fluid
                >
                    <template #option="slotProps">
                        <div class="flex items-center gap-2" :class="slotProps.option.color">
                            <i :class="slotProps.option.icon"></i>
                            <span>{{ slotProps.option.label }}</span>
                        </div>
                    </template>
                </SelectButton>
                <small class="text-center text-zinc-500">
                    {{ VISIBILITY_OPTIONS.find((option) => option.value === eventVisibility)?.description }}
                </small>
            </div>

            <FeatureBudgetForm v-model:selectedFeatures="selectedFeatures" v-model:featurePrices="featurePrices" />
        </div>

        <template #footer>
            <div class="flex gap-2 pt-2">
                <Button
                    label="Cancel"
                    text
                    severity="secondary"
                    @click="emit('update:visible', false)"
                    class="rounded-xl!"
                />
                <Button
                    label="Create Event"
                    icon="pi pi-check"
                    :loading="loading"
                    @click="onSave"
                    class="rounded-xl!"
                />
            </div>
        </template>
    </Dialog>
</template>
