import { Controller, Delete, Get, Inject, NotFoundException, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { type RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { CalendarFeedService } from './calendar-feed.service.js';
import {
    CalendarFeedDeletedResponseDto,
    CalendarFeedResponseDto,
    CreatedCalendarFeedResponseDto
} from './dto/calendar-feed.dto.js';

@ApiTags('calendar-feed')
@Controller('calendar-feed')
export class CalendarFeedController {
    constructor(@Inject(CalendarFeedService) private readonly calendarFeedService: CalendarFeedService) {}

    @ApiBearerAuth()
    @UseGuards(SessionAuthGuard, ThrottlerGuard)
    @Get()
    @ApiOperation({
        summary: 'Get the current calendar feed link',
        description: 'Returns metadata only. The full URL is returned once when the link is created or rotated.'
    })
    @ApiResponse({ status: 200, description: 'Link metadata, or null when none exists', type: CalendarFeedResponseDto })
    findLink(@Req() req: RequestWithUser) {
        return this.calendarFeedService.findLink(req.user.userId as number);
    }

    @ApiBearerAuth()
    @UseGuards(SessionAuthGuard, ThrottlerGuard)
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    @Post()
    @ApiOperation({
        summary: 'Create or rotate the calendar feed link',
        description:
            'Invalidates any previous link immediately and returns the new secret token once. Requires a session token.'
    })
    @ApiResponse({ status: 201, description: 'Link created or rotated', type: CreatedCalendarFeedResponseDto })
    create(@Req() req: RequestWithUser) {
        return this.calendarFeedService.createOrRotate(req.user.userId as number);
    }

    @ApiBearerAuth()
    @UseGuards(SessionAuthGuard, ThrottlerGuard)
    @Delete()
    @ApiOperation({ summary: 'Revoke the calendar feed link' })
    @ApiResponse({ status: 200, description: 'Link revoked', type: CalendarFeedDeletedResponseDto })
    revoke(@Req() req: RequestWithUser) {
        return this.calendarFeedService.revoke(req.user.userId as number).then(() => ({ success: true }));
    }

    /**
     * Public by necessity: calendar clients subscribing by URL cannot send an
     * Authorization header. The secret in the path is the credential.
     */
    @UseGuards(ThrottlerGuard)
    @Get('feed/:token')
    @ApiOperation({
        summary: 'Subscribe to an ICS calendar feed',
        description: 'Paste the full URL into Google Calendar under Other calendars > Add by URL.'
    })
    @ApiResponse({ status: 200, description: 'An iCalendar document', content: { 'text/calendar': {} } })
    @ApiResponse({ status: 304, description: 'Nothing changed since the last poll' })
    @ApiResponse({ status: 404, description: 'Unknown or revoked feed link' })
    async feed(@Param('token') tokenParam: string, @Req() req: Request, @Res() res: Response) {
        const rawToken = tokenParam.endsWith('.ics') ? tokenParam.slice(0, -4) : tokenParam;
        const token = await this.calendarFeedService.resolveToken(rawToken);
        if (!token) throw new NotFoundException('Unknown calendar feed link');

        const { body, etag } = await this.calendarFeedService.buildFeed(token.userId);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
        res.setHeader('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
            res.status(304).end();
            return;
        }
        res.status(200).send(body);
    }
}
