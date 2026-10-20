import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EventsModule } from './events/events.module.js';
import { InvitesModule } from './invites/invites.module.js';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/env.validation.js';

import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { ChatModule } from './chat/chat.module.js';
import { UserGroupsModule } from './user-groups/user-groups.module.js';
import { ApiTokensModule } from './api-tokens/api-tokens.module.js';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { createLoggerModuleParams } from './logging/pino.js';

import { APP_INTERCEPTOR } from '@nestjs/core';
import { ImpersonateInterceptor } from './auth/interceptors/impersonate.interceptor.js';

@Module({
    imports: [
        LoggerModule.forRoot(createLoggerModuleParams()),
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
        // Global (see @Global on ThrottlerModule). No default request cap is
        // enforced globally; specific controllers opt in with @UseGuards +
        // @Throttle so brute-force-prone endpoints (passkey login, invites) are
        // limited without throttling the whole API behind a shared proxy IP.
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
        PrismaModule,
        AuthModule,
        UsersModule,
        EventsModule,
        InvitesModule,
        NotificationsModule,
        UploadsModule,
        ChatModule,
        UserGroupsModule,
        ApiTokensModule
    ],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_INTERCEPTOR,
            useClass: ImpersonateInterceptor
        }
    ]
})
export class AppModule {}
