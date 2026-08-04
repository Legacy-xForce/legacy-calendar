import { EventParticipantDto, EventResponseDto } from './dto/event-response.dto.js';
import { UserDto } from '../users/dto/user.dto.js';
import { buildProfilePictureUrl } from '../users/profile-picture.util.js';
import { EventWithRelations } from './events.repository.js';

function mapUserDto(user: { id: number; username: string; isAdmin: boolean; authId: string | null }): UserDto {
    return {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        profilePictureUrl: buildProfilePictureUrl(user.authId)
    };
}

export function mapEventToDto(event: EventWithRelations): EventResponseDto {
    const rideAssignmentsByPassengerId = new Map(
        event.rideAssignments.map((assignment) => [assignment.passengerId, assignment])
    );

    const participantsDto: EventParticipantDto[] = event.participants.map((attendance) => {
        const rideAssignment = rideAssignmentsByPassengerId.get(attendance.userId);

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
            driverId: rideAssignment?.driverId,
            driver: rideAssignment?.driver ? mapUserDto(rideAssignment.driver) : undefined
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
