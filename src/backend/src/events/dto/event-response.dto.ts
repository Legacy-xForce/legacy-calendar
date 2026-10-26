import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users/dto/user.dto.js';
import { InviteStatus, TransportMode } from '../../../prisma/generated/client.js';
import { AddressDetailsDto } from '../../geocoding/dto/address-details.dto.js';

/**
 * The host view of a user. The payment fields (`paypalLink`, `ibanNumber`,
 * `ibanAccountHolder`, `revolutLink`) are inherited from {@link UserDto}.
 */
export class EventHostDto extends UserDto {}

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

    @ApiProperty({ type: Number, example: 4, description: 'Number of available outbound seats' })
    vehicleSeatsOutbound?: number;

    @ApiProperty({ type: Number, example: 4, description: 'Number of available return seats' })
    vehicleSeatsReturn?: number;

    @ApiProperty({ type: Boolean, example: false, description: 'Payment status tracked by host/co-host' })
    hasPaid?: boolean;

    @ApiProperty({ type: Number, example: 1, description: 'Outbound driver ID', required: false })
    driverId?: number;

    @ApiProperty({ type: Number, example: 1, description: 'Return driver ID', required: false })
    driverIdReturn?: number;

    @ApiProperty({ type: () => UserDto, description: 'Outbound driver details', required: false })
    driver?: UserDto;

    @ApiProperty({ type: () => UserDto, description: 'Return driver details', required: false })
    driverReturn?: UserDto;
}

export class EventResponseDto {
    @ApiProperty({ type: Number, example: 1, description: 'Event ID' })
    id!: number;

    @ApiProperty({ type: Number, example: 1, description: 'Host user ID' })
    hostId!: number;

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

    @ApiProperty({
        type: () => AddressDetailsDto,
        description: 'Structured details of the selected street address',
        required: false,
        nullable: true
    })
    locationDetails?: AddressDetailsDto | null;

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

    @ApiProperty({ type: () => EventHostDto, description: 'Host of the event' })
    host!: EventHostDto;

    @ApiProperty({ type: () => [EventHostDto], description: 'Co-hosts of the event (can edit it like the host)' })
    coHosts!: EventHostDto[];

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
