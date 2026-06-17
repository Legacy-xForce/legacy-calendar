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
                jwksUri: configService.get<string>('AUTH_JWKS_URI') || 'https://auth.legacy-group.tech/.well-known/jwks.json'
            }) as any,
            algorithms: ['ES256']
        });
    }

    async validate(payload: { sub: number | string; username?: string; isAdmin?: boolean; picture?: string }) {
        const userId = typeof payload.sub === 'string' ? parseInt(payload.sub, 10) || undefined : payload.sub;

        // Ensure the user exists in our local DB. If not, create a minimal user record.
        const username = payload.username ?? `user_${payload.sub}`;
        let user = await this.usersService.findOneByUsername(username);
        if (!user) {
            // create a placeholder password so the record can be migrated later
            const placeholderPassword = Math.random().toString(36).slice(2, 12);
            const createDto = { username, password: placeholderPassword, profilePicture: payload.picture ?? null } as any;
            try {
                const created = await this.usersService.create(createDto);
                user = await this.usersService.findOneWithPassword(created.id as number);
            } catch {
                // Ignore creation errors and attempt to fetch again
                user = await this.usersService.findOneByUsername(username);
            }
        }

        return { userId: user?.id ?? userId, username: user?.username ?? username, isAdmin: payload.isAdmin ?? false };
    }
}
