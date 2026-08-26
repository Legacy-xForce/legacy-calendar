import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users/dto/user.dto.js';
import { InviteStatus, TransportMode } from '../../../prisma/generated/client.js';

export class EventParticipantDto extends UserDto {
    @ApiProperty({ enum: InviteStatus, example: 'PENDING', description: 'Status of the invitation' })
    status!: InviteStatus;

    @ApiProperty({ type: Boolean, example: true, description: 'User wants food' })
    wantsFood?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'User wants weed' })
    wantsWeed?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'User wants sleep' })
    wantsSleep?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'User wants alcohol' })
    wantsAlcohol?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'User wants beer' })
    wantsBeer?: boolean;

    @ApiProperty({ enum: TransportMode, example: 'NEEDS_RIDE', description: 'Transport mode' })
    transportMode?: TransportMode;

    @ApiProperty({ type: Number, example: 4, description: 'Number of available seats' })
    vehicleSeats?: number;

    @ApiProperty({ type: Number, example: 1, description: 'Driver ID', required: false })
    driverId?: number;

    @ApiProperty({ type: () => UserDto, description: 'Driver details', required: false })
    driver?: UserDto;
}

export class EventResponseDto {
    @ApiProperty({ type: Number, example: 1, description: 'Event ID' })
    id!: number;

    @ApiProperty({ type: String, example: 'Team Standup', description: 'Title of the event' })
    title!: string;

    @ApiProperty({
        type: String,
        example: '#ffffff',
        description: 'Color of the event',
        required: false,
        nullable: true
    })
    color?: string | null;

    @ApiProperty({
        type: String,
        example: 'Weekly sync with the team',
        description: 'Description',
        required: false,
        nullable: true
    })
    description?: string | null;

    @ApiProperty({ type: String, example: 'Meeting Room A', description: 'Location', required: false, nullable: true })
    location?: string | null;

    @ApiProperty({ type: Date, example: '2026-02-04T10:00:00Z', description: 'Start time' })
    startTime!: Date;

    @ApiProperty({ type: Date, example: '2026-02-04T11:00:00Z', description: 'End time', required: false })
    endTime!: Date | null;

    @ApiProperty({
        type: Date,
        example: '2026-02-04T09:00:00Z',
        description: 'Deadline for participation',
        required: false,
        nullable: true
    })
    participationDeadline!: Date | null;

    @ApiProperty({ type: () => UserDto, description: 'Host of the event' })
    host!: UserDto;

    @ApiProperty({ type: () => [UserDto], description: 'Co-hosts of the event (can edit it like the host)' })
    coHosts!: UserDto[];

    @ApiProperty({ type: () => [EventParticipantDto], description: 'List of participants' })
    participants!: EventParticipantDto[];

    @ApiProperty({ type: Boolean, example: true, description: 'Whether the event is open for spontaneous joining' })
    isOpen!: boolean;

    @ApiProperty({ type: Boolean, example: false, description: 'Whether the event is private' })
    isPrivate!: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Event has food' })
    hasFood?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Event has weed' })
    hasWeed?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Event has sleep' })
    hasSleep?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Event has alcohol' })
    hasAlcohol?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Event has beer' })
    hasBeer?: boolean;

    @ApiProperty({ type: Number, example: 10.5, description: 'Food budget', required: false, nullable: true })
    foodPrice?: number | null;

    @ApiProperty({ type: Number, example: 50, description: 'Weed budget', required: false, nullable: true })
    weedPrice?: number | null;

    @ApiProperty({
        type: Number,
        example: 20,
        description: 'Sleep/Accommodation budget',
        required: false,
        nullable: true
    })
    sleepPrice?: number | null;

    @ApiProperty({ type: Number, example: 30, description: 'Alcohol budget', required: false, nullable: true })
    alcoholPrice?: number | null;

    @ApiProperty({ type: Number, example: 15, description: 'Beer budget', required: false, nullable: true })
    beerPrice?: number | null;
}
