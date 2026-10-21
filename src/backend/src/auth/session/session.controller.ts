import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    HttpCode,
    Inject,
    Post,
    Query,
    Req,
    Res,
    UseGuards
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AppLogger } from '../../logging/app-logger.js';
import { getFrontendUrl } from '../../config/frontend-url.js';
import { getOidcRedirectUri } from '../../config/oidc.js';
import { AuthIdentityService } from '../auth-identity.service.js';
import { BackchannelLogoutService } from './backchannel-logout.service.js';
import { OidcClientService, OidcGrantError, type OidcTokens } from './oidc-client.service.js';
import { SessionService } from './session.service.js';
import {
    LOGIN_ATTEMPT_TTL_MS,
    clearLoginCookie,
    clearSessionCookie,
    hashCookieValue,
    isSameOriginRequest,
    loginCookieName,
    newCookieValue,
    readCookie,
    sessionCookieName,
    setLoginCookie,
    setSessionCookie
} from './session-cookies.js';

const DEFAULT_RETURN_TO = '/calendar';

const hasControlCharacter = (value: string) =>
    [...value].some((char) => char.charCodeAt(0) < 0x20 || char === '\u007f');

/** Only a path on this site, so the callback can never become an open redirect. */
export function safeReturnTo(value: unknown): string {
    if (typeof value !== 'string' || value.length > 2048) return DEFAULT_RETURN_TO;
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || hasControlCharacter(value)) {
        return DEFAULT_RETURN_TO;
    }
    if (value === '/' || value.startsWith('/auth/')) return DEFAULT_RETURN_TO;
    return value;
}

