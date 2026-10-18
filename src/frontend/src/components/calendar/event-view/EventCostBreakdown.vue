<script setup lang="ts">
import { computed } from 'vue';
import { useToast } from 'primevue/usetoast';
import UserAvatar from '../../UserAvatar.vue';
import BankLogo from '../../BankLogo.vue';
import type { Event, EventFeature, EventPersonSummary } from '../../../types/Event';
import { FEATURES } from '../../../constants/features';
import { formatCurrency } from '../../../utils/format';
import { formatDisplayUrl, toAbsoluteUrl } from '../../../utils/url';
import { formatIban, getItalianBankName, normalizeIban } from '../../../utils/iban';
import { injectEventView } from '../../../composables/useEventView';

defineProps<{
    event: Event;
}>();

const {
    userParticipantStatus,
    userTotalShare,
    availableFeatureIds,
    eventPrices,
    eventTotalBudget,
    currentUser,
    getFeatureCount,
    getFeatureSplitPrice,
    getParticipantFeatures,
    allEventHosts,
    paidAmount,
    unpaidAmount
} = injectEventView();

const toast = useToast();

const hostsWithPaymentInfo = computed(() =>
    allEventHosts.value.filter((host) => host.paypalLink || host.ibanNumber || host.revolutLink)
);

const copyIban = (iban: string) => {
    navigator.clipboard.writeText(normalizeIban(iban)).then(() => {
        toast.add({ severity: 'success', summary: 'IBAN copied', life: 2500 });
    });
};

/** Secondary line under the IBAN: the bank (when known) and the account holder. */
const ibanLabel = (host: EventPersonSummary) =>
    [getItalianBankName(host.ibanNumber) ?? 'IBAN', host.ibanAccountHolder].filter(Boolean).join(' · ');

const featureMap = computed(
    () =>
        Object.fromEntries(FEATURES.map((feature) => [feature.id, feature])) as Record<
            EventFeature,
            (typeof FEATURES)[0]
        >
);

const myFeatures = computed(() => (currentUser.value ? getParticipantFeatures(currentUser.value.id) : []));
const isGoing = computed(() => userParticipantStatus.value === 'ACCEPTED');
</script>

<template>
    <section class="flex flex-col gap-2">
        <h3 class="eyebrow m-0">Costs</h3>

        <div
            v-if="isGoing && eventTotalBudget > 0"
            class="flex items-center justify-between gap-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-3.5"
        >
            <div class="min-w-0">
                <p class="text-body text-fg m-0 font-medium">Your share</p>
                <p class="text-meta text-muted m-0">Split by what you opted into</p>
            </div>
            <p class="text-headline font-display tabular m-0 font-semibold text-emerald-300">
                {{ formatCurrency(userTotalShare) }}
            </p>
        </div>

        <div class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border">
            <div v-for="featureId in availableFeatureIds" :key="featureId" class="flex items-center gap-3.5 px-4 py-3">
                <span
                    class="bg-surface-900 font-emoji flex size-9 shrink-0 items-center justify-center rounded-xl text-lg"
                >
                    {{ featureMap[featureId]?.icon }}
                </span>
                <div class="min-w-0 flex-1">
                    <p class="text-body text-fg m-0 flex items-center gap-2 font-medium">
                        {{ featureMap[featureId]?.label }}
                        <i
                            v-if="isGoing && myFeatures.includes(featureId)"
                            class="pi pi-check text-[0.625rem] text-emerald-300"
                            aria-label="You opted in"
                        ></i>
                    </p>
                    <p class="text-meta text-muted tabular m-0">
                        {{ getFeatureCount(featureId) }} in
                        <template v-if="eventPrices[featureId] !== null">
                            · {{ formatCurrency(eventPrices[featureId] ?? 0) }} total
                        </template>
                    </p>
                </div>
                <div class="text-right">
                    <template v-if="eventPrices[featureId] !== null">
                        <p class="text-body text-fg tabular m-0 font-semibold">
                            {{ formatCurrency(getFeatureSplitPrice(featureId)) }}
                        </p>
                        <p class="text-meta text-subtle m-0">each</p>
                    </template>
                    <p v-else class="text-meta text-subtle m-0">No budget</p>
                </div>
            </div>
        </div>

        <p v-if="eventTotalBudget > 0" class="text-meta text-muted tabular m-0 flex flex-wrap gap-x-2 px-1">
            <span>Total budget {{ formatCurrency(eventTotalBudget) }}</span>
            <span class="text-emerald-300"
                ><i class="pi pi-check mr-1 text-[0.5625rem]"></i>{{ formatCurrency(paidAmount) }} paid</span
            >
            <span v-if="unpaidAmount > 0">{{ formatCurrency(unpaidAmount) }} outstanding</span>
        </p>

        <div v-if="hostsWithPaymentInfo.length" class="flex flex-col gap-2 pt-3">
            <h4 class="text-meta text-muted m-0 font-medium">
                {{ hostsWithPaymentInfo.length > 1 ? 'Send your share to one of the hosts' : 'Send your share to' }}
            </h4>
            <div
                v-for="host in hostsWithPaymentInfo"
                :key="host.id"
                class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border"
            >
                <div class="flex items-center gap-3 px-4 py-2.5">
                    <UserAvatar
                        :profilePictureUrl="host.profilePictureUrl"
                        :username="host.username"
                        class="size-7! text-[0.6875rem]!"
                    />
                    <span class="text-body text-fg font-medium">{{ host.username }}</span>
                </div>
                <a
                    v-if="host.paypalLink"
                    :href="toAbsoluteUrl(host.paypalLink)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="hover:bg-surface-950 text-fg flex items-center gap-3.5 px-4 py-3 no-underline transition-colors"
                >
                    <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <i class="pi pi-paypal text-sm"></i>
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="text-body block font-medium">PayPal</span>
                        <span class="text-meta text-muted block truncate">{{ formatDisplayUrl(host.paypalLink) }}</span>
                    </span>
                    <i class="pi pi-external-link text-subtle text-xs"></i>
                </a>
                <a
                    v-if="host.revolutLink"
                    :href="toAbsoluteUrl(host.revolutLink)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="hover:bg-surface-950 text-fg flex items-center gap-3.5 px-4 py-3 no-underline transition-colors"
                >
                    <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <i class="pi pi-money-bill text-sm"></i>
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="text-body block font-medium">Revolut</span>
                        <span class="text-meta text-muted block truncate">{{
                            formatDisplayUrl(host.revolutLink)
                        }}</span>
                    </span>
                    <i class="pi pi-external-link text-subtle text-xs"></i>
                </a>
                <div v-if="host.ibanNumber" class="flex items-center gap-3.5 px-4 py-3">
                    <BankLogo
                        :iban="host.ibanNumber"
                        :name="getItalianBankName(host.ibanNumber)"
                        class="size-9 rounded-xl text-sm"
                    />
                    <span class="min-w-0 flex-1">
                        <span class="text-body text-fg block truncate font-mono font-medium">{{
                            formatIban(host.ibanNumber!)
                        }}</span>
                        <span class="text-meta text-muted block truncate">{{ ibanLabel(host) }}</span>
                    </span>
                    <button
                        type="button"
                        class="pressable text-meta text-fg bg-surface-900 hover:bg-surface-850 flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-medium"
                        aria-label="Copy IBAN"
                        @click="copyIban(host.ibanNumber!)"
                    >
                        <i class="pi pi-copy text-[0.6875rem]"></i>
                        Copy
                    </button>
                </div>
            </div>
        </div>
    </section>
</template>
