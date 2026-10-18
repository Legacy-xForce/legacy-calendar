import { BANK_DOMAINS } from '../constants/bankDomains';
import { getItalianAbi } from './iban';

// Bank logo provider. Brandfetch is the default; set `VITE_BRANDFETCH_CLIENT_ID`
// to your client ID from https://developers.brandfetch.com. For any other provider,
// set `VITE_BANK_LOGO_URL` to a URL template with a `{domain}` placeholder, e.g.
// https://img.logo.dev/{domain}?token=pk_KEY&size=128. With neither set, the app
// stays offline and renders monograms only.
const BRANDFETCH_CLIENT_ID = import.meta.env.VITE_BRANDFETCH_CLIENT_ID;
const LOGO_URL_TEMPLATE = import.meta.env.VITE_BANK_LOGO_URL;

// Brandfetch answers an unknown brand with a generic placeholder image (HTTP 200)
// unless told otherwise. `fallback/404` makes the <img> error out instead, so
// BankLogo can fall back to its own monogram. See
// https://docs.brandfetch.com/logo-api/overview
const urlTemplate = BRANDFETCH_CLIENT_ID
    ? `https://cdn.brandfetch.io/domain/{domain}/fallback/404/icon?c=${BRANDFETCH_CLIENT_ID}`
    : (LOGO_URL_TEMPLATE ?? '');

/**
 * Remote logo URL for the bank behind an Italian IBAN, or `null` when no logo
 * provider is configured or the bank's domain is unknown. Callers should always
 * have a monogram/local fallback: the image may 404 or be slow.
 */
export function getBankLogoUrl(iban?: string | null): string | null {
    if (!urlTemplate) return null;
    const abi = getItalianAbi(iban);
    const domain = abi ? BANK_DOMAINS[abi] : undefined;
    return domain ? urlTemplate.replace('{domain}', domain) : null;
}
