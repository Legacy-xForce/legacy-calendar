<script setup lang="ts">
import Button from 'primevue/button';
import { useSessionStore } from '../stores/session';
import AccountNotice from '../components/AccountNotice.vue';

const sessionStore = useSessionStore();

// Access is baked into the sign-in token, so a new grant only shows up after signing in again.
// `prompt=login` asks for credentials even though Legacy Auth still has a session.
const handleSignInAgain = async () => {
    await sessionStore.signIn('/calendar', true);
};
</script>

<template>
    <AccountNotice icon="pi pi-shield" tone="amber" title="No calendar access yet">
        Your Legacy account works, but it can't open the calendar. Ask an admin to add calendar access in Legacy
        accounts, then sign in again.
        <template #actions>
            <Button label="Use another account" icon="pi pi-sign-in" class="w-full" @click="handleSignInAgain" />
        </template>
    </AccountNotice>
</template>
