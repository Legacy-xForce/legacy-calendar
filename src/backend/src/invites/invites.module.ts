import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventsModule } from '../events/events.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { InvitesRepository } from './invites.repository.js';
import { InvitesService } from './invites.service.js';
import { EventGuestInvitesController } from './event-guest-invites.controller.js';
import { GuestInvitesController } from './guest-invites.controller.js';
import { GuestTokenGuard } from './guards/guest-token.guard.js';

@Module({
    imports: [PrismaModule, EventsModule, NotificationsModule],
    controllers: [EventGuestInvitesController, GuestInvitesController],
    providers: [InvitesRepository, InvitesService, GuestTokenGuard]
})
export class InvitesModule {}
