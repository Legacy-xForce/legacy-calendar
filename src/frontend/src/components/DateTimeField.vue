<script setup lang="ts">
import { computed } from 'vue';
import { format } from 'date-fns';

const model = defineModel<Date | null>({ required: true });

const props = defineProps<{
    id?: string;
    min?: Date;
    max?: Date;
    invalid?: boolean;
    clearable?: boolean;
}>();

// Native datetime-local works in local time with a `yyyy-MM-ddTHH:mm` string
const toLocalValue = (date: Date | null | undefined) => (date ? format(date, "yyyy-MM-dd'T'HH:mm") : '');

const value = computed(() => toLocalValue(model.value));

const onInput = (event: Event) => {
    const raw = (event.target as HTMLInputElement).value;
    if (!raw) {
        model.value = null;
        return;
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) model.value = parsed;
};
</script>

<template>
    <div class="relative">
        <input
            :id="id"
            type="datetime-local"
            class="datetime-input tabular h-11 w-full rounded-xl border px-3.5 text-base outline-none"
            :class="[
                invalid ? 'border-rose-400/70' : 'border-line focus:border-accent',
                clearable && model ? 'pr-10' : ''
            ]"
            :value="value"
            :min="toLocalValue(props.min) || undefined"
            :max="toLocalValue(props.max) || undefined"
            :aria-invalid="invalid || undefined"
            @input="onInput"
            @change="onInput"
        />
        <button
            v-if="clearable && model"
            type="button"
            class="text-subtle hover:text-fg hover:bg-surface-800 absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg"
            aria-label="Remove"
            @click="model = null"
        >
            <i class="pi pi-times text-[0.6875rem]"></i>
        </button>
    </div>
</template>

<style scoped>
.datetime-input {
    background: var(--color-surface-900);
    color: var(--color-fg);
    transition: border-color 160ms var(--ease-out-quart);
    -webkit-appearance: none;
    appearance: none;
}

.datetime-input::-webkit-calendar-picker-indicator {
    opacity: 0.6;
    cursor: pointer;
}

.datetime-input::-webkit-date-and-time-value {
    text-align: left;
}
</style>
