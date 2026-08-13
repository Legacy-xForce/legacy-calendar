import { Body, Controller, Delete, Get, Patch, UseGuards, Request, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GuestTokenGuard } from './guards/guest-token.guard.js';
import { type RequestWithGuestInvite } from './interfaces/request-with-guest.interface.js';
import { InvitesService } from './invites.service.js';
import { GuestParticipateDto } from './dto/guest-participate.dto.js';

@ApiTags('invites')
@Controller('guest-invites')
@UseGuards(GuestTokenGuard)
export class GuestInvitesController {
    constructor(@Inject(InvitesService) private readonly invitesService: InvitesService) {}

    @Get(':token')
    @ApiOperation({ summary: 'Get event details and the current guest participation via a magic link' })
    @ApiResponse({ status: 200, description: 'Return event and guest participation' })
    @ApiResponse({ status: 404, description: 'Invite not found' })
    get(@Request() req: RequestWithGuestInvite) {
        return this.invitesService.getInvite(req.guestInvite);
    }

    @Patch(':token')
    @ApiOperation({ summary: 'Set the guest username and/or update participation preferences' })
    @ApiResponse({ status: 200, description: 'Participation updated' })
    @ApiResponse({ status: 403, description: 'Forbidden - deadline passed or event ended' })
    update(@Request() req: RequestWithGuestInvite, @Body() dto: GuestParticipateDto) {
        return this.invitesService.updateParticipation(req.guestInvite, dto);
    }

    @Delete(':token')
    @ApiOperation({ summary: 'Leave the event as a guest' })
    @ApiResponse({ status: 200, description: 'Left event successfully' })
    leave(@Request() req: RequestWithGuestInvite) {
        return this.invitesService.leave(req.guestInvite);
    }
}
