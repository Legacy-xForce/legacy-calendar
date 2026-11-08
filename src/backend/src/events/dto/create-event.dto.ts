import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    ValidateNested
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEventStartTimeWithinAllowedRange } from '../validators/is-event-start-time-within-allowed-range.validator.js';
import { SINGLE_EMOJI_PATTERN } from '../../features/dto/create-feature.dto.js';
import { AddressDetailsDto } from './address-details.dto.js';

export const MAX_ONE_TIME_FEATURES = 10;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class EventFeatureInputDto {
    @ApiProperty({
        type: Number,
        example: 1,
        description: 'ID of a catalog feature, or of a one-time feature this event already has',
        required: false
    })
    @IsOptional()
    @IsInt()
    featureId?: number;

    @ApiProperty({
        type: String,
        example: 'Karaoke',
        description: 'Name of a new one-time feature (with emoji, instead of featureId)',
        required: false
    })
    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(32)
    name?: string;

    @ApiProperty({ type: String, example: '🎤', description: 'Emoji of a new one-time feature', required: false })
    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(SINGLE_EMOJI_PATTERN, { message: 'emoji must be a single emoji' })
    emoji?: string;

    @ApiProperty({ type: Number, example: 10.5, description: 'Budget for this feature', required: false })
    @IsOptional()
    @IsNumber()
    @Min(0)
    price?: number;

    @ApiProperty({
        type: Boolean,
        description:
            'Everyone eligible who joins gets this feature and cannot opt out. Omitted keeps the current value',
        required: false
    })
    @IsOptional()
    @IsBoolean()
    mandatory?: boolean;

    @ApiProperty({
        type: [Number],
        description:
            'Participants allowed to opt in: registered user ids, or negative ids for magic-link guests. Empty means everyone. Omitted keeps the current value',
        required: false
    })
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    eligibleUserIds?: number[];
}

export class CreateEventDto {
    @ApiProperty({ type: String, example: 'Team Standup', description: 'Title of the event' })
    @IsString()
    @IsNotEmpty()
    title!: string;

    @ApiProperty({ type: String, example: '#ffffff', description: 'Color of the event', required: false })
    @IsString()
    @IsOptional()
    color?: string;

    @ApiProperty({ type: String, example: 'Weekly sync with the team', description: 'Description', required: false })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        type: String,
        example: 'Via Roma 10, 00100 Roma, Italy',
        description: 'Complete location of the event (optional)',
        required: false
    })
    @IsString()
    @IsOptional()
    location?: string;

    @ApiProperty({
        type: () => AddressDetailsDto,
        description: 'Structured details of the selected location',
        required: false
    })
    @ValidateNested()
    @Type(() => AddressDetailsDto)
    @IsOptional()
    locationDetails?: AddressDetailsDto;

    @ApiProperty({
        type: String,
        example: '2026-02-04T10:00:00Z',
        description: 'Start time (ISO 8601). Must be today or within 1 year from now.'
    })
    @IsDateString()
    @IsEventStartTimeWithinAllowedRange()
    @IsNotEmpty()
    startTime!: string;

    @ApiProperty({
        type: String,
        example: '2026-02-04T11:00:00Z',
        description: 'End time (ISO 8601). Must be today or within 1 year from now.',
        required: false
    })
    @IsDateString()
    @IsEventStartTimeWithinAllowedRange()
    @IsOptional()
    endTime?: string;

    @ApiProperty({ type: [Number], example: [1, 2], description: 'List of participant user IDs', required: false })
    @IsOptional()
    @IsInt({ each: true })
    participants?: number[];

    @ApiProperty({
        type: [Number],
        example: [3],
        description: 'List of co-host user IDs (they can edit the event like the host)',
        required: false
    })
    @IsOptional()
    @IsInt({ each: true })
    coHosts?: number[];

    @ApiProperty({
        type: String,
        example: '2026-02-04T09:00:00Z',
        description: 'Deadline for participation (ISO 8601).',
        required: false
    })
    @IsDateString()
    @IsOptional()
    participationDeadline?: string;

    @ApiProperty({
        type: Boolean,
        example: true,
        description: 'Whether the event can be joined spontaneously',
        required: false
    })
    @IsOptional()
    @IsBoolean()
    isOpen?: boolean;

    @ApiProperty({
        type: Boolean,
        example: false,
        description: 'Whether the event is private (visible only to invitees)',
        required: false
    })
    @IsOptional()
    @IsBoolean()
    isPrivate?: boolean;

    @ApiProperty({
        type: () => [EventFeatureInputDto],
        description:
            'Features enabled for this event: catalog ones by featureId, one-time ones by name + emoji, each with an optional budget',
        required: false
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => EventFeatureInputDto)
    features?: EventFeatureInputDto[];
}
