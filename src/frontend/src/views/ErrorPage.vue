<script setup lang="ts">
import Button from 'primevue/button';
import { useRouter } from 'vue-router';

const props = defineProps<{
    status: 403 | 404;
}>();

const router = useRouter();

const title = props.status === 403 ? "You can't see this one" : 'Nothing here';
const message =
    props.status === 403
        ? 'This event or page is private. Ask the host to invite you.'
        : 'The link may be old, or the event was deleted.';

const goHome = () => {
    void router.push('/calendar');
};
</script>

<template>
    <div class="flex min-h-[70dvh] items-center justify-center px-6">
        <div class="animate-rise-in flex max-w-sm flex-col items-center gap-3 text-center">
            <span class="font-display text-display-lg text-subtle tabular font-semibold">{{ props.status }}</span>
            <h1 class="text-headline m-0">{{ title }}</h1>
            <p class="text-body text-muted m-0">{{ message }}</p>
            <Button
                label="Back to calendar"
                icon="pi pi-arrow-left"
                severity="secondary"
                class="mt-3"
                @click="goHome"
            />
        </div>
    </div>
</template>
