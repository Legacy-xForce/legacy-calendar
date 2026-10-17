import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, Max, Min } from 'class-validator';
import { TransportMode } from '../../../prisma/generated/client.js';

export class ParticipateDto {
    @ApiProperty({ type: Boolean, example: true, description: 'Whether the user wants food', required: false })
    @IsOptional()
    @IsBoolean()
    wantsFood?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Whether the user wants weed', required: false })
    @IsOptional()
    @IsBoolean()
    wantsWeed?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Whether the user wants sleep', required: false })
    @IsOptional()
    @IsBoolean()
    wantsSleep?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Whether the user wants alcohol', required: false })
    @IsOptional()
    @IsBoolean()
    wantsAlcohol?: boolean;

    @ApiProperty({ type: Boolean, example: true, description: 'Whether the user wants beer', required: false })
    @IsOptional()
    @IsBoolean()
    wantsBeer?: boolean;

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
