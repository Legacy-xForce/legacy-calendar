<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { User, CreateUserDto, UpdateUserDto } from '../types/User';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useUsersStore } from '../stores/users';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Dialog from 'primevue/dialog';
import Checkbox from 'primevue/checkbox';
import UserAvatar from '../components/UserAvatar.vue';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';

const toast = useToast();
const confirm = useConfirm();
const usersStore = useUsersStore();
const { users, loading } = storeToRefs(usersStore);
const { fetchUsers, createUser, updateUser, removeUser } = usersStore;

const filters = ref<{ global: { value: string | null } }>({
    global: { value: null }
});

const showUserDialog = ref(false);
const isEditing = ref(false);
const userForm = ref<CreateUserDto>({
    username: '',
    password: '',
    isAdmin: false
});
const editingUserId = ref<number | null>(null);
const editingUser = ref<User | null>(null);

const openAddUser = () => {
    isEditing.value = false;
    editingUser.value = null;
    userForm.value = { username: '', password: '', isAdmin: false };
    showUserDialog.value = true;
};

const editUser = (user: User) => {
    isEditing.value = true;
    editingUserId.value = user.id;
    editingUser.value = user;
    userForm.value = {
        username: user.username,
        password: '',
        isAdmin: user.isAdmin
    };
    showUserDialog.value = true;
};

const handleDeleteUser = async (id: number) => {
    try {
        await removeUser(id);
        toast.add({
            severity: 'success',
            summary: 'Success',
            detail: 'User deleted successfully',
            life: 3000
        });
    } catch (err: any) {
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: err.message || 'Failed to delete user',
            life: 3000
        });
    }
};

const confirmDelete = (user: User) => {
    confirm.require({
        message: `Are you sure you want to delete user "${user.username}"? This action cannot be undone.`,
        header: 'Confirm Deletion',
        icon: 'pi pi-exclamation-triangle',
        rejectProps: {
            label: 'Cancel',
            severity: 'secondary',
            outlined: true
        },
        acceptProps: {
            label: 'Delete',
            severity: 'danger'
        },
        accept: () => {
            handleDeleteUser(user.id);
        }
    });
};

const impersonateUser = (user: User) => {
    localStorage.setItem('impersonate_user_id', user.id.toString());
    window.location.href = '/calendar';
};

const saveUser = async () => {
    try {
        let userId = editingUserId.value;
        if (isEditing.value && userId) {
            const updateDto: UpdateUserDto = {
                username: userForm.value.username,
                isAdmin: userForm.value.isAdmin
            };
            if (userForm.value.password) {
                updateDto.password = userForm.value.password;
            }
            await updateUser(userId, updateDto);
        } else {
            await createUser(userForm.value);
        }

        toast.add({
            severity: 'success',
            summary: 'Success',
            detail: isEditing.value ? 'User updated successfully' : 'User created successfully',
            life: 3000
        });
        showUserDialog.value = false;
    } catch (err: any) {
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: err.message || 'Failed to save user',
            life: 3000
        });
    }
};

const filteredUsers = computed(() => {
    const query = (filters.value.global.value ?? '').toString().trim().toLowerCase();
    const sorted = [...users.value].sort((a, b) => a.username.localeCompare(b.username));
    if (!query) return sorted;
    return sorted.filter((user) => user.username.toLowerCase().includes(query) || String(user.id) === query);
});

onMounted(() => {
    fetchUsers();
});
</script>

