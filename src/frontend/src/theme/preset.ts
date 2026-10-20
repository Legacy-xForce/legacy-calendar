import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura-compat';

/*
 * The palette lives in style.css (`--color-*` custom properties), so PrimeVue
 * tokens point at those variables instead of duplicating hex values here. That
 * keeps the Tailwind utilities and PrimeVue components in sync when the theme
 * changes at runtime.
 */
const surface = {
    0: 'var(--color-surface-0)',
    50: 'var(--color-surface-50)',
    100: 'var(--color-surface-100)',
    200: 'var(--color-surface-200)',
    300: 'var(--color-surface-300)',
    400: 'var(--color-surface-400)',
    500: 'var(--color-surface-500)',
    600: 'var(--color-surface-600)',
    700: 'var(--color-surface-700)',
    800: 'var(--color-surface-800)',
    900: 'var(--color-surface-900)',
    950: 'var(--color-surface-950)'
};

const createColorScheme = () => ({
    surface,
    primary: {
        color: 'var(--color-primary)',
        contrastColor: 'var(--color-primary-contrast)',
        hoverColor: 'var(--color-primary-hover)',
        activeColor: 'var(--color-primary-active)'
    },
    highlight: {
        background: 'var(--color-surface-800)',
        focusBackground: 'var(--color-surface-700)',
        color: 'var(--color-fg)',
        focusColor: 'var(--color-fg)'
    },
    mask: {
        background: 'var(--color-mask)',
        color: 'var(--color-surface-200)'
    },
    formField: {
        background: 'var(--color-surface-900)',
        disabledBackground: 'var(--color-surface-800)',
        filledBackground: 'var(--color-surface-800)',
        borderColor: 'var(--color-surface-800)',
        hoverBorderColor: 'var(--color-surface-700)',
        focusBorderColor: 'var(--color-primary)',
        invalidBorderColor: 'var(--color-rose-400)',
        invalidPlaceholderColor: 'var(--color-rose-400)',
        color: 'var(--color-fg)',
        placeholderColor: 'var(--color-subtle)',
        iconColor: 'var(--color-surface-400)',
        shadow: 'none'
    },
    text: {
        color: 'var(--color-fg)',
        hoverColor: 'var(--color-fg-strong)',
        mutedColor: 'var(--color-muted)',
        hoverMutedColor: 'var(--color-muted-strong)'
    },
    content: {
        background: 'var(--color-raised)',
        hoverBackground: 'var(--color-surface-900)',
        borderColor: 'var(--color-surface-800)',
        color: 'var(--color-fg)',
        hoverColor: 'var(--color-fg-strong)'
    },
    overlay: {
        select: {
            background: 'var(--color-surface-900)',
            borderColor: 'var(--color-surface-800)',
            color: 'var(--color-fg)'
        },
        popover: {
            background: 'var(--color-surface-900)',
            borderColor: 'var(--color-surface-800)',
            color: 'var(--color-fg)'
        },
        modal: {
            background: 'var(--color-raised)',
            borderColor: 'var(--color-surface-800)',
            color: 'var(--color-fg)'
        }
    },
    list: {
        option: {
            focusBackground: 'var(--color-surface-800)'
        }
    },
    navigation: {
        item: {
            focusBackground: 'var(--color-surface-800)',
            activeBackground: 'var(--color-surface-800)'
        }
    }
});

// Both schemes use the same CSS variables. Toggling `.dark` only changes the
// native `color-scheme`; the palette is inherited from `data-theme`.
const scheme = <T>(factory: () => T): { light: T; dark: T } => ({ light: factory(), dark: factory() });

const AppPreset = definePreset(Aura, {
    primitive: {
        borderRadius: {
            none: '0',
            xs: '4px',
            sm: '6px',
            md: '10px',
            lg: '12px',
            xl: '20px'
        }
    },
    semantic: {
        transitionDuration: '0.16s',
        focusRing: {
            width: '2px',
            style: 'solid',
            color: 'var(--color-accent)',
            offset: '2px'
        },
        formField: {
            paddingX: '0.875rem',
            paddingY: '0.6875rem',
            borderRadius: '12px'
        },
        overlay: {
            select: { borderRadius: '14px', shadow: 'var(--shadow-overlay)' },
            popover: { borderRadius: '16px', shadow: 'var(--shadow-overlay)' },
            modal: { borderRadius: '20px', padding: '1.25rem', shadow: 'var(--shadow-modal)' }
        },
        colorScheme: scheme(createColorScheme)
    },
    components: {
        dialog: {
            header: { padding: '1.25rem 1.25rem 0.75rem' },
            title: { fontSize: '1.125rem', fontWeight: '600' },
            content: { padding: '0 1.25rem 1.25rem' },
            footer: { padding: '0.75rem 1.25rem 1.25rem', gap: '0.5rem' }
        },
        avatar: {
            root: { fontSize: '0.8125rem', background: 'var(--color-surface-800)', color: 'var(--color-surface-100)' },
            group: { borderColor: 'var(--color-raised)', offset: '-0.5rem' }
        },
        toggleswitch: {
            root: { width: '2.75rem', height: '1.625rem' },
            handle: { size: '1.125rem' },
            colorScheme: scheme(() => ({
                root: { background: 'var(--color-surface-700)', hoverBackground: 'var(--color-surface-600)' },
                handle: { background: 'var(--color-surface-200)', hoverBackground: 'var(--color-surface-100)' }
            }))
        },
        togglebutton: {
            root: { padding: '0.25rem', borderRadius: '12px' },
            content: { padding: '0.5rem 0.75rem', borderRadius: '9px', checkedShadow: 'none' },
            colorScheme: scheme(() => ({
                root: {
                    background: 'var(--color-surface-900)',
                    checkedBackground: 'var(--color-surface-900)',
                    hoverBackground: 'var(--color-surface-900)',
                    borderColor: 'var(--color-surface-900)',
                    checkedBorderColor: 'var(--color-surface-900)',
                    color: 'var(--color-surface-400)',
                    hoverColor: 'var(--color-surface-200)',
                    checkedColor: 'var(--color-fg)'
                },
                content: { checkedBackground: 'var(--color-surface-800)' },
                icon: {
                    color: 'var(--color-surface-400)',
                    hoverColor: 'var(--color-surface-200)',
                    checkedColor: 'var(--color-fg)'
                }
            }))
        },
        datatable: {
            colorScheme: scheme(() => ({
                header: { background: 'transparent' },
                headerCell: { background: 'transparent', borderColor: 'var(--color-surface-800)' },
                row: { background: 'transparent', hoverBackground: 'var(--color-surface-900)' },
                bodyCell: { borderColor: 'var(--color-surface-800)' }
            }))
        },
        accordion: {
            colorScheme: scheme(() => ({
                header: {
                    background: 'transparent',
                    hoverBackground: 'transparent',
                    activeBackground: 'transparent',
                    activeHoverBackground: 'transparent'
                },
                content: { background: 'transparent' }
            }))
        },
        progressspinner: {
            colorScheme: scheme(() => ({
                root: {
                    colorOne: 'var(--color-surface-400)',
                    colorTwo: 'var(--color-surface-400)',
                    colorThree: 'var(--color-surface-400)',
                    colorFour: 'var(--color-surface-400)'
                }
            }))
        }
    }
});

export default AppPreset;
