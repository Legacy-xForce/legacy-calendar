import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '../../prisma/generated/client.js';
import { EventsRepository, type EventWithRelations } from '../events/events.repository.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationCode } from '../notifications/notification-codes.js';
import { EVENT_NOTIFICATION_TITLES, EVENT_NOTIFICATION_MESSAGES } from '../events/event-notification.constants.js';
import { mapEventToDto } from '../events/event-response.mapper.js';
import { AppLogger } from '../logging/app-logger.js';
import { InvitesRepository, type GuestInviteWithRelations } from './invites.repository.js';
import { GuestParticipateDto } from './dto/guest-participate.dto.js';
import { generateGuestToken, hashGuestToken } from './guest-token.util.js';

const FALLBACK_INVITE_LIFETIME_DAYS = 30;

@Injectable()
export class InvitesService {
    private readonly logger = new AppLogger(InvitesService.name);

    constructor(
        @Inject(InvitesRepository) private readonly invitesRepo: InvitesRepository,
        @Inject(EventsRepository) private readonly eventsRepo: EventsRepository,
        @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
        @Inject(NotificationsService) private readonly notificationsService: NotificationsService
    ) {}

    async generateInvite(eventId: number, hostUserId: number, impersonatorId: number | null = null) {
        const event = await this.findEventOrThrow(eventId);

        if (event.hostId !== hostUserId) {
            throw new ForbiddenException('Only the host can create guest invites');
        }

        this.validateEventNotEnded(event);

        const expiresAt = this.resolveExpiry(event);
        const { token, tokenHash } = this.createUniqueToken();
        const username = this.createUniquePlaceholderUsername();

        const { guestUser } = await this.invitesRepo.createGuestInvite(eventId, tokenHash, expiresAt, username);

        await this.auditLogService.recordParticipantInvited(eventId, guestUser, {
            actorId: hostUserId,
            impersonatorId
        });

        this.logger.info('Guest invite created', { eventId, guestUserId: guestUser.id, hostUserId });

        return {
            token,
            guestUserId: guestUser.id,
            expiresAt
        };
    }

    async getInvite(guestInvite: GuestInviteWithRelations) {
        const event = await this.eventsRepo.findById(guestInvite.eventId);
        if (!event) {
            throw new NotFoundException('Event not found');
        }

        return this.buildInviteResponse(event, guestInvite);
    }

    async updateParticipation(guestInvite: GuestInviteWithRelations, dto: GuestParticipateDto) {
        const event = await this.findEventOrThrow(guestInvite.eventId);
        this.validateEventNotEnded(event);
        this.validateDeadlineNotPassed(event);

        const before = event.participants.find((participant) => participant.userId === guestInvite.userId);

        try {
            await this.invitesRepo.updateGuestParticipation(guestInvite.userId, guestInvite.eventId, dto);
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ForbiddenException('That username is already taken, please choose another one');
            }
            throw error;
        }

        const updatedEvent = await this.findEventOrThrow(guestInvite.eventId);
        const after = updatedEvent.participants.find((participant) => participant.userId === guestInvite.userId);

        if (!before) {
            if (after) {
                await this.auditLogService.recordParticipantJoined(guestInvite.eventId, after, {
                    actorId: guestInvite.userId
                });
            }
        } else if (after) {
            await this.auditLogService.recordParticipantUpdated(guestInvite.eventId, before, after, {
                actorId: guestInvite.userId
            });
        }

        await this.notifyHost(updatedEvent, guestInvite.userId, before ? 'updated' : 'accepted');

        this.logger.info('Guest participation updated', {
            eventId: guestInvite.eventId,
            guestUserId: guestInvite.userId
        });

