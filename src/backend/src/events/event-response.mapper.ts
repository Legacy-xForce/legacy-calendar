import { EventHostDto, EventParticipantDto, EventResponseDto } from './dto/event-response.dto.js';
import { UserDto } from '../users/dto/user.dto.js';
import { buildProfilePictureUrl } from '../users/profile-picture.util.js';
import { EventWithRelations } from './events.repository.js';

function mapUserDto(user: { id: number; username: string; isAdmin: boolean; authId: string | null }): UserDto {
    return {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        profilePictureUrl: buildProfilePictureUrl(user.authId),
        isGuest: false
    };
}

// Only hosts/co-hosts surface payment coordinates - participants use mapUserDto so
// they never receive each other's payment info via the participants list.
function mapHostDto(user: {
    id: number;
    username: string;
    isAdmin: boolean;
    authId: string | null;
    paypalLink: string | null;
    ibanNumber: string | null;
    ibanAccountHolder: string | null;
    revolutLink: string | null;
}): EventHostDto {
    return {
        ...mapUserDto(user),
        paypalLink: user.paypalLink,
        ibanNumber: user.ibanNumber,
        ibanAccountHolder: user.ibanAccountHolder,
        revolutLink: user.revolutLink
    };
}

export function mapEventToDto(event: EventWithRelations): EventResponseDto {
    const mapParticipantId = (attendance: (typeof event.participants)[number]) =>
        attendance.userId ?? -attendance.guestParticipant!.id;
    const mapPerson = (id: number): UserDto | undefined => {
        if (id < 0) {
            const guest = event.participants.find(
                (attendance) => attendance.guestParticipantId === -id
            )?.guestParticipant;
            return guest
                ? { id, username: guest.displayName, isAdmin: false, profilePictureUrl: null, isGuest: true }
                : undefined;
        }

        const user =
            event.participants.find((attendance) => attendance.user?.id === id)?.user ??
            (event.host.id === id ? event.host : event.coHosts.find((coHost) => coHost.user.id === id)?.user);
        return user ? mapUserDto(user) : undefined;
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
                ? mapUserDto(attendance.user)
                : {
                      id: -attendance.guestParticipant!.id,
                      username: attendance.guestParticipant!.displayName,
                      isAdmin: false,
                      profilePictureUrl: null,
                      isGuest: true
                  }),
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
