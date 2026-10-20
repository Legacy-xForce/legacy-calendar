import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Inject,
    Param,
    ParseIntPipe,
    Post,
    Request,
    UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { type RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { ApiTokensService } from './api-tokens.service.js';
import { CreateApiTokenDto } from './dto/create-api-token.dto.js';
import { ApiTokenResponseDto, CreatedApiTokenResponseDto } from './dto/api-token-response.dto.js';

@ApiTags('api-tokens')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard, ThrottlerGuard)
@Controller('api-tokens')
export class ApiTokensController {
    constructor(@Inject(ApiTokensService) private readonly apiTokensService: ApiTokensService) {}

    @Get()
    @ApiOperation({
        summary: 'List the API tokens of the authenticated user',
        description: 'Requires a session token. API tokens cannot list or manage API tokens.'
    })
    @ApiResponse({ status: 200, description: 'Return API token metadata', type: ApiTokenResponseDto, isArray: true })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    findAll(@Request() req: RequestWithUser) {
        return this.apiTokensService.findAll(req.user.userId as number);
    }

    @Post()
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    @ApiOperation({
        summary: 'Create an API token',
        description: 'The full token is returned only in this response. Store it somewhere safe.'
    })
    @ApiResponse({ status: 201, description: 'Token created', type: CreatedApiTokenResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid scope or token limit reached' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    create(@Request() req: RequestWithUser, @Body() dto: CreateApiTokenDto) {
        return this.apiTokensService.create(req.user.userId as number, dto);
    }

    @Post(':id/rotate')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    @ApiOperation({
        summary: 'Rotate an API token',
        description: 'Invalidates the old value immediately and returns the new token once.'
    })
    @ApiResponse({ status: 200, description: 'Token rotated', type: CreatedApiTokenResponseDto })
    @ApiResponse({ status: 404, description: 'API token not found' })
    rotate(@Request() req: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
        return this.apiTokensService.rotate(req.user.userId as number, id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete an API token' })
    @ApiResponse({ status: 200, description: 'Token deleted' })
    @ApiResponse({ status: 404, description: 'API token not found' })
    remove(@Request() req: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
        return this.apiTokensService.remove(req.user.userId as number, id);
    }
}
