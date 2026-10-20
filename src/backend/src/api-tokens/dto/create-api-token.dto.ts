import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiTokenScope } from '../../../prisma/generated/client.js';

export class CreateApiTokenDto {
    @ApiPropertyOptional({
        type: String,
        example: 'Home Assistant',
        description: 'Human readable label used to recognise the integration',
        maxLength: 60
    })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(60)
    name?: string;

    @ApiProperty({
        enum: ApiTokenScope,
        example: ApiTokenScope.read,
        description: 'read allows GET requests only, write allows every request the user can make'
    })
    @IsEnum(ApiTokenScope)
    scope!: ApiTokenScope;
}
