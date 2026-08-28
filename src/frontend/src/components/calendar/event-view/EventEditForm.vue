<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { Event, EventFeature, CreateEventDto } from '../../../types/Event';
import type { User } from '../../../types/User';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import MultiSelect from 'primevue/multiselect';
import SelectButton from 'primevue/selectbutton';
import DatePicker from 'primevue/datepicker';
import { VISIBILITY_OPTIONS } from '../../../constants/visibility';
import UserAvatar from '../../UserAvatar.vue';
import FeatureBudgetForm from '../FeatureBudgetForm.vue';
import EventColorSelector from '../EventColorSelector.vue';
import GuestInviteDialog from '../GuestInviteDialog.vue';
import { DEFAULT_COLOR } from '../../../constants/colors';
import {
    createNullFeatureRecord,
    featureFlagsFromSelection,
    featurePricesFromEvent,
    selectedFeaturesFromEvent,
    combineDateAndTime
} from '../../../utils/event';

const props = defineProps<{
    event: Event;
    users: User[];
    saving: boolean;
}>();

const emit = defineEmits<{
    (e: 'save', dto: CreateEventDto): void;
    (e: 'cancel'): void;
    (e: 'delete'): void;
}>();

const userMap = computed(() => new Map(props.users.map((u) => [u.id, u])));

const coHostOptions = computed(() => {
    const invitedIds = new Set(props.event?.participants?.map((participant) => participant.id) ?? []);
    return props.users.filter(
        (user) => invitedIds.has(user.id) && user.id !== props.event?.hostId && user.id !== props.event?.host?.id
    );
});

const title = ref('');
const description = ref('');
const location = ref('');
const eventVisibility = ref('open');
const selectedFeatures = ref<EventFeature[]>([]);
const featurePrices = ref<Record<EventFeature, number | null>>(createNullFeatureRecord());
const selectedParticipants = ref<number[]>([]);
const selectedCoHosts = ref<number[]>([]);
const showGuestInviteDialog = ref(false);

const eventColor = ref(DEFAULT_COLOR);
const startDateOnly = ref<Date | null>(null);
const startTimeOnly = ref<Date | null>(null);
const endDateOnly = ref<Date | null>(null);
const endTimeOnly = ref<Date | null>(null);
const deadlineDateOnly = ref<Date | null>(null);
const deadlineTimeOnly = ref<Date | null>(null);

const initialize = () => {
    title.value = props.event.title;
    description.value = props.event.description || '';
    location.value = props.event.location || '';
    eventColor.value = props.event.color || DEFAULT_COLOR;

    if (props.event.isPrivate) {
        eventVisibility.value = 'private';
    } else if (props.event.isOpen) {
        eventVisibility.value = 'open';
    } else {
        eventVisibility.value = 'standard';
    }

    selectedFeatures.value = selectedFeaturesFromEvent(props.event);
    featurePrices.value = featurePricesFromEvent(props.event);

    selectedParticipants.value = props.event.participants?.map((participant) => participant.id) || [];
    selectedCoHosts.value =
        props.event.coHosts?.map((coHost) => coHost.id) ||
        (props.event as unknown as { coHostIds?: number[] }).coHostIds ||
        [];

    if (props.event.startTime) {
        const start = new Date(props.event.startTime);
        startDateOnly.value = start;
        startTimeOnly.value = start;
    } else {
        startDateOnly.value = null;
        startTimeOnly.value = null;
    }

    if (props.event.endTime) {
        const end = new Date(props.event.endTime);
        endDateOnly.value = end;
        endTimeOnly.value = end;
    } else {
        endDateOnly.value = null;
        endTimeOnly.value = null;
    }

    if (props.event.participationDeadline) {
        const deadline = new Date(props.event.participationDeadline);
        deadlineDateOnly.value = deadline;
        deadlineTimeOnly.value = deadline;
    } else {
        deadlineDateOnly.value = null;
        deadlineTimeOnly.value = null;
    }
};

watch(() => props.event, initialize, { immediate: true });

