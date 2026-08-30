import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Prisma, InviteStatus } from '../../prisma/generated/client.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { ParticipateDto } from './dto/participate.dto.js';
import { EventResponseDto } from './dto/event-response.dto.js';
import { FindEventsQueryDto } from './dto/find-events-query.dto.js';
import { EventsRepository, EventWithRelations } from './events.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationCode } from '../notifications/notification-codes.js';
import { EVENT_NOTIFICATION_MESSAGES, EVENT_NOTIFICATION_TITLES } from './event-notification.constants.js';
import { mapEventToDto } from './event-response.mapper.js';
import { AppLogger } from '../logging/app-logger.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';

@Injectable()
export class EventsService {
    private readonly logger = new AppLogger(EventsService.name);

    constructor(
        @Inject(EventsRepository) private readonly eventsRepo: EventsRepository,
        @Inject(NotificationsService) private readonly notificationsService: NotificationsService,
        @Inject(AuditLogService) private readonly auditLogService: AuditLogService
    ) {}

    async create(
        createEventDto: CreateEventDto,
        userId: number,
        impersonatorId: number | null = null
    ): Promise<EventResponseDto> {
        const { participants = [], coHosts = [], ...eventData } = createEventDto;
        const hostId = Number(userId);
        const participantIds = this.normalizeUserIds(participants);
        const coHostIds = this.normalizeUserIds(coHosts).filter((id) => id !== hostId);
        this.logger.info('Creating event', {
            hostId,
            title: eventData.title,
            participantCount: participantIds.length
        });

        try {
            const event = await this.eventsRepo.create({
                ...this.buildCreateEventInput(eventData),
                host: { connect: { id: hostId } },
                ...(participantIds.length > 0
                    ? {
                          participants: {
                              create: participantIds.map((userId) => ({
                                  userId,
                                  status: InviteStatus.PENDING
                              }))
                          }
                      }
                    : {})
            });

            if (participantIds.length > 0) {
                await this.notifyUserIds(participantIds, {
                    eventId: event.id,
                    type: NotificationCode.EVENT_CREATED,
                    title: event.title,
                    body: EVENT_NOTIFICATION_MESSAGES.eventCreated(
                        this.getActorUsername(event.host.username),
                        event.title
                    ),
                    actorUsername: this.getActorUsername(event.host.username)
                });
            }

            let savedEvent = event;
            if (coHostIds.length > 0) {
                await this.applyCoHostDiff(event.id, [], coHostIds, { actorId: hostId, impersonatorId });
                savedEvent = (await this.eventsRepo.findById(event.id)) ?? event;
            }

            await this.auditLogService.recordEventCreated(savedEvent, { actorId: hostId, impersonatorId });
            this.logger.info('Event created', { eventId: event.id, hostId, participantCount: participantIds.length });
            return mapEventToDto(savedEvent);
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                this.logger.warn('Event create failed: referenced user not found', {
                    hostId,
                    participantIds
                });
                throw new NotFoundException(
                    `User in host or participants not found. IDs: host=${hostId}, participants=[${participantIds.join(', ')}]`
                );
            }
            this.logger.error(
                'Failed to create event',
                error instanceof Error ? (error.stack ?? error.message) : String(error)
            );
            throw error;
        }
    }

    async findAll(userId: number, query: FindEventsQueryDto): Promise<EventResponseDto[]> {
        if (query.start > query.end) {
            this.logger.warn('Rejected event range query', {
                userId,
                start: query.start,
                end: query.end
            });
            throw new BadRequestException('start must be before or equal to end');
        }

        this.logger.debug('Fetching calendar events', { userId, start: query.start, end: query.end });
        const events = await this.eventsRepo.findAll(userId, query.start, query.end);
        this.logger.info('Calendar events loaded', { userId, count: events.length });
        return events.map((event) => mapEventToDto(event));
    }

    async findUpcoming(userId: number): Promise<EventResponseDto[]> {
        this.logger.debug('Fetching upcoming events', { userId });
        const events = await this.eventsRepo.findUpcoming(userId);
        this.logger.info('Upcoming events loaded', { userId, count: events.length });
        return events.map((event) => mapEventToDto(event));
    }

    async findOne(id: number, userId?: number): Promise<EventResponseDto> {
        this.logger.trace('Fetching event', { eventId: id, userId });
        const event = await this.eventsRepo.findOne(id, userId);
        if (!event) {
            this.logger.warn('Event not found', { eventId: id, userId });
            throw new NotFoundException(`Event with id ${id} not found`);
        }

        return mapEventToDto(event);
    }

    async remove(id: number, userId: number, impersonatorId: number | null = null) {
        this.logger.warn('Removing event', { eventId: id, userId });
        const event = await this.findEventOrThrow(id, userId);

        if (event.hostId !== userId) {
            this.logger.warn('Event removal forbidden for non-host', { eventId: id, userId, hostId: event.hostId });
            throw new ForbiddenException('Only the host can delete this event');
        }

        this.validateEventNotEnded(event);

        await this.notifyParticipants(event.id, {
            type: NotificationCode.EVENT_CANCELLED,
            title: EVENT_NOTIFICATION_TITLES.eventCancelled,
            body: EVENT_NOTIFICATION_MESSAGES.eventCancelled(event.title),
            actorUsername: this.getActorUsername(event.host.username)
        });

        await this.auditLogService.recordEventDeleted(event.id, event, { actorId: userId, impersonatorId });
        this.logger.info('Event removed', { eventId: id, userId });
        return this.eventsRepo.remove(id);
    }

    async update(
        id: number,
        updateEventDto: UpdateEventDto,
        userId: number,
        impersonatorId: number | null = null
    ): Promise<EventResponseDto> {
        this.logger.info('Updating event', { eventId: id, userId, fields: Object.keys(updateEventDto) });
        const event = await this.findEventOrThrow(id, userId);

        if (!this.canManageEvent(event, userId)) {
            this.logger.warn('Event update forbidden for non-host', { eventId: id, userId, hostId: event.hostId });
            throw new ForbiddenException('Only the host or a co-host can update this event');
        }

        this.validateEventNotEnded(event);

        const { participants, coHosts, ...eventData } = updateEventDto;
        const updateData: Prisma.EventUpdateInput = this.buildUpdateEventInput(eventData);
        let participantDiff: { toAdd: number[]; toRemove: number[] } | undefined;

        if (participants) {
            const existingParticipantIds = this.getParticipantUserIds(event);
            const nextParticipantIds = this.normalizeUserIds(participants);
            participantDiff = this.diffParticipantIds(existingParticipantIds, nextParticipantIds);
            const { toAdd, toRemove } = participantDiff;

            const participantsUpdate = this.buildParticipantsUpdate(toAdd, toRemove);
            if (participantsUpdate) {
                updateData.participants = participantsUpdate;
            }

            if (toRemove.length > 0) {
                this.logger.debug('Removing ride assignments for departing participants', {
                    eventId: id,
                    userIds: toRemove
                });
                await this.eventsRepo.deleteRideAssignmentsForUsers(id, toRemove);
            }
        }

        const updatedEvent = await this.eventsRepo.update(id, updateData);

        let finalEvent = updatedEvent;
        if (coHosts) {
            const existingCoHostIds = event.coHosts.map((coHost) => coHost.userId);
            const nextCoHostIds = this.normalizeUserIds(coHosts).filter((id) => id !== event.hostId);
            const { toAdd, toRemove } = this.diffParticipantIds(existingCoHostIds, nextCoHostIds);
            if (toAdd.length > 0 || toRemove.length > 0) {
                await this.applyCoHostDiff(id, toAdd, toRemove, { actorId: userId, impersonatorId });
                finalEvent = (await this.eventsRepo.findById(id)) ?? updatedEvent;
            }
        }

        await this.auditLogService.recordEventUpdated(id, event, finalEvent, { actorId: userId, impersonatorId });

        if (participantDiff) {
            const { toAdd } = participantDiff;

            if (toAdd.length > 0) {
                await this.notifyUserIds(toAdd, {
                    eventId: event.id,
                    type: NotificationCode.INVITATION_NEW,
                    title: EVENT_NOTIFICATION_TITLES.invitationNew,
                    body: EVENT_NOTIFICATION_MESSAGES.invitationNew(
                        this.getActorUsername(event.host.username),
                        this.sanitizeInvitationTitle(updatedEvent.title)
                    ),
                    actorUsername: this.getActorUsername(event.host.username)
                });
            }
        }

        if (participantDiff?.toRemove?.length) {
            for (const participantId of participantDiff.toRemove) {
                const removedParticipant = event.participants.find(
                    (participant) => participant.userId === participantId
                );
                if (removedParticipant) {
                    await this.auditLogService.recordParticipantRemoved(id, removedParticipant, {
                        actorId: userId,
                        impersonatorId
                    });
                }
            }
        }

        await this.notifyParticipants(
            event.id,
            {
                type: NotificationCode.EVENT_UPDATED,
                title: EVENT_NOTIFICATION_TITLES.eventUpdated,
                body: EVENT_NOTIFICATION_MESSAGES.eventUpdated(updatedEvent.title),
                actorUsername: this.getActorUsername(event.host.username)
            },
            InviteStatus.ACCEPTED
        );

        this.logger.info('Event updated', {
            eventId: id,
            userId,
            participantDiff
        });
        return mapEventToDto(updatedEvent);
    }

    async invite(eventId: number, username: string, userId: number, impersonatorId: number | null = null) {
        this.logger.info('Inviting user to event', { eventId, username, userId });
        const event = await this.findEventOrThrow(eventId, userId);

        if (!this.canManageEvent(event, userId)) {
            this.logger.warn('Event invite forbidden for non-host', { eventId, userId, hostId: event.hostId });
            throw new ForbiddenException('Only the host or a co-host can invite users');
        }

        this.validateEventNotEnded(event);

        const invitedUser = await this.eventsRepo.inviteUser(eventId, username);

        if (invitedUser) {
            await this.auditLogService.recordParticipantInvited(eventId, invitedUser, {
                actorId: userId,
                impersonatorId
            });
            await this.notifyUserIds([invitedUser.id], {
                eventId,
                type: NotificationCode.INVITATION_NEW,
                title: EVENT_NOTIFICATION_TITLES.invitationNew,
                body: EVENT_NOTIFICATION_MESSAGES.invitationNew(
                    this.getActorUsername(event.host.username),
                    this.sanitizeInvitationTitle(event.title)
                ),
                actorUsername: this.getActorUsername(event.host.username)
            });
        }

        this.logger.info('Invitation processed', {
            eventId,
            invitedUsername: username,
            invitedUserId: invitedUser?.id ?? null
        });
        return { message: 'User invited' };
    }

    async join(eventId: number, userId: number, participateDto: ParticipateDto, impersonatorId: number | null = null) {
        this.logger.info('Joining event', { eventId, userId });
        const event = await this.findEventOrThrow(eventId, userId);
        const participant = this.getParticipant(event, userId);
        const isParticipant = !!participant;

        this.validateEventNotEnded(event);

        if (!event.isOpen && !isParticipant && !this.canManageEvent(event, userId)) {
            this.logger.warn('Join rejected: event is closed', { eventId, userId });
            throw new ForbiddenException('This event is closed and cannot be joined spontaneously');
        }

        if (
            event.participationDeadline &&
            new Date() > event.participationDeadline &&
            !this.canManageEvent(event, userId)
        ) {
            this.logger.warn('Join rejected: participation deadline passed', { eventId, userId });
            throw new ForbiddenException('The participation deadline for this event has passed');
        }

        const result = await this.eventsRepo.join(userId, eventId, participateDto);
        const joinedAtParticipant = await this.eventsRepo.findOne(eventId, userId);
        const savedParticipant = joinedAtParticipant?.participants.find((participant) => participant.userId === userId);

        if (!participant) {
            if (savedParticipant) {
                await this.auditLogService.recordParticipantJoined(eventId, savedParticipant, {
                    actorId: userId,
                    impersonatorId
                });
            }
        } else if (savedParticipant) {
            await this.auditLogService.recordParticipantUpdated(eventId, participant, savedParticipant, {
                actorId: userId,
                impersonatorId
            });
        }

        if (event.hostId !== userId) {
            const hostTokens = await this.eventsRepo.getUserTokens([event.hostId]);

            if (hostTokens.length > 0) {
                const joiningUser = await this.eventsRepo.getUserById(userId);
                const username = joiningUser?.username || 'A user';
                const wasPending = participant?.status === InviteStatus.PENDING;

                if (!isParticipant || wasPending) {
                    await this.notificationsService.sendMulticast(
                        hostTokens,
                        EVENT_NOTIFICATION_TITLES.participationAccepted,
                        EVENT_NOTIFICATION_MESSAGES.participationAccepted(username, event.title),
                        {
                            type: NotificationCode.PARTICIPATION_ACCEPTED,
                            eventId: String(eventId),
                            actorUsername: username
                        }
                    );
                } else {
                    await this.notificationsService.sendMulticast(
                        hostTokens,
                        EVENT_NOTIFICATION_TITLES.participationUpdated,
                        EVENT_NOTIFICATION_MESSAGES.participationUpdated(username, event.title),
                        {
                            type: NotificationCode.PARTICIPATION_UPDATED,
                            eventId: String(eventId),
                            actorUsername: username
                        }
                    );
                }
            }
        }

        this.logger.info('Event participation saved', { eventId, userId, isParticipant });
        return result;
    }

    async updateParticipation(
        eventId: number,
        userId: number,
        participateDto: ParticipateDto,
        impersonatorId: number | null = null
    ) {
        return this.join(eventId, userId, participateDto, impersonatorId);
    }

    async leave(eventId: number, userId: number, impersonatorId: number | null = null) {
        this.logger.info('Leaving event', { eventId, userId });
        const event = await this.findEventOrThrow(eventId, userId);

        this.validateEventNotEnded(event);

        try {
            const participantBefore = event.participants.find((participant) => participant.userId === userId);
            const result = await this.eventsRepo.leave(userId, eventId);
            await this.eventsRepo.deleteRideAssignmentsForUsers(eventId, [userId]);
            if (participantBefore) {
                await this.auditLogService.recordParticipantDeclined(eventId, participantBefore, {
                    actorId: userId,
                    impersonatorId
                });
            }

            if (event.hostId !== userId) {
                const hostTokens = await this.eventsRepo.getUserTokens([event.hostId]);

                if (hostTokens.length > 0) {
                    const leavingUser = await this.eventsRepo.getUserById(userId);
                    const username = leavingUser?.username || 'A user';
                    await this.notificationsService.sendMulticast(
                        hostTokens,
                        EVENT_NOTIFICATION_TITLES.participationCancelled,
                        EVENT_NOTIFICATION_MESSAGES.participationCancelled(username, event.title),
                        {
                            type: NotificationCode.PARTICIPATION_CANCELLED,
                            eventId: String(eventId),
                            actorUsername: username
                        }
                    );
                }
            }

            this.logger.info('Event participation removed', { eventId, userId });
            return result;
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                this.logger.warn('Leave rejected: participation not found', { eventId, userId });
                throw new NotFoundException('Participation not found');
            }
            this.logger.error(
                'Failed to leave event',
                error instanceof Error ? (error.stack ?? error.message) : String(error)
            );
            throw error;
        }
    }

    async assignRide(
        eventId: number,
        passengerId: number,
        driverId: number | null,
        requestingUserId: number,
        impersonatorId: number | null = null
    ) {
        this.logger.info('Assigning ride', {
            eventId,
            passengerId,
            driverId,
            requestingUserId
        });
        const event = await this.findEventOrThrow(eventId, requestingUserId);

        this.validateEventNotEnded(event);

        const isHost = this.canManageEvent(event, requestingUserId);
        const passenger = this.getParticipant(event, passengerId);

        if (!passenger) {
            throw new NotFoundException(`Passenger with id ${passengerId} is not in this event`);
        }

        const passengerAssignment = this.getRideAssignment(event, passengerId);
        const isCurrentDriver = passengerAssignment?.driverId === requestingUserId;
        const isAssigningToSelf = driverId === requestingUserId;
        const isUnassigningFromSelf = driverId === null && isCurrentDriver;

        if (!isHost && !isAssigningToSelf && !isUnassigningFromSelf) {
            if (driverId !== null) {
                this.logger.warn('Ride assignment forbidden', {
                    eventId,
                    passengerId,
                    driverId,
                    requestingUserId
                });
                throw new ForbiddenException(
                    'Only the host or the driver of the vehicle can assign passengers to this car'
                );
            } else {
                this.logger.warn('Ride unassignment forbidden', {
                    eventId,
                    passengerId,
                    driverId,
                    requestingUserId
                });
                throw new ForbiddenException('Only the host or the current driver can remove passengers from this car');
            }
        }

        if (driverId !== null) {
            const driver = this.getParticipant(event, driverId);
            if (!driver) {
                this.logger.warn('Ride assignment rejected: driver not in event', {
                    eventId,
                    passengerId,
                    driverId
                });
                throw new NotFoundException(`Driver with id ${driverId} is not in this event`);
            }

            if (driver.transportMode !== 'DRIVER') {
                this.logger.warn('Ride assignment rejected: selected driver has no vehicle', {
                    eventId,
                    passengerId,
                    driverId
                });
                throw new ForbiddenException('Selected driver does not have a vehicle for this event');
            }
        }

        const previousAssignment = passengerAssignment
            ? { passengerId: passengerAssignment.passengerId, driverId: passengerAssignment.driverId }
            : null;
        await this.eventsRepo.assignRide(eventId, passengerId, driverId);

        if (driverId !== null) {
            await this.auditLogService.recordRideAssigned(
                eventId,
                previousAssignment,
                { passengerId, driverId },
                { actorId: requestingUserId, impersonatorId }
            );
            const actorUser = await this.eventsRepo.getUserById(requestingUserId);
            const actorUsername = this.getActorUsername(actorUser?.username);
            await this.notifyUserIds([passengerId], {
                eventId,
                type: NotificationCode.RIDE_ASSIGNED,
                title: EVENT_NOTIFICATION_TITLES.rideAssigned,
                body: this.truncateText(EVENT_NOTIFICATION_MESSAGES.rideAssigned(actorUsername, event.title), 200),
                actorUsername
            });
        } else {
            await this.auditLogService.recordRideUnassigned(eventId, previousAssignment, {
                actorId: requestingUserId,
                impersonatorId
            });
        }

        this.logger.info('Ride assignment updated', { eventId, passengerId, driverId, requestingUserId });
        return this.findOne(eventId, requestingUserId);
    }

    private canManageEvent(event: EventWithRelations, userId: number): boolean {
        return event.hostId === userId || event.coHosts.some((coHost) => coHost.userId === userId);
    }

    private async applyCoHostDiff(
        eventId: number,
        toAdd: number[],
        toRemove: number[],
        actor: { actorId: number; impersonatorId: number | null }
    ) {
        if (toAdd.length > 0 || toRemove.length > 0) {
            const currentIds = await this.eventsRepo.getCoHostIds(eventId);
            await this.eventsRepo.setCoHosts(eventId, [
                ...currentIds.filter((id) => !toRemove.includes(id)),
                ...toAdd.filter((id) => !currentIds.includes(id))
            ]);
        }

        for (const coHostId of toAdd) {
            const user = await this.eventsRepo.getUserById(coHostId);
            if (user) {
                await this.auditLogService.recordCoHostAdded(eventId, user, actor);
            }
        }

        for (const coHostId of toRemove) {
            const user = await this.eventsRepo.getUserById(coHostId);
            if (user) {
                await this.auditLogService.recordCoHostRemoved(eventId, user, actor);
            }
        }
    }

    private buildCreateEventInput(
        eventData: Omit<CreateEventDto, 'participants' | 'coHosts'>
    ): Omit<Prisma.EventCreateInput, 'host'> {
        const { startTime, endTime, participationDeadline, ...rest } = eventData;

        return {
            ...rest,
            startTime: new Date(startTime),
            endTime: endTime ? new Date(endTime) : null,
            participationDeadline: participationDeadline ? new Date(participationDeadline) : null
        };
    }

    private buildUpdateEventInput(
        eventData: Omit<UpdateEventDto, 'participants' | 'coHosts'>
    ): Prisma.EventUpdateInput {
        const { startTime, endTime, participationDeadline, ...rest } = eventData;
        const updateData: Prisma.EventUpdateInput = { ...rest };

        if (startTime !== undefined) {
            updateData.startTime = new Date(startTime);
        }

        if (endTime !== undefined) {
            updateData.endTime = endTime ? new Date(endTime) : null;
        }

        if (participationDeadline !== undefined) {
            updateData.participationDeadline = participationDeadline ? new Date(participationDeadline) : null;
        }

        return updateData;
    }

    private buildParticipantsUpdate(
        toAdd: number[],
        toRemove: number[]
    ): Prisma.EventUpdateInput['participants'] | undefined {
        const participantsUpdate: NonNullable<Prisma.EventUpdateInput['participants']> = {};

        if (toRemove.length > 0) {
            participantsUpdate.deleteMany = { userId: { in: toRemove } };
        }

        if (toAdd.length > 0) {
            participantsUpdate.create = toAdd.map((userId) => ({
                userId,
                status: InviteStatus.PENDING
            }));
        }

        return Object.keys(participantsUpdate).length > 0 ? participantsUpdate : undefined;
    }

    private diffParticipantIds(existingParticipantIds: number[], nextParticipantIds: number[]) {
        const existingIds = new Set(existingParticipantIds);
        const nextIds = new Set(nextParticipantIds);

        return {
            toAdd: nextParticipantIds.filter((userId) => !existingIds.has(userId)),
            toRemove: existingParticipantIds.filter((userId) => !nextIds.has(userId))
        };
    }

    private getParticipantUserIds(event: EventWithRelations): number[] {
        return event.participants.map((participant) => participant.userId);
    }

    private getParticipant(event: EventWithRelations, userId: number) {
        return event.participants.find((participant) => participant.userId === userId);
    }

    private getRideAssignment(event: EventWithRelations, passengerId: number) {
        return event.rideAssignments.find((assignment) => assignment.passengerId === passengerId);
    }

    private normalizeUserIds(userIds: number[]): number[] {
        return [...new Set(userIds.map((userId) => Number(userId)).filter(Number.isFinite))];
    }

    private async findEventOrThrow(id: number, userId?: number): Promise<EventWithRelations> {
        const event = await this.eventsRepo.findOne(id, userId);
        if (!event) {
            this.logger.warn('Event not found', { eventId: id, userId });
            throw new NotFoundException(`Event with id ${id} not found`);
        }

        return event;
    }

    private validateEventNotEnded(event: EventWithRelations) {
        if (event.endTime && new Date() > event.endTime) {
            throw new ForbiddenException('This event has already ended and cannot be modified');
        }
    }

    private async notifyParticipants(
        eventId: number,
        notification: { type: NotificationCode; title: string; body: string; actorUsername?: string },
        status?: InviteStatus
    ) {
        const tokens = status
            ? await this.eventsRepo.getParticipantTokensByStatus(eventId, status)
            : await this.eventsRepo.getParticipantTokens(eventId);

        if (tokens.length > 0) {
            const data = this.buildNotificationData(eventId, notification.type, notification.actorUsername);
            this.logger.debug('Sending participant notification', {
                eventId,
                type: notification.type,
                recipientCount: tokens.length
            });
            await this.notificationsService.sendMulticast(tokens, notification.title, notification.body, data);
        }
    }

    private async notifyUserIds(
        userIds: number[],
        notification: { eventId: number; type: NotificationCode; title: string; body: string; actorUsername?: string }
    ) {
        const tokens = await this.eventsRepo.getUserTokens(userIds);

        if (tokens.length > 0) {
            const data = this.buildNotificationData(
                notification.eventId,
                notification.type,
                notification.actorUsername
            );
            this.logger.debug('Sending direct notification', {
                eventId: notification.eventId,
                type: notification.type,
                recipientCount: tokens.length
            });
            await this.notificationsService.sendMulticast(tokens, notification.title, notification.body, data);
        }
    }

    private buildNotificationData(eventId: number, type: NotificationCode, actorUsername?: string) {
        const data: Record<string, string> = {
            type,
            eventId: String(eventId)
        };

        if (actorUsername) {
            data.actorUsername = actorUsername;
        }

        return data;
    }

    private truncateText(value: string, maxLength: number): string {
        if (value.length <= maxLength) {
            return value;
        }

        return `${value.slice(0, Math.max(0, maxLength - 1))}\u2026`;
    }

    private getActorUsername(value?: string | null): string {
        const trimmed = value?.trim();
        return trimmed ? this.truncateText(trimmed, 50) : 'Someone';
    }

    private sanitizeInvitationTitle(value?: string | null): string {
        const trimmed = value?.trim();
        return trimmed ? this.truncateText(trimmed, 100) : 'an event';
    }
}
