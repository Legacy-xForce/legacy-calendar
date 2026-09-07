import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateUserGroupDto {
    @ApiProperty({ example: 'Core Friends', description: 'Name of the custom group' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name!: string;

    @ApiProperty({ example: [1, 2, 3], description: 'List of member user IDs in this group' })
    @IsArray()
    @IsInt({ each: true })
    memberIds!: number[];
}
