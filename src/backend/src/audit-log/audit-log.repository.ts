import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const AUDIT_LOG_INCLUDE = {
    actor: { select: { id: true, username: true, authId: true } },
    impersonator: { select: { id: true, username: true, authId: true } }
} satisfies Prisma.AuditLogEntryInclude;

export type AuditLogEntryWithRelations = Prisma.AuditLogEntryGetPayload<{
    include: typeof AUDIT_LOG_INCLUDE;
}>;

@Injectable()
export class AuditLogRepository {
    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    async create(data: Prisma.AuditLogEntryUncheckedCreateInput): Promise<AuditLogEntryWithRelations> {
        return this.prisma.auditLogEntry.create({
            data,
            include: AUDIT_LOG_INCLUDE
        });
    }

    async findManyByEventId(eventId: number): Promise<AuditLogEntryWithRelations[]> {
        return this.prisma.auditLogEntry.findMany({
            where: { eventId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            include: AUDIT_LOG_INCLUDE
        });
    }
}
