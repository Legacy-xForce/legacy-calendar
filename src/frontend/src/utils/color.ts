import { DEFAULT_COLOR } from '../constants/colors';

const SHORT_HEX_COLOR = /^#([\da-f]{3})$/i;
const LONG_HEX_COLOR = /^#([\da-f]{6})$/i;

function expandShortHex(match: RegExpMatchArray) {
    return `#${match[1]
        .split('')
        .map((value) => `${value}${value}`)
        .join('')}`.toLowerCase();
}

export function normalizeHexColor(color: string | undefined, fallback = DEFAULT_COLOR) {
    if (!color) return fallback;

    const trimmed = color.trim();
    if (LONG_HEX_COLOR.test(trimmed)) return trimmed.toLowerCase();

    const shortHexMatch = trimmed.match(SHORT_HEX_COLOR);
    if (shortHexMatch) return expandShortHex(shortHexMatch);

    return fallback;
}
