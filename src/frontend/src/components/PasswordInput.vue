<script setup lang="ts">
import { ref } from 'vue';
import InputPassword from 'primevue/inputpassword';

const model = defineModel<string>({ required: true });

defineProps<{
    inputId: string;
    disabled?: boolean;
    invalid?: boolean;
    autocomplete?: string;
}>();

const masked = ref(true);
</script>

<template>
    <div class="relative">
        <InputPassword
            :id="inputId"
            v-model="model"
            v-model:mask="masked"
            :disabled="disabled"
            :invalid="invalid"
            :autocomplete="autocomplete"
            fluid
            class="pr-10!"
        />
        <button
            type="button"
            class="text-muted hover:text-fg absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl transition-colors"
            :aria-label="masked ? 'Show password' : 'Hide password'"
            :disabled="disabled"
            @click="masked = !masked"
        >
            <i :class="masked ? 'pi pi-eye' : 'pi pi-eye-slash'" class="text-sm" aria-hidden="true"></i>
        </button>
    </div>
</template>
