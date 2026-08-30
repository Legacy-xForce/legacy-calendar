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
import { ConfigService } from '@nestjs/config';
import * as jsonwebtoken from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';
import { Server, Socket } from 'socket.io';
import { ChatMediaType } from '../../prisma/generated/client.js';
import { ChatService } from './chat.service.js';
import { HttpException } from '@nestjs/common';
import { AppLogger } from '../logging/app-logger.js';
import { UsersService } from '../users/users.service.js';

type SocketUser = {
    userId: number;
    username: string;
    isAdmin: boolean;
};

type JwtPayload = {
    sub: string;
    username: string;
    role?: 'admin' | 'user';
};

@WebSocketGateway({
    cors: {
        origin: '*'
    }
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new AppLogger(ChatGateway.name);
    private readonly jwksClient: jwksRsa.JwksClient;

    constructor(
        @Inject(ChatService) private readonly chatService: ChatService,
        @Inject(ConfigService) private readonly configService: ConfigService,
        @Inject(UsersService) private readonly usersService: UsersService
    ) {
        this.jwksClient = new jwksRsa.JwksClient({
            jwksUri:
                this.configService.get<string>('AUTH_JWKS_URI') ||
                'https://auth.legacy-group.tech/.well-known/jwks.json'
        });
    }

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
        const user = this.requireSocketUser(client);
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
        const user = this.requireSocketUser(client);
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
        const user = this.requireSocketUser(client);
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
        const user = this.requireSocketUser(client);
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
        const user = this.requireSocketUser(client);
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
        const user = this.requireSocketUser(client);
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

        const user = this.requireSocketUser(client);
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

        const user = this.requireSocketUser(client);
        client.to(`chat:${eventId}`).emit('userStoppedTyping', {
            userId: user.userId,
            username: user.username
        });
    }

    private async authenticateSocket(socket: Socket, next: (err?: Error) => void) {
        try {
            const token = this.extractHandshakeToken(socket);
            if (!token) {
                next(this.buildHandshakeError(401, 'Unauthorized'));
                return;
            }

            const payload = await this.verifySocketToken(token);
            if (!payload.username) {
                next(this.buildHandshakeError(401, 'Unauthorized'));
                return;
            }

            const isAdmin = payload.role === 'admin';
            const localUser = await this.usersService.syncFromAuth({
                authId: payload.sub,
                username: payload.username,
                isAdmin
            });

            if (!localUser) {
                next(this.buildHandshakeError(401, 'Unauthorized'));
                return;
            }

            const user: SocketUser = {
                userId: localUser.id,
                username: localUser.username,
                isAdmin
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

    private async verifySocketToken(token: string): Promise<JwtPayload> {
        const decoded = jsonwebtoken.decode(token, { complete: true }) as { header?: { kid?: string } } | null;
        const kid = decoded?.header?.kid;

        if (!kid) {
            throw new Error('Missing token key id');
        }

        const signingKey = await this.jwksClient.getSigningKey(kid);
        const publicKey = signingKey.getPublicKey();

        return await new Promise<JwtPayload>((resolve, reject) => {
            jsonwebtoken.verify(token, publicKey, { algorithms: ['ES256'] }, (err, payload) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!payload || typeof payload === 'string') {
                    reject(new Error('Invalid token payload'));
                    return;
                }

                resolve(payload as JwtPayload);
            });
        });
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
