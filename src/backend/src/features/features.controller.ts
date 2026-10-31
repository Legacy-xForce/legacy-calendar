import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { UserAuthGuard } from '../auth/guards/user-auth.guard.js';
import { CreateFeatureDto } from './dto/create-feature.dto.js';
import { UpdateFeatureDto } from './dto/update-feature.dto.js';
import { FeatureDto } from './dto/feature.dto.js';
import { FeaturesService } from './features.service.js';

@ApiTags('features')
@Controller('features')
export class FeaturesController {
    constructor(@Inject(FeaturesService) private readonly featuresService: FeaturesService) {}

    @Get()
    @UseGuards(UserAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'List the instance features hosts can enable on events' })
    @ApiResponse({ status: 200, type: [FeatureDto] })
    findAll() {
        return this.featuresService.findAll();
    }

    @Post()
    @UseGuards(UserAuthGuard, AdminGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a feature (Admin only)' })
    @ApiResponse({ status: 201, type: FeatureDto })
    @ApiResponse({ status: 409, description: 'Name or emoji already in use' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
    create(@Body() dto: CreateFeatureDto) {
        return this.featuresService.create(dto);
    }

    @Patch(':id')
    @UseGuards(UserAuthGuard, AdminGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Rename a feature or change its emoji (Admin only)' })
    @ApiResponse({ status: 200, type: FeatureDto })
    @ApiResponse({ status: 404, description: 'Feature not found' })
    @ApiResponse({ status: 409, description: 'Name or emoji already in use' })
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFeatureDto) {
        return this.featuresService.update(id, dto);
    }

    @Delete(':id')
    @UseGuards(UserAuthGuard, AdminGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete a feature and remove it from all events (Admin only)' })
    @ApiResponse({ status: 200, description: 'Feature deleted' })
    @ApiResponse({ status: 404, description: 'Feature not found' })
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.featuresService.remove(id);
    }
}
