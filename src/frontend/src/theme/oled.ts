import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

const OledPreset = definePreset(Aura, {
    semantic: {
        colorScheme: {
            dark: {
                highlight: {
                    background: '{surface.800}',
                    focusBackground: '{surface.700}',
                    color: '{surface.0}',
                    focusColor: '{surface.0}'
                },
                surface: {
                    0: '#ffffff',
                    50: '#fafafa',
                    100: '#f5f5f5',
                    200: '#e5e5e5',
                    300: '#d4d4d4',
                    400: '#a3a3a3',
                    500: '#737373',
                    600: '#525252',
                    700: '#404040',
                    800: '#262626',
                    900: '#0a0a0a',
                    950: '#000000'
                }
            }
        }
    }
});

export default OledPreset;
