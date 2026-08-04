import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { AuthController } from './auth.controller.js';

@Module({
    imports: [
        UsersModule,
        PassportModule
    ],
    controllers: [AuthController],
    providers: [JwtStrategy]
})
export class AuthModule {}
