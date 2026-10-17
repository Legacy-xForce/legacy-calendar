import type { EventFeature } from '../types/Event';

export interface FeatureConfig {
    id: EventFeature;
    label: string;
    icon: string;
    color: string;
}

export const FEATURES: FeatureConfig[] = [
    {
        id: 'FOOD',
        label: 'Food',
        icon: '🍗',
        color: 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 ring-green-500'
    },
    {
        id: 'WEED',
        label: 'Weed',
        icon: '🌿',
        color: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300 ring-emerald-500'
    },
    {
        id: 'ALCOHOL',
        label: 'Alcohol',
        icon: '🍾',
        color: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 ring-indigo-500'
    },
    {
        id: 'BEER',
        label: 'Beer',
        icon: '🍺',
        color: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-300 ring-yellow-500'
    },
    {
        id: 'SLEEP',
        label: 'Sleep',
        icon: '🌙',
        color: 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 ring-purple-500'
    }
];
