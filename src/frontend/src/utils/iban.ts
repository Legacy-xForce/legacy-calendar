import { ITALIAN_BANKS } from '../constants/italianBanks';

/** Electronic form of an IBAN: no spaces, upper case. */
export function normalizeIban(iban: string): string {
    return iban.replace(/\s+/g, '').toUpperCase();
}

/** Readable form, grouped in blocks of four: `IT60 X054 2811 ...`. */
export function formatIban(iban: string): string {
    return normalizeIban(iban)
        .replace(/(.{4})/g, '$1 ')
        .trim();
}

// ISO 13616 IBAN: two-letter country, two check digits, then a country-specific
// BBAN of letters and digits.
const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/**
 * ISO 7064 MOD 97-10 checksum over the rearranged IBAN (country code and check
 * digits moved to the end, letters replaced by their two-digit values A=10..Z=35).
 */
function mod97(iban: string): number {
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let remainder = 0;
    for (const char of rearranged) {
        const code = char.charCodeAt(0);
        const value = code > 57 ? String(code - 55) : char;
        for (const digit of value) {
            remainder = (remainder * 10 + Number(digit)) % 97;
        }
    }
    return remainder;
}

/** Whether the string is a syntactically valid IBAN (shape + checksum). */
export function isValidIban(iban: string): boolean {
    const value = normalizeIban(iban);
    return IBAN_SHAPE.test(value) && mod97(value) === 1;
}

/**
 * ABI bank code of an Italian IBAN (positions 6-10, after the `IT` country code,
 * the two check digits and the CIN letter). Returns `null` for an invalid or
 * non-Italian IBAN.
 */
export function getItalianAbi(iban?: string | null): string | null {
    if (!iban) return null;
    const value = normalizeIban(iban);
    if (!value.startsWith('IT') || !isValidIban(value)) return null;
    return value.slice(5, 10);
}

/**
 * Bank name for an Italian IBAN, from its ABI code. Returns `null` for an invalid
 * IBAN, a non-Italian IBAN, or an ABI code not in the register.
 */
export function getItalianBankName(iban?: string | null): string | null {
    const abi = getItalianAbi(iban);
    return abi ? (ITALIAN_BANKS[abi] ?? null) : null;
}
