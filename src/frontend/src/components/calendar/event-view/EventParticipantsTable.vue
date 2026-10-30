<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import type { Event } from '../../../types/Event';
import UserAvatar from '../../UserAvatar.vue';
import { injectEventView } from '../../../composables/useEventView';
import api from '../../../services/API';
import { totalEventBudget } from '../../../utils/event';
import { formatCurrency } from '../../../utils/format';

const props = defineProps<{
    event: Event;
}>();

const {
    resolvedInvitees,
    availableFeatureIds,
    featureById,
    allEventHosts,
    getParticipantFeatures,
    getFeatureSplitPrice,
    isHost
} = injectEventView();
const toast = useToast();

// ---------- Payments: hosts and co-hosts mark who has paid their share ----------

type Invitee = (typeof resolvedInvitees.value)[number];
const paymentOverrides = ref<Record<number, boolean>>({});
watch(
    () => props.event.id,
    () => {
        paymentOverrides.value = {};
    }
);

const hasPaymentDue = computed(() => totalEventBudget(props.event) > 0);
const hasPaid = (person: Invitee) => paymentOverrides.value[person.id] ?? person.hasPaid === true;
const amountDue = (person: Invitee) =>
    getParticipantFeatures(person.id).reduce((total, feature) => total + getFeatureSplitPrice(feature), 0);

const togglePayment = async (person: Invitee) => {
    if (!isHost.value) return;
    const previous = hasPaid(person);
    const next = !previous;
    paymentOverrides.value[person.id] = next;
    try {
        await api.updateParticipantPayment(props.event.id, person.id, next);
        const source = props.event.participants?.find((item) => item.id === person.id);
        if (source) source.hasPaid = next;
        toast.add({
            severity: 'success',
            summary: next ? `${person.username} marked as paid` : `${person.username} marked as unpaid`,
            life: 2200
        });
    } catch {
        paymentOverrides.value[person.id] = previous;
        toast.add({ severity: 'error', summary: "Couldn't update payment", detail: 'Please try again.', life: 3000 });
    }
};

const byName = (a: { username: string }, b: { username: string }) => a.username.localeCompare(b.username);
const going = computed(() => resolvedInvitees.value.filter((i) => i.status === 'ACCEPTED').sort(byName));
const invited = computed(() => resolvedInvitees.value.filter((i) => i.status === 'PENDING').sort(byName));
const declined = computed(() => resolvedInvitees.value.filter((i) => i.status === 'DECLINED').sort(byName));

const hostIds = computed(() => new Set(allEventHosts.value.map((host) => host.id)));

const optedFeatures = (userId: number) =>
    getParticipantFeatures(userId).filter((feature) => availableFeatureIds.value.includes(feature));

const summary = computed(() => {
    const parts = [`${going.value.length} going`];
    if (invited.value.length) parts.push(`${invited.value.length} invited`);
    if (declined.value.length) parts.push(`${declined.value.length} declined`);
    return parts.join(' · ');
});
</script>

<template>
    <section class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between gap-3">
            <h3 class="eyebrow m-0">People</h3>
            <span class="text-meta text-muted tabular">{{ summary }}</span>
        </div>

        <div
            v-if="going.length"
            class="border-line bg-raised divide-line grid grid-cols-1 divide-y overflow-hidden rounded-2xl border"
        >
            <div v-for="person in going" :key="person.id" class="flex min-w-0 items-center gap-3 px-4 py-2.5">
                <UserAvatar :profilePictureUrl="person.profilePictureUrl" :username="person.username" />
                <div class="min-w-0 flex-1">
                    <p class="text-body text-fg m-0 flex min-w-0 items-center gap-2 font-medium">
                        <span class="truncate">{{ person.username }}</span>
                        <span
                            v-if="hostIds.has(person.id)"
                            class="bg-surface-850 text-muted shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                        >
                            Host
                        </span>
                    </p>
                    <p
                        v-if="optedFeatures(person.id).length || (hasPaymentDue && amountDue(person) > 0)"
                        class="text-meta text-muted tabular m-0 flex items-center gap-2"
                    >
                        <span v-if="optedFeatures(person.id).length" class="font-emoji flex gap-1">
                            <span
                                v-for="feature in optedFeatures(person.id)"
                                :key="feature"
                                :title="featureById.get(feature)?.name"
                                :aria-label="featureById.get(feature)?.name"
                                >{{ featureById.get(feature)?.emoji }}</span
                            >
                        </span>
                        <span v-if="hasPaymentDue && amountDue(person) > 0">{{
                            formatCurrency(amountDue(person))
                        }}</span>
                    </p>
                </div>
                <template v-if="hasPaymentDue && amountDue(person) > 0">
                    <button
                        v-if="isHost"
                        type="button"
                        class="pressable flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.75rem] font-medium"
                        :class="
                            hasPaid(person)
                                ? 'bg-emerald-400/12 text-emerald-300'
                                : 'bg-surface-850 text-muted hover:text-fg'
                        "
                        :aria-pressed="hasPaid(person)"
                        :aria-label="`${person.username}: ${hasPaid(person) ? 'paid' : 'not paid'}. Tap to change`"
                        @click="togglePayment(person)"
                    >
                        <i :class="hasPaid(person) ? 'pi pi-check' : 'pi pi-circle'" class="text-[0.625rem]"></i>
                        {{ hasPaid(person) ? 'Paid' : 'Unpaid' }}
                    </button>
                    <span
                        v-else
                        class="flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.75rem] font-medium"
                        :class="hasPaid(person) ? 'bg-emerald-400/12 text-emerald-300' : 'bg-surface-850 text-muted'"
                    >
                        <i v-if="hasPaid(person)" class="pi pi-check text-[0.625rem]"></i>
                        {{ hasPaid(person) ? 'Paid' : 'Unpaid' }}
                    </span>
                </template>
            </div>
        </div>
        <p v-else class="text-meta text-muted border-line m-0 rounded-2xl border border-dashed px-4 py-4 text-center">
            Nobody has joined yet.
        </p>

        <div v-if="invited.length" class="flex flex-col gap-2 pt-2">
            <span class="text-meta text-muted font-medium">Waiting for a reply</span>
            <div class="flex flex-wrap gap-1.5">
                <span
                    v-for="person in invited"
                    :key="person.id"
                    class="bg-surface-900 text-meta text-fg flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1"
                >
                    <UserAvatar
                        :profilePictureUrl="person.profilePictureUrl"
                        :username="person.username"
                        class="size-6! text-[0.625rem]!"
                    />
                    {{ person.username }}
                </span>
            </div>
        </div>

        <div v-if="declined.length" class="flex flex-col gap-2 pt-2">
            <span class="text-meta text-muted font-medium">Can't make it</span>
            <div class="flex flex-wrap gap-1.5">
                <span
                    v-for="person in declined"
                    :key="person.id"
                    class="bg-surface-950 text-meta text-subtle flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1"
                >
                    <UserAvatar
                        :profilePictureUrl="person.profilePictureUrl"
                        :username="person.username"
                        class="size-6! text-[0.625rem]! opacity-60"
                    />
                    {{ person.username }}
                </span>
            </div>
        </div>
    </section>
</template>
