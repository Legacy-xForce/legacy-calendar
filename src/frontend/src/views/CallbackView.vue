<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import ProgressSpinner from 'primevue/progressspinner';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const router = useRouter();

// Back from Legacy Auth: finish the sign-in. Replacing the route also takes the code out of the address bar.
onMounted(async () => {
    const next = await session.completeSignIn(new URL(window.location.href));
    await router.replace(next);
});
</script>

<template>
    <main class="flex min-h-dvh items-center justify-center" aria-busy="true">
        <ProgressSpinner style="width: 2rem; height: 2rem" :stroke-width="4" aria-label="Signing in" />
    </main>
</template>
