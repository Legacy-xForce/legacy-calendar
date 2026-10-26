import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class AutocompleteQueryDto {
    @ApiProperty({
        type: String,
        example: 'Via Roma 10, Roma',
        description: 'Text typed by the user; at least 3 characters'
    })
    @Transform(({ value }): unknown => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @Length(3, 200)
    q!: string;

    @ApiProperty({
        type: Number,
        example: 5,
        description: 'Maximum number of suggestions to return',
        required: false,
        default: 5,
        minimum: 1,
        maximum: 8
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(8)
    @IsOptional()
    limit?: number;
}
