import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import compression from 'compression';
import type { Express } from 'express';
import { AppLogger } from './logging/app-logger.js';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import { isOriginAllowed } from './config/cors.js';
import { addApiTokenSecurity, createSwaggerConfig } from './config/swagger.js';

async function bootstrap() {
    const logger = new AppLogger('Bootstrap');

    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.useLogger(app.get(PinoNestLogger));

    app.enableCors({
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            callback(null, isOriginAllowed(origin));
        },
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
        allowedHeaders: 'Content-Type, Accept, Authorization, X-Impersonate, X-Request-Id, X-API-Token'
    });

    // Response Compression with Gzip, Deflate and Brotli support
    app.use(compression());

    // Trust the reverse proxy so rate limiting and logs key on the real client
    // IP. Opt-in: only enable when the app really is behind a trusted proxy,
    // otherwise X-Forwarded-For could be spoofed.
    const trustProxy = process.env.TRUST_PROXY?.trim();
    if (trustProxy) {
        const value = trustProxy === 'true' ? 1 : Number.isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy);
        const expressInstance = app.getHttpAdapter().getInstance() as Express;
        expressInstance.set('trust proxy', value);
    }

    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    // API docs are useful in development but should not be publicly exposed in production.
    const exposeApiDocs = process.env.NODE_ENV !== 'production';
    if (exposeApiDocs) {
        const config = createSwaggerConfig();
        const document = addApiTokenSecurity(SwaggerModule.createDocument(app, config));
        app.use('/api', apiReference({ content: document }));
    }

    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    app.flushLogs();

    logger.info('Application is running', {
        url: `http://localhost:${port}`,
        ...(exposeApiDocs ? { apiDocsUrl: `http://localhost:${port}/api` } : {})
    });
}

bootstrap().catch((err) => {
    const logger = new AppLogger('Bootstrap');
    logger.fatal('Error starting application', err);
});
