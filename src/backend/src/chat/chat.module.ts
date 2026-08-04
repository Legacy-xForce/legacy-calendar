import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';
import { ChatRepository } from './chat.repository.js';
import { ChatController } from './chat.controller.js';
import { EventsModule } from '../events/events.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { MediaProcessorService } from './media-processor.service.js';

@Module({
    imports: [AuthModule, UsersModule, EventsModule, NotificationsModule, PrismaModule],
    providers: [ChatGateway, ChatService, ChatRepository, MediaProcessorService],
    controllers: [ChatController]
})
export class ChatModule {}
