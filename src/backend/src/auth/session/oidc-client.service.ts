import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as oidc from 'openid-client';
import { AppLogger } from '../../logging/app-logger.js';
import {
    CALENDAR_RESOURCE,
    OIDC_SCOPES,
    getOidcClientId,
    getOidcClientSecret,
    getOidcIssuer,
    getOidcPostLogoutRedirectUri,
    getOidcRedirectUri
} from '../../config/oidc.js';

export type AuthorizationChecks = {
    state: string;
    nonce: string;
    codeVerifier: string;
};

export type OidcTokens = {
    accessToken: string;
    refreshToken: string | null;
    idToken: string | null;
    /** Seconds until the access token expires, as the token endpoint said. */
    expiresIn: number;
    /** Validated ID token claims, when the response carried one. */
    claims: oidc.IDToken | undefined;
};

/** The provider said no to a grant (e.g. `invalid_grant`); a network failure is not one of these. */
export class OidcGrantError extends Error {
    constructor(
        readonly error: string,
        description?: string
    ) {
        super(description ? `${error}: ${description}` : error);
    }
}

/**
 * The calendar as a relying party of Legacy Auth (a confidential client,
 * `client_secret_basic`). Wraps openid-client so the session code only deals
 * in tokens. Discovery is fetched on first use and again after a failure, so
 * the API boots even while the auth service is down.
 */
@Injectable()
export class OidcClientService {
    private readonly logger = new AppLogger(OidcClientService.name);
    private configuration: Promise<oidc.Configuration> | null = null;

    private async config(): Promise<oidc.Configuration> {
        this.configuration ??= this.discover().catch((error: unknown) => {
            this.configuration = null;
            this.logger.error('OpenID Provider discovery failed', error);
            throw new ServiceUnavailableException('The sign-in service is unavailable');
        });
        return this.configuration;
    }

    private async discover(): Promise<oidc.Configuration> {
        const issuer = getOidcIssuer();
        const discoveryUrl = process.env.OIDC_DISCOVERY_URL?.trim() || `${issuer}/.well-known/openid-configuration`;
        const response = await fetch(discoveryUrl, { headers: { accept: 'application/json' } });
        if (!response.ok) {
            throw new Error(`Discovery answered ${response.status}`);
        }
        const metadata = (await response.json()) as oidc.ServerMetadata;
        // The document may be fetched from an internal address, but it must describe the issuer tokens carry.
        if (metadata.issuer !== issuer) {
            throw new Error(`Discovery describes issuer ${metadata.issuer}, expected ${issuer}`);
        }

        const configuration = new oidc.Configuration(
            metadata,
            getOidcClientId(),
            { id_token_signed_response_alg: 'ES256' },
            oidc.ClientSecretBasic(getOidcClientSecret())
        );
        // Local development and tests run the provider on plain http.
        if (process.env.NODE_ENV !== 'production' && metadata.token_endpoint?.startsWith('http://')) {
            oidc.allowInsecureRequests(configuration);
        }
        return configuration;
    }

    newChecks(): AuthorizationChecks {
        return { state: oidc.randomState(), nonce: oidc.randomNonce(), codeVerifier: oidc.randomPKCECodeVerifier() };
    }

    /** The /authorize URL for a sign-in. `prompt=consent` is what gets a refresh token for `offline_access`; consent itself is automatic. */
    async authorizationUrl(checks: AuthorizationChecks, options: { forceLogin?: boolean } = {}): Promise<URL> {
        return oidc.buildAuthorizationUrl(await this.config(), {
            redirect_uri: getOidcRedirectUri(),
            scope: OIDC_SCOPES,
            resource: CALENDAR_RESOURCE,
            code_challenge: await oidc.calculatePKCECodeChallenge(checks.codeVerifier),
            code_challenge_method: 'S256',
            state: checks.state,
            nonce: checks.nonce,
            prompt: options.forceLogin ? 'login consent' : 'consent'
        });
    }

    /** Redeems the code in `callbackUrl` (the redirect URI plus the query the provider sent) and validates the ID token. */
    async exchangeCode(callbackUrl: URL, checks: AuthorizationChecks): Promise<OidcTokens> {
        const configuration = await this.config();
        try {
            const response = await oidc.authorizationCodeGrant(configuration, callbackUrl, {
                expectedState: checks.state,
                expectedNonce: checks.nonce,
                pkceCodeVerifier: checks.codeVerifier,
                idTokenExpected: true
            });
            return this.toTokens(response);
        } catch (error) {
            throw this.grantError(error);
        }
    }

    async refresh(refreshToken: string): Promise<OidcTokens> {
        const configuration = await this.config();
        try {
            return this.toTokens(await oidc.refreshTokenGrant(configuration, refreshToken));
        } catch (error) {
            throw this.grantError(error);
        }
    }

    /** The provider's logout URL, or null when it has none. */
    async endSessionUrl(idToken: string | null, state: string): Promise<URL | null> {
        const configuration = await this.config();
        if (!configuration.serverMetadata().end_session_endpoint) {
            return null;
        }
        return oidc.buildEndSessionUrl(configuration, {
            post_logout_redirect_uri: getOidcPostLogoutRedirectUri(),
            state,
            ...(idToken ? { id_token_hint: idToken } : {})
        });
    }

    private toTokens(response: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers): OidcTokens {
        return {
            accessToken: response.access_token,
            refreshToken: response.refresh_token ?? null,
            idToken: response.id_token ?? null,
            expiresIn: response.expiresIn() ?? 300,
            claims: response.claims()
        };
    }

    /** Provider refusals become OidcGrantError; anything else (network, validation) is rethrown as is. */
    private grantError(error: unknown): unknown {
        if (error instanceof oidc.ResponseBodyError || error instanceof oidc.AuthorizationResponseError) {
            return new OidcGrantError(error.error, error.error_description);
        }
        return error;
    }
}
