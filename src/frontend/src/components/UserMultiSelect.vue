<script setup lang="ts">
import { computed } from 'vue';
import MultiSelect from 'primevue/multiselect';
import UserAvatar from './UserAvatar.vue';

/**
 * Multi-select of people with the shared avatar option/chip markup. Used for both
 * participants and co-hosts so their rendering cannot drift apart.
 */
const model = defineModel<number[]>({ required: true });

const props = withDefaults(
    defineProps<{
        inputId: string;
        options: Array<{ id: number; username: string; profilePictureUrl?: string | null }>;
        placeholder?: string;
        filter?: boolean;
        virtualScroll?: boolean;
    }>(),
    { placeholder: 'Choose people', filter: false, virtualScroll: false }
);

const usersById = computed(() => new Map(props.options.map((user) => [user.id, user])));

// Matches the avatar row height; only needed when the caller asks for virtualization.
const virtualScrollerOptions = computed(() => (props.virtualScroll ? { itemSize: 44 } : undefined));
</script>

<template>
    <MultiSelect
        v-model="model"
        :inputId="inputId"
        :options="options"
        optionLabel="username"
        optionValue="id"
        :placeholder="placeholder"
        display="chip"
        :filter="filter"
        filterPlaceholder="Search"
        :showToggleAll="false"
        :virtualScrollerOptions="virtualScrollerOptions"
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
            <span class="bg-surface-800 text-meta text-fg flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5">
                <UserAvatar
                    :profilePictureUrl="usersById.get(slotProps.value)?.profilePictureUrl"
                    :username="usersById.get(slotProps.value)?.username"
                    class="size-5! text-[0.5625rem]!"
                />
                {{ usersById.get(slotProps.value)?.username }}
            </span>
        </template>
    </MultiSelect>
</template>
