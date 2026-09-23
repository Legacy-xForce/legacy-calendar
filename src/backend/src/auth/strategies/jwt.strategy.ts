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

    async validate(payload: { sub: string; username: string }) {
        const user = await this.usersService.syncFromAuth({
            authId: payload.sub,
            username: payload.username
        });

        return {
            userId: user?.id,
            username: user?.username ?? payload.username,
            isAdmin: user?.isAdmin ?? false
        };
    }
}
