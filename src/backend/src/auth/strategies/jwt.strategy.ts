import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwksRsa from 'jwks-rsa';
import jwt from 'jsonwebtoken';
import { UsersService } from '../../users/users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        @Inject(ConfigService) private configService: ConfigService,
        @Inject(UsersService) private readonly usersService: UsersService
    ) {
        const jwksProvider = jwksRsa.passportJwtSecret({
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 10,
            jwksUri:
                configService.get<string>('AUTH_JWKS_URI') || 'https://auth.legacy-group.tech/.well-known/jwks.json'
        }) as (req: unknown, rawJwtToken: unknown, done: (err: unknown, secretOrKey?: string | Buffer) => void) => void;

        const localSecret = configService.get<string>('JWT_SECRET') || 'legacy-calendar-default-secret';

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKeyProvider: (
                req: unknown,
                rawJwtToken: unknown,
                done: (err: unknown, secretOrKey?: string | Buffer) => void
            ) => {
                try {
                    const decoded = jwt.decode(String(rawJwtToken), { complete: true });
                    if (decoded && decoded.header && decoded.header.alg === 'HS256') {
                        return done(null, localSecret);
                    }
                    return jwksProvider(req, rawJwtToken, done);
                } catch (e) {
                    return done(e);
                }
            },
            algorithms: ['ES256', 'HS256']
        });
    }

    async validate(payload: { sub: string; username: string; role?: 'admin' | 'user' }) {
        const isAdmin = payload.role === 'admin';

        let user: { id?: number; username?: string } | null = null;
        const numericId = Number(payload.sub);
        if (Number.isFinite(numericId) && numericId > 0) {
            user = await this.usersService.findOne(numericId).catch(() => null);
        }

        if (!user) {
            user = await this.usersService.syncFromAuth({
                authId: payload.sub,
                username: payload.username,
                isAdmin
            });
        }

        return {
            userId: user?.id ?? (numericId > 0 ? numericId : undefined),
            username: user?.username ?? payload.username,
            isAdmin
        };
    }
}
