import { ApiProperty } from '@nestjs/swagger';
import { IsIBAN, IsString, IsUrl, Length, ValidateIf } from 'class-validator';

// Empty string is accepted as an explicit "clear this field" signal from the
// profile form, so validation is skipped for it rather than rejected.
export class UpdatePaymentInfoDto {
    @ApiProperty({
        type: String,
        example: 'https://paypal.me/johndoe',
        description: 'PayPal link for receiving payments (empty string clears it)',
        required: false
    })
    @ValidateIf((_, value) => value !== undefined && value !== '')
    @IsUrl({}, { message: 'PayPal link must be a valid URL' })
    paypalLink?: string;

    @ApiProperty({
        type: String,
        example: 'IT60X0542811101000000123456',
        description: 'IBAN for bank transfers (empty string clears it)',
        required: false
    })
    @ValidateIf((_, value) => value !== undefined && value !== '')
    @IsIBAN(undefined, { message: 'IBAN is not valid' })
    ibanNumber?: string;

    @ApiProperty({
        type: String,
        example: 'John Doe',
        description: 'Account holder name for bank transfers (empty string clears it)',
        required: false
    })
    @ValidateIf((_, value) => value !== undefined && value !== '')
    @IsString()
    @Length(1, 100)
    ibanAccountHolder?: string;

    @ApiProperty({
        type: String,
        example: 'https://revolut.me/johndoe',
        description: 'Revolut link/username for receiving payments (empty string clears it)',
        required: false
    })
    @ValidateIf((_, value) => value !== undefined && value !== '')
    @IsUrl({}, { message: 'Revolut link must be a valid URL' })
    revolutLink?: string;
}
