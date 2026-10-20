import { ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ApiTokensService } from '../../api-tokens/api-tokens.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { type RequestWithUser } from '../interfaces/request-with-user.interface.js';

/**
 * Guard for endpoints that must be driven by a real login session. Token
 * management is deliberately excluded from API-token access: a leaked token
 * must not be able to mint replacements or escalate its own scope.
 */
@Injectable()
export class SessionAuthGuard extends JwtAuthGuard {
    constructor(@Inject(ApiTokensService) apiTokensService: ApiTokensService) {
        super(apiTokensService);
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const allowed = await super.canActivate(context);
        const request = context.switchToHttp().getRequest<RequestWithUser>();

        if (request.authMethod === 'api-token') {
            throw new ForbiddenException('API tokens cannot manage API tokens; use a session token');
        }

        return allowed;
    }
}
