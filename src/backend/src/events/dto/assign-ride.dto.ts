import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsOptional } from 'class-validator';
import { RideDirection } from '../../../prisma/generated/client.js';

export class AssignRideDto {
    @ApiProperty({
        type: Number,
        description:
            'Namespaced participant id: positive for registered users, negative for guest participants (-guestParticipantId)'
    })
    @IsInt()
    passengerId!: number;

    @ApiPropertyOptional({
        type: Number,
        nullable: true,
        description: 'Driver to assign the passenger to, or null to remove the assignment'
    })
    @IsOptional()
    @IsInt()
    driverId?: number | null;

    @ApiPropertyOptional({ enum: RideDirection, default: RideDirection.OUTBOUND })
    @IsOptional()
    @IsEnum(RideDirection)
    direction?: RideDirection;
}

export class AssignRidesBatchDto {
    @ApiProperty({
        type: [Number],
        description:
            'Namespaced participant ids: positive for registered users, negative for guest participants (-guestParticipantId)'
    })
    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    passengerIds!: number[];

    @ApiPropertyOptional({
        type: Number,
        nullable: true,
        description: 'Driver to assign all passengers to, or null to remove their assignments'
    })
    @IsOptional()
    @IsInt()
    driverId?: number | null;

    @ApiPropertyOptional({ enum: RideDirection, default: RideDirection.OUTBOUND })
    @IsOptional()
    @IsEnum(RideDirection)
    direction?: RideDirection;
}
