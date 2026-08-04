import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, User as UserModel } from '../../prisma/generated/client.js';

const USER_SELECT = { id: true, username: true, isAdmin: true, authId: true } satisfies Prisma.UserSelect;

export type UserRecord = Pick<UserModel, 'id' | 'username' | 'isAdmin' | 'authId'>;

@Injectable()
export class UsersRepository {
    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    async create(data: Prisma.UserCreateInput): Promise<UserRecord> {
        return this.prisma.user.create({
            data,
            select: USER_SELECT
        });
    }

    findAll(): Promise<UserRecord[]> {
        return this.prisma.user.findMany({
            select: USER_SELECT
        });
    }

    findOne(id: number): Promise<UserRecord | null> {
        return this.prisma.user.findUnique({
            where: { id },
            select: USER_SELECT
        });
    }

    findOneByUsername(username: string): Promise<UserModel | null> {
        return this.prisma.user.findUnique({ where: { username } });
    }

    update(id: number, data: Prisma.UserUpdateInput): Promise<UserRecord> {
        return this.prisma.user.update({
            where: { id },
            data,
            select: USER_SELECT
        });
    }

    remove(id: number): Promise<UserRecord> {
        return this.prisma.user.delete({
            where: { id },
            select: USER_SELECT
        });
    }
}
