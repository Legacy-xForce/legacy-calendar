import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    ConnectedSocket,
    MessageBody
} from '@nestjs/websockets';
import { Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ApiTokenScope, ChatMediaType } from '../../prisma/generated/client.js';
import { ChatService } from './chat.service.js';
import { HttpException } from '@nestjs/common';
import { AppLogger } from '../logging/app-logger.js';
import { AuthIdentityService } from '../auth/auth-identity.service.js';
import { ApiTokensService } from '../api-tokens/api-tokens.service.js';
import { isOriginAllowed } from '../config/cors.js';

type SocketUser = {
    userId: number;
    username: string;
    isAdmin: boolean;
    tokenScope?: ApiTokenScope;
};

@WebSocketGateway({
    cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            callback(null, isOriginAllowed(origin));
        }
    }
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new AppLogger(ChatGateway.name);

    constructor(
        @Inject(ChatService) private readonly chatService: ChatService,
        @Inject(AuthIdentityService) private readonly identityService: AuthIdentityService,
        @Inject(ApiTokensService) private readonly apiTokensService: ApiTokensService
    ) {}

    afterInit(server: Server) {
        server.use((socket, next) => {
            void this.authenticateSocket(socket, next);
        });
    }

    handleConnection(client: Socket) {
        const user = this.getSocketUser(client);
        if (user) {
            this.logger.info('Client connected', { socketId: client.id, userId: user.userId, username: user.username });
        } else {
            this.logger.debug('Client connected without authenticated user', { socketId: client.id });
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.info('Client disconnected', { socketId: client.id });
    }

    @SubscribeMessage('joinRoom')
    async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody('eventId') eventIdInput: number) {
        const eventId = this.parseEventId(eventIdInput);
        if (eventId === null) {
            client.emit('error', { code: 400, message: 'Invalid eventId' });
            return;
        }

        const user = this.requireSocketUser(client);
        const isParticipant = await this.chatService.isParticipant(eventId, user.userId);
        const roomName = `chat:${eventId}`;

        if (!isParticipant) {
            this.logger.warn('Room join rejected: user is not a participant', {
                socketId: client.id,
                userId: user.userId,
                eventId
            });
            client.emit('error', { code: 403, message: 'Forbidden' });
            await client.leave(roomName);
            return;
        }

        await client.join(roomName);
        this.logger.info('Room joined', { socketId: client.id, userId: user.userId, roomName });
    }

    @SubscribeMessage('leaveRoom')
    async handleLeaveRoom(@ConnectedSocket() client: Socket, @MessageBody('eventId') eventIdInput: number) {
        const eventId = this.parseEventId(eventIdInput);
        if (eventId === null) {
            return;
        }

        await client.leave(`chat:${eventId}`);
    }

    @SubscribeMessage('sendMessage')
    async handleSendMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { eventId: number; text?: string; mediaUrl?: string; mediaType?: ChatMediaType }
    ) {
        const user = this.requireWritableSocketUser(client);
        if (!user) return;
        const eventId = this.parseEventId(data.eventId);
        if (eventId === null) {
            client.emit('error', { code: 400, message: 'Invalid eventId' });
            return;
        }

        const text = typeof data.text === 'string' ? data.text.trim() : '';
        const mediaUrl = typeof data.mediaUrl === 'string' && data.mediaUrl.trim() ? data.mediaUrl.trim() : null;
        const mediaType = this.isChatMediaType(data.mediaType) ? data.mediaType : null;

        if (!text && !mediaUrl) {
            client.emit('error', { code: 400, message: 'Message must contain text or media' });
            return;
        }

        if (text.length > 4000) {
            client.emit('error', { code: 400, message: 'Message too long' });
            return;
        }

        if (mediaUrl && !mediaType) {
            client.emit('error', { code: 400, message: 'Invalid media type' });
            return;
        }

        try {
            const roomName = `chat:${eventId}`;
            const connectedUserIds = this.getConnectedUserIds(roomName);
            const message = await this.chatService.sendMessage(
                user.userId,
                eventId,
                text || null,
                mediaUrl,
                mediaType,
                connectedUserIds
            );
            this.logger.info('Socket message sent', {
                socketId: client.id,
                userId: user.userId,
                eventId,
                hasMedia: Boolean(mediaUrl)
            });
            this.server.to(roomName).emit('newMessage', message);
        } catch (error) {
            this.emitSocketError(client, error);
        }
    }

    @SubscribeMessage('addReaction')
    async handleAddReaction(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { messageId: number; emoji: string }
    ) {
        const user = this.requireWritableSocketUser(client);
        if (!user) return;
        const messageId = this.parseEventId(data.messageId);
        const emoji = typeof data.emoji === 'string' ? data.emoji.trim() : '';

        if (messageId === null || !emoji) {
            client.emit('error', { code: 400, message: 'Invalid reaction payload' });
            return;
        }

        try {
            const message = await this.chatService.getMessageById(messageId);
            if (!message) {
                client.emit('error', { code: 404, message: 'Message not found' });
                return;
            }

            if (!this.isJoinedToEvent(client, message.eventId)) {
                client.emit('error', { code: 403, message: 'Forbidden' });
                return;
            }

            const reaction = await this.chatService.toggleReaction(messageId, user.userId, emoji, message.eventId);
            this.logger.info('Socket reaction updated', {
                socketId: client.id,
                userId: user.userId,
                messageId,
                emoji
            });
            this.server
                .to(`chat:${reaction.eventId}`)
                .emit('reactionUpdated', this.chatService.toReactionPayload(reaction.messageId, reaction.reactions));
        } catch (error) {
            this.emitSocketError(client, error);
        }
    }

    @SubscribeMessage('pinMessage')
    async handlePinMessage(@ConnectedSocket() client: Socket, @MessageBody('messageId') messageIdInput: number) {
        const user = this.requireWritableSocketUser(client);
        if (!user) return;
        const messageId = this.parseEventId(messageIdInput);
        if (messageId === null) {
            client.emit('error', { code: 400, message: 'Invalid messageId' });
            return;
        }

        try {
            const message = await this.chatService.pinMessage(messageId, user.userId, user.isAdmin);
            this.logger.info('Socket message pinned', { socketId: client.id, userId: user.userId, messageId });
            this.server.to(`chat:${message.eventId}`).emit('messagePinned', { messageId });
        } catch (error) {
            this.emitSocketError(client, error);
        }
    }

    @SubscribeMessage('unpinMessage')
    async handleUnpinMessage(@ConnectedSocket() client: Socket, @MessageBody('messageId') messageIdInput: number) {
        const user = this.requireWritableSocketUser(client);
        if (!user) return;
        const messageId = this.parseEventId(messageIdInput);
        if (messageId === null) {
            client.emit('error', { code: 400, message: 'Invalid messageId' });
            return;
        }

        try {
            const message = await this.chatService.unpinMessage(messageId, user.userId, user.isAdmin);
            this.logger.info('Socket message unpinned', { socketId: client.id, userId: user.userId, messageId });
            this.server.to(`chat:${message.eventId}`).emit('messageUnpinned', { messageId });
        } catch (error) {
            this.emitSocketError(client, error);
        }
    }

    @SubscribeMessage('deleteMessage')
    async handleDeleteMessage(@ConnectedSocket() client: Socket, @MessageBody('messageId') messageIdInput: number) {
        const user = this.requireWritableSocketUser(client);
        if (!user) return;
        const messageId = this.parseEventId(messageIdInput);
        if (messageId === null) {
            client.emit('error', { code: 400, message: 'Invalid messageId' });
            return;
        }

        try {
            const message = await this.chatService.deleteMessage(messageId, user.userId, user.isAdmin);
            this.logger.warn('Socket message deleted', { socketId: client.id, userId: user.userId, messageId });
            this.server.to(`chat:${message.eventId}`).emit('messageDeleted', { messageId });
        } catch (error) {
            this.emitSocketError(client, error);
        }
    }

    @SubscribeMessage('editMessage')
    async handleEditMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { messageId: number; text: string }
    ) {
        const user = this.requireWritableSocketUser(client);
        if (!user) return;
        const messageId = this.parseEventId(data.messageId);
        const text = typeof data.text === 'string' ? data.text.trim() : '';

        if (messageId === null) {
            client.emit('error', { code: 400, message: 'Invalid messageId' });
            return;
        }

        if (!text) {
            client.emit('error', { code: 400, message: 'Message text cannot be empty' });
            return;
        }

        if (text.length > 4000) {
            client.emit('error', { code: 400, message: 'Message too long' });
            return;
        }

        try {
            const message = await this.chatService.editMessage(messageId, user.userId, text);
            this.logger.info('Socket message edited', { socketId: client.id, userId: user.userId, messageId });
            this.server
                .to(`chat:${message.eventId}`)
                .emit('messageEdited', this.chatService.toEditedMessagePayload(message));
        } catch (error) {
            this.emitSocketError(client, error);
        }
    }

    @SubscribeMessage('typing')
    handleTyping(@ConnectedSocket() client: Socket, @MessageBody('eventId') eventIdInput: number) {
        const eventId = this.parseEventId(eventIdInput);
        if (eventId === null) {
            return;
        }

        const user = this.requireWritableSocketUser(client);
        if (!user) return;
        client.to(`chat:${eventId}`).emit('userTyping', {
            userId: user.userId,
            username: user.username
        });
    }

    @SubscribeMessage('stopTyping')
    handleStopTyping(@ConnectedSocket() client: Socket, @MessageBody('eventId') eventIdInput: number) {
        const eventId = this.parseEventId(eventIdInput);
        if (eventId === null) {
            return;
        }

        const user = this.requireWritableSocketUser(client);
        if (!user) return;
        client.to(`chat:${eventId}`).emit('userStoppedTyping', {
            userId: user.userId,
            username: user.username
        });
    }

    private async authenticateSocket(socket: Socket, next: (err?: Error) => void) {
        try {
            const apiToken = this.extractHandshakeApiToken(socket);
            if (apiToken) {
                const identity = await this.apiTokensService.authenticate(apiToken);
                if (!identity) {
                    next(this.buildHandshakeError(401, 'Unauthorized'));
                    return;
                }

                const tokenUser: SocketUser = {
                    userId: identity.userId,
                    username: identity.username,
                    isAdmin: identity.isAdmin,
                    tokenScope: identity.scope
                };

                (socket.data as { user?: SocketUser }).user = tokenUser;
                this.logger.debug('Socket authenticated with API token', {
                    socketId: socket.id,
                    userId: tokenUser.userId,
                    username: tokenUser.username,
                    scope: identity.scope
                });
                next();
                return;
            }

            const token = this.extractHandshakeToken(socket);
            if (!token) {
                next(this.buildHandshakeError(401, 'Unauthorized'));
                return;
            }

            const identity = await this.identityService.resolveToken(token);
            if (!identity) {
                next(this.buildHandshakeError(401, 'Unauthorized'));
                return;
            }

            const user: SocketUser = {
                userId: identity.userId,
                username: identity.username,
                isAdmin: identity.isAdmin
            };

            (socket.data as { user?: SocketUser }).user = user;
            this.logger.debug('Socket authenticated', {
                socketId: socket.id,
                userId: user.userId,
                username: user.username
            });
            next();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn('Socket authentication failed', { socketId: socket.id, reason: message });
            next(this.buildHandshakeError(401, 'Unauthorized'));
        }
    }

    private extractHandshakeToken(socket: Socket): string | null {
        const auth = socket.handshake.auth as { token?: string } | undefined;
        const authToken = auth?.token;
        const headerToken = socket.handshake.headers.authorization;
        const rawToken =
            typeof authToken === 'string' ? authToken : typeof headerToken === 'string' ? headerToken : null;

        if (!rawToken) {
            return null;
        }

        return rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken.trim();
    }

    private extractHandshakeApiToken(socket: Socket): string | null {
        const auth = socket.handshake.auth as { apiToken?: string; token?: string } | undefined;
        const headerToken = socket.handshake.headers['x-api-token'];
        const candidates = [auth?.apiToken, Array.isArray(headerToken) ? headerToken[0] : headerToken, auth?.token];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim().startsWith('legacy-calendar-')) {
                return candidate.trim();
            }
        }

        return null;
    }

    private buildHandshakeError(code: number, message: string): Error {
        const error = new Error(message);
        (error as Error & { data?: { code: number } }).data = { code };
        return error;
    }

    private emitSocketError(client: Socket, error: unknown) {
        const status = this.getErrorStatus(error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        this.logger.warn('Socket operation failed', { socketId: client.id, status, message });
        client.emit('error', { code: status, message });
    }

    private getErrorStatus(error: unknown): number {
        if (error instanceof HttpException) {
            return error.getStatus();
        }

        if (typeof error === 'object' && error !== null) {
            const candidate = error as { status?: number; code?: number };
            if (typeof candidate.status === 'number') {
                return candidate.status;
            }
            if (typeof candidate.code === 'number') {
                return candidate.code;
            }
        }

        return 500;
    }

    private getSocketUser(client: Socket): SocketUser | undefined {
        return (client.data as { user?: SocketUser }).user;
    }

    private requireSocketUser(client: Socket): SocketUser {
        const user = this.getSocketUser(client);
        if (!user) {
            throw new Error('Socket is not authenticated');
        }

        return user;
    }

    private requireWritableSocketUser(client: Socket): SocketUser | null {
        const user = this.getSocketUser(client);
        if (!user) {
            client.emit('error', { code: 401, message: 'Unauthorized' });
            return null;
        }

        if (user.tokenScope === ApiTokenScope.read) {
            client.emit('error', {
                code: 403,
                message: 'This API token is read-only and cannot perform write operations'
            });
            return null;
        }

        return user;
    }

    private parseEventId(value: unknown): number | null {
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    private isChatMediaType(value: unknown): value is ChatMediaType {
        return (
            value === ChatMediaType.image ||
            value === ChatMediaType.gif ||
            value === ChatMediaType.video ||
            value === ChatMediaType.audio
        );
    }

    private isJoinedToEvent(client: Socket, eventId: number): boolean {
        return client.rooms.has(`chat:${eventId}`);
    }

    private getConnectedUserIds(roomName: string): Set<number> {
        const sockets = this.server.sockets.adapter.rooms.get(roomName);
        const userIds = new Set<number>();

        if (!sockets) {
            return userIds;
        }

        for (const socketId of sockets) {
            const socket = this.server.sockets.sockets.get(socketId);
            const user = (socket?.data as { user?: SocketUser } | undefined)?.user;
            if (user) {
                userIds.add(user.userId);
            }
        }

        return userIds;
    }
}
