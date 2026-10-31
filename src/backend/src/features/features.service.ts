import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateFeatureDto } from './dto/create-feature.dto.js';
import { UpdateFeatureDto } from './dto/update-feature.dto.js';
import { FeatureDto } from './dto/feature.dto.js';

const FEATURE_SELECT = { id: true, name: true, emoji: true } satisfies Prisma.FeatureSelect;

/** The case-insensitive key duplicate names are detected by. */
export const featureNameKey = (name: string) => name.trim().toLowerCase();

@Injectable()
export class FeaturesService {
    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    findAll(): Promise<FeatureDto[]> {
        return this.prisma.feature.findMany({ select: FEATURE_SELECT, orderBy: { id: 'asc' } });
    }

    async create(dto: CreateFeatureDto): Promise<FeatureDto> {
        await this.assertNoDuplicate(dto.name, dto.emoji);
        return this.persist(() =>
            this.prisma.feature.create({
                data: { name: dto.name, nameKey: featureNameKey(dto.name), emoji: dto.emoji },
                select: FEATURE_SELECT
            })
        );
    }

    async update(id: number, dto: UpdateFeatureDto): Promise<FeatureDto> {
        await this.findOrThrow(id);
        await this.assertNoDuplicate(dto.name, dto.emoji, id);
        return this.persist(() =>
            this.prisma.feature.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined ? { name: dto.name, nameKey: featureNameKey(dto.name) } : {}),
                    ...(dto.emoji !== undefined ? { emoji: dto.emoji } : {})
                },
                select: FEATURE_SELECT
            })
        );
    }

    /** Removes the feature from every event and participant that used it. */
    async remove(id: number): Promise<{ success: true }> {
        await this.findOrThrow(id);
        await this.prisma.feature.delete({ where: { id } });
        return { success: true };
    }

    private async findOrThrow(id: number) {
        const feature = await this.prisma.feature.findUnique({ where: { id }, select: FEATURE_SELECT });
        if (!feature) throw new NotFoundException(`Feature ${id} not found`);
        return feature;
    }

    private async assertNoDuplicate(name: string | undefined, emoji: string | undefined, exceptId?: number) {
        const clauses: Prisma.FeatureWhereInput[] = [];
        if (name !== undefined) clauses.push({ nameKey: featureNameKey(name) });
        if (emoji !== undefined) clauses.push({ emoji });
        if (clauses.length === 0) return;

        const existing = await this.prisma.feature.findFirst({
            where: { OR: clauses, ...(exceptId !== undefined ? { id: { not: exceptId } } : {}) }
        });
        if (!existing) return;

        const sameName = name !== undefined && existing.nameKey === featureNameKey(name);
        throw new ConflictException(
            sameName ? `A feature named "${existing.name}" already exists` : `The emoji ${emoji} is already in use`
        );
    }

    /** Maps a unique-constraint race (two admins saving at once) to the same 409. */
    private async persist<T>(write: () => Promise<T>): Promise<T> {
        try {
            return await write();
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ConflictException('A feature with this name or emoji already exists');
            }
            throw error;
        }
    }
}
