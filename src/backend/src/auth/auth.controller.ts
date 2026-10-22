import { Controller, Post, Request, UseGuards, Inject } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { type RequestWithUser } from './interfaces/request-with-user.interface.js';

// Signing in is the OpenID Provider's job (Legacy Auth); passwords and passkeys are managed there.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(@Inject(UsersService) private usersService: UsersService) {}

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post('profile')
    @ApiOperation({ summary: 'Get user profile' })
    @ApiResponse({ status: 200, description: 'Return user profile' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getProfile(@Request() req: RequestWithUser) {
        return this.usersService.findOne(req.user.userId!);
    }
}
