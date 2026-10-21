import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { AuthIdentityService } from './auth-identity.service.js';
import { AuthController } from './auth.controller.js';
import { SessionController } from './session/session.controller.js';
import { SessionService } from './session/session.service.js';
import { OidcClientService } from './session/oidc-client.service.js';
import { BackchannelLogoutService } from './session/backchannel-logout.service.js';

/**
 * Global because the shared JwtAuthGuard reads the session cookie and is
 * instantiated in every feature module (see ApiTokensModule for the same reason).
 */
@Global()
@Module({
    imports: [UsersModule, PrismaModule, PassportModule],
    controllers: [AuthController, SessionController],
    providers: [AuthIdentityService, JwtStrategy, SessionService, OidcClientService, BackchannelLogoutService],
    exports: [AuthIdentityService, SessionService]
})
export class AuthModule {}
