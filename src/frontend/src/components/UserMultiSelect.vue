<script setup lang="ts">
import { computed } from 'vue';
import Select from 'primevue/select';
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
const remove = (id: number) => {
    model.value = model.value.filter((selectedId) => selectedId !== id);
};

// Matches the avatar row height; only needed when the caller asks for virtualization.
const virtualScrollerOptions = computed(() => (props.virtualScroll ? { itemSize: 44 } : undefined));
</script>

<template>
    <Select
        v-model="model"
        :inputId="inputId"
        :options="options"
        optionLabel="username"
        optionValue="id"
        :placeholder="placeholder"
        multiple
        :filter="filter"
        filterPlaceholder="Search"
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
        <template #value="slotProps">
            <div v-if="slotProps.value?.length" class="flex flex-wrap gap-1">
                <span
                    v-for="id in slotProps.value"
                    :key="id"
                    class="bg-surface-800 text-meta text-fg flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 pl-0.5"
                >
                    <UserAvatar
                        :profilePictureUrl="usersById.get(id)?.profilePictureUrl"
                        :username="usersById.get(id)?.username"
                        class="size-5! text-[0.5625rem]!"
                    />
                    {{ usersById.get(id)?.username }}
                    <button
                        type="button"
                        class="hover:bg-surface-700 flex size-4 items-center justify-center rounded-full"
                        :aria-label="`Remove ${usersById.get(id)?.username ?? 'person'}`"
                        @click.stop="remove(id)"
                    >
                        <i class="pi pi-times text-[0.5rem]" aria-hidden="true"></i>
                    </button>
                </span>
            </div>
            <span v-else class="text-muted">{{ placeholder }}</span>
        </template>
    </Select>
</template>
