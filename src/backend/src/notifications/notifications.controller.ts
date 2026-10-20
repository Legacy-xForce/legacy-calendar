import {
    Body,
    Controller,
    Post,
    Request,
    UseGuards,
    Inject,
    Get,
    Delete,
    Param,
    ParseIntPipe,
    Res
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { NotificationsService } from './notifications.service.js';
import { SubscribeNotificationDto } from './dto/subscribe-notification.dto.js';
import { type RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import type { Response } from 'express';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
    constructor(@Inject(NotificationsService) private readonly notificationsService: NotificationsService) {}

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, ThrottlerGuard)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @Post('subscribe')
    @ApiOperation({ summary: 'Subscribe device to notifications' })
    @ApiResponse({ status: 201, description: 'Subscribed successfully' })
    async subscribe(@Request() req: RequestWithUser, @Body() body: SubscribeNotificationDto): Promise<void> {
        await this.notificationsService.subscribe(req.user.userId as number, body.token);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, ThrottlerGuard)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @Post('unsubscribe')
    @ApiOperation({ summary: 'Unsubscribe device from notifications' })
    @ApiResponse({ status: 201, description: 'Unsubscribed successfully' })
    async unsubscribe(@Request() req: RequestWithUser, @Body() body: SubscribeNotificationDto): Promise<void> {
        await this.notificationsService.unsubscribe(req.user.userId as number, body.token);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Get('mute')
    @ApiOperation({ summary: 'List muted event chat notification preferences' })
    @ApiResponse({ status: 200, description: 'Muted event IDs returned', type: [Number] })
    async listMutedEvents(@Request() req: RequestWithUser): Promise<number[]> {
        return this.notificationsService.getMutedEventIds(req.user.userId as number);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post('mute/:eventId')
    @ApiOperation({ summary: 'Mute chat notifications for an event' })
    @ApiResponse({ status: 200, description: 'Mute already existed' })
    @ApiResponse({ status: 201, description: 'Mute created' })
    async mute(
        @Param('eventId', ParseIntPipe) eventId: number,
        @Request() req: RequestWithUser,
        @Res({ passthrough: true }) res: Response
    ): Promise<void> {
        const created = await this.notificationsService.setChatMute(req.user.userId as number, eventId, true);
        res.status(created ? 201 : 200);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Delete('mute/:eventId')
    @ApiOperation({ summary: 'Unmute chat notifications for an event' })
    @ApiResponse({ status: 200, description: 'Mute removed' })
    @ApiResponse({ status: 404, description: 'Mute not found' })
    async unmute(
        @Param('eventId', ParseIntPipe) eventId: number,
        @Request() req: RequestWithUser,
        @Res({ passthrough: true }) res: Response
    ): Promise<void> {
        const removed = await this.notificationsService.setChatMute(req.user.userId as number, eventId, false);
        if (!removed) {
            res.status(404);
            return;
        }

        res.status(200);
    }
}
