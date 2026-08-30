import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwksRsa from 'jwks-rsa';
import { UsersService } from '../../users/users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        @Inject(ConfigService) private configService: ConfigService,
        @Inject(UsersService) private readonly usersService: UsersService
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            // Use JWKS to resolve signing keys from the auth microservice
            secretOrKeyProvider: jwksRsa.passportJwtSecret({
                cache: true,
                rateLimit: true,
                jwksRequestsPerMinute: 10,
                jwksUri:
                    configService.get<string>('AUTH_JWKS_URI') || 'https://auth.legacy-group.tech/.well-known/jwks.json'
            }) as any,
            algorithms: ['ES256']
        });
    }

    async validate(payload: { sub: string; username: string; role?: 'admin' | 'user' }) {
        const isAdmin = payload.role === 'admin';

        const user = await this.usersService.syncFromAuth({
            authId: payload.sub,
            username: payload.username,
            isAdmin
        });

        return { userId: user?.id, username: user?.username ?? payload.username, isAdmin };
    }
}
