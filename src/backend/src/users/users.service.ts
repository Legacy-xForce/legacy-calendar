import { ConflictException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Prisma, User as UserModel } from '../../prisma/generated/client.js';

import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserDto } from './dto/user.dto.js';
import { UsersRepository, UserRecord } from './users.repository.js';
import { buildProfilePictureUrl } from './profile-picture.util.js';
import { AppLogger } from '../logging/app-logger.js';

@Injectable()
export class UsersService {
    private readonly logger = new AppLogger(UsersService.name);

    constructor(@Inject(UsersRepository) private readonly usersRepo: UsersRepository) {}

    async create(createUserDto: CreateUserDto): Promise<UserDto> {
        this.logger.info('Creating user', { username: createUserDto.username });
        try {
            const user = await this.usersRepo.create({
                username: createUserDto.username,
                isAdmin: createUserDto.isAdmin ?? false
            });
            this.logger.info('User created', { userId: user.id, username: user.username });
            return this.toDto(user);
        } catch (error) {
            this.throwFriendlyUserError(error, 'Username already taken');
            this.logger.error('Failed to create user', error);
            throw error;
        }
    }

    async findAll(): Promise<UserDto[]> {
        this.logger.debug('Fetching users list');
        const users = await this.usersRepo.findAll();
        return users.map((user) => this.toDto(user));
    }

    async findOne(id: number): Promise<UserDto> {
        this.logger.trace('Fetching user', { userId: id });
        const user = await this.usersRepo.findOne(id);
        if (!user) {
            this.logger.warn('User not found', { userId: id });
            throw new NotFoundException(`User with id ${id} not found`);
        }

        return this.toDto(user);
    }

    async findOneByUsername(username: string): Promise<UserModel | null> {
        return this.usersRepo.findOneByUsername(username);
    }

    // Keeps the local user record in sync with the identity asserted by the auth
    // microservice's JWT (sub = authId), creating it on first sight.
    async syncFromAuth(params: { authId: string; username: string; isAdmin: boolean }): Promise<UserRecord | null> {
        const { authId, username, isAdmin } = params;

        let user = await this.usersRepo.findOneByUsername(username);
        if (!user) {
            try {
                user = await this.usersRepo.create({ username, isAdmin, authId });
            } catch {
                user = await this.usersRepo.findOneByUsername(username);
            }
        }

        if (!user) {
            return null;
        }

        if (user.isAdmin !== isAdmin || user.authId !== authId) {
            user = await this.usersRepo.update(user.id, {
                isAdmin,
                authId
            });
        }

        return user;
    }

    async update(id: number, updateUserDto: UpdateUserDto): Promise<UserDto> {
        this.logger.info('Updating user', { userId: id, fields: Object.keys(updateUserDto) });
        try {
            const user = await this.usersRepo.update(id, { ...updateUserDto });
            this.logger.info('User updated', { userId: id });
            return this.toDto(user);
        } catch (error) {
            this.handleUserWriteError(error, id);
            this.logger.error('Failed to update user', error);
            throw error;
        }
    }

    async remove(id: number): Promise<UserDto> {
        this.logger.warn('Removing user', { userId: id });
        try {
            const user = await this.usersRepo.remove(id);
            this.logger.info('User removed', { userId: id, username: user.username });
            return this.toDto(user);
        } catch (error) {
            this.handleUserWriteError(error, id);
            this.logger.error('Failed to remove user', error);
            throw error;
        }
    }

    private toDto(user: UserRecord): UserDto {
        return {
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin,
            profilePictureUrl: buildProfilePictureUrl(user.authId)
        };
    }

    private handleUserWriteError(error: unknown, id: number): void {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
                throw new ConflictException('Username already taken');
            }

            if (error.code === 'P2025') {
                throw new NotFoundException(`User with id ${id} not found`);
            }
        }
    }

    private throwFriendlyUserError(error: unknown, message: string): void {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException(message);
        }
    }
}
