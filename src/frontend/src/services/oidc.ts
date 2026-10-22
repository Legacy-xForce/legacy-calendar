import * as oauth from 'oauth4webapi';

// Legacy Auth's OpenID Provider: authorization code + PKCE, as a public client (no secret).

export class AuthError extends Error {
    readonly status: number;

    constructor(message: string, status = 0) {
        super(message);
        this.name = 'AuthError';
        this.status = status;
    }
}

/** The OP refused the grant or the refresh token (invalid_grant and the like): the session is over. */
export class AuthRejectedError extends AuthError {
    constructor(message: string, status: number) {
        super(message, status);
        this.name = 'AuthRejectedError';
    }
}

/** The OP turned the sign-in down (`error=access_denied`): this account can't use the calendar. */
export class SignInDeniedError extends AuthError {
    constructor() {
        super("This account can't use Legacy Calendar.", 403);
        this.name = 'SignInDeniedError';
    }
}

export const authBaseURL = import.meta.env.VITE_AUTH_URL || 'https://auth.legacy-group.tech';
const CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID || 'calendar-spa';
const CALENDAR_RESOURCE = 'urn:legacy:calendar';
// `offline_access` gets a refresh token; the OP only grants it with `prompt=consent`.
const SCOPES = 'openid profile offline_access calendar.read calendar.write';

export const CALLBACK_PATH = '/callback';
const PENDING_KEY = 'legacycalendar.oidc.pending';

export interface GrantTokens {
    accessToken: string;
    refreshToken: string;
    /** Epoch ms. */
    expiresAt: number;
}

export interface SignInResult extends GrantTokens {
    idToken: string;
    returnTo: string;
}

interface PendingSignIn {
    state: string;
    nonce: string;
    verifier: string;
    returnTo: string;
}

const issuer = new URL(authBaseURL);
const client: oauth.Client = { client_id: CLIENT_ID, id_token_signed_response_alg: 'ES256' };
const clientAuth = oauth.None();
// Only a local OP runs on plain http.
const httpOptions = issuer.protocol === 'http:' ? { [oauth.allowInsecureRequests]: true } : {};

let discovery: Promise<oauth.AuthorizationServer> | null = null;

/** Turns library and network failures into the AuthError family. */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (error) {
        if (error instanceof AuthError) throw error;
        if (error instanceof oauth.ResponseBodyError) {
            // 400/401 with an OAuth error: the OP refused (invalid_grant, invalid_target, ...).
            if (error.status >= 400 && error.status < 500) {
                throw new AuthRejectedError(`Session rejected (${error.error}).`, error.status);
            }
            throw new AuthError('The sign-in server had a problem.', error.status);
        }
        if (error instanceof TypeError) throw new AuthError('Unable to reach the sign-in server.', 0);
        throw new AuthError('Unexpected response from the sign-in server.', 0);
    }
}

function server(): Promise<oauth.AuthorizationServer> {
    discovery ??= guarded(async () =>
        oauth.processDiscoveryResponse(issuer, await oauth.discoveryRequest(issuer, httpOptions))
    ).catch((error: unknown) => {
        discovery = null;
        throw error;
    });
    return discovery;
}

function redirectUri(): string {
    return window.location.origin + CALLBACK_PATH;
}

function readGrant(response: oauth.TokenEndpointResponse, now: number): GrantTokens {
    if (!response.refresh_token) throw new AuthError('The sign-in server sent no refresh token.', 0);
    return {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresAt: now + (response.expires_in ?? 300) * 1000
    };
}

/**
 * The URL that starts a sign-in at the OP. Remembers the PKCE verifier, state and nonce for
 * {@link finishSignIn} in sessionStorage (this tab only). `switchAccount` makes the OP ask for
 * credentials even when a Legacy session exists.
 */
export async function signInUrl(returnTo: string, switchAccount = false): Promise<string> {
    const as = await server();
    const pending: PendingSignIn = {
        state: oauth.generateRandomState(),
        nonce: oauth.generateRandomNonce(),
        verifier: oauth.generateRandomCodeVerifier(),
        returnTo
    };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    const url = new URL(as.authorization_endpoint!);
    url.searchParams.set('client_id', client.client_id);
    url.searchParams.set('redirect_uri', redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('prompt', switchAccount ? 'login consent' : 'consent');
    url.searchParams.set('state', pending.state);
    url.searchParams.set('nonce', pending.nonce);
    url.searchParams.set('code_challenge', await oauth.calculatePKCECodeChallenge(pending.verifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('resource', CALENDAR_RESOURCE);
    return url.toString();
}

function takePending(): PendingSignIn | null {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as PendingSignIn;
    } catch {
        return null;
    }
}

/** Completes a sign-in from the OP's redirect to {@link CALLBACK_PATH}. */
export async function finishSignIn(callbackUrl: URL): Promise<SignInResult> {
    const pending = takePending();
    if (!pending) throw new AuthError('The sign-in expired. Please try again.', 0);
    return guarded(async () => {
        const as = await server();
        let params: URLSearchParams;
        try {
            params = oauth.validateAuthResponse(as, client, callbackUrl, pending.state);
        } catch (error) {
            if (error instanceof oauth.AuthorizationResponseError && error.error === 'access_denied') {
                throw new SignInDeniedError();
            }
            throw new AuthError('Sign-in failed. Please try again.', 0);
        }
        const response = await oauth.authorizationCodeGrantRequest(
            as,
            client,
            clientAuth,
            params,
            redirectUri(),
            pending.verifier,
            { ...httpOptions, additionalParameters: { resource: CALENDAR_RESOURCE } }
        );
        const now = Date.now();
        const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
            expectedNonce: pending.nonce,
            requireIdToken: true
        });
        return { ...readGrant(result, now), idToken: result.id_token!, returnTo: pending.returnTo };
    });
}

/**
 * Trades the refresh token for a new access token. The OP rotates the refresh token on every
 * use, so the caller must store the new one before anything else uses the grant.
 */
export async function refreshGrant(refreshToken: string): Promise<GrantTokens> {
    return guarded(async () => {
        const as = await server();
        const response = await oauth.refreshTokenGrantRequest(as, client, clientAuth, refreshToken, {
            ...httpOptions,
            additionalParameters: { resource: CALENDAR_RESOURCE }
        });
        const now = Date.now();
        return readGrant(await oauth.processRefreshTokenResponse(as, client, response), now);
    });
}

/** Where to send the browser to end the OP session (every Legacy app signed in through it). */
export async function signOutUrl(idToken: string | null): Promise<string> {
    const as = await server();
    const url = new URL(as.end_session_endpoint!);
    url.searchParams.set('client_id', client.client_id);
    url.searchParams.set('post_logout_redirect_uri', window.location.origin + '/');
    if (idToken) url.searchParams.set('id_token_hint', idToken);
    return url.toString();
}

/** The profile (name, picture, password, passkeys) is managed at Legacy Auth, not in the calendar. */
export const accountSettingsURL = `${authBaseURL}/settings`;
