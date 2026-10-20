<script setup lang="ts">
import { computed, ref } from 'vue';
import InputText from 'primevue/inputtext';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import { useToast } from 'primevue/usetoast';
import { useSessionStore } from '../stores/session';
import {
    API_DOC_ENDPOINT_COUNT,
    API_DOC_GROUPS,
    API_TOKEN_EXAMPLE,
    type ApiAuthKind,
    type ApiDocEndpoint,
    type ApiMethod,
    type ApiScope
} from '../constants/apiDocs';

const sessionStore = useSessionStore();
const toast = useToast();

const search = ref('');
const copiedCode = ref<string | null>(null);

const apiBaseUrl = import.meta.env.VITE_API_URL || 'https://calendar.example.com';
const isAuthenticated = computed(() => sessionStore.isAuthenticated);
const query = computed(() => search.value.trim().toLowerCase());

const filteredGroups = computed(() => {
    if (!query.value) {
        return API_DOC_GROUPS;
    }

    return API_DOC_GROUPS.map((group) => ({
        ...group,
        endpoints: group.endpoints.filter((endpoint) =>
            `${endpoint.method} ${endpoint.path} ${endpoint.title} ${endpoint.description}`
                .toLowerCase()
                .includes(query.value)
        )
    })).filter((group) => group.endpoints.length > 0);
});

const visibleCount = computed(() => filteredGroups.value.reduce((total, group) => total + group.endpoints.length, 0));

const methodClass = (method: ApiMethod) => {
    switch (method) {
        case 'GET':
            return 'bg-emerald-400/10 text-emerald-300';
        case 'POST':
            return 'bg-sky-400/10 text-sky-300';
        case 'PATCH':
            return 'bg-amber-400/10 text-amber-300';
        case 'DELETE':
            return 'bg-rose-400/10 text-rose-300';
        default:
            return 'bg-violet-400/10 text-violet-300';
    }
};

const authLabel = (auth: ApiAuthKind) => {
    switch (auth) {
        case 'authenticated':
            return 'Session or API token';
        case 'session-only':
            return 'Session only';
        case 'guest':
            return 'Guest link';
        default:
            return 'Public';
    }
};

const scopeLabel = (scope?: ApiScope | 'session') => {
    if (scope === 'read') return 'Read';
    if (scope === 'write') return 'Write';
    if (scope === 'session') return 'Session';
    return null;
};

const scopeClass = (scope?: ApiScope | 'session') => {
    if (scope === 'read') return 'bg-surface-850 text-muted';
    if (scope === 'write') return 'bg-accent-soft text-accent';
    return 'bg-surface-850 text-subtle';
};

const copy = async (value: string, key: string) => {
    try {
        await navigator.clipboard.writeText(value);
        copiedCode.value = key;
        window.setTimeout(() => {
            if (copiedCode.value === key) copiedCode.value = null;
        }, 2000);
    } catch {
        toast.add({
            severity: 'error',
            summary: "Couldn't copy automatically",
            detail: 'Select the text and copy it manually.',
            life: 4000
        });
    }
};

const curlExample = `curl "${apiBaseUrl}/events?start=2026-10-01T00:00:00.000Z&end=2026-11-01T00:00:00.000Z" \\
  -H "X-API-Token: ${API_TOKEN_EXAMPLE}"`;

const socketExample = `import { io } from 'socket.io-client';

const socket = io('${apiBaseUrl}', {
  auth: { apiToken: '${API_TOKEN_EXAMPLE}' }
});

socket.emit('joinRoom', { eventId: 12 });
socket.on('newMessage', (message) => console.log(message));`;

const createTokenExample = `curl -X POST "${apiBaseUrl}/api-tokens" \\
  -H "Authorization: Bearer $SESSION_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Home Assistant","scope":"read"}'`;

const scopeRows: { scope: ApiScope; label: string; allows: string; useFor: string }[] = [
    {
        scope: 'read',
        label: 'Read only',
        allows: 'GET, HEAD and OPTIONS requests, plus POST /auth/profile',
        useFor: 'Dashboards, calendar exports and monitoring'
    },
    {
        scope: 'write',
        label: 'Read & write',
        allows: 'Everything the owning account can do through the API',
        useFor: 'Automations that create or update events'
    }
];

