<script setup lang="ts">
import Button from 'primevue/button';
import { useRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';
import AccountNotice from '../components/AccountNotice.vue';

const router = useRouter();
const sessionStore = useSessionStore();

// Access is baked into the sign-in token, so a new grant only shows up after signing in again
const handleSignInAgain = async () => {
    await sessionStore.logout();
    router.push('/');
};
</script>

<template>
    <AccountNotice icon="pi pi-shield" tone="amber" title="No calendar access yet">
        Your Legacy account works, but it can't open the calendar. Ask an admin to add calendar access in Legacy
        accounts, then sign in again.
        <template #actions>
            <Button label="Sign in again" icon="pi pi-sign-in" class="w-full" @click="handleSignInAgain" />
        </template>
    </AccountNotice>
</template>
