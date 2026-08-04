import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
    @ApiProperty({
        type: String,
        example: 'user123',
        description: 'The username of the user (3-30 chars, alphanumeric)'
    })
    @IsString()
    @IsNotEmpty()
    @Length(3, 30)
    @Matches(/^[a-zA-Z0-9._-]+$/)
    username!: string;

    @ApiProperty({ example: false, description: 'Whether the user is an admin', default: false, required: false })
    isAdmin?: boolean;
}
