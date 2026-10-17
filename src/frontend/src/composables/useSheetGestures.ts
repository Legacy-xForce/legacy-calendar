import { onBeforeUnmount, onMounted } from 'vue';

const SHEET_QUERY = '(max-width: 640px)';
const GRAB_ZONE_PX = 36;
const DISMISS_DISTANCE_PX = 120;
const DISMISS_VELOCITY = 0.6; // px per ms

/**
 * On phones every non-maximized PrimeVue dialog is styled as a bottom sheet (see style.css).
 * This lets users drag a sheet down by its header or grab handle to dismiss it, like a native sheet.
 * Dismissal goes through the dialog's own close button so routing and v-model stay in charge.
 */
export function useSheetGestures() {
    let mediaQuery: MediaQueryList | null = null;
    let sheet: HTMLElement | null = null;
    let startY = 0;
    let startTime = 0;
    let offset = 0;

    const reset = (el: HTMLElement) => {
        el.style.transition = 'transform 280ms var(--ease-out-expo)';
        el.style.transform = '';
        el.addEventListener(
            'transitionend',
            () => {
                el.style.transition = '';
            },
            { once: true }
        );
    };

    const onTouchStart = (event: TouchEvent) => {
        if (!mediaQuery?.matches || event.touches.length !== 1) return;

        const target = event.target as HTMLElement | null;
        const dialog = target?.closest<HTMLElement>('.p-dialog');
        if (!target || !dialog || dialog.classList.contains('p-dialog-maximized')) return;
        if (target.closest('button, a, input, textarea, select, [role="button"], [role="slider"]')) return;

        const touch = event.touches[0]!;
        const inHeader = !!target.closest('.p-dialog-header');
        const inGrabZone = touch.clientY - dialog.getBoundingClientRect().top <= GRAB_ZONE_PX;
        if (!inHeader && !inGrabZone) return;

        sheet = dialog;
        startY = touch.clientY;
        startTime = performance.now();
        offset = 0;
        sheet.style.transition = 'none';
    };

    const onTouchMove = (event: TouchEvent) => {
        if (!sheet) return;
        const touch = event.touches[0];
        if (!touch) return;

        const delta = touch.clientY - startY;
        // Resist upward drags instead of ignoring them, so the sheet still feels attached to the finger.
        offset = delta > 0 ? delta : delta / 6;
        sheet.style.transform = `translateY(${offset}px)`;
    };

    const onTouchEnd = () => {
        if (!sheet) return;
        const el = sheet;
        sheet = null;

        const velocity = offset / Math.max(1, performance.now() - startTime);
        const shouldDismiss = offset > DISMISS_DISTANCE_PX || (offset > 40 && velocity > DISMISS_VELOCITY);
        const closeButton = el.querySelector<HTMLElement>('.p-dialog-close-button');

        if (!shouldDismiss || !closeButton) {
            reset(el);
            return;
        }

        el.style.transition = 'transform 200ms var(--ease-in-quart)';
        el.style.transform = 'translateY(100%)';
        window.setTimeout(() => closeButton.click(), 120);
    };

    onMounted(() => {
        mediaQuery = window.matchMedia(SHEET_QUERY);
        document.addEventListener('touchstart', onTouchStart, { passive: true });
        document.addEventListener('touchmove', onTouchMove, { passive: true });
        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('touchcancel', onTouchEnd);
    });

    onBeforeUnmount(() => {
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchEnd);
    });
}
