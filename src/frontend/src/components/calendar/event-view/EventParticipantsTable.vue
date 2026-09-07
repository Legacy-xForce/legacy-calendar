<script setup lang="ts">
import { computed, ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import type { Event } from '../../../types/Event';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import UserAvatar from '../../UserAvatar.vue';
import { injectEventView } from '../../../composables/useEventView';
import api from '../../../services/API';

const props = defineProps<{
    event: Event;
}>();

const { resolvedInvitees, featuresListColumns, getFeatureCount, hasFeature, getStatusSeverity, getStatusIcon } =
    injectEventView();
const { isHost, currentUser } = injectEventView();
const toast = useToast();
const paymentOverrides = ref<Record<number, boolean>>({});

const canUpdatePayment = computed(() => isHost.value || currentUser.value?.isAdmin === true);
const getPaymentStatus = (participant: (typeof resolvedInvitees.value)[number]) =>
    paymentOverrides.value[participant.id] ?? participant.hasPaid === true;

const togglePayment = async (participant: (typeof resolvedInvitees.value)[number]) => {
    if (!canUpdatePayment.value) return;

    const previousValue = getPaymentStatus(participant);
    const nextValue = !previousValue;
    paymentOverrides.value[participant.id] = nextValue;

    try {
        await api.updateParticipantPayment(props.event.id, participant.id, nextValue);
        const sourceParticipant = props.event.participants?.find((item) => item.id === participant.id);
        if (sourceParticipant) sourceParticipant.hasPaid = nextValue;
        toast.add({
            severity: 'success',
            summary: nextValue ? 'Payment recorded' : 'Payment cleared',
            detail: `${participant.username} is marked ${nextValue ? 'paid' : 'unpaid'}`,
            life: 2200
        });
    } catch {
        paymentOverrides.value[participant.id] = previousValue;
        toast.add({ severity: 'error', summary: 'Payment update failed', detail: 'Please try again.', life: 3000 });
    }
};

const acceptedCount = computed(() => resolvedInvitees.value.filter((i) => i.status === 'ACCEPTED').length);
const pendingCount = computed(() => resolvedInvitees.value.filter((i) => i.status === 'PENDING').length);
const declinedCount = computed(() => resolvedInvitees.value.filter((i) => i.status === 'DECLINED').length);
</script>

<template>
    <div class="-mx-2 flex flex-col gap-3 sm:mx-0">
        <Accordion :value="null">
            <AccordionPanel value="0" class="w-full! border-none!">
                <AccordionHeader class="px-2! py-1! sm:pl-0!">
                    <div class="flex w-full flex-wrap justify-between gap-2 pr-4">
                        <div class="flex items-center gap-2 text-white!">
                            <i class="pi pi-users"></i>
                            <span class="font-semibold">Participants</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-1.5">
                            <Tag v-if="acceptedCount > 0" severity="success" :value="`${acceptedCount} accepted`" />
                            <Tag v-if="pendingCount > 0" severity="warn" :value="`${pendingCount} pending`" />
                            <Tag v-if="declinedCount > 0" severity="danger" :value="`${declinedCount} declined`" />
                            <span v-if="resolvedInvitees.length === 0" class="text-surface-500 text-sm">None</span>
                        </div>
                    </div>
                </AccordionHeader>
                <AccordionContent
                    :pt="{
                        root: {
                            class: 'grid-cols-[minmax(0,1fr)]'
                        },
                        content: {
                            class: 'min-w-0 px-0! pt-2! pb-0!'
                        }
                    }"
                >
                    <DataTable
                        :value="resolvedInvitees"
                        scrollable
                        sortMode="multiple"
                        :multiSortMeta="[
                            { field: 'status', order: 1 },
                            { field: 'username', order: 1 }
                        ]"
                    >
                        <template #empty>
                            <div class="text-surface-500 p-4 text-center">No invitees found</div>
                        </template>
                        <Column field="username" header="Name" sortable>
                            <template #body="slotProps">
                                <div class="flex items-center gap-2">
                                    <UserAvatar
                                        :profilePictureUrl="slotProps.data.profilePictureUrl"
                                        :username="slotProps.data.username"
                                        class="h-8! w-8! lg:h-10! lg:w-10!"
                                    />
                                    <span>{{ slotProps.data.username }}</span>
                                </div>
                            </template>
                        </Column>
                        <Column
                            v-for="col in featuresListColumns"
                            :key="col.field"
                            class="min-w-12 text-center sm:min-w-28"
                        >
                            <template #header>
                                <span class="hidden w-full text-center font-bold whitespace-nowrap sm:inline">
                                    <span
                                        :class="getFeatureCount(col.field) > 0 ? 'text-green-500' : 'text-zinc-400'"
                                        class="font-bold tracking-widest uppercase"
                                    >
                                        {{ getFeatureCount(col.field) }}
                                    </span>
                                    {{ col.header }}
                                </span>
                                <span
                                    class="w-full text-center font-bold whitespace-nowrap sm:hidden"
                                    :title="col.header"
                                >
                                    {{ col.icon }}
                                </span>
                            </template>
                            <template #body="slotProps">
                                <div v-if="slotProps.data.status === 'ACCEPTED'" class="flex justify-center text-xs">
                                    <template v-if="hasFeature(slotProps.data.id, col.field)">
                                        <i class="pi pi-check font-bold text-green-500"></i>
                                    </template>
                                    <template v-else>
                                        <i class="pi pi-times font-bold text-red-500/40"></i>
                                    </template>
                                </div>
                                <div v-else class="text-surface-400 text-center">-</div>
                            </template>
                        </Column>
                        <Column field="hasPaid" header="Payment" class="w-24 text-center sm:w-32" sortable>
                            <template #body="slotProps">
                                <button
                                    v-if="canUpdatePayment"
                                    type="button"
                                    class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition-colors"
                                    :class="
                                        getPaymentStatus(slotProps.data)
                                            ? 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
                                            : 'bg-zinc-500/15 text-zinc-400 hover:bg-zinc-500/25'
                                    "
                                    @click="togglePayment(slotProps.data)"
                                >
                                    <i :class="getPaymentStatus(slotProps.data) ? 'pi pi-check' : 'pi pi-minus'"></i>
                                    {{ getPaymentStatus(slotProps.data) ? 'Paid' : 'Unpaid' }}
                                </button>
                                <Tag
                                    v-else
                                    :severity="getPaymentStatus(slotProps.data) ? 'success' : 'secondary'"
                                    :value="getPaymentStatus(slotProps.data) ? 'Paid' : 'Unpaid'"
                                    size="small"
                                />
                            </template>
                        </Column>
                        <Column field="status" header="Status" class="w-16 text-center sm:w-24" sortable>
                            <template #body="slotProps">
                                <span class="hidden sm:inline">
                                    <Tag
                                        :severity="getStatusSeverity(slotProps.data.status)"
                                        size="small"
                                        :value="slotProps.data.status"
                                    />
                                </span>
                                <div class="flex justify-center sm:hidden">
                                    <Tag
                                        :severity="getStatusSeverity(slotProps.data.status)"
                                        class="flex h-8! w-8! items-center justify-center p-0!"
                                        size="small"
                                    >
                                        <i :class="getStatusIcon(slotProps.data.status)" class="text-xs"></i>
                                    </Tag>
                                </div>
                            </template>
                        </Column>
                    </DataTable>
                </AccordionContent>
            </AccordionPanel>
        </Accordion>
    </div>
</template>
