import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { isOriginAllowed } from '../../config/cors.js';
import { useSecureCookies } from '../../config/oidc.js';

/**
 * Cookies of the browser session. `__Host-` pins them to this exact origin
 * (Secure, Path=/, no Domain); on plain-http development they drop the prefix,
 * which browsers only allow with Secure.
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 14 * 24 * 60 * 60 * 1000;
export const LOGIN_ATTEMPT_TTL_MS = 10 * 60 * 1000;

const prefix = () => (useSecureCookies() ? '__Host-' : '');
export const sessionCookieName = () => `${prefix()}calendar_session`;
export const loginCookieName = () => `${prefix()}calendar_login`;

function cookieOptions(maxAge: number): CookieOptions {
    return { httpOnly: true, secure: useSecureCookies(), sameSite: 'lax', path: '/', maxAge };
}

export function setSessionCookie(res: Response, value: string) {
    res.cookie(sessionCookieName(), value, cookieOptions(SESSION_TTL_MS));
}

export function clearSessionCookie(res: Response) {
    const { maxAge: _maxAge, ...options } = cookieOptions(0);
    res.clearCookie(sessionCookieName(), options);
}

export function setLoginCookie(res: Response, value: string) {
    res.cookie(loginCookieName(), value, cookieOptions(LOGIN_ATTEMPT_TTL_MS));
}

export function clearLoginCookie(res: Response) {
    const { maxAge: _maxAge, ...options } = cookieOptions(0);
    res.clearCookie(loginCookieName(), options);
}

/** A fresh opaque cookie value; only its hash is stored. */
export const newCookieValue = () => randomBytes(32).toString('base64url');
export const hashCookieValue = (value: string) => createHash('sha256').update(value).digest('hex');

/** Parses a `Cookie` header. Shared by HTTP requests and the Socket.IO handshake. */
export function parseCookies(header: string | string[] | undefined): Record<string, string> {
    const raw = Array.isArray(header) ? header.join('; ') : header;
    const cookies: Record<string, string> = {};
    if (!raw) {
        return cookies;
    }
    for (const part of raw.split(';')) {
        const index = part.indexOf('=');
        if (index <= 0) continue;
        const name = part.slice(0, index).trim();
        if (!name || name in cookies) continue;
        const value = part.slice(index + 1).trim();
        try {
            cookies[name] = decodeURIComponent(value);
        } catch {
            cookies[name] = value;
        }
    }
    return cookies;
}

export const readCookie = (req: Pick<Request, 'headers'>, name: string): string | null =>
    parseCookies(req.headers.cookie)[name] || null;

const header = (req: Pick<Request, 'headers'>, name: string) => {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
};

/**
 * CSRF defence for cookie-authenticated requests: SameSite=Lax stops most
 * cross-site sends, and this requires the browser to vouch for the origin too.
 * `Sec-Fetch-Site` when the browser sends it, otherwise an allowed `Origin`.
 */
export function isSameOriginRequest(req: Pick<Request, 'headers'>): boolean {
    const site = header(req, 'sec-fetch-site');
    const origin = header(req, 'origin');
    if (site) {
        return site === 'same-origin' || (site === 'same-site' && Boolean(origin) && isOriginAllowed(origin));
    }
    return Boolean(origin) && isOriginAllowed(origin);
}

export const isSafeMethod = (method: string) => ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
