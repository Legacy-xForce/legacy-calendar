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
import { hasSplitVehicleSeats } from './vehicle-seats.util.js';
import { AppLogger } from '../logging/app-logger.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { normalizeIdList } from '../common/id.util.js';
import { attendanceId } from '../common/participant-id.util.js';
import { buildNotificationData } from '../notifications/notification-data.util.js';
import { assertEventNotEnded } from './event-guards.js';
import { isEventManager } from './event-access.util.js';
import { EventsRealtime } from './events-realtime.service.js';
import { AddressDetailsDto } from '../geocoding/dto/address-details.dto.js';

@Injectable()
export class EventsService {
    private readonly logger = new AppLogger(EventsService.name);

    constructor(
        @Inject(EventsRepository) private readonly eventsRepo: EventsRepository,
        @Inject(NotificationsService) private readonly notificationsService: NotificationsService,
        @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
        @Inject(EventsRealtime) private readonly realtime: EventsRealtime
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
        this.assertValidLocationForCreate(eventData.location, eventData.locationDetails);
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
                    : {}),
                ...(coHostIds.length > 0
                    ? {
                          coHosts: {
                              create: coHostIds.map((userId) => ({ userId }))
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

            if (event.coHosts.length > 0) {
                await Promise.all(
                    event.coHosts.map((coHost) =>
                        this.auditLogService.recordCoHostAdded(event.id, coHost.user, {
                            actorId: hostId,
                            impersonatorId
                        })
                    )
                );
            }

            await this.auditLogService.recordEventCreated(event, { actorId: hostId, impersonatorId });
            this.logger.info('Event created', { eventId: event.id, hostId, participantCount: participantIds.length });
            this.realtime.eventChanged(event.id);
            return mapEventToDto(event);
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
        const removed = await this.eventsRepo.remove(id);
        this.realtime.eventChanged(id);
        return removed;
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
        this.assertValidLocationForUpdate(event, eventData.location, eventData.locationDetails);
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

        let coHostsChanged = false;
        if (coHosts) {
            const existingCoHostIds = event.coHosts.map((coHost) => coHost.userId);
            const nextCoHostIds = this.normalizeUserIds(coHosts).filter((id) => id !== event.hostId);
            const { toAdd, toRemove } = this.diffParticipantIds(existingCoHostIds, nextCoHostIds);
            if (toAdd.length > 0 || toRemove.length > 0) {
                coHostsChanged = true;
                await this.applyCoHostDiff(id, toAdd, toRemove, { actorId: userId, impersonatorId }, existingCoHostIds);
            }
        }

        // Applying the co-host diff first means the update response already
        // contains the final co-host list, so no second event fetch is needed.
        const updatedEvent = await this.eventsRepo.update(id, updateData);
        const finalEvent = updatedEvent;

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

                // Participants added through PATCH are invited just like via the
                // dedicated invite endpoint, so record the same audit entries.
                await Promise.all(
                    toAdd.flatMap((invitedUserId) => {
                        const invitedUser = updatedEvent.participants.find(
                            (participant) => participant.userId === invitedUserId
                        )?.user;
                        return invitedUser
                            ? [
                                  this.auditLogService.recordParticipantInvited(event.id, invitedUser, {
                                      actorId: userId,
                                      impersonatorId
                                  })
                              ]
                            : [];
                    })
                );
            }
        }

        if (participantDiff?.toRemove?.length) {
            await Promise.all(
                participantDiff.toRemove.flatMap((participantId) => {
                    const removedParticipant = event.participants.find(
                        (participant) => participant.userId === participantId
                    );
                    return removedParticipant
                        ? [
                              this.auditLogService.recordParticipantRemoved(id, removedParticipant, {
                                  actorId: userId,
                                  impersonatorId
                              })
                          ]
                        : [];
                })
            );
        }

        // Only notify participants when something actually changed: a no-op patch
        // (or one re-submitting identical values) should stay silent.
        const participantsChanged = Boolean(
            participantDiff && (participantDiff.toAdd.length > 0 || participantDiff.toRemove.length > 0)
        );
        const eventFieldsChanged = this.auditLogService.hasEventChanges(event, finalEvent);

        if (eventFieldsChanged || participantsChanged || coHostsChanged) {
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
        }

        this.logger.info('Event updated', {
            eventId: id,
            userId,
            participantDiff
        });
        this.realtime.eventChanged(id);
        return mapEventToDto(finalEvent);
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
        this.realtime.eventChanged(eventId);
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
        const savedParticipant = result;

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
        this.realtime.eventChanged(eventId);
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
            this.realtime.eventChanged(eventId);
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
        direction: 'OUTBOUND' | 'RETURN' = 'OUTBOUND',
        requestingUserId: number,
        impersonatorId: number | null = null
    ) {
        return this.assignRides(eventId, [passengerId], driverId, direction, requestingUserId, impersonatorId);
    }

