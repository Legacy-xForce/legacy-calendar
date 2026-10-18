import { Controller, Post, Param, ParseIntPipe, UseGuards, Request, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { type RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { getFrontendUrl } from '../config/frontend-url.js';
import { InvitesService } from './invites.service.js';

@ApiTags('invites')
@Controller('events')
export class EventGuestInvitesController {
    constructor(@Inject(InvitesService) private readonly invitesService: InvitesService) {}

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, ThrottlerGuard)
    @Post(':id/guest-invites')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    @ApiOperation({ summary: 'Generate a magic-link invite for a guest without an account' })
    @ApiResponse({ status: 201, description: 'Guest invite created' })
    @ApiResponse({ status: 403, description: 'Forbidden - Only the host can create guest invites' })
    async create(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
        const { token, guestUserId, expiresAt } = await this.invitesService.generateInvite(
            id,
            req.user.userId as number,
            req.impersonatorUserId ?? null
        );

        return {
            url: `${getFrontendUrl()}/invite/${token}`,
            guestUserId,
            expiresAt
        };
    }
}
