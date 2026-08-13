import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EventsModule } from './events/events.module.js';
import { InvitesModule } from './invites/invites.module.js';
import { ConfigModule } from '@nestjs/config';

import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { ChatModule } from './chat/chat.module.js';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerModuleParams } from './logging/pino.js';

import { APP_INTERCEPTOR } from '@nestjs/core';
import { ImpersonateInterceptor } from './auth/interceptors/impersonate.interceptor.js';

@Module({
    imports: [
        LoggerModule.forRoot(createLoggerModuleParams()),
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        UsersModule,
        EventsModule,
        InvitesModule,
        NotificationsModule,
        UploadsModule,
        ChatModule
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
