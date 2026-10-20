import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFile } from 'node:fs/promises';

async function generateOpenApi() {
    // Schema generation does not touch the database. These fallbacks only satisfy
    // ConfigModule validation when the script runs without a local .env file.
    // They must be set before AppModule is imported, because ConfigModule.forRoot
    // validates at module-evaluation time.
    process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@127.0.0.1:5432/openapi';
    process.env.JWT_SECRET ??= 'openapi-generation-secret-not-used-at-runtime';

    const { AppModule } = await import('./app.module.js');
    const { PrismaService } = await import('./prisma/prisma.service.js');
    const app = await NestFactory.create(AppModule, { logger: false });

    // Swagger only needs controllers/routes, not a live database. Skipping the
    // Prisma connect hook keeps schema generation usable offline and in CI.
    app.get(PrismaService).onModuleInit = async () => {};
    await app.init();

    const config = new DocumentBuilder()
        .setTitle('Legacy Calendar API')
        .setDescription('The legacy calendar server API description')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    await writeFile('openapi.json', `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await app.close();
}

generateOpenApi().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
