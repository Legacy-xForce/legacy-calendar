import { Controller, Get, Req, Res, NotFoundException, Inject, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import * as path from 'path';
import { existsSync, createReadStream, statSync } from 'fs';
import { lookup } from 'mime-types';
import { AppLogger } from '../logging/app-logger.js';

@Controller('uploads')
export class UploadsController {
    private readonly logger = new AppLogger(UploadsController.name);

    constructor(@Inject(ConfigService) private configService: ConfigService) {}

    @Get('{*path}')
    getUpload(@Param('path') wildcardPath: string | string[] | undefined, @Req() req: Request, @Res() res: Response) {
        const relativePath = Array.isArray(wildcardPath) ? wildcardPath.join('/') : (wildcardPath ?? '');
        const normalizedRelativePath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
        const uploadsRoot = path.resolve(process.cwd(), 'uploads');
        const filePath = path.resolve(uploadsRoot, normalizedRelativePath);
        const relativeToRoot = path.relative(uploadsRoot, filePath);

        this.logger.debug('Resolving upload request', { relativePath: normalizedRelativePath });

        if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
            this.logger.warn('Blocked upload path traversal attempt', { relativePath: normalizedRelativePath });
            throw new NotFoundException('File not found');
        }

        if (existsSync(filePath)) {
            const stat = statSync(filePath);
            if (!stat.isFile()) {
                this.logger.warn('Upload path resolved to non-file', { filePath });
                throw new NotFoundException('File not found');
            }
            const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;

            res.set('ETag', etag);
            res.set('Cache-Control', 'no-cache');

            const contentType = lookup(path.basename(filePath)) || 'application/octet-stream';
            res.set('Content-Type', contentType);
            this.logger.info('Serving local upload', { filePath, contentType, size: stat.size });

            if (req.headers['if-none-match'] === etag) {
                this.logger.trace('Returning cached upload response', { filePath });
                res.status(304).end();
                return;
            }

            res.set('Content-Length', stat.size.toString());
            const file = createReadStream(filePath);
            file.on('error', (error) => {
                this.logger.error('Failed to stream upload', { filePath, error });
                if (res.headersSent) {
                    res.destroy(error);
                } else {
                    res.status(500).end();
                }
            });
            file.pipe(res);
            return;
        }

        const remoteUrl = this.configService.get<string>('REMOTE_UPLOADS_URL');
        if (remoteUrl) {
            const sanitizedRemoteUrl = remoteUrl.endsWith('/') ? remoteUrl.slice(0, -1) : remoteUrl;
            this.logger.info('Redirecting upload request to remote origin', {
                relativePath: normalizedRelativePath,
                remoteUrl: sanitizedRemoteUrl
            });
            return res.redirect(`${sanitizedRemoteUrl}/uploads/${normalizedRelativePath}`);
        }

        this.logger.warn('Upload not found', { relativePath: normalizedRelativePath });
        throw new NotFoundException('File not found');
    }
}
