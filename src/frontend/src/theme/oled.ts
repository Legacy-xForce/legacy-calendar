import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// Keep in sync with the `--color-surface-*` tokens in style.css.
const surface = {
    0: '#ffffff',
    50: '#f8fbf9',
    100: '#f1f4f3',
    200: '#e2e6e4',
    300: '#d1d5d3',
    400: '#9da3a0',
    500: '#747a77',
    600: '#505553',
    700: '#3c413f',
    800: '#252927',
    900: '#151817',
    950: '#090b0a'
};

const raised = '#0f1110';

const OledPreset = definePreset(Aura, {
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
            color: '{primary.color}',
            offset: '2px'
        },
        formField: {
            paddingX: '0.875rem',
            paddingY: '0.6875rem',
            borderRadius: '12px'
        },
        overlay: {
            select: { borderRadius: '14px', shadow: '0 18px 40px -16px rgba(0, 0, 0, 0.9)' },
            popover: { borderRadius: '16px', shadow: '0 18px 40px -16px rgba(0, 0, 0, 0.9)' },
            modal: { borderRadius: '20px', padding: '1.25rem', shadow: '0 24px 64px -24px rgba(0, 0, 0, 0.95)' }
        },
        colorScheme: {
            dark: {
                surface,
                primary: {
                    color: '{emerald.400}',
                    contrastColor: '#03140d',
                    hoverColor: '{emerald.300}',
                    activeColor: '{emerald.500}'
                },
                highlight: {
                    background: 'color-mix(in srgb, {emerald.400}, transparent 86%)',
                    focusBackground: 'color-mix(in srgb, {emerald.400}, transparent 78%)',
                    color: '{surface.50}',
                    focusColor: '{surface.50}'
                },
                mask: {
                    background: 'rgba(0, 0, 0, 0.72)',
                    color: '{surface.200}'
                },
                formField: {
                    background: '{surface.900}',
                    disabledBackground: '{surface.800}',
                    filledBackground: '{surface.800}',
                    borderColor: '{surface.800}',
                    hoverBorderColor: '{surface.700}',
                    focusBorderColor: '{primary.color}',
                    color: '{surface.50}',
                    placeholderColor: '{surface.500}',
                    iconColor: '{surface.400}',
                    shadow: 'none'
                },
                text: {
                    color: '{surface.50}',
                    hoverColor: '{surface.0}',
                    mutedColor: '{surface.400}',
                    hoverMutedColor: '{surface.300}'
                },
                content: {
                    background: raised,
                    hoverBackground: '{surface.900}',
                    borderColor: '{surface.800}',
                    color: '{text.color}',
                    hoverColor: '{text.hover.color}'
                },
                overlay: {
                    select: { background: '{surface.900}', borderColor: '{surface.800}', color: '{text.color}' },
                    popover: { background: '{surface.900}', borderColor: '{surface.800}', color: '{text.color}' },
                    modal: { background: raised, borderColor: '{surface.800}', color: '{text.color}' }
                },
                list: {
                    option: {
                        focusBackground: '{surface.800}'
                    }
                },
                navigation: {
                    item: {
                        focusBackground: '{surface.800}',
                        activeBackground: '{surface.800}'
                    }
                }
            }
        }
    },
    components: {
        dialog: {
            header: { padding: '1.25rem 1.25rem 0.75rem' },
            title: { fontSize: '1.125rem', fontWeight: '600' },
            content: { padding: '0 1.25rem 1.25rem' },
            footer: { padding: '0.75rem 1.25rem 1.25rem', gap: '0.5rem' }
        },
        avatar: {
            root: { fontSize: '0.8125rem', background: '{surface.800}', color: '{surface.100}' },
            group: { borderColor: raised, offset: '-0.5rem' }
        },
        toggleswitch: {
            root: { width: '2.75rem', height: '1.625rem' },
            handle: { size: '1.125rem' },
            colorScheme: {
                dark: {
                    root: { background: '{surface.700}', hoverBackground: '{surface.600}' },
                    handle: { background: '{surface.200}', hoverBackground: '{surface.100}' }
                }
            }
        },
        togglebutton: {
            root: { padding: '0.25rem', borderRadius: '12px' },
            content: { padding: '0.5rem 0.75rem', borderRadius: '9px', checkedShadow: 'none' },
            colorScheme: {
                dark: {
                    root: {
                        background: '{surface.900}',
                        checkedBackground: '{surface.900}',
                        hoverBackground: '{surface.900}',
                        borderColor: '{surface.900}',
                        checkedBorderColor: '{surface.900}',
                        color: '{surface.400}',
                        hoverColor: '{surface.200}',
                        checkedColor: '{surface.50}'
                    },
                    content: { checkedBackground: '{surface.800}' },
                    icon: { color: '{surface.400}', hoverColor: '{surface.200}', checkedColor: '{surface.50}' }
                }
            }
        },
        datatable: {
            colorScheme: {
                dark: {
                    header: { background: 'transparent' },
                    headerCell: { background: 'transparent', borderColor: '{surface.800}' },
                    row: { background: 'transparent', hoverBackground: '{surface.900}' },
                    bodyCell: { borderColor: '{surface.800}' }
                }
            }
        },
        accordion: {
            colorScheme: {
                dark: {
                    header: {
                        background: 'transparent',
                        hoverBackground: 'transparent',
                        activeBackground: 'transparent',
                        activeHoverBackground: 'transparent'
                    },
                    content: { background: 'transparent' }
                }
            }
        },
        progressspinner: {
            colorScheme: {
                dark: {
                    root: {
                        colorOne: '{surface.400}',
                        colorTwo: '{surface.400}',
                        colorThree: '{surface.400}',
                        colorFour: '{surface.400}'
                    }
                }
            }
        }
    }
});

export default OledPreset;
