import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { ParticipateDto } from '../../events/dto/participate.dto.js';

export class GuestParticipateDto extends ParticipateDto {
    @ApiProperty({
        type: String,
        example: 'jane_doe',
        description: 'Display name chosen by the guest. Required on first submission.',
        required: false
    })
    @IsOptional()
    @IsString()
    @Length(2, 32)
    @Matches(/^[a-zA-Z0-9_.-]+$/, {
        message: 'username may only contain letters, numbers, underscores, dots and hyphens'
    })
    username?: string;
}
