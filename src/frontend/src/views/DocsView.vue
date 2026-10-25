<script setup lang="ts">
import { ApiReference } from '@scalar/api-reference';
import '@scalar/api-reference/style.css';
import openApiDocument from '../../../backend/openapi.json';

// The committed OpenAPI document is the single source of truth for the API
// reference. Point its server at the backend this build talks to so Scalar's
// "Test Request" uses the right host.
const apiBaseUrl = import.meta.env.VITE_API_URL || 'https://calendar.example.com';
const content = {
    ...openApiDocument,
    servers: [{ url: apiBaseUrl, description: 'Legacy Calendar API' }]
};

const darkMode = document.documentElement.classList.contains('dark');
</script>

<template>
    <div class="docs h-dvh w-full">
        <ApiReference
            :configuration="{
                content,
                darkMode,
                telemetry: false,
                withDefaultFonts: false,
                hideClientButton: true
            }"
        />
    </div>
</template>

<style scoped>
.docs :deep(.scalar-app) {
    height: 100%;
}
</style>
