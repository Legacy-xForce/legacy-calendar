import { ApiProperty } from '@nestjs/swagger';
import { ApiTokenScope } from '../../../prisma/generated/client.js';

export class ApiTokenResponseDto {
    @ApiProperty({ type: Number, example: 7, description: 'Token id' })
    id!: number;

    @ApiProperty({ type: String, example: 'Home Assistant', description: 'Human readable label' })
    name!: string;

    @ApiProperty({ enum: ApiTokenScope, example: ApiTokenScope.read, description: 'Capability of the token' })
    scope!: ApiTokenScope;

    @ApiProperty({
        type: String,
        example: 'legacy-calendar-01a1…1289',
        description: 'Non-secret hint that identifies the token in lists'
    })
    tokenHint!: string;

    @ApiProperty({ type: Date, description: 'When the token was created' })
    createdAt!: Date;

    @ApiProperty({ type: Date, nullable: true, description: 'Last time the token authenticated a request' })
    lastUsedAt!: Date | null;

    @ApiProperty({ type: Date, nullable: true, description: 'Last time the token was rotated' })
    rotatedAt!: Date | null;
}

export class CreatedApiTokenResponseDto extends ApiTokenResponseDto {
    @ApiProperty({
        type: String,
        example: 'legacy-calendar-01a15968-64aa-707d-8904-a6a408611289',
        description: 'The full token. Only returned once, at creation or rotation time.'
    })
    token!: string;
}
