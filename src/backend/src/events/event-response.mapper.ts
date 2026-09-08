import { EventParticipantDto, EventResponseDto } from './dto/event-response.dto.js';
import { UserDto } from '../users/dto/user.dto.js';
import { buildProfilePictureUrl } from '../users/profile-picture.util.js';
import { EventWithRelations } from './events.repository.js';

function mapUserDto(user: {
    id: number;
    username: string;
    isAdmin: boolean;
    authId: string | null;
    isGuest?: boolean;
}): UserDto {
    return {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        profilePictureUrl: buildProfilePictureUrl(user.authId),
        isGuest: user.isGuest ?? false
    };
}

export function mapEventToDto(event: EventWithRelations): EventResponseDto {
    const rideAssignmentsByPassengerId = new Map<
        number,
        { outbound?: (typeof event.rideAssignments)[number]; return?: (typeof event.rideAssignments)[number] }
    >();
    event.rideAssignments.forEach((assignment) => {
        const existing = rideAssignmentsByPassengerId.get(assignment.passengerId) ?? {};
        if (assignment.direction === 'RETURN') existing.return = assignment;
        else existing.outbound = assignment;
        rideAssignmentsByPassengerId.set(assignment.passengerId, existing);
    });

    const participantsDto: EventParticipantDto[] = event.participants.map((attendance) => {
        const assignments = rideAssignmentsByPassengerId.get(attendance.userId);
        const outboundAssignment = assignments?.outbound;
        const returnAssignment = assignments?.return;

        return {
            ...mapUserDto(attendance.user),
            status: attendance.status,
            wantsFood: attendance.wantsFood,
            wantsWeed: attendance.wantsWeed,
            wantsSleep: attendance.wantsSleep,
            wantsAlcohol: attendance.wantsAlcohol,
            wantsBeer: attendance.wantsBeer,
            transportMode: attendance.transportMode,
            vehicleSeats: attendance.vehicleSeats,
            vehicleSeatsOutbound: attendance.vehicleSeatsOutbound,
            vehicleSeatsReturn: attendance.vehicleSeatsReturn,
            hasPaid: attendance.hasPaid,
            driverId: outboundAssignment?.driverId,
            driver: outboundAssignment?.driver ? mapUserDto(outboundAssignment.driver) : undefined,
            driverIdOutbound: outboundAssignment?.driverId,
            driverOutbound: outboundAssignment?.driver ? mapUserDto(outboundAssignment.driver) : undefined,
            driverIdReturn: returnAssignment?.driverId,
            driverReturn: returnAssignment?.driver ? mapUserDto(returnAssignment.driver) : undefined
        };
    });

    return {
        id: event.id,
        title: event.title,
        color: event.color,
        description: event.description,
        location: event.location,
        startTime: event.startTime,
        endTime: event.endTime ?? null,
        participationDeadline: event.participationDeadline ?? null,
        host: mapUserDto(event.host),
        coHosts: (event.coHosts ?? []).map((coHost) => mapUserDto(coHost.user)),
        participants: participantsDto,
        isOpen: event.isOpen,
        isPrivate: event.isPrivate,
        hasFood: event.hasFood,
        hasWeed: event.hasWeed,
        hasSleep: event.hasSleep,
        hasAlcohol: event.hasAlcohol,
        hasBeer: event.hasBeer,
        foodPrice: event.foodPrice,
        weedPrice: event.weedPrice,
        sleepPrice: event.sleepPrice,
        alcoholPrice: event.alcoholPrice,
        beerPrice: event.beerPrice
    };
}
