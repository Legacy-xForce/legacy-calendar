import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { AppLogger } from './logging/app-logger.js';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import { isOriginAllowed } from './config/cors.js';

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
        allowedHeaders: 'Content-Type, Accept, Authorization, X-Impersonate, X-Request-Id'
    });

    // Response Compression with Gzip, Deflate and Brotli support
    app.use(compression());

    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    // API docs are useful in development but should not be publicly exposed in production.
    if (process.env.NODE_ENV !== 'production') {
        const config = new DocumentBuilder()
            .setTitle('Legacy Calendar API')
            .setDescription('The legacy calendar server API description')
            .setVersion('1.0')
            .addBearerAuth()
            .build();
        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('api', app, document);
    }

    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    app.flushLogs();

    logger.info('Application is running', {
        url: `http://localhost:${port}`,
        swaggerUrl: `http://localhost:${port}/api`
    });
}

bootstrap().catch((err) => {
    const logger = new AppLogger('Bootstrap');
    logger.fatal('Error starting application', err);
});
