import { parseJwtPayload } from './jwt';

/**
 * Single source of the account-state policy: which accounts are unusable, where
 * each state redirects, and how that state is read from a token or an API error.
 * The router guard, both login flows and the Axios interceptor all go through here.
 */
export type AccountIssue = 'disabled' | 'insufficient-scope';

const ACCOUNT_ISSUE_ROUTES: Record<AccountIssue, string> = {
    disabled: 'disabled-account',
    'insufficient-scope': 'insufficient-scope'
};

const ACCOUNT_ISSUE_PATHS: Record<AccountIssue, string> = {
    disabled: '/disabled',
    'insufficient-scope': '/insufficient-scope'
};

/** Route name the guard should navigate to for a given issue. */
export function accountIssueRoute(issue: AccountIssue): string {
    return ACCOUNT_ISSUE_ROUTES[issue];
}

/** Account state carried by the token claims, if any. */
export function accountIssueFromToken(token: string | null | undefined): AccountIssue | null {
    if (!token) return null;

    const payload = parseJwtPayload(token);
    if (!payload) return null;

    if (payload.disabled === true || payload.status === 'disabled' || payload.accountStatus === 'disabled') {
        return 'disabled';
    }

    return tokenHasCalendarScope(payload) ? null : 'insufficient-scope';
}

/** Account state implied by an API error, if any. */
export function accountIssueFromError(error: unknown): AccountIssue | null {
    const response = (error as { response?: { data?: unknown } } | undefined)?.response;
    if (!response) return null;

    const data = (response.data ?? {}) as {
        message?: unknown;
        error?: unknown;
        status?: unknown;
        accountStatus?: unknown;
    };
    const message = String(data.message ?? data.error ?? '').toLowerCase();

    if (data.status === 'disabled' || data.accountStatus === 'disabled' || message.includes('disabled')) {
        return 'disabled';
    }

    if (data.error === 'insufficient_scope' || message.includes('scope') || message.includes('permission')) {
        return 'insufficient-scope';
    }

    return null;
}

/** Send the browser to the notice page for an issue, unless it is already there. */
export function redirectToAccountNotice(issue: AccountIssue): void {
    const path = ACCOUNT_ISSUE_PATHS[issue];
    if (window.location.pathname.startsWith(path)) return;
    window.location.href = path;
}

/**
 * Redirect when the token belongs to an unusable account.
 * Returns false when a redirect happened, true when the session may continue.
 */
export function assertAccountUsable(token: string): boolean {
    const issue = accountIssueFromToken(token);
    if (!issue) return true;

    redirectToAccountNotice(issue);
    return false;
}

function tokenHasCalendarScope(payload: any): boolean {
    if (payload.scope === undefined && payload.scopes === undefined) return true;

    if (payload.scopes && typeof payload.scopes === 'object' && !Array.isArray(payload.scopes)) {
        return payload.scopes.calendar === true || payload.scopes['*'] === true || payload.scopes.all === true;
    }

    const scopes: string[] = Array.isArray(payload.scopes)
        ? payload.scopes
        : typeof payload.scope === 'string'
          ? payload.scope.split(' ').filter(Boolean)
          : [];

    if (scopes.length === 0) return false;
    return scopes.includes('calendar') || scopes.includes('*') || scopes.includes('all');
}