const onSave = () => {
    if (!title.value) return;

    emit('save', {
        title: title.value,
        description: description.value || undefined,
        location: location.value || undefined,
        startTime:
            startDateOnly.value && startTimeOnly.value
                ? combineDateAndTime(startDateOnly.value, startTimeOnly.value).toISOString()
                : props.event.startTime,
        endTime:
            endDateOnly.value && endTimeOnly.value
                ? combineDateAndTime(endDateOnly.value, endTimeOnly.value).toISOString()
                : undefined,
        participants: selectedParticipants.value,
        coHosts: selectedCoHosts.value,
        isOpen: eventVisibility.value === 'open',
        isPrivate: eventVisibility.value === 'private',
        color: eventColor.value,
        ...featureFlagsFromSelection(selectedFeatures.value),
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

defineExpose({
    onSave
});
</script>

<template>
    <div class="flex flex-col gap-6">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-2">
                    <label for="edit-title" class="text-sm font-bold tracking-wider text-zinc-500 uppercase">
                        Title
                    </label>
                    <InputText id="edit-title" v-model="title" placeholder="Event Title" class="rounded-xl!" />
                </div>

                <div class="flex flex-col gap-2">
                    <label for="edit-desc" class="text-sm font-bold tracking-wider text-zinc-500 uppercase"
                        >Description</label
                    >
                    <Textarea
                        id="edit-desc"
                        v-model="description"
                        rows="4"
                        placeholder="Add a description..."
                        class="rounded-xl!"
                    />
                </div>

                <div class="flex flex-col gap-2">
                    <label class="text-sm font-bold tracking-wider text-zinc-500 uppercase">Event Color</label>
                    <EventColorSelector v-model="eventColor" />
                </div>

                <div class="flex flex-col gap-2">
                    <label for="edit-location" class="text-sm font-bold tracking-wider text-zinc-500 uppercase"
                        >Location</label
                    >
                    <InputText
                        id="edit-location"
                        v-model="location"
                        placeholder="Meeting Room, Online, etc."
                        class="rounded-xl!"
                    />
                </div>

                <div class="flex flex-col gap-2">
                    <label class="text-sm font-bold tracking-wider text-zinc-500 uppercase">Start Time</label>
                    <div class="flex gap-2">
                        <DatePicker
                            v-model="startDateOnly"
                            dateFormat="d MM yy"
                            class="flex-1 rounded-xl!"
                            placeholder="Date"
                        />
                        <DatePicker v-model="startTimeOnly" timeOnly class="w-24 rounded-xl!" placeholder="Time" />
                    </div>
                </div>

                <div class="flex flex-col gap-2">
                    <label class="text-sm font-bold tracking-wider text-zinc-500 uppercase">End Time (Optional)</label>
                    <div class="flex gap-2">
                        <DatePicker
                            v-model="endDateOnly"
                            dateFormat="d MM yy"
                            class="flex-1 rounded-xl!"
                            placeholder="Date"
                        />
                        <DatePicker v-model="endTimeOnly" timeOnly class="w-24 rounded-xl!" placeholder="Time" />
                    </div>
                </div>

                <div class="flex flex-col gap-2">
                    <label class="text-sm font-bold tracking-wider text-zinc-500 uppercase"
                        >Participation Deadline</label
                    >
                    <div class="flex gap-2">
                        <DatePicker
                            v-model="deadlineDateOnly"
                            dateFormat="d MM yy"
                            class="flex-1 rounded-xl!"
                            placeholder="Date"
                        />
                        <DatePicker v-model="deadlineTimeOnly" timeOnly class="w-24 rounded-xl!" placeholder="Time" />
                    </div>
                    <small class="text-center text-zinc-500">
                        Users won't be able to join or edit participation after this time.
                    </small>
                </div>

                <div class="mt-2 flex flex-col gap-2">
                    <label for="edit-participants" class="text-sm font-bold tracking-wider text-zinc-500 uppercase">
                        Participants ({{ selectedParticipants.length }})
                    </label>
                    <MultiSelect
                        id="edit-participants"
                        v-model="selectedParticipants"
                        :options="users"
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
                    <Button
                        label="Invite Guest"
                        icon="pi pi-user-plus"
                        severity="secondary"
                        outlined
                        size="small"
                        class="mt-1 self-start rounded-xl!"
                        @click="showGuestInviteDialog = true"
                    />
                </div>

                <div class="flex flex-col gap-2">
                    <label for="edit-cohosts" class="text-sm font-bold tracking-wider text-zinc-500 uppercase">
                        Co-Hosts ({{ selectedCoHosts.length }})
                    </label>
                    <MultiSelect
                        id="edit-cohosts"
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
                        Co-hosts can edit this event and manage its participants just like the host.
                    </small>
                </div>

                <div class="flex flex-col">
                    <label class="text-sm font-bold tracking-wider text-zinc-500 uppercase">Event Visibility</label>
                    <SelectButton
                        v-model="eventVisibility"
                        :options="VISIBILITY_OPTIONS"
                        optionLabel="label"
                        optionValue="value"
                        :allowEmpty="false"
                        class="mt-2"
                        fluid
                    >
                        <template #option="slotProps">
                            <div class="flex items-center gap-2" :class="slotProps.option.color">
                                <i :class="slotProps.option.icon"></i>
                                <span>{{ slotProps.option.label }}</span>
                            </div>
                        </template>
                    </SelectButton>
                    <small class="mt-2 text-center text-zinc-500">
                        {{ VISIBILITY_OPTIONS.find((option) => option.value === eventVisibility)?.description }}
                    </small>
                </div>
            </div>

            <div class="flex flex-col gap-4">
                <FeatureBudgetForm v-model:selectedFeatures="selectedFeatures" v-model:featurePrices="featurePrices" />
            </div>

            <!-- Mobile Only Actions -->
            <div class="mt-4 flex flex-col gap-2 md:hidden">
                <Button
                    label="Delete Event"
                    icon="pi pi-trash"
                    severity="danger"
                    outlined
                    @click="emit('delete')"
                    :disabled="saving"
                    class="rounded-xl!"
                />
            </div>
        </div>
    </div>

    <GuestInviteDialog v-model:visible="showGuestInviteDialog" :eventId="event.id" />
</template>

<style scoped></style>
