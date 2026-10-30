import {
    ConnectedSocket,
    MessageBody,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer
} from '@nestjs/websockets';
import { Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { isOriginAllowed } from '../config/cors.js';
import { AppLogger } from '../logging/app-logger.js';
import { EventsRepository } from './events.repository.js';
import { EventsRealtime, eventRoom } from './events-realtime.service.js';

@WebSocketGateway({
    cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            callback(null, isOriginAllowed(origin));
        }
    }
})
export class EventsGateway implements OnGatewayInit {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new AppLogger(EventsGateway.name);

    constructor(
        @Inject(EventsRepository) private readonly eventsRepo: EventsRepository,
        @Inject(EventsRealtime) private readonly realtime: EventsRealtime
    ) {}

    afterInit(server: Server) {
        this.realtime.attach(server);
    }

    /** Sockets are authenticated by the middleware the chat gateway installs on this server. */
    @SubscribeMessage('watchEvent')
    async handleWatch(@ConnectedSocket() client: Socket, @MessageBody('eventId') eventIdInput: number) {
        const eventId = Number(eventIdInput);
        const userId = (client.data as { user?: { userId: number } }).user?.userId;
        if (!userId || !Number.isInteger(eventId) || eventId <= 0) {
            client.emit('error', { code: 400, message: 'Invalid eventId' });
            return;
        }

        const event = await this.eventsRepo.findOne(eventId, userId);
        if (!event) {
            this.logger.warn('Event watch rejected: event not visible', { socketId: client.id, userId, eventId });
            client.emit('error', { code: 403, message: 'Forbidden' });
            return;
        }

        await client.join(eventRoom(eventId));
    }

    @SubscribeMessage('unwatchEvent')
    async handleUnwatch(@ConnectedSocket() client: Socket, @MessageBody('eventId') eventIdInput: number) {
        await client.leave(eventRoom(Number(eventIdInput)));
    }
}
