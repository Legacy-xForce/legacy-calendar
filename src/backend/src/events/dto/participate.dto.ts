import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TransportMode } from '../../../prisma/generated/client.js';

export class ParticipateDto {
    @ApiProperty({
        type: [Number],
        example: [1, 3],
        description: 'IDs of the event features the user opts into',
        required: false
    })
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    featureIds?: number[];

    @ApiProperty({
        enum: TransportMode,
        example: 'NEEDS_RIDE',
        description: 'Transport mode: NEEDS_RIDE, SELF, or DRIVER',
        required: false
    })
    @IsOptional()
    @IsEnum(TransportMode)
    transportMode?: TransportMode;

    @ApiProperty({ type: Number, example: 4, description: 'Number of total seats (for DRIVER mode)', required: false })
    @IsOptional()
    @Min(2)
    @Max(9)
    vehicleSeats?: number;

    @ApiProperty({
        type: Number,
        example: 4,
        description: 'Number of outbound seats (for DRIVER mode)',
        required: false
    })
    @IsOptional()
    @Min(2)
    @Max(9)
    vehicleSeatsOutbound?: number;

    @ApiProperty({ type: Number, example: 4, description: 'Number of return seats (for DRIVER mode)', required: false })
    @IsOptional()
    @Min(2)
    @Max(9)
    vehicleSeatsReturn?: number;
}
