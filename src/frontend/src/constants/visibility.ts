export const VISIBILITY_OPTIONS = [
    {
        label: 'Private',
        value: 'private',
        icon: 'pi pi-lock',
        color: 'text-red-500',
        description: 'Only invited participants can see this event'
    },
    {
        label: 'Invite only',
        value: 'standard',
        icon: 'pi pi-users',
        color: 'text-zinc-500',
        description: 'Everyone can see this event, only invited participants can join'
    },
    {
        label: 'Open',
        value: 'open',
        icon: 'pi pi-globe',
        color: 'text-emerald-500',
        description: 'Anyone can see and join this event'
    }
];

export type EventVisibility = 'private' | 'standard' | 'open';
