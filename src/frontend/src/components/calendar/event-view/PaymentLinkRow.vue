<script setup lang="ts">
import { formatDisplayUrl, toAbsoluteUrl } from '../../../utils/url';

/** One external payment destination (PayPal, Revolut, …) in the costs card. */
defineProps<{
    icon: string;
    label: string;
    href: string;
}>();
</script>

<template>
    <a
        :href="toAbsoluteUrl(href)"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:bg-surface-950 text-fg flex items-center gap-3.5 px-4 py-3 no-underline transition-colors"
    >
        <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
            <i :class="icon" class="text-sm"></i>
        </span>
        <span class="min-w-0 flex-1">
            <span class="text-body block font-medium">{{ label }}</span>
            <span class="text-meta text-muted block truncate">{{ formatDisplayUrl(href) }}</span>
        </span>
        <i class="pi pi-external-link text-subtle text-xs"></i>
    </a>
</template>
