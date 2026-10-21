<script setup lang="ts">
import Button from 'primevue/button';
import AccountNotice from '../components/AccountNotice.vue';
import { accountSettingsURL } from '../services/auth';
import { signInWithAnotherAccount } from '../utils/account';
</script>

<template>
    <AccountNotice icon="pi pi-shield" tone="amber" title="No calendar access yet">
        Your Legacy account works, but it can't open the calendar. Ask an admin to add calendar access in Legacy
        accounts, then sign in again.
        <template #actions>
            <Button label="Sign in again" icon="pi pi-sign-in" class="w-full" @click="signInWithAnotherAccount" />
            <Button
                as="a"
                :href="accountSettingsURL"
                label="Open Legacy accounts"
                icon="pi pi-external-link"
                severity="secondary"
                class="w-full"
            />
        </template>
    </AccountNotice>
</template>
