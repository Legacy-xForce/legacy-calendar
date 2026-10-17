import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEventStartTimeWithinAllowedRange } from '../validators/is-event-start-time-within-allowed-range.validator.js';

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

    @ApiProperty({ type: String, example: 'Meeting Room A', description: 'Location of the event', required: false })
    @IsString()
    @IsOptional()
    location?: string;

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

    @ApiProperty({ type: Boolean, example: true, description: 'Whether the event has food', required: false })
    @IsOptional()
    @IsBoolean()
    hasFood?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Whether the event has weed', required: false })
    @IsOptional()
    @IsBoolean()
    hasWeed?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Whether the event has sleep', required: false })
    @IsOptional()
    @IsBoolean()
    hasSleep?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Whether the event has alcohol', required: false })
    @IsOptional()
    @IsBoolean()
    hasAlcohol?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Whether the event has beer', required: false })
    @IsOptional()
    @IsBoolean()
    hasBeer?: boolean;

    @ApiProperty({ type: Number, example: 10.5, description: 'Food budget', required: false })
    @IsOptional()
    @IsNumber()
    foodPrice?: number;

    @ApiProperty({ type: Number, example: 50, description: 'Weed budget', required: false })
    @IsOptional()
    @IsNumber()
    weedPrice?: number;

    @ApiProperty({ type: Number, example: 20, description: 'Sleep/Accommodation budget', required: false })
    @IsOptional()
    @IsNumber()
    sleepPrice?: number;

    @ApiProperty({ type: Number, example: 30, description: 'Alcohol budget', required: false })
    @IsOptional()
    @IsNumber()
    alcoholPrice?: number;

    @ApiProperty({ type: Number, example: 15, description: 'Beer budget', required: false })
    @IsOptional()
    @IsNumber()
    beerPrice?: number;
}
