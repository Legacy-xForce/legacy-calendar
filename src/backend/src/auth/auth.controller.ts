import { Body, Controller, Post, Request, UseGuards, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { type RequestWithUser } from './interfaces/request-with-user.interface.js';

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

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    @ApiOperation({ summary: "Change user password (proxied to auth service)" })
    @ApiBody({ type: ChangePasswordDto })
    @ApiResponse({ status: 200, description: 'Password changed successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async changePassword(@Request() req: RequestWithUser, @Body() changePasswordDto: ChangePasswordDto) {
        const authHeader = (req.headers?.authorization as string) || '';
        const authHost = process.env.AUTH_HOST || 'https://auth.legacy-group.tech';

        try {
            const res = await fetch(`${authHost}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(authHeader ? { Authorization: authHeader } : {}),
                },
                body: JSON.stringify({
                    current_password: changePasswordDto.currentPassword,
                    new_password: changePasswordDto.newPassword,
                }),
            });

            let data: any = null;
            try { data = await res.json(); } catch (e) { data = null; }

            if (!res.ok) {
                const msg = data && data.message ? data.message : 'Auth service error';
                // forward the upstream body when available so clients receive the same JSON
                throw new HttpException(data ?? { message: msg }, res.status || HttpStatus.BAD_GATEWAY);
            }

            // return upstream JSON body as-is
            return data;
        } catch (err: any) {
            if (err instanceof HttpException) throw err;
            throw new HttpException('Unable to contact auth service', HttpStatus.SERVICE_UNAVAILABLE);
        }
    }
}
