import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
    @ApiProperty({ type: Number, example: 1, description: 'The user ID' })
    id!: number;

    @ApiProperty({ type: String, example: 'user123', description: 'The username' })
    username!: string;

    @ApiProperty({ type: Boolean, example: false, description: 'Whether the user is an admin' })
    isAdmin!: boolean;

    @ApiProperty({
        type: String,
        nullable: true,
        example: 'https://auth.legacy-group.tech/auth/profile-picture/4a41d722-9bc3-407b-b3b1-e15d22b05463',
        description: 'URL of the user profile picture, served by the auth microservice'
    })
    profilePictureUrl!: string | null;

    @ApiProperty({
        type: Boolean,
        example: false,
        description: 'Whether this is a temporary guest account created via a magic-link invite'
    })
    isGuest!: boolean;

    @ApiProperty({
        type: String,
        nullable: true,
        example: 'https://paypal.me/johndoe',
        description: 'PayPal link for receiving payments',
        required: false
    })
    paypalLink?: string | null;

    @ApiProperty({
        type: String,
        nullable: true,
        example: 'IT60X0542811101000000123456',
        description: 'IBAN for bank transfers',
        required: false
    })
    ibanNumber?: string | null;

    @ApiProperty({
        type: String,
        nullable: true,
        example: 'John Doe',
        description: 'Account holder name for bank transfers',
        required: false
    })
    ibanAccountHolder?: string | null;

    @ApiProperty({
        type: String,
        nullable: true,
        example: 'https://revolut.me/johndoe',
        description: 'Revolut link/username for receiving payments',
        required: false
    })
    revolutLink?: string | null;
}