<template>
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-10 md:pt-10">
        <header class="flex items-end justify-between gap-4">
            <div>
                <router-link
                    :to="{ name: 'profile' }"
                    class="text-meta text-muted hover:text-fg mb-2 inline-flex items-center gap-1.5 no-underline"
                >
                    <i class="pi pi-arrow-left text-[0.625rem]"></i>
                    Profile
                </router-link>
                <h1 class="text-display m-0">Users</h1>
                <p class="text-meta text-muted tabular m-0 mt-1">{{ users.length }} accounts</p>
            </div>
            <Button label="Add user" icon="pi pi-plus" @click="openAddUser" />
        </header>

        <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="filters['global'].value" placeholder="Search by name or ID" fluid />
        </IconField>

        <div v-if="loading && !users.length" class="text-muted flex justify-center py-12">
            <i class="pi pi-spin pi-spinner"></i>
        </div>

        <div
            v-else-if="filteredUsers.length"
            class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border"
        >
            <div v-for="user in filteredUsers" :key="user.id" class="flex items-center gap-3 px-4 py-2.5">
                <UserAvatar :profilePictureUrl="user.profilePictureUrl" :username="user.username" class="size-9!" />
                <div class="min-w-0 flex-1">
                    <p class="text-body text-fg m-0 flex items-center gap-2 truncate font-medium">
                        {{ user.username }}
                        <span
                            v-if="user.isAdmin"
                            class="bg-surface-850 text-muted rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                        >
                            Admin
                        </span>
                    </p>
                    <p class="text-meta text-subtle tabular m-0">#{{ user.id }}</p>
                </div>
                <div class="flex shrink-0 items-center">
                    <Button
                        icon="pi pi-eye"
                        text
                        rounded
                        severity="secondary"
                        :aria-label="`View the app as ${user.username}`"
                        v-tooltip.top="'View as this user'"
                        @click="impersonateUser(user)"
                    />
                    <Button
                        icon="pi pi-pencil"
                        text
                        rounded
                        severity="secondary"
                        :aria-label="`Edit ${user.username}`"
                        v-tooltip.top="'Edit'"
                        @click="editUser(user)"
                    />
                    <Button
                        icon="pi pi-trash"
                        text
                        rounded
                        severity="danger"
                        :aria-label="`Delete ${user.username}`"
                        v-tooltip.top="'Delete'"
                        @click="confirmDelete(user)"
                    />
                </div>
            </div>
        </div>

        <p v-else class="text-body text-muted py-12 text-center">No users match that search.</p>

        <Dialog
            v-model:visible="showUserDialog"
            :header="isEditing ? 'Edit user' : 'New user'"
            :style="{ width: '26rem' }"
            modal
            dismissableMask
            :draggable="false"
        >
            <form class="flex flex-col gap-4" novalidate @submit.prevent="saveUser">
                <div class="flex justify-center py-1">
                    <UserAvatar
                        :profilePictureUrl="editingUser?.profilePictureUrl"
                        :username="userForm.username"
                        class="size-16! text-xl!"
                    />
                </div>

                <div class="flex flex-col gap-1.5">
                    <label for="username" class="text-meta text-muted font-medium">Username</label>
                    <InputText
                        id="username"
                        v-model="userForm.username"
                        required
                        autofocus
                        autocomplete="off"
                        autocapitalize="none"
                        fluid
                    />
                </div>
                <div class="flex flex-col gap-1.5">
                    <label for="password" class="text-meta text-muted font-medium">
                        {{ isEditing ? 'New password' : 'Password' }}
                    </label>
                    <Password
                        inputId="password"
                        v-model="userForm.password"
                        :feedback="!isEditing"
                        toggleMask
                        :placeholder="isEditing ? 'Leave empty to keep the current one' : ''"
                        :inputProps="{ autocomplete: 'new-password' }"
                        fluid
                    />
                </div>
                <label for="isAdmin" class="flex cursor-pointer items-center gap-3">
                    <Checkbox inputId="isAdmin" v-model="userForm.isAdmin" binary />
                    <span class="text-body text-fg">Administrator</span>
                </label>
                <button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
            </form>
            <template #footer>
                <Button label="Cancel" severity="secondary" text @click="showUserDialog = false" />
                <Button :label="isEditing ? 'Save' : 'Create user'" icon="pi pi-check" @click="saveUser" />
            </template>
        </Dialog>
    </div>
</template>

<style scoped>
:deep(.p-password-input) {
    width: 100%;
}
</style>
