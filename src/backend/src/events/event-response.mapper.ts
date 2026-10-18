import { EventHostDto, EventParticipantDto, EventResponseDto } from './dto/event-response.dto.js';
import { UserDto } from '../users/dto/user.dto.js';
import { mapGuestToDto, mapUserToDto, type MappableUser } from '../users/user.mapper.js';
import { EventWithRelations } from './events.repository.js';

// Only hosts/co-hosts surface payment coordinates - participants use the public
// user shape so they never receive each other's payment info via the list.
function mapHostDto(user: MappableUser): EventHostDto {
    return mapUserToDto(user, { includePaymentInfo: true });
}

export function mapEventToDto(event: EventWithRelations): EventResponseDto {
    const mapParticipantId = (attendance: (typeof event.participants)[number]) =>
        attendance.userId ?? -attendance.guestParticipant!.id;
    const mapPerson = (id: number): UserDto | undefined => {
        if (id < 0) {
            const guest = event.participants.find(
                (attendance) => attendance.guestParticipantId === -id
            )?.guestParticipant;
            return guest ? mapGuestToDto(id, guest.displayName) : undefined;
        }

        const user =
            event.participants.find((attendance) => attendance.user?.id === id)?.user ??
            (event.host.id === id ? event.host : event.coHosts.find((coHost) => coHost.user.id === id)?.user);
        return user ? mapUserToDto(user) : undefined;
    };
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
        const assignments = rideAssignmentsByPassengerId.get(mapParticipantId(attendance));
        const outboundAssignment = assignments?.outbound;
        const returnAssignment = assignments?.return;

        return {
            ...(attendance.user
                ? mapUserToDto(attendance.user)
                : mapGuestToDto(-attendance.guestParticipant!.id, attendance.guestParticipant!.displayName)),
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
            driver: outboundAssignment ? mapPerson(outboundAssignment.driverId) : undefined,
            driverIdOutbound: outboundAssignment?.driverId,
            driverOutbound: outboundAssignment ? mapPerson(outboundAssignment.driverId) : undefined,
            driverIdReturn: returnAssignment?.driverId,
            driverReturn: returnAssignment ? mapPerson(returnAssignment.driverId) : undefined
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
        host: mapHostDto(event.host),
        coHosts: (event.coHosts ?? []).map((coHost) => mapHostDto(coHost.user)),
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
