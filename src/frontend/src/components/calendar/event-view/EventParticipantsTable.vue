<script setup lang="ts">
import { computed } from 'vue';
import type { Event, EventFeature } from '../../../types/Event';
import UserAvatar from '../../UserAvatar.vue';
import { FEATURES } from '../../../constants/features';
import { injectEventView } from '../../../composables/useEventView';

defineProps<{
    event: Event;
}>();

const { resolvedInvitees, availableFeatureIds, allEventHosts, getParticipantFeatures } = injectEventView();

const byName = (a: { username: string }, b: { username: string }) => a.username.localeCompare(b.username);
const going = computed(() => resolvedInvitees.value.filter((i) => i.status === 'ACCEPTED').sort(byName));
const invited = computed(() => resolvedInvitees.value.filter((i) => i.status === 'PENDING').sort(byName));
const declined = computed(() => resolvedInvitees.value.filter((i) => i.status === 'DECLINED').sort(byName));

const hostIds = computed(() => new Set(allEventHosts.value.map((host) => host.id)));
const featureIcon = Object.fromEntries(FEATURES.map((feature) => [feature.id, feature.icon])) as Record<
    EventFeature,
    string
>;
const featureLabel = Object.fromEntries(FEATURES.map((feature) => [feature.id, feature.label])) as Record<
    EventFeature,
    string
>;

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
                <span class="text-body text-fg min-w-0 truncate font-medium">{{ person.username }}</span>
                <span
                    v-if="hostIds.has(person.id)"
                    class="bg-surface-850 text-muted shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                >
                    Host
                </span>
                <span class="font-emoji ml-auto flex shrink-0 gap-1 text-sm">
                    <span
                        v-for="feature in optedFeatures(person.id)"
                        :key="feature"
                        :title="featureLabel[feature]"
                        :aria-label="featureLabel[feature]"
                        >{{ featureIcon[feature] }}</span
                    >
                </span>
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
