import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class PasskeyRegisterOptionsDto {
    @ApiProperty({ example: 'My MacBook Touch ID', description: 'Friendly name for the passkey', required: false })
    @IsOptional()
    @IsString()
    deviceName?: string;
}

export class PasskeyRegisterVerifyDto {
    @ApiProperty({ description: 'Credential ID' })
    @IsString()
    @IsNotEmpty()
    id!: string;

    @ApiProperty({ description: 'Raw credential ID' })
    @IsString()
    @IsNotEmpty()
    rawId!: string;

    @ApiProperty({ description: 'Registration response payload', type: Object })
    @IsObject()
    response!: {
        clientDataJSON: string;
        attestationObject?: string;
        publicKey?: string;
        transports?: string[];
    };

    @ApiProperty({ required: false, description: 'Friendly name for the passkey' })
    @IsOptional()
    @IsString()
    deviceName?: string;
}

export class PasskeyLoginOptionsDto {
    @ApiProperty({
        example: 'alice',
        description: 'Username if known, or empty for discoverable passkey',
        required: false
    })
    @IsOptional()
    @IsString()
    username?: string;
}

export class PasskeyLoginVerifyDto {
    @ApiProperty({ description: 'Credential ID' })
    @IsString()
    @IsNotEmpty()
    id!: string;

    @ApiProperty({ description: 'Raw credential ID' })
    @IsString()
    @IsNotEmpty()
    rawId!: string;

    @ApiProperty({ description: 'Authentication response payload', type: Object })
    @IsObject()
    response!: {
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
        userHandle?: string;
    };
}
