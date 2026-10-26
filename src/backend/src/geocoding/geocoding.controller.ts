import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AddressDetailsDto } from './dto/address-details.dto.js';
import { AutocompleteQueryDto } from './dto/autocomplete-query.dto.js';
import { GeocodingService } from './geocoding.service.js';

@ApiTags('geocoding')
@Controller('geocoding')
export class GeocodingController {
    constructor(@Inject(GeocodingService) private readonly geocodingService: GeocodingService) {}

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, ThrottlerGuard)
    @Throttle({ default: { limit: 60, ttl: 60_000 } })
    @Get('autocomplete')
    @ApiOperation({ summary: 'Search complete street addresses for autocomplete' })
    @ApiQuery({
        name: 'q',
        required: true,
        type: String,
        example: 'Via Roma 10, Roma',
        description: 'Text typed by the user; at least 3 characters'
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
        example: 5,
        description: 'Maximum number of suggestions (1-8)'
    })
    @ApiResponse({ status: 200, description: 'Matching street addresses', type: AddressDetailsDto, isArray: true })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 503, description: 'Address search is not configured' })
    search(@Query() query: AutocompleteQueryDto): Promise<AddressDetailsDto[]> {
        return this.geocodingService.autocomplete(query.q, query.limit ?? 5);
    }
}
