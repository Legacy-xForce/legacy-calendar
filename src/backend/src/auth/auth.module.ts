import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { AuthIdentityService } from './auth-identity.service.js';
import { AuthController } from './auth.controller.js';

@Module({
    imports: [UsersModule, PrismaModule, PassportModule],
    controllers: [AuthController],
    providers: [AuthIdentityService, JwtStrategy],
    exports: [AuthIdentityService]
})
export class AuthModule {}