const endpointScope = (endpoint: ApiDocEndpoint) => endpoint.scope;
</script>

<template>
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-6 pb-12 md:pt-10">
        <header class="flex flex-col gap-3">
            <router-link
                :to="{ name: isAuthenticated ? 'profile' : 'login' }"
                class="text-meta text-muted hover:text-fg inline-flex w-fit items-center gap-1.5 no-underline"
            >
                <i class="pi pi-arrow-left text-[0.625rem]"></i>
                {{ isAuthenticated ? 'Profile' : 'Sign in' }}
            </router-link>
            <div class="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 class="text-display m-0">API documentation</h1>
                    <p class="text-body text-muted m-0 mt-1">
                        Every Legacy Calendar endpoint, the API token header and the two scopes.
                    </p>
                </div>
                <p class="text-meta text-subtle tabular m-0">{{ API_DOC_ENDPOINT_COUNT }} endpoints documented</p>
            </div>
            <IconField>
                <InputIcon class="pi pi-search" />
                <InputText
                    v-model="search"
                    placeholder="Search endpoints, e.g. rides, chat, api-tokens"
                    aria-label="Search API documentation"
                    fluid
                />
            </IconField>
            <p v-if="query" class="text-meta text-muted m-0">
                {{ visibleCount }} {{ visibleCount === 1 ? 'match' : 'matches' }} for “{{ search.trim() }}”
            </p>
        </header>

        <section class="border-line bg-raised flex flex-col gap-5 rounded-2xl border p-5">
            <div>
                <h2 class="eyebrow m-0">Authentication</h2>
                <p class="text-body text-muted m-0 mt-1">
                    Every endpoint marked <em>Session or API token</em> accepts either credential. Send exactly one of
                    them; if both are present the API token is used.
                </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
                <div class="bg-surface-900 rounded-xl p-4">
                    <p class="text-body text-fg m-0 flex items-center gap-2 font-medium">
                        <i class="pi pi-key text-accent text-sm"></i>
                        API token
                    </p>
                    <p class="text-meta text-muted m-0 mt-1">
                        Add the personal token to every request. Tokens do not expire on their own.
                    </p>
                    <code class="text-meta text-fg mt-3 block font-mono break-all">
                        X-API-Token: legacy-calendar-…
                    </code>
                </div>
                <div class="bg-surface-900 rounded-xl p-4">
                    <p class="text-body text-fg m-0 flex items-center gap-2 font-medium">
                        <i class="pi pi-user text-accent text-sm"></i>
                        Session token
                    </p>
                    <p class="text-meta text-muted m-0 mt-1">
                        The JWT returned by the Legacy auth service or passkey login.
                    </p>
                    <code class="text-meta text-fg mt-3 block font-mono break-all">
                        Authorization: Bearer &lt;access_token&gt;
                    </code>
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full min-w-[34rem] border-collapse text-left">
                    <thead>
                        <tr class="text-meta text-subtle">
                            <th class="border-line border-b py-2 pr-4 font-medium">Scope</th>
                            <th class="border-line border-b py-2 pr-4 font-medium">Allows</th>
                            <th class="border-line border-b py-2 font-medium">Typical use</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in scopeRows" :key="row.scope" class="text-meta align-top">
                            <td class="border-line border-b py-3 pr-4">
                                <span class="rounded-full px-2 py-0.5 font-medium" :class="scopeClass(row.scope)">
                                    {{ row.label }}
                                </span>
                            </td>
                            <td class="text-muted border-line border-b py-3 pr-4">{{ row.allows }}</td>
                            <td class="text-muted border-line border-b py-3">{{ row.useFor }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="flex flex-col gap-2">
                <p class="text-meta text-muted m-0 font-medium">Quick start</p>
                <div class="border-line bg-canvas/60 overflow-hidden rounded-xl border">
                    <div class="border-line flex items-center justify-between gap-3 border-b px-3 py-2">
                        <span class="text-meta text-subtle font-mono">curl</span>
                        <button
                            type="button"
                            class="text-meta text-muted hover:text-fg flex items-center gap-1.5"
                            @click="copy(curlExample, 'curl')"
                        >
                            <i :class="copiedCode === 'curl' ? 'pi pi-check' : 'pi pi-copy'" class="text-xs"></i>
                            {{ copiedCode === 'curl' ? 'Copied' : 'Copy' }}
                        </button>
                    </div>
                    <pre class="text-meta text-fg m-0 overflow-x-auto p-3 font-mono">{{ curlExample }}</pre>
                </div>
                <div class="border-line bg-canvas/60 overflow-hidden rounded-xl border">
                    <div class="border-line flex items-center justify-between gap-3 border-b px-3 py-2">
                        <span class="text-meta text-subtle font-mono">Socket.IO</span>
                        <button
                            type="button"
                            class="text-meta text-muted hover:text-fg flex items-center gap-1.5"
                            @click="copy(socketExample, 'socket')"
                        >
                            <i :class="copiedCode === 'socket' ? 'pi pi-check' : 'pi pi-copy'" class="text-xs"></i>
                            {{ copiedCode === 'socket' ? 'Copied' : 'Copy' }}
                        </button>
                    </div>
                    <pre class="text-meta text-fg m-0 overflow-x-auto p-3 font-mono">{{ socketExample }}</pre>
                </div>
            </div>

            <div class="text-meta flex flex-col gap-2">
                <p class="m-0 flex items-start gap-2 text-amber-300/90">
                    <i class="pi pi-exclamation-triangle mt-0.5 text-xs"></i>
                    <span>
                        Never put a token in a URL, a frontend bundle or a public repository. Treat it like a password
                        and rotate it immediately if it leaks.
                    </span>
                </p>
                <p class="text-muted m-0 flex items-start gap-2">
                    <i class="pi pi-info-circle mt-0.5 text-xs"></i>
                    <span>
                        API tokens cannot manage API tokens. Listing, creating, rotating and deleting tokens always
                        requires a normal session token.
                    </span>
                </p>
            </div>
        </section>

        <div class="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-8">
            <aside v-if="!query" class="hidden lg:block">
                <nav class="sticky top-24 flex flex-col gap-1" aria-label="Documentation sections">
                    <a
                        v-for="group in API_DOC_GROUPS"
                        :key="group.id"
                        :href="`#${group.id}`"
                        class="text-meta text-muted hover:bg-surface-900 hover:text-fg flex items-center gap-2 rounded-lg px-2.5 py-1.5 no-underline transition-colors"
                    >
                        <i :class="group.icon" class="w-3.5 text-[0.6875rem]"></i>
                        {{ group.title }}
                    </a>
                </nav>
            </aside>

            <div class="flex min-w-0 flex-col gap-8">
                <p
                    v-if="!filteredGroups.length"
                    class="text-meta text-muted border-line m-0 rounded-2xl border border-dashed px-4 py-8 text-center"
                >
                    No endpoints match “{{ search.trim() }}”.
                </p>

                <section v-for="group in filteredGroups" :id="group.id" :key="group.id" class="scroll-mt-24">
                    <div class="mb-3 flex items-start gap-3">
                        <span
                            class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl"
                        >
                            <i :class="group.icon" class="text-sm"></i>
                        </span>
                        <div>
                            <h2 class="text-headline m-0">{{ group.title }}</h2>
                            <p class="text-meta text-muted m-0 mt-0.5">{{ group.summary }}</p>
                        </div>
                    </div>

                    <div class="flex flex-col gap-2">
                        <div
                            v-for="endpoint in group.endpoints"
                            :id="endpoint.id"
                            :key="endpoint.id"
                            class="border-line bg-raised scroll-mt-24 overflow-hidden rounded-2xl border"
                        >
                            <details class="group">
                                <summary
                                    class="hover:bg-surface-900 flex cursor-pointer list-none items-start gap-3 p-3.5 transition-colors"
                                >
                                    <span
                                        class="text-meta mt-0.5 w-12 shrink-0 rounded-md py-0.5 text-center font-mono font-semibold"
                                        :class="methodClass(endpoint.method)"
                                    >
                                        {{ endpoint.method }}
                                    </span>
                                    <span class="min-w-0 flex-1">
                                        <span class="text-meta text-fg block font-mono break-all">{{
                                            endpoint.path
                                        }}</span>
                                        <span class="text-body text-fg mt-0.5 block font-medium">{{
                                            endpoint.title
                                        }}</span>
                                        <span class="mt-1.5 flex flex-wrap items-center gap-1.5">
                                            <span
                                                class="bg-surface-850 text-subtle rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                                            >
                                                {{ authLabel(endpoint.auth) }}
                                            </span>
                                            <span
                                                v-if="endpointScope(endpoint)"
                                                class="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                                                :class="scopeClass(endpointScope(endpoint))"
                                            >
                                                {{ scopeLabel(endpointScope(endpoint)) }}
                                            </span>
                                        </span>
                                    </span>
                                    <i
                                        class="pi pi-chevron-down text-subtle mt-1 text-xs transition-transform duration-200 group-open:rotate-180"
                                    ></i>
                                </summary>

                                <div class="border-line flex flex-col gap-4 border-t px-3.5 py-4">
                                    <p class="text-body text-muted m-0">{{ endpoint.description }}</p>

                                    <div v-if="endpoint.params?.length">
                                        <p class="text-meta text-subtle m-0 mb-1.5 font-medium">Parameters</p>
                                        <div class="overflow-x-auto">
                                            <table class="w-full min-w-[30rem] border-collapse text-left">
                                                <thead>
                                                    <tr class="text-meta text-subtle">
                                                        <th class="border-line border-b py-1.5 pr-3 font-medium">
                                                            Name
                                                        </th>
                                                        <th class="border-line border-b py-1.5 pr-3 font-medium">In</th>
                                                        <th class="border-line border-b py-1.5 pr-3 font-medium">
                                                            Type
                                                        </th>
                                                        <th class="border-line border-b py-1.5 font-medium">
                                                            Description
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr
                                                        v-for="param in endpoint.params"
                                                        :key="`${param.in}-${param.name}`"
                                                        class="text-meta align-top"
                                                    >
                                                        <td class="border-line text-fg border-b py-2 pr-3 font-mono">
                                                            {{ param.name }}
                                                            <span v-if="param.required" class="text-rose-300">*</span>
                                                        </td>
                                                        <td class="text-subtle border-line border-b py-2 pr-3">
                                                            {{ param.in }}
                                                        </td>
                                                        <td class="text-muted border-line border-b py-2 pr-3 font-mono">
                                                            {{ param.type }}
                                                        </td>
                                                        <td class="text-muted border-line border-b py-2">
                                                            {{ param.description }}
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div
                                        v-if="endpoint.body"
                                        class="border-line bg-canvas/60 overflow-hidden rounded-xl border"
                                    >
                                        <div
                                            class="border-line flex items-center justify-between gap-3 border-b px-3 py-1.5"
                                        >
                                            <span class="text-meta text-subtle font-medium">
                                                {{ endpoint.method === 'WS' ? 'Payload' : 'Request body' }}
                                            </span>
                                            <button
                                                type="button"
                                                class="text-meta text-muted hover:text-fg flex items-center gap-1.5"
                                                @click.prevent="copy(endpoint.body || '', `${endpoint.id}-body`)"
                                            >
                                                <i
                                                    :class="
                                                        copiedCode === `${endpoint.id}-body`
                                                            ? 'pi pi-check'
                                                            : 'pi pi-copy'
                                                    "
                                                    class="text-xs"
                                                ></i>
                                                {{ copiedCode === `${endpoint.id}-body` ? 'Copied' : 'Copy' }}
                                            </button>
                                        </div>
                                        <pre class="text-meta text-fg m-0 overflow-x-auto p-3 font-mono">{{
                                            endpoint.body
                                        }}</pre>
                                    </div>

                                    <div
                                        v-if="endpoint.response"
                                        class="border-line bg-canvas/60 overflow-hidden rounded-xl border"
                                    >
                                        <div
                                            class="border-line flex items-center justify-between gap-3 border-b px-3 py-1.5"
                                        >
                                            <span class="text-meta text-subtle font-medium">
                                                {{
                                                    endpoint.method === 'WS'
                                                        ? 'Client auth example'
                                                        : 'Example response'
                                                }}
                                            </span>
                                            <button
                                                type="button"
                                                class="text-meta text-muted hover:text-fg flex items-center gap-1.5"
                                                @click.prevent="
                                                    copy(endpoint.response || '', `${endpoint.id}-response`)
                                                "
                                            >
                                                <i
                                                    :class="
                                                        copiedCode === `${endpoint.id}-response`
                                                            ? 'pi pi-check'
                                                            : 'pi pi-copy'
                                                    "
                                                    class="text-xs"
                                                ></i>
                                                {{ copiedCode === `${endpoint.id}-response` ? 'Copied' : 'Copy' }}
                                            </button>
                                        </div>
                                        <pre class="text-meta text-fg m-0 overflow-x-auto p-3 font-mono">{{
                                            endpoint.response
                                        }}</pre>
                                    </div>

                                    <ul
                                        v-if="endpoint.notes?.length"
                                        class="text-meta text-muted m-0 flex list-disc flex-col gap-1 pl-5"
                                    >
                                        <li v-for="note in endpoint.notes" :key="note">{{ note }}</li>
                                    </ul>
                                </div>
                            </details>
                        </div>
                    </div>
                </section>

                <section class="border-line bg-raised flex flex-col gap-3 rounded-2xl border p-5">
                    <h2 class="eyebrow m-0">Errors, limits & conventions</h2>
                    <div class="overflow-x-auto">
                        <table class="w-full min-w-[30rem] border-collapse text-left">
                            <thead>
                                <tr class="text-meta text-subtle">
                                    <th class="border-line border-b py-2 pr-4 font-medium">Status</th>
                                    <th class="border-line border-b py-2 font-medium">Meaning</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="text-meta align-top">
                                    <td class="border-line text-fg border-b py-2 pr-4 font-mono">400</td>
                                    <td class="text-muted border-line border-b py-2">
                                        Invalid body, query or token scope. The response message explains which field
                                        failed.
                                    </td>
                                </tr>
                                <tr class="text-meta align-top">
                                    <td class="border-line text-fg border-b py-2 pr-4 font-mono">401</td>
                                    <td class="text-muted border-line border-b py-2">
                                        Missing, invalid, rotated or deleted credential.
                                    </td>
                                </tr>
                                <tr class="text-meta align-top">
                                    <td class="border-line text-fg border-b py-2 pr-4 font-mono">403</td>
                                    <td class="text-muted border-line border-b py-2">
                                        Authenticated but not allowed. A read-only token receives this for any write.
                                    </td>
                                </tr>
                                <tr class="text-meta align-top">
                                    <td class="border-line text-fg border-b py-2 pr-4 font-mono">404</td>
                                    <td class="text-muted border-line border-b py-2">
                                        The resource does not exist or is not visible to the caller. Token management
                                        uses this for tokens owned by somebody else.
                                    </td>
                                </tr>
                                <tr class="text-meta align-top">
                                    <td class="border-line text-fg border-b py-2 pr-4 font-mono">429</td>
                                    <td class="text-muted border-line border-b py-2">
                                        Rate limit exceeded. Passkey login allows 10/min, password changes 10/min, token
                                        creation 20/min, guest invites 60/min and notifications 30/min.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <ul class="text-meta text-muted m-0 flex list-disc flex-col gap-1 pl-5">
                        <li>Request and response bodies are JSON unless an endpoint says multipart.</li>
                        <li>Timestamps are ISO 8601 strings in UTC.</li>
                        <li>
                            Pagination uses cursor ids where available; chat pages return
                            <code class="font-mono">nextCursor</code>.
                        </li>
                        <li>Admin endpoints follow the role of the owning account, including for API tokens.</li>
                        <li>Swagger/OpenAPI is available at <code class="font-mono">/api</code> outside production.</li>
                    </ul>
                    <div class="border-line bg-canvas/60 mt-1 overflow-hidden rounded-xl border">
                        <div class="border-line flex items-center justify-between gap-3 border-b px-3 py-2">
                            <span class="text-meta text-subtle font-mono">Create a token (session only)</span>
                            <button
                                type="button"
                                class="text-meta text-muted hover:text-fg flex items-center gap-1.5"
                                @click="copy(createTokenExample, 'create-token')"
                            >
                                <i
                                    :class="copiedCode === 'create-token' ? 'pi pi-check' : 'pi pi-copy'"
                                    class="text-xs"
                                ></i>
                                {{ copiedCode === 'create-token' ? 'Copied' : 'Copy' }}
                            </button>
                        </div>
                        <pre class="text-meta text-fg m-0 overflow-x-auto p-3 font-mono">{{ createTokenExample }}</pre>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>
