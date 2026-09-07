import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    UseGuards,
    Request,
    ParseIntPipe,
    Patch,
    Query,
    Inject
} from '@nestjs/common';
import { EventsService } from './events.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { ParticipateDto } from './dto/participate.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { EventResponseDto } from './dto/event-response.dto.js';
import { type RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { FindEventsQueryDto } from './dto/find-events-query.dto.js';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto.js';

@ApiTags('events')
@Controller('events')
export class EventsController {
    constructor(@Inject(EventsService) private readonly eventsService: EventsService) {}

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post()
    @ApiOperation({ summary: 'Create a new event' })
    @ApiResponse({ status: 201, description: 'Event created successfully', type: EventResponseDto })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    create(@Body() createEventDto: CreateEventDto, @Request() req: RequestWithUser) {
        return this.eventsService.create(createEventDto, req.user.userId as number, req.impersonatorUserId ?? null);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Get()
    @ApiOperation({ summary: 'Get events for a visible calendar range' })
    @ApiQuery({
        name: 'start',
        required: true,
        type: String,
        example: '2026-04-01T00:00:00.000Z',
        description: 'Start of the visible calendar range, inclusive'
    })
    @ApiQuery({
        name: 'end',
        required: true,
        type: String,
        example: '2026-05-03T23:59:59.999Z',
        description: 'End of the visible calendar range, inclusive'
    })
    @ApiResponse({
        status: 200,
        description: 'Return events in the requested calendar range',
        type: EventResponseDto,
        isArray: true
    })
    findAll(@Request() req: RequestWithUser, @Query() query: FindEventsQueryDto) {
        return this.eventsService.findAll(req.user.userId as number, query);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Get('upcoming')
    @ApiOperation({ summary: 'Get upcoming events' })
    @ApiResponse({
        status: 200,
        description: 'Return upcoming events',
        type: EventResponseDto,
        isArray: true
    })
    findUpcoming(@Request() req: RequestWithUser) {
        return this.eventsService.findUpcoming(req.user.userId as number);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Get(':id')
    @ApiOperation({ summary: 'Get an event by ID' })
    @ApiResponse({ status: 200, description: 'Return event', type: EventResponseDto })
    @ApiResponse({ status: 404, description: 'Event not found' })
    findOne(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
        return this.eventsService.findOne(id, req.user.userId);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Delete(':id')
    @ApiOperation({ summary: 'Delete an event' })
    @ApiResponse({ status: 200, description: 'Event deleted' })
    @ApiResponse({ status: 403, description: 'Forbidden - Only host can delete' })
    @ApiResponse({ status: 404, description: 'Event not found' })
    remove(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
        return this.eventsService.remove(id, req.user.userId as number, req.impersonatorUserId ?? null);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Patch(':id')
    @ApiOperation({ summary: 'Update an event' })
    @ApiResponse({ status: 200, description: 'Event updated', type: EventResponseDto })
    @ApiResponse({ status: 403, description: 'Forbidden - Only host can update' })
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateEventDto: UpdateEventDto,
        @Request() req: RequestWithUser
    ) {
        return this.eventsService.update(id, updateEventDto, req.user.userId as number, req.impersonatorUserId ?? null);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post(':id/invite')
    @ApiOperation({ summary: 'Invite a user to an event' })
    @ApiResponse({ status: 201, description: 'User invited' })
    invite(@Param('id', ParseIntPipe) id: number, @Body('username') username: string, @Request() req: RequestWithUser) {
        return this.eventsService.invite(id, username, req.user.userId as number, req.impersonatorUserId ?? null);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post(':id/join')
    @ApiOperation({ summary: 'Join an event' })
    @ApiResponse({ status: 201, description: 'Joined event successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Event not found' })
    join(
        @Param('id', ParseIntPipe) id: number,
        @Body() participateDto: ParticipateDto,
        @Request() req: RequestWithUser
    ) {
        return this.eventsService.join(id, req.user.userId as number, participateDto, req.impersonatorUserId ?? null);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Delete(':id/join')
    @ApiOperation({ summary: 'Leave an event / Cancel participation' })
    @ApiResponse({ status: 200, description: 'Left event successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Event or participation not found' })
    leave(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
        return this.eventsService.leave(id, req.user.userId as number, req.impersonatorUserId ?? null);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Patch(':id/join')
    @ApiOperation({ summary: 'Edit participation details' })
    @ApiResponse({ status: 200, description: 'Participation updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Event not found' })
    editParticipation(
        @Param('id', ParseIntPipe) id: number,
        @Body() participateDto: ParticipateDto,
        @Request() req: RequestWithUser
    ) {
        return this.eventsService.updateParticipation(
            id,
            req.user.userId as number,
            participateDto,
            req.impersonatorUserId ?? null
        );
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post(':id/assign-ride')
    @ApiOperation({ summary: 'Assign a ride to a passenger' })
    @ApiResponse({ status: 201, description: 'Ride assigned successfully' })
    assignRide(
        @Param('id', ParseIntPipe) id: number,
        @Body('passengerId') passengerId: number,
        @Body('driverId') driverId: number | null,
        @Request() req: RequestWithUser
    ) {
        return this.eventsService.assignRide(
            id,
            passengerId,
            driverId,
            req.user.userId as number,
            req.impersonatorUserId ?? null
        );
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Patch(':id/participants/:userId/payment')
    @ApiOperation({ summary: 'Update payment status for a participant (host/co-host only)' })
    @ApiResponse({ status: 200, description: 'Payment status updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Event or participant not found' })
    updatePaymentStatus(
        @Param('id', ParseIntPipe) id: number,
        @Param('userId', ParseIntPipe) userId: number,
        @Body() dto: UpdatePaymentStatusDto,
        @Request() req: RequestWithUser
    ) {
        return this.eventsService.updatePaymentStatus(
            id,
            userId,
            dto.hasPaid,
            req.user.userId as number,
            req.user.isAdmin,
            req.impersonatorUserId ?? null
        );
    }
}
