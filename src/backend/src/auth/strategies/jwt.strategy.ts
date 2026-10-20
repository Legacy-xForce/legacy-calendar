import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { AuthIdentityService, type AuthIdentity, type AuthTokenPayload } from '../auth-identity.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(@Inject(AuthIdentityService) private readonly identityService: AuthIdentityService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKeyProvider: (
                _req: unknown,
                rawJwtToken: unknown,
                done: (err: unknown, secretOrKey?: string | Buffer) => void
            ) => {
                this.identityService
                    .getVerificationKey(String(rawJwtToken))
                    .then((key) => done(null, key))
                    .catch((error: unknown) => done(error));
            },
            algorithms: ['ES256', 'HS256']
        });
    }

    async validate(payload: AuthTokenPayload): Promise<AuthIdentity> {
        const identity = await this.identityService.resolvePayload(payload);
        if (!identity) {
            throw new UnauthorizedException('Missing or invalid authentication token');
        }

        return identity;
    }
}
