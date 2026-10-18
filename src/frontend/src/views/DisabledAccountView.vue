<script setup lang="ts">
import Button from 'primevue/button';
import { useRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';
import AccountNotice from '../components/AccountNotice.vue';

const router = useRouter();
const sessionStore = useSessionStore();

const handleLogout = async () => {
    await sessionStore.logout();
    router.push('/');
};
</script>

<template>
    <AccountNotice icon="pi pi-lock" tone="rose" title="This account is turned off">
        An admin has disabled it, so the calendar is closed for now. If that sounds wrong, ask them to turn it back on.
        <template #actions>
            <Button
                label="Use another account"
                icon="pi pi-sign-out"
                severity="secondary"
                class="w-full"
                @click="handleLogout"
            />
        </template>
    </AccountNotice>
</template>
