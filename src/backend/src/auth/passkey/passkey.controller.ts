import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PasskeyService } from './passkey.service.js';
import {
    PasskeyRegisterOptionsDto,
    PasskeyRegisterVerifyDto,
    PasskeyLoginOptionsDto,
    PasskeyLoginVerifyDto
} from './dto/passkey.dto.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { type RequestWithUser } from '../interfaces/request-with-user.interface.js';

@ApiTags('passkey')
@Controller('auth/passkey')
export class PasskeyController {
    constructor(@Inject(PasskeyService) private readonly passkeyService: PasskeyService) {}

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post('register-options')
    @ApiOperation({ summary: 'Generate WebAuthn registration options for current user' })
    generateRegisterOptions(@Request() req: RequestWithUser, @Body() _dto: PasskeyRegisterOptionsDto) {
        return this.passkeyService.generateRegisterOptions(req.user.userId as number);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post('register-verify')
    @ApiOperation({ summary: 'Verify WebAuthn registration and store credential' })
    verifyRegister(@Request() req: RequestWithUser, @Body() dto: PasskeyRegisterVerifyDto) {
        return this.passkeyService.verifyRegister(req.user.userId as number, dto);
    }

    @Post('login-options')
    @ApiOperation({ summary: 'Generate WebAuthn login assertion options' })
    generateLoginOptions(@Body() dto: PasskeyLoginOptionsDto) {
        return this.passkeyService.generateLoginOptions(dto.username);
    }

    @Post('login-verify')
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
    @UseGuards(JwtAuthGuard)
    @Delete('credentials/:id')
    @ApiOperation({ summary: 'Delete a registered passkey' })
    deleteCredential(@Param('id') id: string, @Request() req: RequestWithUser) {
        return this.passkeyService.deleteCredential(id, req.user.userId as number);
    }
}
