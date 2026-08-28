<script setup lang="ts">
import Button from 'primevue/button';
import { useRouter } from 'vue-router';

const props = defineProps<{
    status: 403 | 404;
}>();

const router = useRouter();

const title = props.status === 403 ? 'Access denied' : 'Page not found';
const message =
    props.status === 403
        ? 'You do not have permission to view this page.'
        : 'The page you were looking for does not exist.';

const goHome = () => {
    void router.push('/calendar');
};
</script>

<template>
    <div class="flex min-h-[calc(100vh-4rem)] items-center justify-center p-6">
        <div class="max-w-lg rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 text-center shadow-2xl">
            <div
                class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 text-red-400"
            >
                <span class="text-3xl font-black">{{ props.status }}</span>
            </div>
            <h1 class="text-3xl font-black text-white">{{ title }}</h1>
            <p class="mt-3 text-sm leading-relaxed text-zinc-400">{{ message }}</p>
            <Button label="Back to Calendar" icon="pi pi-home" class="mt-8 rounded-xl!" @click="goHome" />
        </div>
    </div>
</template>
