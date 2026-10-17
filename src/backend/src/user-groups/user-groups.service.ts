import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserGroupDto } from './dto/create-user-group.dto.js';
import { UpdateUserGroupDto } from './dto/update-user-group.dto.js';
import { AppLogger } from '../logging/app-logger.js';
import { Prisma } from '../../prisma/generated/client.js';

@Injectable()
export class UserGroupsService {
    private readonly logger = new AppLogger(UserGroupsService.name);

    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    async findAll(userId: number) {
        return this.prisma.userGroup.findMany({
            where: { userId },
            orderBy: { name: 'asc' }
        });
    }

    async findOne(id: number, userId: number) {
        const group = await this.prisma.userGroup.findFirst({
            where: { id, userId }
        });
        if (!group) {
            throw new NotFoundException(`User group with ID ${id} not found`);
        }
        return group;
    }

    async create(userId: number, dto: CreateUserGroupDto) {
        this.logger.info('Creating user group', { userId, name: dto.name, membersCount: dto.memberIds.length });
        const trimmedName = dto.name.trim();

        // deduplicate memberIds and filter positive ints
        const memberIds = [...new Set(dto.memberIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))];

        try {
            return await this.prisma.userGroup.create({
                data: {
                    userId,
                    name: trimmedName,
                    memberIds
                }
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ConflictException(`A group named "${trimmedName}" already exists`);
            }
            throw error;
        }
    }

    async update(id: number, userId: number, dto: UpdateUserGroupDto) {
        await this.findOne(id, userId);

        const data: Prisma.UserGroupUpdateInput = {};
        if (dto.name !== undefined) {
            data.name = dto.name.trim();
        }
        if (dto.memberIds !== undefined) {
            data.memberIds = [...new Set(dto.memberIds.map(Number).filter((mId) => Number.isFinite(mId) && mId > 0))];
        }

        try {
            return await this.prisma.userGroup.update({
                where: { id },
                data
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ConflictException(`A group named "${dto.name?.trim() ?? ''}" already exists`);
            }
            throw error;
        }
    }

    async remove(id: number, userId: number) {
        await this.findOne(id, userId);
        return this.prisma.userGroup.delete({
            where: { id }
        });
    }
}
