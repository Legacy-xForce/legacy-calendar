<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    text: string;
}>();

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;
const TRAILING_PUNCTUATION = /[.,!?;:)\]]+$/;

/** Readable label for a link: host and path, without protocol, `www.` or a trailing slash. */
const shorten = (href: string) => {
    try {
        const url = new URL(href);
        const label = `${url.hostname.replace(/^www\./, '')}${url.pathname}`.replace(/\/$/, '');
        return label.length > 48 ? `${label.slice(0, 47)}…` : label;
    } catch {
        return href;
    }
};

// Split into plain text and links so nothing is rendered as raw HTML
const parts = computed(() => {
    const result: { type: 'text' | 'link'; value: string; label?: string }[] = [];
    for (const chunk of props.text.split(URL_PATTERN)) {
        if (!chunk) continue;
        if (!/^https?:\/\//i.test(chunk)) {
            result.push({ type: 'text', value: chunk });
            continue;
        }
        const trailing = chunk.match(TRAILING_PUNCTUATION)?.[0] ?? '';
        const href = trailing ? chunk.slice(0, -trailing.length) : chunk;
        result.push({ type: 'link', value: href, label: shorten(href) });
        if (trailing) result.push({ type: 'text', value: trailing });
    }
    return result;
});
</script>

<template>
    <span>
        <template v-for="(part, index) in parts" :key="index">
            <a
                v-if="part.type === 'link'"
                :href="part.value"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent break-all underline decoration-emerald-400/40 underline-offset-2 hover:decoration-emerald-400"
                @click.stop
                >{{ part.label }}</a
            >
            <template v-else>{{ part.value }}</template>
        </template>
    </span>
</template>