    /** Assign/unassign several passengers in a single request and transaction. */
    async assignRides(
        eventId: number,
        passengerIdsInput: number[],
        driverId: number | null,
        direction: 'OUTBOUND' | 'RETURN' = 'OUTBOUND',
        requestingUserId: number,
        impersonatorId: number | null = null
    ) {
        const passengerIds = this.normalizeUserIds(passengerIdsInput);
        this.logger.info('Assigning rides', {
            eventId,
            passengerCount: passengerIds.length,
            driverId,
            requestingUserId
        });
        if (passengerIds.length === 0) {
            throw new BadRequestException('At least one passenger is required');
        }

        const event = await this.findEventOrThrow(eventId, requestingUserId);

        this.validateEventNotEnded(event);

        const isManager = this.canManageEvent(event, requestingUserId);
        const driver = driverId === null ? null : this.getParticipant(event, driverId);

        if (driverId !== null) {
            if (!driver) {
                this.logger.warn('Ride assignment rejected: driver not in event', {
                    eventId,
                    driverId
                });
                throw new NotFoundException(`Driver with id ${driverId} is not in this event`);
            }

            if (driver.transportMode !== 'DRIVER') {
                this.logger.warn('Ride assignment rejected: selected driver has no vehicle', {
                    eventId,
                    driverId
                });
                throw new ForbiddenException('Selected driver does not have a vehicle for this event');
            }
        }

        const assignments = passengerIds.map((passengerId) => {
            const passenger = this.getParticipant(event, passengerId);
            if (!passenger) {
                throw new NotFoundException(`Passenger with id ${passengerId} is not in this event`);
            }

            const currentAssignment = this.getRideAssignment(event, passengerId, direction);
            const isCurrentDriver = currentAssignment?.driverId === requestingUserId;
            const isAssigningToSelf = driverId === requestingUserId;
            const isUnassigningFromSelf = driverId === null && isCurrentDriver;

            if (!isManager && !isAssigningToSelf && !isUnassigningFromSelf) {
                this.logger.warn('Ride assignment forbidden', {
                    eventId,
                    passengerId,
                    driverId,
                    requestingUserId
                });
                throw new ForbiddenException(
                    driverId !== null
                        ? 'Only the host or the driver of the vehicle can assign passengers to this car'
                        : 'Only the host or the current driver can remove passengers from this car'
                );
            }

            // Drivers who did not split their trips drive the same passengers both ways.
            const affectedDriverId = driverId ?? currentAssignment?.driverId;
            const affectedDriver =
                affectedDriverId === undefined ? undefined : this.getParticipant(event, affectedDriverId);
            const directions: ('OUTBOUND' | 'RETURN')[] =
                affectedDriver && !hasSplitVehicleSeats(affectedDriver) ? ['OUTBOUND', 'RETURN'] : [direction];

            return {
                passengerId,
                driverId,
                directions,
                previousDriverId: currentAssignment?.driverId,
                previousAssignment: currentAssignment
                    ? { passengerId: currentAssignment.passengerId, driverId: currentAssignment.driverId }
                    : null
            };
        });

        await this.eventsRepo.assignRides(eventId, assignments);

        if (driverId !== null) {
            const actorUser = await this.eventsRepo.getUserById(requestingUserId);
            const actorUsername = this.getActorUsername(actorUser?.username);

            await Promise.all([
                ...assignments.map(({ passengerId, previousAssignment }) =>
                    this.auditLogService.recordRideAssigned(
                        eventId,
                        previousAssignment,
                        { passengerId, driverId },
                        { actorId: requestingUserId, impersonatorId }
                    )
                ),
                this.notifyUserIds(passengerIds, {
                    eventId,
                    type: NotificationCode.RIDE_ASSIGNED,
                    title: EVENT_NOTIFICATION_TITLES.rideAssigned,
                    body: this.truncateText(EVENT_NOTIFICATION_MESSAGES.rideAssigned(actorUsername, event.title), 200),
                    actorUsername
                })
            ]);
        } else {
            await Promise.all(
                assignments.map(({ previousAssignment }) =>
                    this.auditLogService.recordRideUnassigned(eventId, previousAssignment, {
                        actorId: requestingUserId,
                        impersonatorId
                    })
                )
            );
        }

        this.logger.info('Ride assignment updated', {
            eventId,
            passengerCount: passengerIds.length,
            driverId,
            requestingUserId
        });
        this.realtime.eventChanged(eventId);
        return this.findOne(eventId, requestingUserId);
    }

