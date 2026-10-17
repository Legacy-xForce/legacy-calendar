import { Injectable, Inject, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from '../../users/users.service.js';
import { PasskeyRegisterVerifyDto, PasskeyLoginVerifyDto } from './dto/passkey.dto.js';
import { AppLogger } from '../../logging/app-logger.js';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';

interface StoredChallenge {
    challenge: string;
    userId?: number;
    expiresAt: number;
}

@Injectable()
export class PasskeyService {
    private readonly logger = new AppLogger(PasskeyService.name);
    private readonly challenges = new Map<string, StoredChallenge>();

    constructor(
        @Inject(PrismaService) private readonly prisma: PrismaService,
        @Inject(UsersService) private readonly usersService: UsersService,
        @Inject(ConfigService) private readonly configService: ConfigService
    ) {
        // Periodically prune expired challenges
        setInterval(() => this.cleanupExpiredChallenges(), 60000).unref();
    }

    private cleanupExpiredChallenges() {
        const now = Date.now();
        for (const [key, value] of this.challenges.entries()) {
            if (value.expiresAt < now) {
                this.challenges.delete(key);
            }
        }
    }

    private generateRandomChallenge(): string {
        return crypto.randomBytes(32).toString('base64url');
    }

    private decodeBase64(value: unknown, fieldName: string): Buffer {
        if (typeof value !== 'string' || value.length === 0) {
            throw new BadRequestException(`${fieldName} must be a non-empty base64 string`);
        }

        let normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
        normalized += '='.repeat((4 - (normalized.length % 4)) % 4);
        try {
            return Buffer.from(normalized, 'base64');
        } catch {
            throw new BadRequestException(`Invalid ${fieldName}`);
        }
    }

    async generateRegisterOptions(userId: number) {
        const user = await this.usersService.findOne(userId);
        const challenge = this.generateRandomChallenge();

        // Store challenge for 5 minutes
        this.challenges.set(`reg_${userId}`, {
            challenge,
            userId,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        // Also store keyed by challenge string for quick lookup
        this.challenges.set(`chal_${challenge}`, {
            challenge,
            userId,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        return {
            challenge,
            rp: {
                name: 'Legacy Calendar'
            },
            user: {
                id: Buffer.from(String(userId)).toString('base64url'),
                name: user.username,
                displayName: user.username
            },
            pubKeyCredParams: [
                { alg: -7, type: 'public-key' }, // ES256
                { alg: -257, type: 'public-key' } // RS256
            ],
            timeout: 60000,
            attestation: 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                residentKey: 'required',
                requireResidentKey: true,
                userVerification: 'required'
            }
        };
    }

    async verifyRegister(userId: number, dto: PasskeyRegisterVerifyDto) {
        const stored = this.challenges.get(`reg_${userId}`);
        if (!stored) {
            throw new BadRequestException('Registration challenge not found or expired');
        }

        let parsedClientData: { challenge?: string; type?: string };
        try {
            const rawJson = this.decodeBase64(dto.response.clientDataJSON, 'clientDataJSON').toString('utf8');
            parsedClientData = JSON.parse(rawJson) as { challenge?: string; type?: string };
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'invalid payload';
            this.logger.warn('Failed to decode WebAuthn client data', { reason });
            throw new BadRequestException(`Invalid clientDataJSON: ${reason}`);
        }

        if (parsedClientData.type !== 'webauthn.create' || parsedClientData.challenge !== stored.challenge) {
            throw new BadRequestException('Challenge mismatch');
        }

        // Challenge consumed
        this.challenges.delete(`reg_${userId}`);
        this.challenges.delete(`chal_${stored.challenge}`);

        if (!dto.response.publicKey) {
            throw new BadRequestException('Registration response did not include a public key');
        }

        const publicKey = dto.response.publicKey;
        const deviceName = dto.deviceName?.trim() || 'Biometric Passkey';

        const credential = await this.prisma.passkeyCredential.upsert({
            where: { id: dto.id },
            update: {
                publicKey,
                deviceName,
                userId
            },
            create: {
                id: dto.id,
                userId,
                publicKey,
                deviceName
            }
        });

        this.logger.info('Passkey registered successfully', { userId, credentialId: credential.id });
        return { success: true, credentialId: credential.id, deviceName: credential.deviceName };
    }

    async generateLoginOptions(username?: string) {
        const challenge = this.generateRandomChallenge();
        let allowCredentials: { id: string; type: 'public-key' }[] = [];

        if (username) {
            const user = await this.usersService.findOneByUsername(username);
            if (user) {
                const creds = await this.prisma.passkeyCredential.findMany({
                    where: { userId: user.id }
                });
                allowCredentials = creds.map((c) => ({
                    id: c.id,
                    type: 'public-key' as const
                }));
            }
        }

        this.challenges.set(`chal_${challenge}`, {
            challenge,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        return {
            challenge,
            timeout: 60000,
            userVerification: 'preferred',
            allowCredentials
        };
    }

    async verifyLogin(dto: PasskeyLoginVerifyDto) {
        let parsedClientData: { challenge?: string; type?: string };
        try {
            const rawJson = this.decodeBase64(dto.response.clientDataJSON, 'clientDataJSON').toString('utf8');
            parsedClientData = JSON.parse(rawJson) as { challenge?: string; type?: string };
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'invalid payload';
            this.logger.warn('Failed to decode WebAuthn client data', { reason });
            throw new BadRequestException(`Invalid clientDataJSON: ${reason}`);
        }

        if (parsedClientData.type !== 'webauthn.get') {
            throw new UnauthorizedException('Invalid WebAuthn response type');
        }

        const challengeKey = `chal_${parsedClientData.challenge ?? ''}`;
        const stored = this.challenges.get(challengeKey);
        if (!stored) {
            throw new UnauthorizedException('Authentication challenge expired or invalid');
        }
        this.challenges.delete(challengeKey);

        const credential = await this.prisma.passkeyCredential.findUnique({
            where: { id: dto.id },
            include: { user: true }
        });

        if (!credential) {
            throw new UnauthorizedException('Unknown passkey credential');
        }

        let publicKey: crypto.KeyObject;
        try {
            publicKey = crypto.createPublicKey({
                key: this.decodeBase64(credential.publicKey, 'publicKey'),
                format: 'der',
                type: 'spki'
            });
        } catch {
            throw new UnauthorizedException('Stored passkey public key is invalid');
        }

        const clientDataHash = crypto
            .createHash('sha256')
            .update(this.decodeBase64(dto.response.clientDataJSON, 'clientDataJSON'))
            .digest();
        const authenticatorData = this.decodeBase64(dto.response.authenticatorData, 'authenticatorData');
        if (authenticatorData.length < 37 || (authenticatorData[32] & 0x01) === 0) {
            throw new UnauthorizedException('Passkey user verification failed');
        }

        const validSignature = crypto.verify(
            'sha256',
            Buffer.concat([authenticatorData, clientDataHash]),
            publicKey,
            this.decodeBase64(dto.response.signature, 'signature')
        );
        if (!validSignature) {
            throw new UnauthorizedException('Invalid passkey signature');
        }

        const counter = authenticatorData.readUInt32BE(33);
        if (counter !== 0 && counter <= Number(credential.counter)) {
            throw new UnauthorizedException('Passkey counter replay detected');
        }
        await this.prisma.passkeyCredential.update({
            where: { id: credential.id },
            data: { counter: BigInt(counter) }
        });

        const user = credential.user;
        const secret = this.configService.get<string>('JWT_SECRET') || 'legacy-calendar-default-secret';
        const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '30d';

        const payload = {
            sub: String(user.id),
            username: user.username,
            role: user.isAdmin ? 'admin' : 'user',
            scope: 'calendar'
        };

        const access_token = jwt.sign(payload, secret, { expiresIn });

        this.logger.info('Passkey login verified successfully', { userId: user.id, username: user.username });
        return {
            access_token,
            refresh_token: access_token,
            expires_in: 30 * 24 * 3600,
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin
            }
        };
    }

    async listCredentials(userId: number) {
        const creds = await this.prisma.passkeyCredential.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        return creds.map((c) => ({
            id: c.id,
            deviceName: c.deviceName || 'Passkey',
            createdAt: c.createdAt
        }));
    }

    async deleteCredential(id: string, userId: number) {
        const cred = await this.prisma.passkeyCredential.findFirst({
            where: { id, userId }
        });

        if (!cred) {
            throw new NotFoundException('Passkey not found');
        }

        await this.prisma.passkeyCredential.delete({
            where: { id }
        });

        return { success: true };
    }
}