const escapeHtml = (value: string) =>
    value.replace(
        /[&<>"']/g,
        (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
    );

/**
 * Signing in through Legacy Auth (OpenID Connect, Authorization Code + PKCE)
 * and the browser session that results. These are browser navigations and
 * server-to-server calls, not part of the JSON API, so they stay out of the
 * OpenAPI document.
 */
@ApiExcludeController()
@Controller('auth')
export class SessionController {
    private readonly logger = new AppLogger(SessionController.name);

    constructor(
        @Inject(PrismaService) private readonly prisma: PrismaService,
        @Inject(OidcClientService) private readonly oidcClient: OidcClientService,
        @Inject(SessionService) private readonly sessions: SessionService,
        @Inject(AuthIdentityService) private readonly identityService: AuthIdentityService,
        @Inject(BackchannelLogoutService) private readonly backchannel: BackchannelLogoutService
    ) {}

    /** Starts a sign-in: remembers the PKCE verifier, state and nonce for this browser and sends it to Legacy Auth. */
    @Get('login')
    @UseGuards(ThrottlerGuard)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    async login(@Query('returnTo') returnTo: unknown, @Query('prompt') prompt: unknown, @Res() res: Response) {
        const checks = this.oidcClient.newChecks();
        const url = await this.oidcClient.authorizationUrl(checks, { forceLogin: prompt === 'login' });

        const cookieValue = newCookieValue();
        await this.prisma.oidcLoginAttempt.create({
            data: {
                id: hashCookieValue(cookieValue),
                state: checks.state,
                nonce: checks.nonce,
                codeVerifier: checks.codeVerifier,
                returnTo: safeReturnTo(returnTo),
                expiresAt: new Date(Date.now() + LOGIN_ATTEMPT_TTL_MS)
            }
        });
        setLoginCookie(res, cookieValue);
        res.setHeader('cache-control', 'no-store');
        res.redirect(302, url.toString());
    }

    /** Where Legacy Auth sends the browser back: redeem the code, open a session, continue in the app. */
    @Get('callback')
    @UseGuards(ThrottlerGuard)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    async callback(@Req() req: Request, @Res() res: Response) {
        res.setHeader('cache-control', 'no-store');
        const loginCookie = readCookie(req, loginCookieName());
        const attempt = loginCookie
            ? await this.prisma.oidcLoginAttempt.findUnique({ where: { id: hashCookieValue(loginCookie) } })
            : null;
        clearLoginCookie(res);
        if (attempt) {
            // Single use, whatever happens next.
            await this.prisma.oidcLoginAttempt.deleteMany({ where: { id: attempt.id } });
        }

        const error = typeof req.query.error === 'string' ? req.query.error : null;
        if (error) {
            return this.handleProviderError(
                res,
                error,
                typeof req.query.error_description === 'string' ? req.query.error_description : ''
            );
        }

        if (!attempt || attempt.expiresAt.getTime() <= Date.now()) {
            return this.failurePage(res, 400, 'This sign-in link has expired or was opened in another browser.');
        }
        if (req.query.state !== attempt.state) {
            return this.failurePage(res, 400, 'The sign-in response did not match the request.');
        }

        // The URL the provider redirected to, as registered: behind the proxy, req.protocol/host are not trustworthy.
        const callbackUrl = new URL(getOidcRedirectUri());
        callbackUrl.search = new URL(req.originalUrl, 'http://placeholder').search;

        let tokens: OidcTokens;
        try {
            tokens = await this.oidcClient.exchangeCode(callbackUrl, attempt);
        } catch (failure) {
            if (failure instanceof OidcGrantError) {
                this.logger.warn('Code exchange refused', { error: failure.error });
                return this.failurePage(res, 400, 'Legacy Auth refused the sign-in. Please try again.');
            }
            this.logger.error('Code exchange failed', failure);
            return this.failurePage(res, 502, 'Could not complete the sign-in with Legacy Auth. Please try again.');
        }

        const identity = await this.identityService.resolveToken(tokens.accessToken).catch(() => null);
        if (!identity || !tokens.claims || !tokens.refreshToken) {
            // Only a token for the calendar, with the calendar scope, opens a session.
            return res.redirect(302, '/insufficient-scope');
        }
        const accessClaims = await this.identityService.verifySignedByAuth(tokens.accessToken);
        if (accessClaims.sub !== tokens.claims.sub) {
            return this.failurePage(res, 400, 'The sign-in response was inconsistent.');
        }

        const sessionCookie = await this.sessions.create({
            userId: identity.userId,
            authSub: tokens.claims.sub,
            sid: typeof tokens.claims.sid === 'string' ? tokens.claims.sid : null,
            tokens
        });

        // Signing in replaces whatever session this browser had.
        const previous = readCookie(req, sessionCookieName());
        if (previous) await this.sessions.delete(hashCookieValue(previous));

        setSessionCookie(res, sessionCookie);
        return res.redirect(302, attempt.returnTo);
    }

    /**
     * Ends this browser's session and returns where to send the browser next:
     * Legacy Auth's logout, which ends the single sign-on session for every app.
     */
    @Post('logout')
    @HttpCode(200)
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ redirect: string }> {
        if (!isSameOriginRequest(req)) {
            throw new ForbiddenException('Cross-site request refused');
        }
        res.setHeader('cache-control', 'no-store');
        const cookie = readCookie(req, sessionCookieName());
        const session = cookie ? await this.sessions.idTokenFor(cookie) : null;
        clearSessionCookie(res);
        if (session) await this.sessions.delete(session.id);

        const endSession = await this.oidcClient
            .endSessionUrl(session?.idToken ?? null, newCookieValue())
            .catch(() => null);
        return { redirect: endSession?.toString() ?? `${getFrontendUrl().replace(/\/+$/, '')}/` };
    }

    /** OpenID Connect Back-Channel Logout: Legacy Auth tells us a sign-on session ended. */
    @Post('backchannel-logout')
    async backchannelLogout(@Body() body: Record<string, unknown>, @Res() res: Response) {
        res.setHeader('cache-control', 'no-store');
        const token = typeof body?.logout_token === 'string' ? body.logout_token : null;
        const target = token ? await this.backchannel.verify(token) : null;
        if (!target) {
            return res.status(400).json({ error: 'invalid_request' });
        }
        const ended = await this.sessions.revokeByProviderSession(target);
        this.logger.info('Back-channel logout', { sessions: ended });
        return res.status(204).end();
    }

    private handleProviderError(res: Response, error: string, description: string) {
        if (error === 'access_denied') {
            if (/cancel/i.test(description)) {
                return this.failurePage(res, 200, 'Sign-in was cancelled.');
            }
            return res.redirect(
                302,
                /not available|turned off|disabled/i.test(description) ? '/disabled' : '/insufficient-scope'
            );
        }
        if (error === 'login_required' || error === 'interaction_required' || error === 'consent_required') {
            return res.redirect(302, '/auth/login');
        }
        this.logger.warn('Sign-in failed at the provider', { error });
        return this.failurePage(res, 400, 'Legacy Auth could not complete the sign-in. Please try again.');
    }

    /** A bare page for failures before the app can take over; it only offers to start again. */
    private failurePage(res: Response, status: number, message: string) {
        res.status(status)
            .type('html')
            .setHeader(
                'content-security-policy',
                "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"
            )
            .send(
                `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
                    `<title>Legacy Calendar</title><style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;line-height:1.5}` +
                    `a{display:inline-block;margin-top:1rem;padding:.6rem 1rem;border-radius:.5rem;background:#2563eb;color:#fff;text-decoration:none}</style></head>` +
                    `<body><h1>Sign-in</h1><p>${escapeHtml(message)}</p><a href="/auth/login">Sign in</a></body></html>`
            );
    }
}
