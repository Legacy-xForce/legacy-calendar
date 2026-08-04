import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ChatRepository, ChatMessageWithRelations, ReactionSummary } from './chat.repository.js';
import { EventsRepository } from '../events/events.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { InviteStatus, ChatMediaType } from '../../prisma/generated/client.js';
import * as path from 'path';
import { AppLogger } from '../logging/app-logger.js';
import { NotificationCode } from '../notifications/notification-codes.js';
import { buildProfilePictureUrl } from '../users/profile-picture.util.js';

export type ChatMessagePayload = {
    id: number;
    eventId: number;
    authorId: number;
    authorUsername: string;
    authorProfilePictureUrl: string | null;
    text: string | null;
    mediaUrl: string | null;
    mediaType: ChatMediaType | null;
    reactions: ReactionSummary[];
    isPinned: boolean;
    createdAt: Date;
    isEdited: boolean;
    updatedAt: Date;
};

export type ChatEditedMessagePayload = ChatMessagePayload & {
    isEdited: boolean;
    updatedAt: Date;
};

@Injectable()
export class ChatService {
    private readonly logger = new AppLogger(ChatService.name);

    constructor(
        @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
        @Inject(EventsRepository) private readonly eventsRepo: EventsRepository,
        @Inject(NotificationsService) private readonly notificationsService: NotificationsService
    ) {}

    async isParticipant(eventId: number, userId: number): Promise<boolean> {
        this.logger.trace('Checking chat participation', { eventId, userId });
        const event = await this.eventsRepo.findById(eventId);
        if (!event) {
            this.logger.debug('Chat participation check failed: event not found', { eventId, userId });
            return false;
        }

        if (event.hostId === userId) {
            return true;
        }

        const attendance = event.participants.find((participant) => participant.userId === userId);
        return attendance?.status === InviteStatus.ACCEPTED;
    }

    async sendMessage(
        userId: number,
        eventId: number,
        text?: string | null,
        mediaUrl?: string | null,
        mediaType?: ChatMediaType | null,
        connectedUserIds: Set<number> = new Set()
    ): Promise<ChatMessagePayload> {
        this.logger.info('Sending chat message', {
            eventId,
            userId,
            hasText: Boolean(text?.trim()),
            hasMedia: Boolean(mediaUrl)
        });
        const isParticipant = await this.isParticipant(eventId, userId);
        if (!isParticipant) {
            this.logger.warn('Chat message rejected: user is not a participant', { eventId, userId });
            throw new ForbiddenException('Not a participant');
        }

        const message = await this.chatRepo.createMessage({
            eventId,
            authorId: userId,
            text: text?.trim() ? text.trim() : null,
            mediaUrl: mediaUrl ?? null,
            mediaType: mediaType ?? null
        });

        await this.sendPushNotification(message, connectedUserIds);
        this.logger.info('Chat message sent', { eventId, messageId: message.id, userId });
        return this.toMessagePayload(message);
    }

    async getHistory(eventId: number, userId: number, cursor?: number, limit = 50) {
        this.logger.debug('Fetching chat history', { eventId, userId, cursor, limit });
        const isParticipant = await this.isParticipant(eventId, userId);
        if (!isParticipant) {
            this.logger.warn('Chat history rejected: user is not a participant', { eventId, userId });
            throw new ForbiddenException('Not a participant');
        }

        const { messages, hasMore } = await this.chatRepo.findMessagePage(eventId, limit, cursor);
        this.logger.info('Chat history loaded', { eventId, userId, count: messages.length, hasMore });

        return {
            messages: messages.map((message) => this.toMessagePayload(message)),
            nextCursor: hasMore && messages.length > 0 ? messages[messages.length - 1].id : null
        };
    }

    async getPinnedMessages(eventId: number, userId: number): Promise<ChatMessagePayload[]> {
        this.logger.debug('Fetching pinned chat messages', { eventId, userId });
        const isParticipant = await this.isParticipant(eventId, userId);
        if (!isParticipant) {
            this.logger.warn('Pinned chat rejected: user is not a participant', { eventId, userId });
            throw new ForbiddenException('Not a participant');
        }

        const messages = await this.chatRepo.findPinnedMessages(eventId);
        this.logger.info('Pinned chat messages loaded', { eventId, userId, count: messages.length });
        return messages.map((message) => this.toMessagePayload(message));
    }

    async getMessageById(messageId: number): Promise<ChatMessageWithRelations | null> {
        return this.chatRepo.findMessageById(messageId);
    }

