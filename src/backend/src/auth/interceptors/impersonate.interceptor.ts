import {
    BadRequestException,
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Inject
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { UsersService } from '../../users/users.service.js';
import { RequestWithUser } from '../interfaces/request-with-user.interface.js';
import { AppLogger } from '../../logging/app-logger.js';

@Injectable()
export class ImpersonateInterceptor implements NestInterceptor {
    private readonly logger = new AppLogger(ImpersonateInterceptor.name);
    constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest<RequestWithUser>();
        const impersonateUserId = request.headers['x-impersonate'];

        // Only admins can impersonate
        if (impersonateUserId) {
            if (!request.user) {
                return next.handle();
            }

            if (!request.user.isAdmin) {
                this.logger.warn('Impersonation rejected: non-admin user', { username: request.user.username });
                throw new BadRequestException('Invalid impersonation target');
            }

            const userId = parseInt(impersonateUserId as string, 10);
            if (Number.isNaN(userId)) {
                this.logger.warn('Impersonation rejected: invalid target id', {
                    adminUsername: request.user.username,
                    value: impersonateUserId
                });
                throw new BadRequestException('Invalid impersonation target');
            }

            try {
                const user = await this.usersService.findOne(userId);
                request.impersonatorUserId = request.user.userId ?? request.user.id ?? null;
                this.logger.warn('Admin impersonation applied', {
                    adminUsername: request.user.username,
                    adminUserId: request.impersonatorUserId,
                    impersonatedUserId: user.id,
                    impersonatedUsername: user.username
                });
                request.user = {
                    userId: user.id,
                    id: user.id,
                    username: user.username,
                    isAdmin: user.isAdmin
                };
            } catch (error) {
                this.logger.warn('Impersonation rejected: target user not found', {
                    adminUsername: request.user.username,
                    targetUserId: userId
                });
                throw new BadRequestException('Invalid impersonation target');
            }
        }

        return next.handle();
    }
}
