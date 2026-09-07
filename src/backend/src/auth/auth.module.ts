import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { AuthController } from './auth.controller.js';
import { PasskeyController } from './passkey/passkey.controller.js';
import { PasskeyService } from './passkey/passkey.service.js';

@Module({
    imports: [UsersModule, PrismaModule, PassportModule],
    controllers: [AuthController, PasskeyController],
    providers: [JwtStrategy, PasskeyService],
    exports: [PasskeyService]
})
export class AuthModule {}
