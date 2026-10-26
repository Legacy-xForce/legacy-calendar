import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class AddressDetailsDto {
    @ApiProperty({
        type: String,
        example: '511b0b0a2c3d4e5f6a7b8c9d0e1f2a3b',
        description: 'Provider identifier for the selected address'
    })
    @IsString()
    @IsNotEmpty()
    placeId!: string;

    @ApiProperty({
        type: String,
        example: 'Via Roma 10, 00100 Roma, Italy',
        description: 'Full address as shown to the user'
    })
    @IsString()
    @IsNotEmpty()
    formattedAddress!: string;

    @ApiProperty({ type: String, example: 'Via Roma', description: 'Street name' })
    @IsString()
    @IsNotEmpty()
    street!: string;

    @ApiProperty({ type: String, example: '10', description: 'House number' })
    @IsString()
    @IsNotEmpty()
    houseNumber!: string;

    @ApiProperty({ type: String, example: 'Roma', description: 'City or municipality' })
    @IsString()
    @IsNotEmpty()
    city!: string;

    @ApiProperty({ type: String, example: '00100', description: 'Postal code', required: false })
    @IsString()
    @IsOptional()
    postcode?: string;

    @ApiProperty({ type: String, example: 'Italy', description: 'Country name' })
    @IsString()
    @IsNotEmpty()
    country!: string;

    @ApiProperty({ type: String, example: 'IT', description: 'ISO 3166-1 alpha-2 country code' })
    @IsString()
    @Length(2, 2)
    countryCode!: string;

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
