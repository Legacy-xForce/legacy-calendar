import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PasskeyService } from './passkey.service.js';
import {
    PasskeyRegisterOptionsDto,
    PasskeyRegisterVerifyDto,
    PasskeyLoginOptionsDto,
    PasskeyLoginVerifyDto
} from './dto/passkey.dto.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { SessionAuthGuard } from '../guards/session-auth.guard.js';
import { type RequestWithUser } from '../interfaces/request-with-user.interface.js';

@ApiTags('passkey')
@Controller('auth/passkey')
@UseGuards(ThrottlerGuard)
export class PasskeyController {
    constructor(@Inject(PasskeyService) private readonly passkeyService: PasskeyService) {}

    // A passkey is a way to sign in, so an API token must not be able to add
    // one: it would turn a revocable integration token into a full session.
    @ApiBearerAuth()
    @UseGuards(SessionAuthGuard)
    @Post('register-options')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    @ApiOperation({ summary: 'Generate WebAuthn registration options for current user' })
    generateRegisterOptions(@Request() req: RequestWithUser, @Body() _dto: PasskeyRegisterOptionsDto) {
        return this.passkeyService.generateRegisterOptions(req.user.userId as number);
    }

    @ApiBearerAuth()
    @UseGuards(SessionAuthGuard)
    @Post('register-verify')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    @ApiOperation({ summary: 'Verify WebAuthn registration and store credential' })
    verifyRegister(@Request() req: RequestWithUser, @Body() dto: PasskeyRegisterVerifyDto) {
        return this.passkeyService.verifyRegister(req.user.userId as number, dto);
    }

    @Post('login-options')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @ApiOperation({ summary: 'Generate WebAuthn login assertion options' })
    generateLoginOptions(@Body() dto: PasskeyLoginOptionsDto) {
        return this.passkeyService.generateLoginOptions(dto.username);
    }

    @Post('login-verify')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @ApiOperation({ summary: 'Verify WebAuthn assertion and issue authentication token' })
    verifyLogin(@Body() dto: PasskeyLoginVerifyDto) {
        return this.passkeyService.verifyLogin(dto);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Get('credentials')
    @ApiOperation({ summary: 'List registered passkeys for current user' })
    listCredentials(@Request() req: RequestWithUser) {
        return this.passkeyService.listCredentials(req.user.userId as number);
    }

    @ApiBearerAuth()
    @UseGuards(SessionAuthGuard)
    @Delete('credentials/:id')
    @ApiOperation({ summary: 'Delete a registered passkey' })
    deleteCredential(@Param('id') id: string, @Request() req: RequestWithUser) {
        return this.passkeyService.deleteCredential(id, req.user.userId as number);
    }
}
