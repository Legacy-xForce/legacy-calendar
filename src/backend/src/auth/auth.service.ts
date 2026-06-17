import { BadRequestException, Injectable, NotFoundException, Inject, NotImplementedException } from '@nestjs/common';
import { User as UserModel } from '../../prisma/generated/client.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { UserDto } from '../users/dto/user.dto.js';
import { UsersService } from '../users/users.service.js';
import { AppLogger } from '../logging/app-logger.js';

export type AuthenticatedUser = Omit<UserModel, 'password'>;

@Injectable()
export class AuthService {
    private readonly logger = new AppLogger(AuthService.name);

    constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

    async validateUser(username: string, pass: string): Promise<AuthenticatedUser | null> {
        this.logger.trace('Validating user credentials', { username });
        const user = await this.usersService.findOneByUsername(username);
        if (user && (await Bun.password.verify(pass, user.password))) {
            const { password: _password, ...result } = user;
            this.logger.info('User authenticated', { userId: result.id, username: result.username });
            return result;
        }

        this.logger.warn('Invalid login attempt', { username });
        return null;
    }

    // Token issuance is handled by the external auth microservice.
    // Keep this method for compatibility but mark as not implemented.
    login(_user: AuthenticatedUser) {
        throw new NotImplementedException('Local token issuance disabled. Use the auth microservice at AUTH_HOST');
    }

    // Password changes are not supported in this service while auth is delegated.
    async changePassword(_userId: number, _changePasswordDto: ChangePasswordDto): Promise<UserDto> {
        throw new NotImplementedException('Password changes are handled by the auth microservice');
    }
}
