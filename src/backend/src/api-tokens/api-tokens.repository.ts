import { Inject, Injectable } from '@nestjs/common';
import { ApiToken, Prisma } from '../../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ApiTokenWithUser = Prisma.ApiTokenGetPayload<{
    include: { user: { select: { id: true; username: true; isAdmin: true } } };
}>;

@Injectable()
export class ApiTokensRepository {
    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    findAllForUser(userId: number): Promise<ApiToken[]> {
        return this.prisma.apiToken.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
    }

    findOneForUser(id: number, userId: number): Promise<ApiToken | null> {
        return this.prisma.apiToken.findFirst({
            where: { id, userId }
        });
    }

    countForUser(userId: number): Promise<number> {
        return this.prisma.apiToken.count({ where: { userId } });
    }

    findByTokenHash(tokenHash: string): Promise<ApiTokenWithUser | null> {
        return this.prisma.apiToken.findUnique({
            where: { tokenHash },
            include: {
                user: {
                    select: { id: true, username: true, isAdmin: true }
                }
            }
        });
    }

    create(data: Prisma.ApiTokenUncheckedCreateInput): Promise<ApiToken> {
        return this.prisma.apiToken.create({ data });
    }

    async updateForUser(id: number, userId: number, data: Prisma.ApiTokenUpdateInput): Promise<ApiToken | null> {
        const result = await this.prisma.apiToken.updateMany({
            where: { id, userId },
            data
        });

        if (result.count === 0) {
            return null;
        }

        return this.findOneForUser(id, userId);
    }

    async deleteForUser(id: number, userId: number): Promise<boolean> {
        const result = await this.prisma.apiToken.deleteMany({
            where: { id, userId }
        });

        return result.count > 0;
    }

    async touchLastUsed(id: number): Promise<void> {
        await this.prisma.apiToken.update({
            where: { id },
            data: { lastUsedAt: new Date() }
        });
    }
}
