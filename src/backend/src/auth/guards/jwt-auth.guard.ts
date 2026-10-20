import { ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTokenScope } from '../../../prisma/generated/client.js';
import { ApiTokensService } from '../../api-tokens/api-tokens.service.js';
import { type RequestWithUser } from '../interfaces/request-with-user.interface.js';

/**
 * Authenticates either a normal session (Authorization: Bearer …) or a
 * long-lived personal token (X-API-Token: legacy-calendar-…). Every guarded
 * controller keeps working without changes, and read-only tokens are rejected
 * centrally before a write operation reaches the handler.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(@Inject(ApiTokensService) private readonly apiTokensService: ApiTokensService) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithUser>();
        const apiToken = this.extractApiToken(request);

        if (apiToken) {
            const identity = await this.apiTokensService.authenticate(apiToken);
            if (!identity) {
                throw new UnauthorizedException('Missing or invalid authentication token');
            }

            if (!this.isRequestAllowed(identity.scope, request)) {
                throw new ForbiddenException('This API token is read-only and cannot perform write operations');
            }

            request.user = {
                userId: identity.userId,
                id: identity.userId,
                username: identity.username,
                isAdmin: identity.isAdmin
            };
            request.authMethod = 'api-token';
            request.apiTokenId = identity.tokenId;
            request.apiTokenScope = identity.scope;
            return true;
        }

        request.authMethod = 'session';
        return (await super.canActivate(context)) as boolean;
    }

    handleRequest<TUser = any>(err: any, user: TUser, _info: any): TUser {
        if (err || !user) {
            throw err || new UnauthorizedException('Missing or invalid authentication token');
        }
        return user;
    }

    private extractApiToken(request: RequestWithUser): string | null {
        const header = request.headers['x-api-token'];
        const value = Array.isArray(header) ? header[0] : header;
        return typeof value === 'string' && value.trim() ? value.trim() : null;
    }

    private isRequestAllowed(scope: ApiTokenScope, request: RequestWithUser): boolean {
        if (scope === ApiTokenScope.write) {
            return true;
        }

        const method = request.method.toUpperCase();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
            return true;
        }

        // Profile lookup is a POST for historical reasons but does not mutate
        // anything, so read-only integrations may call it.
        return method === 'POST' && request.path === '/auth/profile';
    }
}
