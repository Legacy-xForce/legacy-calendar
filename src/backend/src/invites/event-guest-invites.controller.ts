import { Controller, Post, Param, ParseIntPipe, UseGuards, Request, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { type RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { InvitesService } from './invites.service.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://calendar.legacy-group.tech';

@ApiTags('invites')
@Controller('events')
export class EventGuestInvitesController {
    constructor(@Inject(InvitesService) private readonly invitesService: InvitesService) {}

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post(':id/guest-invites')
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
            url: `${FRONTEND_URL}/invite/${token}`,
            guestUserId,
            expiresAt
        };
    }
}