        const refreshedInvite = { ...guestInvite };
        return this.buildInviteResponse(updatedEvent, refreshedInvite);
    }

    async leave(guestInvite: GuestInviteWithRelations) {
        const event = await this.findEventOrThrow(guestInvite.eventId);
        this.validateEventNotEnded(event);

        const before = event.participants.find((participant) => participant.userId === guestInvite.userId);

        await this.invitesRepo.declineGuestParticipation(guestInvite.userId, guestInvite.eventId);

        if (before) {
            await this.auditLogService.recordParticipantDeclined(guestInvite.eventId, before, {
                actorId: guestInvite.userId
            });
        }

        await this.notifyHost(event, guestInvite.userId, 'cancelled');

        this.logger.info('Guest left event', { eventId: guestInvite.eventId, guestUserId: guestInvite.userId });

        const updatedEvent = await this.findEventOrThrow(guestInvite.eventId);
        return this.buildInviteResponse(updatedEvent, guestInvite);
    }

    private buildInviteResponse(event: EventWithRelations, guestInvite: GuestInviteWithRelations) {
        const isDeadlinePassed = !!event.participationDeadline && new Date() > event.participationDeadline;

        return {
            event: mapEventToDto(event),
            guestUserId: guestInvite.userId,
            isDeadlinePassed,
            canEdit: !isDeadlinePassed && !(event.endTime && new Date() > event.endTime)
        };
    }

    private async notifyHost(
        event: EventWithRelations,
        guestUserId: number,
        action: 'accepted' | 'updated' | 'cancelled'
    ) {
        if (event.hostId === guestUserId) return;

        const hostTokens = await this.eventsRepo.getUserTokens([event.hostId]);
        if (hostTokens.length === 0) return;

        const guestUser = await this.eventsRepo.getUserById(guestUserId);
        const username = guestUser?.username || 'A guest';

        const messages = {
            accepted: {
                type: NotificationCode.PARTICIPATION_ACCEPTED,
                title: EVENT_NOTIFICATION_TITLES.participationAccepted,
                body: EVENT_NOTIFICATION_MESSAGES.participationAccepted(username, event.title)
            },
            updated: {
                type: NotificationCode.PARTICIPATION_UPDATED,
                title: EVENT_NOTIFICATION_TITLES.participationUpdated,
                body: EVENT_NOTIFICATION_MESSAGES.participationUpdated(username, event.title)
            },
            cancelled: {
                type: NotificationCode.PARTICIPATION_CANCELLED,
                title: EVENT_NOTIFICATION_TITLES.participationCancelled,
                body: EVENT_NOTIFICATION_MESSAGES.participationCancelled(username, event.title)
            }
        }[action];

        await this.notificationsService.sendMulticast(hostTokens, messages.title, messages.body, {
            type: messages.type,
            eventId: String(event.id),
            actorUsername: username
        });
    }

    private resolveExpiry(event: EventWithRelations): Date {
        if (event.participationDeadline) return event.participationDeadline;
        if (event.endTime) return event.endTime;

        const fallback = new Date();
        fallback.setDate(fallback.getDate() + FALLBACK_INVITE_LIFETIME_DAYS);
        return fallback;
    }

    private validateDeadlineNotPassed(event: EventWithRelations) {
        if (event.participationDeadline && new Date() > event.participationDeadline) {
            throw new ForbiddenException('The participation deadline for this event has passed');
        }
    }

    private validateEventNotEnded(event: EventWithRelations) {
        if (event.endTime && new Date() > event.endTime) {
            throw new ForbiddenException('This event has already ended');
        }
    }

    private async findEventOrThrow(eventId: number): Promise<EventWithRelations> {
        const event = await this.eventsRepo.findById(eventId);
        if (!event) {
            throw new NotFoundException(`Event with id ${eventId} not found`);
        }
        return event;
    }

    private createUniqueToken(): { token: string; tokenHash: string } {
        const token = generateGuestToken();
        return { token, tokenHash: hashGuestToken(token) };
    }

    private createUniquePlaceholderUsername(): string {
        return `guest-${randomBytes(4).toString('hex')}`;
    }
}
