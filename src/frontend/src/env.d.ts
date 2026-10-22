/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_WS_URL?: string;
    readonly VITE_AUTH_URL?: string;
    readonly VITE_OIDC_CLIENT_ID?: string;
    readonly VITE_UPLOADS_URL?: string;
    readonly VITE_LOG_LEVEL?: 'fatal' | 'critical' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
    readonly VITE_GOOGLE_MAPS_EMBED_API_KEY?: string;
    readonly VITE_BRANDFETCH_CLIENT_ID?: string;
    readonly VITE_BANK_LOGO_URL?: string;
    readonly VITE_PRIMEUI_LICENSE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare module 'vue3-emoji-picker' {
    import { DefineComponent } from 'vue';
    const component: DefineComponent<object, object, any>;
    export default component;
}

declare module 'vue3-emoji-picker/css' {
    const content: any;
    export default content;
}
