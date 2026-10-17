import { onBeforeUnmount, onMounted, ref } from 'vue';

export const MOBILE_QUERY = '(max-width: 767px)';

/** Reactive `matchMedia` result, kept in sync while the calling component is mounted. */
export function useMediaQuery(query: string) {
    const matches = ref(typeof window !== 'undefined' ? window.matchMedia(query).matches : false);
    let mediaQuery: MediaQueryList | null = null;

    const sync = (source: MediaQueryList | MediaQueryListEvent) => {
        matches.value = source.matches;
    };

    onMounted(() => {
        mediaQuery = window.matchMedia(query);
        sync(mediaQuery);
        mediaQuery.addEventListener('change', sync);
    });

    onBeforeUnmount(() => {
        mediaQuery?.removeEventListener('change', sync);
    });

    return matches;
}
