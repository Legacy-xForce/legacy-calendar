export interface NavigationItem {
    name: string;
    label: string;
    icon?: string;
    match: (path: string) => boolean;
    showInHeader: boolean;
    showInBottomBar: boolean;
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
    {
        name: 'calendar',
        label: 'Calendar',
        icon: 'pi pi-calendar',
        match: (path) => path === '/calendar' || path.startsWith('/event'),
        showInHeader: true,
        showInBottomBar: true
    },
    {
        name: 'upcoming',
        label: 'Upcoming',
        icon: 'pi pi-list',
        match: (path) => path.startsWith('/upcoming'),
        showInHeader: true,
        showInBottomBar: true
    },
    {
        name: 'profile',
        label: 'Profile',
        match: (path) => path === '/profile' || path === '/admin',
        showInHeader: false,
        showInBottomBar: true
    }
];

export const HEADER_NAVIGATION = NAVIGATION_ITEMS.filter((item) => item.showInHeader);
export const BOTTOM_NAVIGATION = NAVIGATION_ITEMS.filter((item) => item.showInBottomBar);

export function stopImpersonating() {
    localStorage.removeItem('impersonate_user_id');
    window.location.href = '/admin';
}
