import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class InviteUserDto {
    @ApiProperty({ type: String, example: 'johndoe', description: 'Username of the user to invite' })
    @IsString()
    @IsNotEmpty()
    username!: string;
}