    async toggleReaction(
        messageId: number,
        userId: number,
        emoji: string,
        joinedEventId: number
    ): Promise<{ messageId: number; reactions: ReactionSummary[]; eventId: number }> {
        this.logger.debug('Toggling chat reaction', { messageId, userId, emoji, joinedEventId });
        if (!emoji.trim()) {
            throw new BadRequestException('Emoji is required');
        }

        const message = await this.chatRepo.findMessageById(messageId);
        if (!message) {
            throw new NotFoundException('Message not found');
        }

        if (message.eventId !== joinedEventId) {
            this.logger.warn('Reaction rejected: message does not belong to joined event', {
                messageId,
                userId,
                joinedEventId,
                messageEventId: message.eventId
            });
            throw new ForbiddenException('Message does not belong to the joined event');
        }

        const isParticipant = await this.isParticipant(message.eventId, userId);
        if (!isParticipant) {
            this.logger.warn('Reaction rejected: user is not a participant', { messageId, userId });
            throw new ForbiddenException('Not a participant');
        }

        const reactions = await this.chatRepo.toggleReaction(messageId, userId, emoji.trim());
        this.logger.info('Chat reaction updated', {
            messageId,
            userId,
            emoji: emoji.trim(),
            reactionCount: reactions.length
        });
        return {
            messageId,
            reactions,
            eventId: message.eventId
        };
    }

    async pinMessage(messageId: number, userId: number, isAdmin: boolean): Promise<ChatMessageWithRelations> {
        this.logger.info('Pinning chat message', { messageId, userId, isAdmin });
        const message = await this.chatRepo.findMessageById(messageId);
        if (!message) {
            throw new NotFoundException('Message not found');
        }

        const event = await this.eventsRepo.findById(message.eventId);
        if (!event) {
            throw new NotFoundException('Event not found');
        }

        if (event.hostId !== userId && !isAdmin) {
            this.logger.warn('Pin message rejected: not authorized', {
                messageId,
                userId,
                isAdmin,
                hostId: event.hostId
            });
            throw new ForbiddenException('Only host or admin can pin messages');
        }

        return this.chatRepo.updateMessage(messageId, { isPinned: true });
    }

    async unpinMessage(messageId: number, userId: number, isAdmin: boolean): Promise<ChatMessageWithRelations> {
        this.logger.info('Unpinning chat message', { messageId, userId, isAdmin });
        const message = await this.chatRepo.findMessageById(messageId);
        if (!message) {
            throw new NotFoundException('Message not found');
        }

        const event = await this.eventsRepo.findById(message.eventId);
        if (!event) {
            throw new NotFoundException('Event not found');
        }

        if (event.hostId !== userId && !isAdmin) {
            this.logger.warn('Unpin message rejected: not authorized', {
                messageId,
                userId,
                isAdmin,
                hostId: event.hostId
            });
            throw new ForbiddenException('Only host or admin can unpin messages');
        }

        return this.chatRepo.updateMessage(messageId, { isPinned: false });
    }

    async deleteMessage(messageId: number, userId: number, isAdmin: boolean): Promise<ChatMessageWithRelations> {
        this.logger.warn('Deleting chat message', { messageId, userId, isAdmin });
        const message = await this.chatRepo.findMessageById(messageId);
        if (!message) {
            throw new NotFoundException('Message not found');
        }

        const event = await this.eventsRepo.findById(message.eventId);
        if (!event) {
            throw new NotFoundException('Event not found');
        }

        if (message.authorId !== userId && event.hostId !== userId && !isAdmin) {
            this.logger.warn('Delete message rejected: not authorized', {
                messageId,
                userId,
                isAdmin,
                authorId: message.authorId,
                hostId: event.hostId
            });
            throw new ForbiddenException('Not authorized to delete this message');
        }

        if (message.mediaUrl) {
            const filePath = path.join(process.cwd(), message.mediaUrl);
            const f = Bun.file(filePath);
            if (await f.exists()) {
                await f.delete();
            }
        }

        await this.chatRepo.deleteMessage(messageId);
        this.logger.info('Chat message deleted', { messageId, userId, eventId: message.eventId });
        return message;
    }

    async editMessage(messageId: number, userId: number, text: string): Promise<ChatMessageWithRelations> {
        this.logger.info('Editing chat message', { messageId, userId });
        const message = await this.chatRepo.findMessageById(messageId);
        if (!message) {
            throw new NotFoundException('Message not found');
        }

        if (message.authorId !== userId) {
            this.logger.warn('Edit message rejected: user is not the author', {
                messageId,
                userId,
                authorId: message.authorId
            });
            throw new ForbiddenException('Only author can edit message');
        }

        const nextText = text.trim();
        if (!nextText) {
            throw new BadRequestException('Message text cannot be empty');
        }

        if (nextText.length > 4000) {
            throw new BadRequestException('Message text is too long');
        }

        this.logger.debug('Chat message validated for edit', { messageId, userId, length: nextText.length });
        return this.chatRepo.updateMessage(messageId, {
            text: nextText,
            isEdited: true
        });
    }

