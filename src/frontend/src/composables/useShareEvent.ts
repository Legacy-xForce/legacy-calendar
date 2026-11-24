import { useToast } from 'primevue/usetoast';
import { copyText } from '../utils/clipboard';

/**
 * Composable to handle sharing an event by copying its link to the clipboard.
 * Provides consistent toast notifications across the app.
 */
export function useShareEvent() {
    const toast = useToast();

    const shareEvent = async (eventId: number) => {
        const url = `${window.location.origin}/event/${eventId}`;
        if (!(await copyText(url))) {
            toast.add({ severity: 'error', summary: "Couldn't copy link", life: 3000 });
            return;
        }
        toast.add({
            severity: 'success',
            summary: 'Link copied',
            detail: 'Only people with a Legacy account can open it.',
            life: 3000
        });
    };

    return {
        shareEvent
    };
}
