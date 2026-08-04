import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../../prisma/generated/client.js';

export const CHAT_MESSAGE_INCLUDE = {
    author: { select: { id: true, username: true, authId: true } },
    reactions: true
} satisfies Prisma.ChatMessageInclude;

export type ChatMessageWithRelations = Prisma.ChatMessageGetPayload<{
    include: typeof CHAT_MESSAGE_INCLUDE;
}>;

export type ReactionSummary = {
    emoji: string;
    count: number;
    userIds: number[];
};

@Injectable()
export class ChatRepository {
    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    async createMessage(data: Prisma.ChatMessageUncheckedCreateInput): Promise<ChatMessageWithRelations> {
        return this.prisma.chatMessage.create({
            data,
            include: CHAT_MESSAGE_INCLUDE
        });
    }

    async findMessagePage(eventId: number, limit: number, cursorMessageId?: number) {
        const pageSize = Math.max(1, Math.min(Math.trunc(limit) || 50, 100));

        let cursorMessage: { id: number; createdAt: Date } | null = null;
        if (cursorMessageId !== undefined) {
            cursorMessage = await this.prisma.chatMessage.findUnique({
                where: { id: cursorMessageId },
                select: { id: true, createdAt: true }
            });
        }

        const where: Prisma.ChatMessageWhereInput = {
            eventId,
            ...(cursorMessage ? { createdAt: { lt: cursorMessage.createdAt } } : {})
        };

        const messages = await this.prisma.chatMessage.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: pageSize + 1,
            include: CHAT_MESSAGE_INCLUDE
        });

        const hasMore = messages.length > pageSize;
        return {
            messages: hasMore ? messages.slice(0, pageSize) : messages,
            hasMore
        };
    }

    async findPinnedMessages(eventId: number): Promise<ChatMessageWithRelations[]> {
        return this.prisma.chatMessage.findMany({
            where: { eventId, isPinned: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: CHAT_MESSAGE_INCLUDE
        });
    }

    async findMessageById(id: number): Promise<ChatMessageWithRelations | null> {
        return this.prisma.chatMessage.findUnique({
            where: { id },
            include: CHAT_MESSAGE_INCLUDE
        });
    }

    async updateMessage(id: number, data: Prisma.ChatMessageUpdateInput): Promise<ChatMessageWithRelations> {
        return this.prisma.chatMessage.update({
            where: { id },
            data,
            include: CHAT_MESSAGE_INCLUDE
        });
    }

    async deleteMessage(id: number) {
        return this.prisma.chatMessage.delete({
            where: { id }
        });
    }

    async toggleReaction(messageId: number, userId: number, emoji: string): Promise<ReactionSummary[]> {
        const existing = await this.prisma.chatReaction.findUnique({
            where: {
                messageId_userId_emoji: { messageId, userId, emoji }
            }
        });

        if (existing) {
            await this.prisma.chatReaction.delete({
                where: { id: existing.id }
            });
        } else {
            await this.prisma.chatReaction.create({
                data: { messageId, userId, emoji }
            });
        }

        return this.getReactionsGrouped(messageId);
    }

    async getReactionsGrouped(messageId: number): Promise<ReactionSummary[]> {
        const reactions = await this.prisma.chatReaction.findMany({
            where: { messageId },
            select: { emoji: true, userId: true }
        });

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
}
