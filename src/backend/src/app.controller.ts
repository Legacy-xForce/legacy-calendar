import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { getWebAppUrl } from './config/frontend-url.js';

@Controller()
export class AppController {
    /** A browser opening the API root wants the calendar, not a JSON hello. */
    @Get()
    @ApiExcludeEndpoint()
    getRoot(@Res() response: Response): void {
        response.redirect(302, getWebAppUrl());
    }

    @Get('health')
    getHealth(): { status: string } {
        return { status: 'ok' };
    }
}