    async updatePaymentStatus(
        eventId: number,
        targetUserId: number,
        hasPaid: boolean,
        requestingUserId: number,
        impersonatorId: number | null = null
    ) {
        this.logger.info('Updating participant payment status', { eventId, targetUserId, hasPaid, requestingUserId });
        const event = await this.findEventOrThrow(eventId, requestingUserId);

        const isHost = this.canManageEvent(event, requestingUserId);
        if (!isHost) {
            this.logger.warn('Payment update forbidden for non-host', {
                eventId,
                requestingUserId,
                hostId: event.hostId
            });
            throw new ForbiddenException('Only the host or a co-host can update payment status');
        }

        const participant = this.getParticipant(event, targetUserId);
        if (!participant) {
            throw new NotFoundException(`Participant with userId ${targetUserId} not found in event ${eventId}`);
        }

        const updated = await this.eventsRepo.updatePaymentStatus(eventId, targetUserId, hasPaid);
        await this.auditLogService.recordParticipantUpdated(
            eventId,
            participant,
            { ...participant, hasPaid },
            { actorId: requestingUserId, impersonatorId },
            targetUserId
        );

        this.logger.info('Participant payment status updated', { eventId, targetUserId, hasPaid });
        this.realtime.eventChanged(eventId);
        return { success: true, hasPaid: updated.hasPaid };
    }

    private canManageEvent(event: EventWithRelations, userId: number): boolean {
        return isEventManager(event, userId);
    }

    private async applyCoHostDiff(
        eventId: number,
        toAdd: number[],
        toRemove: number[],
        actor: { actorId: number; impersonatorId: number | null },
        currentIds?: number[]
    ) {
        if (toAdd.length > 0 || toRemove.length > 0) {
            const existingIds = currentIds ?? (await this.eventsRepo.getCoHostIds(eventId));
            await this.eventsRepo.setCoHosts(eventId, [
                ...existingIds.filter((id) => !toRemove.includes(id)),
                ...toAdd.filter((id) => !existingIds.includes(id))
            ]);
        }

        const [addedUsers, removedUsers] = await Promise.all([
            Promise.all(toAdd.map((coHostId) => this.eventsRepo.getUserById(coHostId))),
            Promise.all(toRemove.map((coHostId) => this.eventsRepo.getUserById(coHostId)))
        ]);

        await Promise.all([
            ...addedUsers.flatMap((user) =>
                user ? [this.auditLogService.recordCoHostAdded(eventId, user, actor)] : []
            ),
            ...removedUsers.flatMap((user) =>
                user ? [this.auditLogService.recordCoHostRemoved(eventId, user, actor)] : []
            )
        ]);
    }

