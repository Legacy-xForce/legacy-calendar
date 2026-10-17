<script setup lang="ts">
import { PREDEFINED_COLORS } from '../../constants/colors';

defineProps<{
    modelValue: string;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
}>();
</script>

<template>
    <div class="flex flex-wrap gap-1.5 sm:gap-2" role="radiogroup" aria-label="Event color">
        <button
            v-for="color in PREDEFINED_COLORS"
            :key="color"
            type="button"
            role="radio"
            :aria-checked="modelValue === color"
            :aria-label="`Color ${color}`"
            class="pressable relative flex size-7 items-center justify-center rounded-full sm:size-8"
            :style="{ backgroundColor: color }"
            @click="emit('update:modelValue', color)"
        >
            <span
                class="absolute -inset-1 rounded-full border-2 transition-opacity duration-150"
                :class="modelValue === color ? 'opacity-100' : 'opacity-0'"
                :style="{ borderColor: color }"
            ></span>
            <i v-if="modelValue === color" class="pi pi-check text-[0.6875rem] text-white"></i>
        </button>
    </div>
</template>
