import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { getStoredTheme, setTheme as persistTheme, type ThemeId } from '../theme/themes';

/**
 * How the calendar is laid out on phones:
 * - `agenda`: compact month with event dots, plus the selected day's events listed below
 * - `grid`: full-height month with event titles inside each day
 */
export type MobileCalendarLayout = 'agenda' | 'grid';

const STORAGE_KEY = 'pref_mobile_calendar_layout';
const LAYOUTS: MobileCalendarLayout[] = ['agenda', 'grid'];

function readLayout(): MobileCalendarLayout {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return LAYOUTS.includes(stored as MobileCalendarLayout) ? (stored as MobileCalendarLayout) : 'agenda';
    } catch {
        return 'agenda';
    }
}

/** UI preferences kept on this device only. */
export const usePreferencesStore = defineStore('preferences', () => {
    const mobileCalendarLayout = ref<MobileCalendarLayout>(readLayout());
    const theme = ref<ThemeId>(getStoredTheme());

    watch(mobileCalendarLayout, (layout) => {
        try {
            localStorage.setItem(STORAGE_KEY, layout);
        } catch {
            // Storage can be unavailable (private mode, blocked site data); the choice still applies this session.
        }
    });

    const toggleMobileCalendarLayout = () => {
        mobileCalendarLayout.value = mobileCalendarLayout.value === 'agenda' ? 'grid' : 'agenda';
    };

    const setTheme = (id: ThemeId) => {
        theme.value = persistTheme(id);
    };

    return {
        mobileCalendarLayout,
        toggleMobileCalendarLayout,
        theme,
        setTheme
    };
});
