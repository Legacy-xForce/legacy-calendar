import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class AddressDetailsDto {
    @ApiProperty({
        type: String,
        example: '511b0b0a2c3d4e5f6a7b8c9d0e1f2a3b',
        description: 'Provider identifier for the selected location'
    })
    @IsString()
    @IsNotEmpty()
    placeId!: string;

    @ApiProperty({
        type: String,
        example: 'Via Roma 10, 00100 Roma, Italy',
        description: 'Full location label as shown to the user'
    })
    @IsString()
    @IsNotEmpty()
    formattedAddress!: string;

    @ApiProperty({ type: String, example: 'Via Roma', description: 'Street name, when available', required: false })
    @IsString()
    @IsOptional()
    street?: string;

    @ApiProperty({ type: String, example: '10', description: 'House number, when available', required: false })
    @IsString()
    @IsOptional()
    houseNumber?: string;

    @ApiProperty({
        type: String,
        example: 'Roma',
        description: 'City or municipality, when available',
        required: false
    })
    @IsString()
    @IsOptional()
    city?: string;

    @ApiProperty({ type: String, example: '00100', description: 'Postal code, when available', required: false })
    @IsString()
    @IsOptional()
    postcode?: string;

    @ApiProperty({ type: String, example: 'Italy', description: 'Country name, when available', required: false })
    @IsString()
    @IsOptional()
    country?: string;

    @ApiProperty({
        type: String,
        example: 'IT',
        description: 'ISO 3166-1 alpha-2 country code, when available',
        required: false
    })
    @IsString()
    @Length(2, 2)
    @IsOptional()
    countryCode?: string;

    @ApiProperty({ type: Number, example: 41.9028, description: 'Latitude' })
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat!: number;

    @ApiProperty({ type: Number, example: 12.4964, description: 'Longitude' })
    @IsNumber()
    @Min(-180)
    @Max(180)
    lon!: number;
}