    private buildCreateEventInput(
        eventData: Omit<CreateEventDto, 'participants' | 'coHosts'>
    ): Omit<Prisma.EventCreateInput, 'host'> {
        const { startTime, endTime, participationDeadline, locationDetails, ...rest } = eventData;

        return {
            ...rest,
            ...(locationDetails ? { locationDetails: locationDetails as unknown as Prisma.InputJsonValue } : {}),
            startTime: new Date(startTime),
            endTime: endTime ? new Date(endTime) : null,
            participationDeadline: participationDeadline ? new Date(participationDeadline) : null
        };
    }

    private buildUpdateEventInput(
        eventData: Omit<UpdateEventDto, 'participants' | 'coHosts'>
    ): Prisma.EventUpdateInput {
        const { startTime, endTime, participationDeadline, locationDetails, ...rest } = eventData;
        const updateData: Prisma.EventUpdateInput = { ...rest };

        if (locationDetails !== undefined) {
            updateData.locationDetails = locationDetails as unknown as Prisma.InputJsonValue;
        }

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

    private assertValidLocationForCreate(location: string, details?: AddressDetailsDto): void {
        const trimmedLocation = location?.trim();
        if (!trimmedLocation) {
            throw new BadRequestException('A complete street address is required');
        }

        if (!details) {
            throw new BadRequestException('Pick a complete street address from the suggestions');
        }

        this.assertLocationDetailsMatch(trimmedLocation, details);
    }

    private assertValidLocationForUpdate(
        event: EventWithRelations,
        location?: string,
        details?: AddressDetailsDto
    ): void {
        const locationProvided = location !== undefined;
        const detailsProvided = details !== undefined;

        if (!locationProvided && !detailsProvided) {
            return;
        }

        if (detailsProvided && !locationProvided) {
            throw new BadRequestException('Location is required when address details are provided');
        }

        const trimmedLocation = location?.trim() ?? '';
        if (!detailsProvided) {
            // Existing free-text (or missing) locations may keep their value when the field is untouched.
            if (trimmedLocation === (event.location ?? '').trim()) {
                return;
            }

            if (!trimmedLocation) {
                throw new BadRequestException('A complete street address is required');
            }

            throw new BadRequestException('Pick a complete street address from the suggestions');
        }

        if (!trimmedLocation) {
            throw new BadRequestException('A complete street address is required');
        }

        this.assertLocationDetailsMatch(trimmedLocation, details);
    }

    private assertLocationDetailsMatch(location: string, details: AddressDetailsDto): void {
        if (details.formattedAddress.trim() !== location) {
            throw new BadRequestException('The address details do not match the selected address');
        }
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
        return event.participants.flatMap((participant) => (participant.userId === null ? [] : [participant.userId]));
    }

    private getParticipant(event: EventWithRelations, userId: number) {
        return event.participants.find((participant) => attendanceId(participant) === userId);
    }

    private getRideAssignment(
        event: EventWithRelations,
        passengerId: number,
        direction: 'OUTBOUND' | 'RETURN' = 'OUTBOUND'
    ) {
        return event.rideAssignments.find(
            (assignment) => assignment.passengerId === passengerId && assignment.direction === direction
        );
    }

    private normalizeUserIds(userIds: number[]): number[] {
        return normalizeIdList(userIds);
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
        assertEventNotEnded(event);
    }

    private async notifyParticipants(
        eventId: number,
        notification: { type: NotificationCode; title: string; body: string; actorUsername?: string },
        status?: InviteStatus
    ) {
        const tokens = status
            ? await this.eventsRepo.getParticipantTokens(eventId, status)
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
        return buildNotificationData({ eventId, type, actorUsername });
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