    async sendPushNotification(message: ChatMessageWithRelations, connectedUserIds: Set<number>): Promise<void> {
        this.logger.debug('Preparing chat push notification', {
            messageId: message.id,
            eventId: message.eventId,
            connectedUserCount: connectedUserIds.size
        });
        const event = await this.eventsRepo.findById(message.eventId);
        if (!event) {
            this.logger.warn('Skipping chat push notification: event not found', {
                eventId: message.eventId,
                messageId: message.id
            });
            return;
        }

        const participantIds = [
            event.hostId,
            ...event.participants
                .filter((participant) => participant.status === InviteStatus.ACCEPTED)
                .map((participant) => participant.userId)
        ].filter((participantId) => participantId !== message.authorId);
        const offlineParticipantIds = [...new Set(participantIds)].filter(
            (participantId) => !connectedUserIds.has(participantId)
        );

        if (offlineParticipantIds.length === 0) {
            this.logger.trace('Skipping chat push notification: all participants are online', {
                messageId: message.id
            });
            return;
        }

        const mutedRecipientIds = new Set(
            await this.notificationsService.getMutedUserIdsForEvent(message.eventId, offlineParticipantIds)
        );
        const deliverableRecipientIds = offlineParticipantIds.filter(
            (participantId) => !mutedRecipientIds.has(participantId)
        );

        if (deliverableRecipientIds.length === 0) {
            this.logger.trace('Skipping chat push notification: all offline recipients are muted', {
                messageId: message.id
            });
            return;
        }

        const tokens = await this.eventsRepo.getUserTokens(deliverableRecipientIds);
        if (tokens.length === 0) {
            this.logger.trace('Skipping chat push notification: no device tokens found', {
                messageId: message.id,
                offlineParticipantCount: deliverableRecipientIds.length
            });
            return;
        }

        const authorUsername = message.author.username;
        const body = message.text
            ? `${authorUsername}: ${this.buildPreview(message.text)}`
            : message.mediaType
              ? `${authorUsername}: ${this.getMediaDescription(message.mediaType)}`
              : `${authorUsername}: Message`;

        await this.notificationsService.sendMulticast(tokens, event.title, body, {
            type: NotificationCode.CHAT_NEW_MESSAGE,
            eventId: String(message.eventId),
            messageId: String(message.id),
            actorUsername: authorUsername
        });
        this.logger.info('Chat push notification sent', {
            messageId: message.id,
            eventId: message.eventId,
            recipientCount: tokens.length,
            mutedRecipientCount: mutedRecipientIds.size
        });
    }

    toMessagePayload(message: ChatMessageWithRelations): ChatMessagePayload {
        return {
            id: message.id,
            eventId: message.eventId,
            authorId: message.authorId,
            authorUsername: message.author.username,
            authorProfilePictureUrl: buildProfilePictureUrl(message.author.authId),
            text: message.text,
            mediaUrl: message.mediaUrl,
            mediaType: message.mediaType,
            reactions: this.groupReactions(message.reactions),
            isPinned: message.isPinned,
            createdAt: message.createdAt,
            isEdited: message.isEdited,
            updatedAt: message.updatedAt
        };
    }

    toEditedMessagePayload(message: ChatMessageWithRelations): ChatEditedMessagePayload {
        return {
            ...this.toMessagePayload(message),
            isEdited: message.isEdited,
            updatedAt: message.updatedAt
        };
    }

    toReactionPayload(messageId: number, reactions: ReactionSummary[]) {
        return {
            messageId,
            reactions
        };
    }

    private groupReactions(reactions: ChatMessageWithRelations['reactions']): ReactionSummary[] {
        const grouped = new Map<string, ReactionSummary>();

        for (const reaction of reactions) {
            const current = grouped.get(reaction.emoji);
            if (current) {
                current.count += 1;
                current.userIds.push(reaction.userId);
            } else {
                grouped.set(reaction.emoji, {
                    emoji: reaction.emoji,
                    count: 1,
                    userIds: [reaction.userId]
                });
            }
        }

        return [...grouped.values()];
    }

    private buildPreview(text: string): string {
        const trimmed = text.trim();
        const preview = trimmed.slice(0, 100);
        return trimmed.length > 100 ? `${preview}\u2026` : preview;
    }

    private getMediaDescription(mediaType: ChatMediaType): 'Image' | 'Video' | 'File' {
        if (mediaType === 'video') {
            return 'Video';
        }

        if (mediaType === 'image' || mediaType === 'gif') {
            return 'Image';
        }

        return 'File';
    }
}
