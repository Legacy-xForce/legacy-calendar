import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ApiToken, ApiTokenScope } from '../../prisma/generated/client.js';
import { AppLogger } from '../logging/app-logger.js';
import {
    API_TOKEN_DEFAULT_NAME,
    API_TOKEN_LAST_USED_REFRESH_MS,
    MAX_API_TOKENS_PER_USER
} from './api-token.constants.js';
import { buildApiTokenHint, generateApiToken, hashApiToken, isApiTokenShape } from './api-token.util.js';
import { ApiTokensRepository } from './api-tokens.repository.js';
import { CreateApiTokenDto } from './dto/create-api-token.dto.js';
import { ApiTokenResponseDto, CreatedApiTokenResponseDto } from './dto/api-token-response.dto.js';

export type ApiTokenIdentity = {
    tokenId: number;
    userId: number;
    username: string;
    isAdmin: boolean;
    scope: ApiTokenScope;
};

@Injectable()
export class ApiTokensService {
    private readonly logger = new AppLogger(ApiTokensService.name);

    constructor(@Inject(ApiTokensRepository) private readonly apiTokensRepo: ApiTokensRepository) {}

    async findAll(userId: number): Promise<ApiTokenResponseDto[]> {
        const tokens = await this.apiTokensRepo.findAllForUser(userId);
        return tokens.map((token) => this.toPublic(token));
    }

    async create(userId: number, dto: CreateApiTokenDto): Promise<CreatedApiTokenResponseDto> {
        const count = await this.apiTokensRepo.countForUser(userId);
        if (count >= MAX_API_TOKENS_PER_USER) {
            throw new BadRequestException(
                `You already have the maximum of ${MAX_API_TOKENS_PER_USER} API tokens. Delete one before creating another.`
            );
        }

        const token = generateApiToken();
        const created = await this.apiTokensRepo.create({
            userId,
            name: dto.name?.trim() || API_TOKEN_DEFAULT_NAME,
            scope: dto.scope,
            tokenHash: hashApiToken(token),
            tokenHint: buildApiTokenHint(token)
        });

        this.logger.info('API token created', { userId, tokenId: created.id, scope: created.scope });
        return { ...this.toPublic(created), token };
    }

    async rotate(userId: number, id: number): Promise<CreatedApiTokenResponseDto> {
        const token = generateApiToken();
        const rotated = await this.apiTokensRepo.updateForUser(id, userId, {
            tokenHash: hashApiToken(token),
            tokenHint: buildApiTokenHint(token),
            lastUsedAt: null,
            rotatedAt: new Date()
        });

        if (!rotated) {
            throw new NotFoundException(`API token with id ${id} not found`);
        }

        this.logger.info('API token rotated', { userId, tokenId: rotated.id, scope: rotated.scope });
        return { ...this.toPublic(rotated), token };
    }

    async remove(userId: number, id: number): Promise<{ success: boolean }> {
        const deleted = await this.apiTokensRepo.deleteForUser(id, userId);
        if (!deleted) {
            throw new NotFoundException(`API token with id ${id} not found`);
        }

        this.logger.info('API token deleted', { userId, tokenId: id });
        return { success: true };
    }

    /**
     * Resolve an X-API-Token value into the same identity shape the JWT strategy
     * produces, so controllers do not need to know which credential was used.
     */
    async authenticate(rawToken: string): Promise<ApiTokenIdentity | null> {
        const token = rawToken.trim();
        if (!isApiTokenShape(token)) {
            return null;
        }

        const record = await this.apiTokensRepo.findByTokenHash(hashApiToken(token));
        if (!record) {
            return null;
        }

        const lastUsedAt = record.lastUsedAt?.getTime() ?? 0;
        if (Date.now() - lastUsedAt > API_TOKEN_LAST_USED_REFRESH_MS) {
            // Usage tracking must never make an otherwise valid request fail.
            await this.apiTokensRepo.touchLastUsed(record.id).catch((error: unknown) => {
                this.logger.warn('Failed to update API token lastUsedAt', {
                    tokenId: record.id,
                    reason: error instanceof Error ? error.message : String(error)
                });
            });
        }

        return {
            tokenId: record.id,
            userId: record.user.id,
            username: record.user.username,
            isAdmin: record.user.isAdmin,
            scope: record.scope
        };
    }

    private toPublic(token: ApiToken): ApiTokenResponseDto {
        return {
            id: token.id,
            name: token.name,
            scope: token.scope,
            tokenHint: token.tokenHint,
            createdAt: token.createdAt,
            lastUsedAt: token.lastUsedAt,
            rotatedAt: token.rotatedAt
        };
    }
}
