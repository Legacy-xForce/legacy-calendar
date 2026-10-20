import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { router } from './router/router';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import AppPreset from './theme/preset';
import { applyTheme, getStoredTheme } from './theme/themes';
import { createPinia } from 'pinia';
import './services/firebase';
import { registerSW } from 'virtual:pwa-register';
import Tooltip from 'primevue/tooltip';
import { twMerge, type ClassNameValue } from 'tailwind-merge';
import { mergeProps } from 'vue';

// Smarter merging for PrimeVue component props with Tailwind classes
const customMergeProps = (
    globalPTProps: Record<string, any> = {},
    selfPTProps: Record<string, any> = {},
    datasets: any
) => {
    const merged = mergeProps(globalPTProps, selfPTProps, datasets);
    merged.class = twMerge(merged.class as ClassNameValue);
    return merged;
};

registerSW({ immediate: true });

// Apply before mounting so the first paint uses the saved theme.
applyTheme(getStoredTheme());

createApp(App)
    .use(router)
    .use(createPinia())
    .use(PrimeVue, {
        // PrimeUI license key (community tier, dev).
        license: import.meta.env.VITE_PRIMEUI_LICENSE,
        ripple: false,
        theme: {
            preset: AppPreset,
            options: {
                darkModeSelector: '.dark'
            }
        },
        pt: {
            Dialog: {
                // PrimeVue force-focuses the close button with focus-visible on open; keep that ring quiet
                pcCloseButton: {
                    root: {
                        class: 'focus-visible:outline-1! focus-visible:outline-surface-700! focus-visible:outline-offset-0!'
                    }
                }
            },
            ConfirmDialog: {
                message: { class: 'whitespace-pre-line text-body' }
            }
        },
        ptOptions: {
            mergeSections: true,
            mergeProps: customMergeProps
        }
    })
    .use(ToastService)
    .use(ConfirmationService)
    .directive('tooltip', Tooltip)
    .mount('#app');
