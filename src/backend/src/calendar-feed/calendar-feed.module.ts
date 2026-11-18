import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CalendarFeedController } from './calendar-feed.controller.js';
import { CalendarFeedRepository } from './calendar-feed.repository.js';
import { CalendarFeedService } from './calendar-feed.service.js';

@Module({
    imports: [PrismaModule],
    controllers: [CalendarFeedController],
    providers: [CalendarFeedService, CalendarFeedRepository]
})
export class CalendarFeedModule {}
