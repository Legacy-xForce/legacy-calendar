<script setup lang="ts">
defineEmits<{
    (e: 'delete'): void;
}>();
</script>

<template>
    <div class="border-line flex justify-center border-t pt-5">
        <button
            type="button"
            class="text-meta pressable flex items-center gap-2 rounded-full px-4 py-2 font-medium text-rose-300 hover:bg-rose-400/10"
            @click="$emit('delete')"
        >
            <i class="pi pi-trash text-xs"></i>
            Delete event
        </button>
    </div>
</template>
